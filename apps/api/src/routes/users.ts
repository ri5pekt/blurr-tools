import type { FastifyInstance } from 'fastify'
import { randomBytes } from 'node:crypto'
import argon2 from 'argon2'
import { eq } from 'drizzle-orm'
import { db } from '../db.js'
import { users } from '@blurr-tools/db'
import { EmailService } from '../services/email.service.js'
import { log } from '../logger.js'

export async function usersRoutes(fastify: FastifyInstance) {
  // ─── GET /api/users ───────────────────────────────────────────────────────

  fastify.get('/api/users', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', code: 'FORBIDDEN' })
    }

    return db
      .select({
        id:        users.id,
        email:     users.email,
        name:      users.name,
        role:      users.role,
        isActive:  users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(users.createdAt)
  })

  // ─── POST /api/users ──────────────────────────────────────────────────────

  fastify.post('/api/users', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['email', 'name'],
        properties: {
          email: { type: 'string' },
          name:  { type: 'string', minLength: 1 },
          role:  { type: 'string', enum: ['admin', 'staff'] },
        },
      },
    },
  }, async (request, reply) => {
    if (request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', code: 'FORBIDDEN' })
    }

    const { email, name, role = 'staff' } = request.body as {
      email: string
      name:  string
      role?: 'admin' | 'staff'
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1)

    if (existing) {
      return reply.status(409).send({ error: 'Email already in use', code: 'EMAIL_TAKEN' })
    }

    const tempPassword = randomBytes(8).toString('hex')
    const passwordHash = await argon2.hash(tempPassword)

    const [newUser] = await db
      .insert(users)
      .values({ email: email.toLowerCase(), passwordHash, name, role })
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role })

    log({
      level: 'info', source: 'api', action: 'user.created',
      message: `User created: ${newUser.email} (role: ${newUser.role})`,
      userId: request.user.id,
      meta: { newUserId: newUser.id, newUserEmail: newUser.email, role: newUser.role },
    })

    let emailSent = false
    let emailError: string | null = null

    try {
      await EmailService.sendInvitationEmail({ to: email, tempPassword, invitedBy: request.user.name })
      emailSent = true
    } catch (err: any) {
      fastify.log.error({ err }, 'Failed to send invitation email')
      emailError = err.message
    }

    return {
      user: newUser,
      emailSent,
      tempPassword: emailSent ? undefined : tempPassword,
      message: emailSent
        ? 'User invited successfully.'
        : `User created but email failed. Share this password manually: ${tempPassword}`,
      ...(emailError && { emailError }),
    }
  })

  // ─── PUT /api/users/:id ───────────────────────────────────────────────────

  fastify.put('/api/users/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          name:     { type: 'string', minLength: 1 },
          role:     { type: 'string', enum: ['admin', 'staff'] },
          isActive: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    if (request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', code: 'FORBIDDEN' })
    }

    const { id } = request.params as { id: string }
    const { name, role, isActive } = request.body as {
      name?:     string
      role?:     'admin' | 'staff'
      isActive?: boolean
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)

    if (!existing) {
      return reply.status(404).send({ error: 'User not found', code: 'USER_NOT_FOUND' })
    }

    const updates: Partial<typeof users.$inferInsert> = {}
    if (name     !== undefined) updates.name     = name
    if (role     !== undefined) updates.role     = role
    if (isActive !== undefined) updates.isActive = isActive

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: 'No fields to update', code: 'NO_UPDATES' })
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning({
        id:       users.id,
        email:    users.email,
        name:     users.name,
        role:     users.role,
        isActive: users.isActive,
      })

    log({
      level: 'info', source: 'api', action: 'user.updated',
      message: `User updated: ${updated.email}`,
      userId: request.user.id,
      meta: { targetUserId: updated.id, changes: updates },
    })

    return updated
  })

  // ─── DELETE /api/users/:id (soft deactivate) ──────────────────────────────

  fastify.delete('/api/users/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    if (request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', code: 'FORBIDDEN' })
    }

    const { id } = request.params as { id: string }

    if (id === request.user.id) {
      return reply.status(400).send({
        error: 'Cannot deactivate your own account',
        code: 'CANNOT_DEACTIVATE_SELF',
      })
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)

    if (!existing) {
      return reply.status(404).send({ error: 'User not found', code: 'USER_NOT_FOUND' })
    }

    await db.update(users).set({ isActive: false }).where(eq(users.id, id))

    log({
      level: 'info', source: 'api', action: 'user.deactivated',
      message: `User deactivated: ${id}`,
      userId: request.user.id,
      meta: { targetUserId: id },
    })

    return { success: true }
  })
}

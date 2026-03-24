import type { FastifyInstance } from 'fastify'
import { createHash, randomBytes } from 'node:crypto'
import argon2 from 'argon2'
import { eq, and, isNull, gt } from 'drizzle-orm'
import { db } from '../db.js'
import { users, refreshTokens } from '@blurr-tools/db'
import { env } from '../env.js'
import { log } from '../logger.js'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function parseExpiresInMs(val: string): number {
  const match = val.match(/^(\d+)([smhd])$/)
  if (!match) return 30 * 24 * 60 * 60 * 1000
  const num = parseInt(match[1], 10)
  const unit = match[2]
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60 * 1_000,
    h: 60 * 60 * 1_000,
    d: 24 * 60 * 60 * 1_000,
  }
  return num * multipliers[unit]
}

const REFRESH_COOKIE = 'refreshToken'

export async function authRoutes(fastify: FastifyInstance) {
  // ─── POST /api/auth/login ─────────────────────────────────────────────────

  fastify.post('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1)

    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      log({
        level: 'warning', source: 'api', action: 'user.login.failed',
        message: `Failed login attempt for ${email.toLowerCase()}`,
        userId: user?.id ?? null,
      })
      return reply.status(401).send({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' })
    }

    if (!user.isActive) {
      log({
        level: 'warning', source: 'api', action: 'user.login.failed',
        message: `Login attempt on disabled account: ${email.toLowerCase()}`,
        userId: user.id,
      })
      return reply.status(403).send({ error: 'Account disabled', code: 'ACCOUNT_DISABLED' })
    }

    const payload = { id: user.id, email: user.email, name: user.name, role: user.role }
    const accessToken = fastify.jwt.sign(payload, { expiresIn: env.JWT_ACCESS_EXPIRES_IN })

    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = hashToken(rawToken)
    const refreshMs = parseExpiresInMs(env.JWT_REFRESH_EXPIRES_IN)
    const expiresAt = new Date(Date.now() + refreshMs)

    await db.insert(refreshTokens).values({ userId: user.id, tokenHash, expiresAt })

    reply.setCookie(REFRESH_COOKIE, rawToken, {
      httpOnly: true,
      path: '/api/auth',
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: Math.floor(refreshMs / 1000),
    })

    log({
      level: 'info', source: 'api', action: 'user.login',
      message: `User logged in: ${user.email}`,
      userId: user.id,
    })

    return { accessToken, user: payload }
  })

  // ─── POST /api/auth/refresh ───────────────────────────────────────────────

  fastify.post('/api/auth/refresh', async (request, reply) => {
    const rawToken = request.cookies[REFRESH_COOKIE]

    if (!rawToken) {
      return reply.status(401).send({ error: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' })
    }

    const tokenHash = hashToken(rawToken)
    const now = new Date()

    const [tokenRow] = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, now),
        ),
      )
      .limit(1)

    if (!tokenRow) {
      reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })
      return reply.status(401).send({ error: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' })
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, tokenRow.userId))
      .limit(1)

    if (!user || !user.isActive) {
      reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })
      return reply.status(401).send({ error: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' })
    }

    const payload = { id: user.id, email: user.email, name: user.name, role: user.role }
    const accessToken = fastify.jwt.sign(payload, { expiresIn: env.JWT_ACCESS_EXPIRES_IN })

    return { accessToken, user: payload }
  })

  // ─── POST /api/auth/logout ────────────────────────────────────────────────

  fastify.post('/api/auth/logout', async (request, reply) => {
    const rawToken = request.cookies[REFRESH_COOKIE]

    if (rawToken) {
      const tokenHash = hashToken(rawToken)

      const [tokenRow] = await db
        .select({ userId: refreshTokens.userId })
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1)

      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.tokenHash, tokenHash))

      if (tokenRow) {
        log({
          level: 'info', source: 'api', action: 'user.logout',
          message: 'User logged out',
          userId: tokenRow.userId,
        })
      }
    }

    reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })
    return { success: true }
  })

  // ─── GET /api/auth/me ─────────────────────────────────────────────────────

  fastify.get('/api/auth/me', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    return request.user
  })

  // ─── PUT /api/auth/profile ────────────────────────────────────────────────

  fastify.put('/api/auth/profile', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          name:        { type: 'string', minLength: 1 },
          oldPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 8 },
        },
      },
    },
  }, async (request, reply) => {
    const { name, oldPassword, newPassword } = request.body as {
      name?: string
      oldPassword?: string
      newPassword?: string
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, request.user.id))
      .limit(1)

    if (!user) {
      return reply.status(404).send({ error: 'User not found', code: 'USER_NOT_FOUND' })
    }

    const updates: Partial<typeof users.$inferInsert> = {}

    if (name !== undefined) {
      updates.name = name
    }

    if (newPassword !== undefined) {
      if (!oldPassword) {
        return reply.status(400).send({ error: 'Old password required to set a new password', code: 'OLD_PASSWORD_REQUIRED' })
      }
      const valid = await argon2.verify(user.passwordHash, oldPassword)
      if (!valid) {
        return reply.status(400).send({ error: 'Incorrect current password', code: 'WRONG_PASSWORD' })
      }
      updates.passwordHash = await argon2.hash(newPassword)
    }

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: 'No fields to update', code: 'NO_UPDATES' })
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id))
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role })

    return updated
  })
}

import type { FastifyInstance } from 'fastify'
import { eq, and, desc, count } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db.js'
import { jobs, users } from '@blurr-tools/db'

const listQuerySchema = z.object({
  feature: z.string().optional(),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
  offset:  z.coerce.number().int().min(0).default(0),
})

export async function jobsRoutes(fastify: FastifyInstance) {
  // ─── GET /api/jobs ────────────────────────────────────────────────────────

  fastify.get('/api/jobs', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const q = listQuerySchema.parse(request.query)

    const where = q.feature ? eq(jobs.feature, q.feature as 'daily_orders_export' | 'priority_export') : undefined

    const [jobsList, totalResult] = await Promise.all([
      db
        .select({
          id:           jobs.id,
          feature:      jobs.feature,
          status:       jobs.status,
          options:      jobs.options,
          result:       jobs.result,
          progress:     jobs.progress,
          errorMessage: jobs.errorMessage,
          startedAt:    jobs.startedAt,
          completedAt:  jobs.completedAt,
          createdAt:    jobs.createdAt,
          updatedAt:    jobs.updatedAt,
          createdBy: {
            id:   users.id,
            name: users.name,
          },
        })
        .from(jobs)
        .leftJoin(users, eq(jobs.createdBy, users.id))
        .where(where)
        .orderBy(desc(jobs.createdAt))
        .limit(q.limit)
        .offset(q.offset),
      db.select({ total: count() }).from(jobs).where(where),
    ])

    return {
      jobs: jobsList.map(j => ({
        ...j,
        createdBy: j.createdBy?.id !== null ? j.createdBy : null,
      })),
      total: totalResult[0]?.total ?? 0,
    }
  })

  // ─── GET /api/jobs/:id ────────────────────────────────────────────────────

  fastify.get('/api/jobs/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const [job] = await db
      .select({
        id:           jobs.id,
        feature:      jobs.feature,
        status:       jobs.status,
        options:      jobs.options,
        result:       jobs.result,
        progress:     jobs.progress,
        errorMessage: jobs.errorMessage,
        startedAt:    jobs.startedAt,
        completedAt:  jobs.completedAt,
        createdAt:    jobs.createdAt,
        updatedAt:    jobs.updatedAt,
        createdBy: {
          id:   users.id,
          name: users.name,
        },
      })
      .from(jobs)
      .leftJoin(users, eq(jobs.createdBy, users.id))
      .where(eq(jobs.id, id))
      .limit(1)

    if (!job) {
      return reply.status(404).send({ error: 'Job not found', code: 'NOT_FOUND' })
    }

    return {
      ...job,
      createdBy: job.createdBy?.id !== null ? job.createdBy : null,
    }
  })

  // ─── DELETE /api/jobs/:id (cancel) ────────────────────────────────────────

  fastify.delete('/api/jobs/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const [job] = await db
      .select({ id: jobs.id, status: jobs.status })
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1)

    if (!job) {
      return reply.status(404).send({ error: 'Job not found', code: 'NOT_FOUND' })
    }

    if (!['pending', 'running'].includes(job.status)) {
      return reply.status(400).send({
        error: 'Can only cancel pending or running jobs',
        code:  'INVALID_STATUS',
      })
    }

    await db
      .update(jobs)
      .set({ status: 'cancelled', completedAt: new Date() })
      .where(eq(jobs.id, id))

    return { success: true }
  })
}

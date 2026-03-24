import type { FastifyInstance } from 'fastify'
import { and, eq, like, gte, lte, desc, count } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db.js'
import { systemLogs } from '@blurr-tools/db'

const querySchema = z.object({
  limit:   z.coerce.number().int().min(1).max(200).default(50),
  offset:  z.coerce.number().int().min(0).default(0),
  level:   z.enum(['info', 'warning', 'error']).optional(),
  source:  z.enum(['api', 'worker', 'scheduler', 'system']).optional(),
  feature: z.string().optional(),
  jobId:   z.string().optional(),
  search:  z.string().optional(),
  from:    z.string().optional(),
  to:      z.string().optional(),
})

export async function logsRoutes(fastify: FastifyInstance) {
  // ─── GET /api/logs ────────────────────────────────────────────────────────

  fastify.get('/api/logs', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const q = querySchema.parse(request.query)

    const conditions = []

    if (q.level)   conditions.push(eq(systemLogs.level,   q.level))
    if (q.source)  conditions.push(eq(systemLogs.source,  q.source))
    if (q.feature) conditions.push(eq(systemLogs.feature, q.feature as 'daily_orders_export'))
    if (q.jobId)   conditions.push(eq(systemLogs.jobId,   q.jobId))
    if (q.search)  conditions.push(like(systemLogs.message, `%${q.search}%`))
    if (q.from)    conditions.push(gte(systemLogs.createdAt, new Date(q.from)))
    if (q.to)      conditions.push(lte(systemLogs.createdAt, new Date(q.to + 'T23:59:59.999Z')))

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [logsList, totalResult] = await Promise.all([
      db
        .select()
        .from(systemLogs)
        .where(where)
        .orderBy(desc(systemLogs.createdAt))
        .limit(q.limit)
        .offset(q.offset),
      db.select({ total: count() }).from(systemLogs).where(where),
    ])

    return { logs: logsList, total: totalResult[0]?.total ?? 0 }
  })
}

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../db.js'
import { jobs, scheduledExports } from '@blurr-tools/db'
import { queues } from '../../queues.js'
import { log } from '../../logger.js'

const FEATURE    = 'daily_orders_export' as const
const DATE_RE    = /^\d{4}-\d{2}-\d{2}$/
const MAX_RANGE  = 90

const exportBodySchema = z.object({
  dateFrom: z.string().regex(DATE_RE, 'Must be YYYY-MM-DD'),
  dateTo:   z.string().regex(DATE_RE, 'Must be YYYY-MM-DD'),
})

const scheduleBodySchema = z.object({
  enabled:  z.boolean().optional(),
  cron:     z.string().optional(),
  timezone: z.string().optional(),
})

function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = []
  const start = new Date(`${from}T00:00:00Z`)
  const end   = new Date(`${to}T00:00:00Z`)
  while (start <= end) {
    dates.push(start.toISOString().slice(0, 10))
    start.setUTCDate(start.getUTCDate() + 1)
  }
  return dates
}

export async function dailyOrdersRoutes(fastify: FastifyInstance) {
  // ─── POST /api/features/daily-orders/export ──────────────────────────────

  fastify.post('/api/features/daily-orders/export', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const parsed = exportBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body', code: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    }

    const { dateFrom, dateTo } = parsed.data

    if (dateTo < dateFrom) {
      return reply.status(400).send({ error: '"dateTo" must be on or after "dateFrom"', code: 'INVALID_RANGE' })
    }

    const dates = getDatesInRange(dateFrom, dateTo)
    if (dates.length > MAX_RANGE) {
      return reply.status(400).send({ error: `Date range may not exceed ${MAX_RANGE} days`, code: 'RANGE_TOO_LARGE' })
    }

    const jobIds: string[] = []

    for (const date of dates) {
      const [job] = await db
        .insert(jobs)
        .values({
          feature:   FEATURE,
          createdBy: request.user.id,
          options:   { date },
        })
        .returning({ id: jobs.id })

      await queues.dailyOrdersExport.add('export', { jobId: job.id, date })
      jobIds.push(job.id)
    }

    log({
      level:   'info',
      source:  'api',
      action:  'export.triggered',
      message: `Daily orders export triggered for ${dateFrom}${dateFrom !== dateTo ? ` → ${dateTo}` : ''} (${dates.length} day${dates.length > 1 ? 's' : ''})`,
      feature: FEATURE,
      jobId:   jobIds[0],
      userId:  request.user.id,
      meta:    { dateFrom, dateTo, count: dates.length, jobIds },
    })

    return { jobIds, count: dates.length }
  })

  // ─── GET /api/features/daily-orders/schedule ─────────────────────────────

  fastify.get('/api/features/daily-orders/schedule', {
    onRequest: [fastify.authenticate],
  }, async () => {
    const [schedule] = await db
      .select()
      .from(scheduledExports)
      .where(eq(scheduledExports.feature, FEATURE))
      .limit(1)

    return schedule ?? null
  })

  // ─── PUT /api/features/daily-orders/schedule ─────────────────────────────

  fastify.put('/api/features/daily-orders/schedule', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', code: 'FORBIDDEN' })
    }

    const parsed = scheduleBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body', code: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    }

    const { enabled, cron, timezone } = parsed.data

    const [existing] = await db
      .select()
      .from(scheduledExports)
      .where(eq(scheduledExports.feature, FEATURE))
      .limit(1)

    const updates: Record<string, unknown> = {}
    if (enabled  !== undefined) updates.enabled  = enabled
    if (cron     !== undefined) updates.cron     = cron
    if (timezone !== undefined) updates.timezone = timezone

    let schedule

    if (existing) {
      const [updated] = await db
        .update(scheduledExports)
        .set(updates)
        .where(eq(scheduledExports.feature, FEATURE))
        .returning()
      schedule = updated
    } else {
      const [created] = await db
        .insert(scheduledExports)
        .values({
          feature:  FEATURE,
          name:     'Daily Orders Export',
          cron:     cron     ?? '0 8 * * *',
          timezone: timezone ?? 'America/New_York',
          enabled:  enabled  ?? false,
        })
        .returning()
      schedule = created
    }

    log({
      level:   'info',
      source:  'api',
      action:  'schedule.updated',
      message: 'Daily orders schedule updated',
      feature: FEATURE,
      userId:  request.user.id,
      meta:    updates,
    })

    return schedule
  })
}

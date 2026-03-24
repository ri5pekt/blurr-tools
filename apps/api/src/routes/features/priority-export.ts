import type { FastifyInstance } from 'fastify'
import { createReadStream, existsSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../db.js'
import { jobs } from '@blurr-tools/db'
import { queues } from '../../queues.js'
import { log } from '../../logger.js'
import { env } from '../../env.js'

const FEATURE = 'priority_export' as const
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const exportBodySchema = z.object({
  dateFrom: z.string().regex(DATE_RE, 'Must be YYYY-MM-DD').optional(),
  dateTo:   z.string().regex(DATE_RE, 'Must be YYYY-MM-DD').optional(),
  orderIds: z.array(z.string().min(1)).optional(),
}).refine(
  (d) => (d.dateFrom && d.dateTo) || (d.orderIds && d.orderIds.length > 0),
  { message: 'Provide either dateFrom + dateTo, or a non-empty orderIds array' },
)

export async function priorityExportRoutes(fastify: FastifyInstance) {
  // ─── POST /api/features/priority-export/export ───────────────────────────

  fastify.post('/api/features/priority-export/export', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const parsed = exportBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error:   'Invalid request body',
        code:    'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      })
    }

    const { dateFrom, dateTo, orderIds } = parsed.data

    if (dateFrom && dateTo && dateTo < dateFrom) {
      return reply.status(400).send({
        error: '"dateTo" must be on or after "dateFrom"',
        code:  'INVALID_RANGE',
      })
    }

    const [job] = await db
      .insert(jobs)
      .values({
        feature:   FEATURE,
        createdBy: request.user.id,
        options:   { dateFrom, dateTo, orderIds },
      })
      .returning({ id: jobs.id })

    await queues.priorityExport.add('export', {
      jobId: job.id,
      dateFrom,
      dateTo,
      orderIds,
    })

    log({
      level:   'info',
      source:  'api',
      action:  'export.triggered',
      message: orderIds?.length
        ? `Priority export triggered for ${orderIds.length} order IDs`
        : `Priority export triggered for ${dateFrom} → ${dateTo}`,
      feature: FEATURE,
      jobId:   job.id,
      userId:  request.user.id,
      meta:    { dateFrom, dateTo, orderIds },
    })

    return { jobId: job.id }
  })

  // ─── GET /api/features/priority-export/download/:jobId ───────────────────

  fastify.get('/api/features/priority-export/download/:jobId', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string }

    const [job] = await db
      .select({ id: jobs.id, status: jobs.status, result: jobs.result })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)

    if (!job) {
      return reply.status(404).send({ error: 'Job not found', code: 'NOT_FOUND' })
    }

    if (job.status !== 'completed') {
      return reply.status(400).send({ error: 'Job is not completed yet', code: 'NOT_READY' })
    }

    const result = job.result as Record<string, unknown> | null
    const filePath = result?.filePath as string | undefined
    const fileName = result?.fileName as string | undefined

    if (!filePath || !fileName) {
      return reply.status(404).send({ error: 'No file associated with this job', code: 'NO_FILE' })
    }

    const absolutePath = filePath.startsWith('/')
      ? filePath
      : join(env.EXPORTS_DIR, 'priority', fileName)

    if (!existsSync(absolutePath)) {
      return reply.status(404).send({ error: 'Export file not found on disk', code: 'FILE_NOT_FOUND' })
    }

    reply.header('Content-Type', 'text/plain; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="${fileName}"`)

    return reply.send(createReadStream(absolutePath))
  })
}

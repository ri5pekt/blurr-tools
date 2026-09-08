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

const FEATURE = 'refunds_export' as const
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const exportBodySchema = z.object({
  dateFrom: z.string().regex(DATE_RE, 'Must be YYYY-MM-DD'),
  dateTo:   z.string().regex(DATE_RE, 'Must be YYYY-MM-DD'),
})

export async function refundsExportRoutes(fastify: FastifyInstance) {
  // ─── POST /api/features/refunds-export/export ─────────────────────────────

  fastify.post('/api/features/refunds-export/export', {
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

    const { dateFrom, dateTo } = parsed.data

    if (dateTo < dateFrom) {
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
        options:   { dateFrom, dateTo },
      })
      .returning({ id: jobs.id })

    await queues.refundsExport.add('export', {
      jobId: job.id,
      dateFrom,
      dateTo,
    })

    log({
      level:   'info',
      source:  'api',
      action:  'export.triggered',
      message: `Refunds export triggered for ${dateFrom} → ${dateTo}`,
      feature: FEATURE,
      jobId:   job.id,
      userId:  request.user.id,
      meta:    { dateFrom, dateTo },
    })

    return { jobId: job.id }
  })

  // ─── GET /api/features/refunds-export/download/:jobId ─────────────────────

  fastify.get('/api/features/refunds-export/download/:jobId', {
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
      : join(env.EXPORTS_DIR, 'refunds', fileName)

    if (!existsSync(absolutePath)) {
      return reply.status(404).send({ error: 'Export file not found on disk', code: 'FILE_NOT_FOUND' })
    }

    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="${fileName}"`)

    return reply.send(createReadStream(absolutePath))
  })
}

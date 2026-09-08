import { Worker } from 'bullmq'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { connection } from '../queues.js'
import { db } from '../db.js'
import { jobs } from '@blurr-tools/db'
import { startJob, updateJobProgress, completeJob, failJob } from '../utils/job.js'
import { log } from '../logger.js'
import { fetchOrdersUpdatedInRange, getStoreTimezone, localDayToUtcWindow } from '../shopify/client.js'
import { formatRefundsToCsv, type RefundRow } from '../utils/refunds-formatter.js'
import { env } from '../env.js'

const FEATURE = 'refunds_export' as const

interface RefundsExportJobData {
  jobId?:    string
  dateFrom:  string // YYYY-MM-DD
  dateTo:    string // YYYY-MM-DD
}

function buildFileName(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `refunds-export-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.csv`
}

export function registerRefundsExportProcessor(): Worker {
  const worker = new Worker<RefundsExportJobData>(
    'refunds_export',
    async (job) => {
      const { dateFrom, dateTo } = job.data

      let dbJobId = job.data.jobId

      if (!dbJobId) {
        const [dbJob] = await db
          .insert(jobs)
          .values({
            feature: FEATURE,
            options: { dateFrom, dateTo },
          })
          .returning({ id: jobs.id })
        dbJobId = dbJob.id
      }

      await startJob(dbJobId)

      log({
        level:   'info',
        source:  'worker',
        action:  'job.started',
        message: `Refunds export started for ${dateFrom} → ${dateTo}`,
        feature: FEATURE,
        jobId:   dbJobId,
        meta:    { dateFrom, dateTo },
      })

      try {
        // ── Step 1: Fetch orders updated in range (0–60%) ──────────────────
        await updateJobProgress(dbJobId, 10)

        log({
          level:   'info',
          source:  'worker',
          action:  'shopify.fetch.started',
          message: 'Fetching orders from Shopify',
          feature: FEATURE,
          jobId:   dbJobId,
        })

        const orders = await fetchOrdersUpdatedInRange(dateFrom, dateTo)

        await updateJobProgress(dbJobId, 50)

        // ── Step 2: Filter down to refunds that actually happened in range ──
        // Uses the store's local-day boundaries (same convention as every other
        // date-range fetch in this app) so "Sep 1 → Sep 3" matches the store's
        // own calendar, not raw UTC days.
        const storeTz    = await getStoreTimezone()
        const startBound = new Date(localDayToUtcWindow(dateFrom, storeTz).min)
        const endBound   = new Date(localDayToUtcWindow(dateTo,   storeTz).max)

        const refundRows: RefundRow[] = []
        for (const order of orders) {
          for (const refund of order.refunds ?? []) {
            const refundTime = new Date(refund.created_at)
            if (refundTime >= startBound && refundTime <= endBound) {
              refundRows.push({ order, refund })
            }
          }
        }

        await updateJobProgress(dbJobId, 60)

        log({
          level:   'info',
          source:  'worker',
          action:  'shopify.fetch.completed',
          message: `Found ${refundRows.length} refunds across ${orders.length} orders`,
          feature: FEATURE,
          jobId:   dbJobId,
          meta:    { refundsCount: refundRows.length, ordersScanned: orders.length },
        })

        // ── Step 3: Format to CSV (60–80%) ─────────────────────────────────
        await updateJobProgress(dbJobId, 70)

        const csvContent = formatRefundsToCsv(refundRows)

        // ── Step 4: Save file (80–100%) ────────────────────────────────────
        await updateJobProgress(dbJobId, 80)

        const exportsDir = join(env.EXPORTS_DIR, 'refunds')
        await mkdir(exportsDir, { recursive: true })

        const fileName = buildFileName()
        const filePath = join(exportsDir, fileName)
        await writeFile(filePath, csvContent, 'utf8')

        await completeJob(dbJobId, {
          refundsCount: refundRows.length,
          fileName,
          filePath,
        })

        log({
          level:   'info',
          source:  'worker',
          action:  'job.completed',
          message: `Refunds export completed: ${refundRows.length} refunds → ${fileName}`,
          feature: FEATURE,
          jobId:   dbJobId,
          meta:    { refundsCount: refundRows.length, fileName },
        })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)

        await failJob(dbJobId, message)

        log({
          level:   'error',
          source:  'worker',
          action:  'job.failed',
          message: `Refunds export failed: ${message}`,
          feature: FEATURE,
          jobId:   dbJobId,
          meta:    { dateFrom, dateTo, error: message },
        })

        throw err
      }
    },
    { connection: connection as any, concurrency: 1 },
  )

  worker.on('error', (err) => {
    console.error('[refunds-export] Worker error:', err.message)
  })

  console.log('[worker] Refunds export processor registered')
  return worker
}

import { Worker } from 'bullmq'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { connection } from '../queues.js'
import { db } from '../db.js'
import { jobs } from '@blurr-tools/db'
import { startJob, updateJobProgress, completeJob, failJob } from '../utils/job.js'
import { log } from '../logger.js'
import { fetchOrdersForPriorityRange, fetchOrdersByIds } from '../shopify/client.js'
import { formatOrdersToPriorityTxt } from '../utils/priority-formatter.js'
import { env } from '../env.js'

interface PriorityExportJobData {
  jobId?:    string
  dateFrom?: string   // YYYY-MM-DD
  dateTo?:   string   // YYYY-MM-DD
  orderIds?: string[] // explicit Shopify order IDs
}

function buildFileName(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `priority-export-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.txt`
}

export function registerPriorityExportProcessor(): Worker {
  const worker = new Worker<PriorityExportJobData>(
    'priority_export',
    async (job) => {
      const { dateFrom, dateTo, orderIds } = job.data

      let dbJobId = job.data.jobId

      if (!dbJobId) {
        const [dbJob] = await db
          .insert(jobs)
          .values({
            feature: 'priority_export',
            options: { dateFrom, dateTo, orderIds },
          })
          .returning({ id: jobs.id })
        dbJobId = dbJob.id
      }

      await startJob(dbJobId)

      log({
        level:   'info',
        source:  'worker',
        action:  'job.started',
        message: orderIds?.length
          ? `Priority export started for ${orderIds.length} order IDs`
          : `Priority export started for ${dateFrom} → ${dateTo}`,
        feature: 'priority_export',
        jobId:   dbJobId,
        meta:    { dateFrom, dateTo, orderIds },
      })

      try {
        // ── Step 1: Fetch orders from Shopify (0–60%) ──────────────────────
        await updateJobProgress(dbJobId, 10)

        log({
          level:   'info',
          source:  'worker',
          action:  'shopify.fetch.started',
          message: 'Fetching orders from Shopify',
          feature: 'priority_export',
          jobId:   dbJobId,
        })

        // Only export orders that were paid at some point — mirrors the PHP plugin's
        // wc-processing / wc-completed / wc-on-hold / wc-refunded filter.
        const PAID_STATUSES = new Set([
          'paid', 'partially_paid', 'authorized', 'partially_refunded', 'refunded',
        ])

        let orders
        if (orderIds && orderIds.length > 0) {
          const fetched = await fetchOrdersByIds(orderIds)
          orders = fetched.filter(o => PAID_STATUSES.has(o.financial_status))
        } else if (dateFrom && dateTo) {
          const fetched = await fetchOrdersForPriorityRange(dateFrom, dateTo)
          orders = fetched.filter(o => PAID_STATUSES.has(o.financial_status))
        } else {
          throw new Error('Either dateFrom/dateTo or orderIds must be provided')
        }

        await updateJobProgress(dbJobId, 60)

        log({
          level:   'info',
          source:  'worker',
          action:  'shopify.fetch.completed',
          message: `Fetched ${orders.length} paid orders from Shopify`,
          feature: 'priority_export',
          jobId:   dbJobId,
          meta:    { ordersCount: orders.length },
        })

        // ── Step 2: Format to Priority TXT (60–80%) ────────────────────────
        await updateJobProgress(dbJobId, 70)

        const txtContent = formatOrdersToPriorityTxt(orders)

        // ── Step 3: Save file (80–100%) ────────────────────────────────────
        await updateJobProgress(dbJobId, 80)

        const exportsDir = join(env.EXPORTS_DIR, 'priority')
        await mkdir(exportsDir, { recursive: true })

        const fileName = buildFileName()
        const filePath = join(exportsDir, fileName)
        await writeFile(filePath, txtContent, 'utf8')

        await completeJob(dbJobId, {
          ordersCount: orders.length,
          fileName,
          filePath,
        })

        log({
          level:   'info',
          source:  'worker',
          action:  'job.completed',
          message: `Priority export completed: ${orders.length} orders → ${fileName}`,
          feature: 'priority_export',
          jobId:   dbJobId,
          meta:    { ordersCount: orders.length, fileName },
        })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)

        await failJob(dbJobId, message)

        log({
          level:   'error',
          source:  'worker',
          action:  'job.failed',
          message: `Priority export failed: ${message}`,
          feature: 'priority_export',
          jobId:   dbJobId,
          meta:    { dateFrom, dateTo, orderIds, error: message },
        })

        throw err
      }
    },
    { connection: connection as any, concurrency: 1 },
  )

  worker.on('error', (err) => {
    console.error('[priority-export] Worker error:', err.message)
  })

  console.log('[worker] Priority export processor registered')
  return worker
}

import { Worker } from 'bullmq'
import { connection } from '../queues.js'
import { db } from '../db.js'
import { jobs } from '@blurr-tools/db'
import { startJob, updateJobProgress, completeJob, failJob } from '../utils/job.js'
import { log } from '../logger.js'
import { fetchOrdersForDate } from '../shopify/client.js'
import { writeOrdersToSheet } from '../google/sheets.js'

interface DailyOrdersJobData {
  jobId?: string
  date:   string // YYYY-MM-DD or 'auto' for previous day
}

function getPreviousDay(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function registerDailyOrdersProcessor(): Worker {
  const worker = new Worker<DailyOrdersJobData>(
    'daily_orders_export',
    async (job) => {
      const date = job.data.date === 'auto' ? getPreviousDay() : job.data.date

      // For scheduled jobs (no jobId in data), create a DB row here
      let dbJobId = job.data.jobId

      if (!dbJobId) {
        const [dbJob] = await db
          .insert(jobs)
          .values({
            feature: 'daily_orders_export',
            options: { date, scheduled: true },
          })
          .returning({ id: jobs.id })
        dbJobId = dbJob.id

        log({
          level:   'info',
          source:  'scheduler',
          action:  'export.triggered',
          message: `Scheduled daily orders export triggered for ${date}`,
          feature: 'daily_orders_export',
          jobId:   dbJobId,
        })
      }

      await startJob(dbJobId)

      log({
        level:   'info',
        source:  'worker',
        action:  'job.started',
        message: `Daily orders export started for ${date}`,
        feature: 'daily_orders_export',
        jobId:   dbJobId,
        meta:    { date },
      })

      try {
        // Step 1: Fetch orders from Shopify (0–50%)
        await updateJobProgress(dbJobId, 10)

        log({
          level:   'info',
          source:  'worker',
          action:  'shopify.fetch.started',
          message: `Fetching orders from Shopify for ${date}`,
          feature: 'daily_orders_export',
          jobId:   dbJobId,
        })

        const orders = await fetchOrdersForDate(date)

        await updateJobProgress(dbJobId, 50)

        log({
          level:   'info',
          source:  'worker',
          action:  'shopify.fetch.completed',
          message: `Fetched ${orders.length} orders from Shopify for ${date}`,
          feature: 'daily_orders_export',
          jobId:   dbJobId,
          meta:    { ordersCount: orders.length, date },
        })

        // Step 2: Write to Google Sheets (50–100%)
        log({
          level:   'info',
          source:  'worker',
          action:  'sheets.write.started',
          message: `Writing ${orders.length} orders to Google Sheets`,
          feature: 'daily_orders_export',
          jobId:   dbJobId,
        })

        const result = await writeOrdersToSheet(date, orders)

        await completeJob(dbJobId, {
          ordersCount: result.ordersCount,
          sheetUrl:    result.sheetUrl,
          tabName:     result.tabName,
          rowNumber:   result.rowNumber,
          date,
        })

        log({
          level:   'info',
          source:  'worker',
          action:  'job.completed',
          message: `Daily orders export completed: ${result.ordersCount} orders → "${result.tabName}" row ${result.rowNumber}`,
          feature: 'daily_orders_export',
          jobId:   dbJobId,
          meta:    { ordersCount: result.ordersCount, sheetUrl: result.sheetUrl, tabName: result.tabName, rowNumber: result.rowNumber, date },
        })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)

        await failJob(dbJobId, message)

        log({
          level:   'error',
          source:  'worker',
          action:  'job.failed',
          message: `Daily orders export failed for ${date}: ${message}`,
          feature: 'daily_orders_export',
          jobId:   dbJobId,
          meta:    { date, error: message },
        })

        throw err
      }
    },
    { connection: connection as any, concurrency: 1 },
  )

  worker.on('error', (err) => {
    console.error('[daily-orders] Worker error:', err.message)
  })

  console.log('[worker] Daily orders processor registered')
  return worker
}

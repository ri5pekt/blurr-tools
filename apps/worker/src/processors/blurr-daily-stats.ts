import { Worker } from 'bullmq'
import { connection } from '../queues.js'
import { db } from '../db.js'
import { jobs } from '@blurr-tools/db'
import { startJob, updateJobProgress, completeJob, failJob } from '../utils/job.js'
import { log } from '../logger.js'
import { fetchFeesForDate } from '../shopify/client.js'
import { fetchMetorikDailyStats } from '../metorik/client.js'
import { writeBlurrDailyStatsToSheet } from '../google/sheets.js'

const FEATURE = 'blurr_daily_stats_export' as const

interface BlurrDailyStatsJobData {
  jobId?: string
  date:   string // YYYY-MM-DD or 'auto' for previous day
}

function getPreviousDay(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function registerBlurrDailyStatsProcessor(): Worker {
  const worker = new Worker<BlurrDailyStatsJobData>(
    'blurr_daily_stats_export',
    async (job) => {
      const date = job.data.date === 'auto' ? getPreviousDay() : job.data.date

      let dbJobId = job.data.jobId

      if (!dbJobId) {
        const [dbJob] = await db
          .insert(jobs)
          .values({
            feature: FEATURE,
            options: { date, scheduled: true },
          })
          .returning({ id: jobs.id })
        dbJobId = dbJob.id

        log({
          level:   'info',
          source:  'scheduler',
          action:  'export.triggered',
          message: `Scheduled Blurr daily stats export triggered for ${date}`,
          feature: FEATURE,
          jobId:   dbJobId,
        })
      }

      await startJob(dbJobId)

      log({
        level:   'info',
        source:  'worker',
        action:  'job.started',
        message: `Blurr daily stats export started for ${date}`,
        feature: FEATURE,
        jobId:   dbJobId,
        meta:    { date },
      })

      try {
        // Step 1: Fetch stats from Metorik (0–70%)
        await updateJobProgress(dbJobId, 10)

        log({
          level:   'info',
          source:  'worker',
          action:  'metorik.fetch.started',
          message: `Fetching daily stats from Metorik for ${date}`,
          feature: FEATURE,
          jobId:   dbJobId,
        })

        const metorikStats = await fetchMetorikDailyStats(date)
        await updateJobProgress(dbJobId, 50)

        log({
          level:   'info',
          source:  'worker',
          action:  'metorik.fetch.completed',
          message: `Metorik stats for ${date}: ${metorikStats.totalOrders} orders, $${metorikStats.grossSales} gross, $${metorikStats.totalRefunds} refunds`,
          feature: FEATURE,
          jobId:   dbJobId,
          meta:    { totalOrders: metorikStats.totalOrders, grossSales: metorikStats.grossSales, totalRefunds: metorikStats.totalRefunds, date },
        })

        // Step 2: Fetch Shopify payment processing fees via GraphQL (50–70%)
        log({
          level:   'info',
          source:  'worker',
          action:  'shopify.fees.started',
          message: `Fetching Shopify payment fees for ${date}`,
          feature: FEATURE,
          jobId:   dbJobId,
        })

        const shopifyFees = await fetchFeesForDate(date)
        await updateJobProgress(dbJobId, 70)

        log({
          level:   'info',
          source:  'worker',
          action:  'shopify.fees.completed',
          message: `Fetched Shopify fees for ${date}: $${shopifyFees}`,
          feature: FEATURE,
          jobId:   dbJobId,
          meta:    { shopifyFees, date },
        })

        // Step 3: Write to Google Sheets (70–100%)
        const stats = {
          grossSales:              metorikStats.grossSales,
          netRevenue:              metorikStats.netRevenue,
          totalOrders:             metorikStats.totalOrders,
          shopifyFees:             Math.round(shopifyFees * 100) / 100,
          salesTax:                metorikStats.salesTax,
          totalUnits:              metorikStats.totalUnits,
          totalRefunds:            metorikStats.totalRefunds,
          newCustomers:            metorikStats.newCustomers,
          returningCustomerOrders: metorikStats.returningCustomerOrders,
          productUnits:            metorikStats.productUnits,
        }

        log({
          level:   'info',
          source:  'worker',
          action:  'sheets.write.started',
          message: `Writing Blurr daily stats to Google Sheets for ${date}`,
          feature: FEATURE,
          jobId:   dbJobId,
        })

        const result = await writeBlurrDailyStatsToSheet(date, stats)

        await completeJob(dbJobId, {
          ordersCount: result.ordersCount,
          sheetUrl:    result.sheetUrl,
          rowNumber:   result.rowNumber,
          shopifyFees: stats.shopifyFees,
          date,
        })

        log({
          level:   'info',
          source:  'worker',
          action:  'job.completed',
          message: `Blurr daily stats export completed: ${result.ordersCount} orders → row ${result.rowNumber}`,
          feature: FEATURE,
          jobId:   dbJobId,
          meta:    { ordersCount: result.ordersCount, sheetUrl: result.sheetUrl, rowNumber: result.rowNumber, date },
        })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)

        await failJob(dbJobId, message)

        log({
          level:   'error',
          source:  'worker',
          action:  'job.failed',
          message: `Blurr daily stats export failed for ${date}: ${message}`,
          feature: FEATURE,
          jobId:   dbJobId,
          meta:    { date, error: message },
        })

        throw err
      }
    },
    { connection: connection as any, concurrency: 1, limiter: { max: 1, duration: 5000 } },
  )

  worker.on('error', (err) => {
    console.error('[blurr-daily-stats] Worker error:', err.message)
  })

  console.log('[worker] Blurr daily stats processor registered')
  return worker
}

import { Worker } from 'bullmq'
import { connection } from '../queues.js'
import { db } from '../db.js'
import { jobs } from '@blurr-tools/db'
import { startJob, updateJobProgress, completeJob, failJob } from '../utils/job.js'
import { log } from '../logger.js'
import { fetchOrdersForDate, fetchFeesForDate } from '../shopify/client.js'
import { writeBlurrDailyStatsToSheet } from '../google/sheets.js'
import type { BlurrDailyStats } from '../google/sheets.js'
import type { ShopifyOrder } from '../shopify/client.js'

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

function computeRefundTotal(order: ShopifyOrder): number {
  const byPrice = Math.max(
    0,
    parseFloat(order.total_price) - parseFloat(order.current_total_price ?? order.total_price),
  )
  let byTxn = 0
  for (const r of order.refunds ?? []) {
    for (const txn of r.transactions ?? []) {
      if (txn.kind === 'refund' && txn.status === 'success') {
        byTxn += parseFloat(txn.amount ?? '0')
      }
    }
  }
  return Math.max(byPrice, byTxn)
}

function aggregateStats(orders: ShopifyOrder[], shopifyFees: number): BlurrDailyStats {
  // Exclude $0 / draft orders — same filter as Daily Orders Export
  const billableOrders = orders.filter(o =>
    o.source_name !== 'shopify_draft_order' &&
    parseFloat(o.total_price) > 0,
  )

  let grossSales   = 0
  let totalRefunds = 0
  let salesTax     = 0
  let totalUnits   = 0
  const productUnits: Record<string, number> = {}

  for (const o of billableOrders) {
    grossSales   += parseFloat(o.total_price)
    totalRefunds += computeRefundTotal(o)
    salesTax     += parseFloat(o.total_tax ?? '0')

    for (const li of o.line_items) {
      totalUnits += li.quantity ?? 0
      if (li.title) {
        productUnits[li.title] = (productUnits[li.title] ?? 0) + (li.quantity ?? 0)
      }
    }
  }

  return {
    grossSales:   Math.round(grossSales   * 100) / 100,
    totalOrders:  billableOrders.length,
    shopifyFees:  Math.round(shopifyFees  * 100) / 100,
    salesTax:     Math.round(salesTax     * 100) / 100,
    totalUnits,
    totalRefunds: Math.round(totalRefunds * 100) / 100,
    productUnits,
  }
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
        // Step 1: Fetch orders from Shopify REST (0–40%)
        await updateJobProgress(dbJobId, 10)

        log({
          level:   'info',
          source:  'worker',
          action:  'shopify.fetch.started',
          message: `Fetching orders from Shopify for ${date}`,
          feature: FEATURE,
          jobId:   dbJobId,
        })

        const orders = await fetchOrdersForDate(date)
        await updateJobProgress(dbJobId, 40)

        log({
          level:   'info',
          source:  'worker',
          action:  'shopify.fetch.completed',
          message: `Fetched ${orders.length} orders from Shopify for ${date}`,
          feature: FEATURE,
          jobId:   dbJobId,
          meta:    { ordersCount: orders.length, date },
        })

        // Step 2: Fetch Shopify payment fees via GraphQL (40–70%)
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
        const stats = aggregateStats(orders, shopifyFees)

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

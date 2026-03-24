import { eq } from 'drizzle-orm'
import { db } from './db.js'
import { scheduledExports } from '@blurr-tools/db'
import { queues } from './queues.js'

const FEATURE         = 'daily_orders_export' as const
const JOB_NAME        = 'scheduled'
const SYNC_INTERVAL   = 5 * 60 * 1000 // re-sync every 5 minutes

let lastCron: string | null = null
let lastEnabled: boolean | null = null

/**
 * Syncs the BullMQ repeatable job with the schedule stored in the DB.
 * Idempotent — only removes/adds if something changed.
 */
async function syncSchedule(): Promise<void> {
  const [schedule] = await db
    .select()
    .from(scheduledExports)
    .where(eq(scheduledExports.feature, FEATURE))
    .limit(1)

  const enabled  = schedule?.enabled  ?? false
  const cron     = schedule?.cron     ?? null
  const timezone = schedule?.timezone ?? 'America/New_York'

  const changed = enabled !== lastEnabled || cron !== lastCron

  if (!changed) return

  // Remove any existing repeatable job for this feature
  const repeatableJobs = await queues.dailyOrdersExport.getRepeatableJobs()
  for (const rj of repeatableJobs) {
    if (rj.name === JOB_NAME) {
      await queues.dailyOrdersExport.removeRepeatableByKey(rj.key)
      console.log('[scheduler] Removed old repeatable job:', rj.key)
    }
  }

  if (enabled && cron) {
    await queues.dailyOrdersExport.add(
      JOB_NAME,
      { date: 'auto' },
      { repeat: { pattern: cron, tz: timezone } },
    )
    console.log(`[scheduler] Registered repeatable job: ${cron} (${timezone})`)
  } else {
    console.log('[scheduler] Schedule disabled — no repeatable job registered')
  }

  lastEnabled = enabled
  lastCron    = cron
}

export async function startScheduler(): Promise<void> {
  await syncSchedule()
  setInterval(() => void syncSchedule(), SYNC_INTERVAL)
  console.log('[scheduler] Started (syncs every 5 min)')
}

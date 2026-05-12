import { eq } from 'drizzle-orm'
import { db } from './db.js'
import { scheduledExports } from '@blurr-tools/db'
import { queues } from './queues.js'

const SYNC_INTERVAL = 5 * 60 * 1000 // re-sync every 5 minutes
const JOB_NAME      = 'scheduled'

interface FeatureScheduleState {
  lastCron:    string | null
  lastEnabled: boolean | null
}

const state: Record<string, FeatureScheduleState> = {
  daily_orders_export:     { lastCron: null, lastEnabled: null },
  blurr_daily_stats_export: { lastCron: null, lastEnabled: null },
}

/**
 * Syncs the BullMQ repeatable job for a single feature with the schedule stored in the DB.
 * Idempotent — only removes/adds if something changed.
 */
async function syncFeatureSchedule(feature: 'daily_orders_export' | 'blurr_daily_stats_export'): Promise<void> {
  const queue = feature === 'daily_orders_export'
    ? queues.dailyOrdersExport
    : queues.blurrDailyStats

  const [schedule] = await db
    .select()
    .from(scheduledExports)
    .where(eq(scheduledExports.feature, feature))
    .limit(1)

  const enabled  = schedule?.enabled  ?? false
  const cron     = schedule?.cron     ?? null
  const timezone = schedule?.timezone ?? 'America/New_York'

  const s       = state[feature]!
  const changed = enabled !== s.lastEnabled || cron !== s.lastCron

  if (!changed) return

  const repeatableJobs = await queue.getRepeatableJobs()
  for (const rj of repeatableJobs) {
    if (rj.name === JOB_NAME) {
      await queue.removeRepeatableByKey(rj.key)
      console.log(`[scheduler] Removed old repeatable job for ${feature}:`, rj.key)
    }
  }

  if (enabled && cron) {
    await queue.add(
      JOB_NAME,
      { date: 'auto' },
      { repeat: { pattern: cron, tz: timezone } },
    )
    console.log(`[scheduler] Registered repeatable job for ${feature}: ${cron} (${timezone})`)
  } else {
    console.log(`[scheduler] Schedule disabled — no repeatable job registered for ${feature}`)
  }

  s.lastEnabled = enabled
  s.lastCron    = cron
}

async function syncSchedule(): Promise<void> {
  await syncFeatureSchedule('daily_orders_export')
  await syncFeatureSchedule('blurr_daily_stats_export')
}

export async function startScheduler(): Promise<void> {
  await syncSchedule()
  setInterval(() => void syncSchedule(), SYNC_INTERVAL)
  console.log('[scheduler] Started (syncs every 5 min)')
}

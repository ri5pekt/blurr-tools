import { eq } from 'drizzle-orm'
import { db } from './db.js'
import { scheduledExports } from '@blurr-tools/db'
import { parseCrons } from '@blurr-tools/types'
import { queues } from './queues.js'

const SYNC_INTERVAL = 5 * 60 * 1000 // re-sync every 5 minutes
const JOB_NAME      = 'scheduled'

interface FeatureScheduleState {
  lastCron:     string | null
  lastEnabled:  boolean | null
  lastTimezone: string | null
}

const state: Record<string, FeatureScheduleState> = {
  daily_orders_export:      { lastCron: null, lastEnabled: null, lastTimezone: null },
  blurr_daily_stats_export: { lastCron: null, lastEnabled: null, lastTimezone: null },
}

function isScheduledJobName(name: string): boolean {
  return name === JOB_NAME || name.startsWith(`${JOB_NAME}:`)
}

/**
 * Syncs BullMQ repeatable jobs for a feature with the schedule stored in the DB.
 * Supports multiple daily cron expressions stored as a plain string or JSON array.
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

  const s = state[feature]!
  const changed =
    enabled !== s.lastEnabled ||
    cron !== s.lastCron ||
    timezone !== s.lastTimezone

  if (!changed) return

  const repeatableJobs = await queue.getRepeatableJobs()
  for (const rj of repeatableJobs) {
    if (isScheduledJobName(rj.name)) {
      await queue.removeRepeatableByKey(rj.key)
      console.log(`[scheduler] Removed old repeatable job for ${feature}:`, rj.key)
    }
  }

  const crons = cron ? parseCrons(cron) : []

  if (enabled && crons.length > 0) {
    for (const pattern of crons) {
      // Distinct job name per pattern so BullMQ keeps separate repeatable keys
      const name = `${JOB_NAME}:${pattern}`
      await queue.add(
        name,
        { date: 'auto' },
        { repeat: { pattern, tz: timezone } },
      )
    }
    console.log(
      `[scheduler] Registered ${crons.length} repeatable job(s) for ${feature}: ${crons.join(', ')} (${timezone})`,
    )
  } else {
    console.log(`[scheduler] Schedule disabled — no repeatable job registered for ${feature}`)
  }

  s.lastEnabled  = enabled
  s.lastCron     = cron
  s.lastTimezone = timezone
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

// ─── Auth ────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'staff'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export type FeatureKey = 'daily_orders_export' | 'priority_export' | 'blurr_daily_stats_export'

export interface Job {
  id: string
  feature: FeatureKey
  status: JobStatus
  options: Record<string, unknown> | null
  result: Record<string, unknown> | null
  progress: number
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdBy: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

/** Options stored on scheduled_exports.options for daily_orders_export */
export interface DailyOrdersScheduleOptions {
  /** When true, each auto-run also re-exports the day before yesterday. */
  includeDayBefore?: boolean
}

export interface ScheduledExport {
  id: string
  feature: FeatureKey
  name: string
  /** Stored form: plain cron for 1 time, JSON array string for 2+ */
  cron: string
  /** Derived list of daily cron expressions (always present on API responses) */
  crons?: string[]
  timezone: string
  enabled: boolean
  options: (DailyOrdersScheduleOptions & Record<string, unknown>) | null
  createdAt: string
  updatedAt: string
}

/** Max number of daily run times allowed on one schedule. */
export const MAX_SCHEDULE_CRONS = 4

const DAILY_CRON_RE = /^(\d{1,2}) (\d{1,2}) \* \* \*$/

/**
 * Parses `scheduled_exports.cron` into a list of daily cron expressions.
 * Accepts a plain cron string or a JSON array string of crons.
 */
export function parseCrons(cron: string): string[] {
  const trimmed = cron.trim()
  if (!trimmed) return []

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) {
        return normalizeCrons(parsed.map(String))
      }
    } catch {
      // fall through to single-cron handling
    }
  }

  return normalizeCrons([trimmed])
}

/**
 * Serializes cron list for storage: 1 → plain string, 2+ → JSON array string.
 */
export function serializeCrons(crons: string[]): string {
  const normalized = normalizeCrons(crons)
  if (normalized.length === 0) return '0 8 * * *'
  if (normalized.length === 1) return normalized[0]!
  return JSON.stringify(normalized)
}

function normalizeCrons(crons: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  for (const raw of crons) {
    const c = raw.trim()
    const m = DAILY_CRON_RE.exec(c)
    if (!m) continue
    const minute = parseInt(m[1]!, 10)
    const hour   = parseInt(m[2]!, 10)
    if (minute < 0 || minute > 59 || hour < 0 || hour > 23) continue
    const normalized = `${minute} ${hour} * * *`
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }

  out.sort((a, b) => {
    const [am, ah] = a.split(' ').map(Number)
    const [bm, bh] = b.split(' ').map(Number)
    return (ah! - bh!) || (am! - bm!)
  })

  return out.slice(0, MAX_SCHEDULE_CRONS)
}

/** Enrich a DB schedule row with a derived `crons` array for API responses. */
export function withCrons<T extends { cron: string }>(schedule: T): T & { crons: string[] } {
  return { ...schedule, crons: parseCrons(schedule.cron) }
}

// ─── Logs ────────────────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warning' | 'error'
export type LogSource = 'api' | 'worker' | 'scheduler' | 'system'

export interface SystemLog {
  id: string
  level: LogLevel
  source: LogSource
  feature: FeatureKey | null
  jobId: string | null
  userId: string | null
  action: string
  message: string
  meta: Record<string, unknown> | null
  createdAt: string
}

// ─── API responses ───────────────────────────────────────────────────────────

export interface ApiError {
  error: string
  code: string
  details?: unknown
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
}

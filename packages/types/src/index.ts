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

export type FeatureKey = 'daily_orders_export' | 'priority_export'

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

export interface ScheduledExport {
  id: string
  feature: FeatureKey
  name: string
  cron: string
  timezone: string
  enabled: boolean
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
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

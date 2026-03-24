import type { Db } from './index.js'
import { systemLogs } from './schema/index.js'

type LogLevel  = 'info' | 'warning' | 'error'
type LogSource = 'api' | 'worker' | 'scheduler' | 'system'
type Feature   = 'daily_orders_export' | 'priority_export'

export interface LogInput {
  level:    LogLevel
  source:   LogSource
  action:   string
  message:  string
  feature?: Feature | null
  jobId?:   string | null
  userId?:  string | null
  meta?:    Record<string, unknown> | null
}

export type LogFn = (input: LogInput) => void

export function createLogger(db: Db): LogFn {
  return function log(input: LogInput): void {
    void db
      .insert(systemLogs)
      .values({
        level:   input.level,
        source:  input.source,
        action:  input.action,
        message: input.message,
        feature: input.feature ?? null,
        jobId:   input.jobId   ?? null,
        userId:  input.userId  ?? null,
        meta:    input.meta    ?? null,
      })
      .catch((err: unknown) => {
        console.error('[logger] Failed to write log entry:', err)
      })
  }
}

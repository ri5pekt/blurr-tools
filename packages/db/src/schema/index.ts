import {
  pgTable, pgEnum, uuid, text, boolean, timestamp,
  integer, jsonb, index,
} from 'drizzle-orm/pg-core'

// ─── Auth enums ───────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['admin', 'staff'])

// ─── Job enums ────────────────────────────────────────────────────────────────

export const jobStatusEnum = pgEnum('job_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
])

export const featureEnum = pgEnum('feature', [
  'daily_orders_export',
])

// ─── Log enums ────────────────────────────────────────────────────────────────

export const logLevelEnum  = pgEnum('log_level',  ['info', 'warning', 'error'])
export const logSourceEnum = pgEnum('log_source', ['api', 'worker', 'scheduler', 'system'])

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  email:        text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name:         text('name').notNull(),
  role:         userRoleEnum('role').notNull().default('staff'),
  isActive:     boolean('is_active').notNull().default(true),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
})

// ─── Refresh tokens ───────────────────────────────────────────────────────────

export const refreshTokens = pgTable('refresh_tokens', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export const jobs = pgTable('jobs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  feature:      featureEnum('feature').notNull(),
  status:       jobStatusEnum('status').notNull().default('pending'),
  options:      jsonb('options'),
  result:       jsonb('result'),
  progress:     integer('progress').notNull().default(0),
  errorMessage: text('error_message'),
  startedAt:    timestamp('started_at',   { withTimezone: true }),
  completedAt:  timestamp('completed_at', { withTimezone: true }),
  createdBy:    uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
})

// ─── Scheduled exports ────────────────────────────────────────────────────────

export const scheduledExports = pgTable('scheduled_exports', {
  id:        uuid('id').primaryKey().defaultRandom(),
  feature:   featureEnum('feature').notNull(),
  name:      text('name').notNull(),
  cron:      text('cron').notNull(),
  timezone:  text('timezone').notNull().default('America/New_York'),
  enabled:   boolean('enabled').notNull().default(true),
  options:   jsonb('options'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
})

// ─── System logs ──────────────────────────────────────────────────────────────

export const systemLogs = pgTable('system_logs', {
  id:        uuid('id').primaryKey().defaultRandom(),
  level:     logLevelEnum('level').notNull(),
  source:    logSourceEnum('source').notNull(),
  feature:   featureEnum('feature'),
  jobId:     uuid('job_id').references(() => jobs.id,  { onDelete: 'set null' }),
  userId:    uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action:    text('action').notNull(),
  message:   text('message').notNull(),
  meta:      jsonb('meta'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_logs_created_at').on(t.createdAt),
  index('idx_logs_level').on(t.level),
  index('idx_logs_feature').on(t.feature),
  index('idx_logs_job_id').on(t.jobId),
])

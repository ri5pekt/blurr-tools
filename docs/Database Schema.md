# Database Schema

All tables use UUID primary keys (`uuid().primaryKey().defaultRandom()`). All timestamps include timezone (`{ withTimezone: true }`).

Schema is defined in TypeScript via Drizzle ORM in `packages/db/src/schema/`.

---

## Auth

### `users`

```typescript
export const userRoleEnum = pgEnum('user_role', ['admin', 'staff'])

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
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `email` | text | unique |
| `password_hash` | text | argon2 hash |
| `name` | text | display name |
| `role` | enum | `admin` or `staff` |
| `is_active` | boolean | soft deactivation |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | auto-updated |

---

### `refresh_tokens`

```typescript
export const refreshTokens = pgTable('refresh_tokens', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | cascade delete |
| `token_hash` | text | SHA-256 hash of raw token |
| `expires_at` | timestamptz | token expiry |
| `revoked_at` | timestamptz | null = active |
| `created_at` | timestamptz | |

**Note:** Raw refresh token is never stored. Only its SHA-256 hash is stored. The raw token is sent to the client as an HttpOnly cookie.

---

## Jobs

### `jobs`

Persistent log of every background job run. Never deleted — provides full history.

```typescript
export const jobStatusEnum = pgEnum('job_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
])

export const featureEnum = pgEnum('feature', [
  'daily_orders_export',
  // add new features here
])

export const jobs = pgTable('jobs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  feature:      featureEnum('feature').notNull(),
  status:       jobStatusEnum('status').notNull().default('pending'),
  options:      jsonb('options'),        // input params: date, spreadsheetId, etc.
  result:       jsonb('result'),         // output summary: rowsWritten, sheetUrl, etc.
  progress:     integer('progress').default(0),  // 0–100
  errorMessage: text('error_message'),
  startedAt:    timestamp('started_at', { withTimezone: true }),
  completedAt:  timestamp('completed_at', { withTimezone: true }),
  createdBy:    uuid('created_by').references(() => users.id),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
})
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | also used as BullMQ job ID |
| `feature` | enum | which feature triggered this job |
| `status` | enum | `pending → running → completed / failed / cancelled` |
| `options` | jsonb | input parameters (date, config overrides, etc.) |
| `result` | jsonb | output summary after completion |
| `progress` | integer | 0–100, updated by worker |
| `error_message` | text | set on failure |
| `started_at` | timestamptz | set when worker picks up job |
| `completed_at` | timestamptz | set on completion or failure |
| `created_by` | UUID FK → users | null for scheduled/automatic jobs |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | auto-updated |

---

### `scheduled_exports`

Configuration table for recurring scheduled jobs. One row per configured schedule.

```typescript
export const scheduledExports = pgTable('scheduled_exports', {
  id:        uuid('id').primaryKey().defaultRandom(),
  feature:   featureEnum('feature').notNull(),
  name:      text('name').notNull(),           // human label, e.g. "Daily Orders — Daily"
  cron:      text('cron').notNull(),           // cron expression, e.g. "0 8 * * *"
  timezone:  text('timezone').notNull().default('America/New_York'),
  enabled:   boolean('enabled').notNull().default(true),
  options:   jsonb('options'),                 // feature-specific config overrides
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
})
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `feature` | enum | which feature to run |
| `name` | text | human-readable label |
| `cron` | text | standard cron expression |
| `timezone` | text | IANA timezone string |
| `enabled` | boolean | toggle without deleting |
| `options` | jsonb | e.g. `{ spreadsheetId, sheetTab }` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | auto-updated |

**Note:** BullMQ's native repeatable jobs (via `repeat: { cron }`) are used to execute these. On worker startup (or on schedule change), repeatable jobs are registered/unregistered to match the DB state.

---

## Relationships

```
users
  └─< refresh_tokens   (user_id → users.id, cascade delete)
  └─< jobs             (created_by → users.id, set null on delete)
```

---

## Migrations

Managed by `drizzle-kit`. All migration SQL files live in `packages/db/src/migrations/`.

```bash
# Generate a migration after schema changes
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Open Drizzle Studio (DB browser)
pnpm db:studio
```

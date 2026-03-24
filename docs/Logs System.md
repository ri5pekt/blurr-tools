# Logs System

A centralized, persistent log of everything that happens in the system — job events, user actions, errors, and scheduled triggers. Accessible through a dedicated Logs screen in the UI.

---

## Purpose

- **Observability:** see exactly what ran, when, and what happened
- **Debugging:** trace errors back to their context without digging through container logs
- **Audit trail:** know who triggered what and when
- **History:** logs persist forever — no log rotation, no docker log loss

---

## Database Table: `system_logs`

Defined in `packages/db/src/schema/logs.ts`.

```typescript
export const logLevelEnum = pgEnum('log_level', ['info', 'warning', 'error'])

export const logSourceEnum = pgEnum('log_source', [
  'api',       // HTTP request handlers
  'worker',    // BullMQ job processors
  'scheduler', // Scheduled job triggers
  'system',    // App startup, migrations, seed
])

export const systemLogs = pgTable('system_logs', {
  id:        uuid('id').primaryKey().defaultRandom(),
  level:     logLevelEnum('level').notNull(),
  source:    logSourceEnum('source').notNull(),
  feature:   featureEnum('feature'),             // null for non-feature events
  jobId:     uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  userId:    uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action:    text('action').notNull(),           // short machine-readable key
  message:   text('message').notNull(),          // human-readable description
  meta:      jsonb('meta'),                      // any extra structured data
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID PK | |
| `level` | enum | `info` / `warning` / `error` |
| `source` | enum | where the log came from |
| `feature` | enum (nullable) | which feature, if applicable |
| `job_id` | UUID FK → jobs (nullable) | links log to a specific job run |
| `user_id` | UUID FK → users (nullable) | who triggered it; null for scheduled/system |
| `action` | text | short key, e.g. `job.started`, `job.failed`, `user.login` |
| `message` | text | human-readable sentence describing what happened |
| `meta` | jsonb (nullable) | extra context: error stack, row counts, date range, etc. |
| `created_at` | timestamptz | |

### Indexes
```typescript
// Fast queries for the Logs screen
index('idx_logs_created_at').on(systemLogs.createdAt).desc()
index('idx_logs_level').on(systemLogs.level)
index('idx_logs_feature').on(systemLogs.feature)
index('idx_logs_job_id').on(systemLogs.jobId)
```

---

## What Gets Logged

### Job lifecycle (source: `worker`)

| Action | Level | When |
|--------|-------|------|
| `job.started` | info | Worker picks up a job |
| `job.completed` | info | Job finishes successfully |
| `job.failed` | error | Job throws an error (all retry attempts exhausted) |
| `job.retry` | warning | Job failed but will retry (attempt N of M) |
| `job.cancelled` | warning | Job was cancelled by user |
| `job.progress` | info | Optional milestone logs during long jobs (e.g. "Page 3/7 fetched") |

Example `job.completed` log:
```json
{
  "level": "info",
  "source": "worker",
  "feature": "daily_orders_export",
  "jobId": "uuid",
  "userId": null,
  "action": "job.completed",
  "message": "Daily orders export completed — 247 orders written to Google Sheets",
  "meta": {
    "date": "2026-03-23",
    "ordersCount": 247,
    "sheetUrl": "https://docs.google.com/spreadsheets/d/..."
  }
}
```

Example `job.failed` log:
```json
{
  "level": "error",
  "source": "worker",
  "feature": "daily_orders_export",
  "jobId": "uuid",
  "action": "job.failed",
  "message": "Daily orders export failed: Shopify API returned 429 Too Many Requests",
  "meta": {
    "date": "2026-03-23",
    "attempt": 3,
    "error": "429 Too Many Requests",
    "stack": "Error: 429...\n  at fetchOrders..."
  }
}
```

---

### User actions (source: `api`)

| Action | Level | When |
|--------|-------|------|
| `user.login` | info | Successful login |
| `user.login.failed` | warning | Failed login attempt (wrong password) |
| `user.logout` | info | User logged out |
| `user.created` | info | Admin created a new user |
| `user.updated` | info | Admin updated a user |
| `user.deactivated` | warning | Admin deactivated a user |
| `export.triggered` | info | User manually triggered an export |
| `schedule.updated` | info | User changed a scheduled export setting |

Example `export.triggered` log:
```json
{
  "level": "info",
  "source": "api",
  "feature": "daily_orders_export",
  "jobId": "uuid",
  "userId": "uuid",
  "action": "export.triggered",
  "message": "Denis triggered daily orders export for 2026-03-23",
  "meta": { "date": "2026-03-23" }
}
```

---

### Scheduled triggers (source: `scheduler`)

| Action | Level | When |
|--------|-------|------|
| `schedule.fired` | info | Cron job triggered, job enqueued |
| `schedule.skipped` | warning | Schedule fired but feature was disabled |

---

### System events (source: `system`)

| Action | Level | When |
|--------|-------|------|
| `app.started` | info | API server started successfully |
| `worker.started` | info | Worker process started |
| `db.migrated` | info | Migrations ran on startup |

---

## API Routes

All under `/api/logs/`. Auth required. Admin-only for full access; staff can read.

### `GET /api/logs`

Returns paginated log entries, newest first.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 50 | Page size (max 200) |
| `offset` | number | 0 | Pagination offset |
| `level` | string | — | Filter: `info`, `warning`, `error` |
| `source` | string | — | Filter: `api`, `worker`, `scheduler`, `system` |
| `feature` | string | — | Filter by feature key |
| `jobId` | string | — | Filter all logs for a specific job |
| `search` | string | — | Full-text search on `message` field |
| `from` | ISO date | — | Filter from date (inclusive) |
| `to` | ISO date | — | Filter to date (inclusive) |

**Response:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "level": "error",
      "source": "worker",
      "feature": "daily_orders_export",
      "jobId": "uuid",
      "userId": null,
      "action": "job.failed",
      "message": "Daily orders export failed: Shopify API returned 429",
      "meta": { ... },
      "createdAt": "2026-03-24T08:02:15Z"
    }
  ],
  "total": 1204
}
```

---

## Shared Logger Utility

A single `logger` module shared across `apps/api` and `apps/worker` via direct import (both have access to `packages/db`).

`packages/db/src/logger.ts`:

```typescript
import { db } from './client'
import { systemLogs } from './schema/logs'

type LogInput = {
  level: 'info' | 'warning' | 'error'
  source: 'api' | 'worker' | 'scheduler' | 'system'
  action: string
  message: string
  feature?: string
  jobId?: string
  userId?: string
  meta?: Record<string, unknown>
}

export async function log(input: LogInput): Promise<void> {
  await db.insert(systemLogs).values(input)
}
```

Usage in worker:
```typescript
import { log } from '@blurr-tools/db'

await log({
  level: 'info',
  source: 'worker',
  feature: 'daily_orders_export',
  jobId: data.jobId,
  action: 'job.completed',
  message: `Daily orders export completed — ${ordersCount} orders written to Google Sheets`,
  meta: { date: data.date, ordersCount, sheetUrl },
})
```

Usage in API route:
```typescript
await log({
  level: 'info',
  source: 'api',
  feature: 'daily_orders_export',
  jobId: newJob.id,
  userId: request.user.id,
  action: 'export.triggered',
  message: `${request.user.name} triggered daily orders export for ${body.date}`,
  meta: { date: body.date },
})
```

**Important:** The logger is fire-and-forget in non-critical paths. Never `await` it inside a user-facing request if it would slow the response. Use `void log(...)` or wrap in a non-blocking call.

---

## UI: Logs Screen

**Route:** `/app/logs`  
**Sidebar entry:** `pi-list` icon + "Logs"  
**Access:** all authenticated users (read-only)

### Layout

```
┌──────────────────────────────────────────────────────┐
│  System Logs                                         │
├──────────────────────────────────────────────────────┤
│  FILTERS                                             │
│  [Level ▾]  [Source ▾]  [Feature ▾]  [Search...]    │
│  [From date]  [To date]              [Clear filters] │
├──────────────────────────────────────────────────────┤
│  LOG TABLE                                           │
│  Time          Level    Source    Action    Message  │
│  ─────────────────────────────────────────────────  │
│  Mar 24 08:02  ● ERROR  worker    job.failed  ...   │
│  Mar 24 08:00  ● INFO   scheduler schedule.fired ... │
│  Mar 24 07:58  ● INFO   api       export.triggered…  │
│  ...                                                 │
├──────────────────────────────────────────────────────┤
│  [← Prev]   Page 1 of 25   [Next →]                 │
└──────────────────────────────────────────────────────┘
```

### Table Columns

| Column | Content |
|--------|---------|
| **Time** | `createdAt` formatted as `Mar 24, 08:02:15` |
| **Level** | Colored dot badge: red=error, yellow=warning, blue=info |
| **Source** | `worker` / `api` / `scheduler` / `system` |
| **Feature** | Feature name or `—` |
| **Action** | `action` key in monospace |
| **Message** | Full `message` text (truncated to 1 line, expandable) |

### Row Expand
Clicking a row expands it inline to show:
- Full message
- `meta` JSON block (pretty-printed)
- Link to related job (if `jobId` present) → navigates to that feature's screen pre-filtered to that job

### Level Badge Colors

| Level | Color |
|-------|-------|
| `info` | Blue |
| `warning` | Amber/yellow |
| `error` | Red |

### Filters
- **Level:** multi-select dropdown (`info`, `warning`, `error`)
- **Source:** multi-select dropdown
- **Feature:** dropdown of all known features
- **Search:** debounced text search on `message`
- **Date range:** from/to date pickers
- Filters persist in URL query params so the page is shareable/bookmarkable

### Auto-refresh
Toggle button: "Auto-refresh (5s)" — when on, the table refetches every 5 seconds. Useful for watching a running job in real time.

---

## Dashboard Card

```
┌─────────────────────────────┐
│  📋  System Logs            │
│  View all actions, job      │
│  runs, and errors.          │
│                   [Open →]  │
└─────────────────────────────┘
```

---

## Dev Plan Integration

The logs system is built as part of **Phase 3 — Jobs Infrastructure**, since it's a shared foundation that all features depend on. The `system_logs` table is created alongside `jobs` and `scheduled_exports`. The `logger` utility is written once in `packages/db` and then used by every subsequent feature.

The **Logs screen** UI is delivered in **Phase 3** as well — it's immediately useful for debugging during Phase 4 feature development.

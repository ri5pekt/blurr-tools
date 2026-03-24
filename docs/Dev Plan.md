# Blurr Tools — Development Plan

## What Is This?

**Blurr Tools** is an internal admin toolset that connects to a Shopify store and automates data operations — exporting orders, syncing data, generating reports — all surfaced through a clean, branded web interface.

It follows the same product shape as **pfm-tools** (feature cards on a dashboard, sidebar navigation, per-feature screens with controls and live logs), uses the same tech stack and code patterns as **ob-inventory**, and is styled with the Blurr brand colors.

---

## Reference Projects

| Project | What We Take From It |
|---------|----------------------|
| `pfm-tools` | Product structure: dashboard card grid, sidebar nav, feature screens, job logs pattern |
| `ob-inventory` | Everything technical: monorepo setup, auth system, DB patterns, UI shell, mobile layout, Docker Compose |

---

## Working Conventions

### Git — Commit Only When Asked
Code is written and saved locally during development. **Git commits and pushes happen only when the user explicitly requests it.** Never auto-commit after completing a task.

### Version Tracking
Every meaningful change (new feature, significant UI update, bug fix) must update the app version in two places:

1. **`apps/web/src/config/version.ts`** — the single source of truth:
   ```typescript
   export const APP_VERSION = '0.1.0'
   ```

2. **Sidebar / header display** — the version string is shown visually under the Blurr Tools logo in the sidebar:
   ```
   ┌──────────────────┐
   │  Blurr Tools     │
   │  v0.1.0          │  ← always reflects current version
   └──────────────────┘
   ```

**Versioning scheme:** `MAJOR.MINOR.PATCH`
- `PATCH` — bug fixes, small tweaks
- `MINOR` — new feature or screen added
- `MAJOR` — breaking change or full redesign

The version is imported from `version.ts` and rendered in `AppLayout.vue`. It is never hardcoded in the template.

---

## Build Phases

### Phase 0 — Scaffold (Foundation) ✅
Set up the monorepo, Docker Compose, shared packages, and a working dev environment. No features yet — just the plumbing.

**Deliverables:**
- Git repo initialized, connected to `https://github.com/ri5pekt/blurr-tools.git`, `main` branch
- pnpm monorepo with `apps/api`, `apps/web`, `apps/worker`, `packages/db`, `packages/types`
- Docker Compose (dev + prod)
- Drizzle + PostgreSQL connected
- BullMQ + Redis connected
- `packages/db` with initial migration (empty schema, ready to extend)
- `packages/types` with base shared types
- Environment validation (`env.ts`) in API and worker
- Health check endpoint (`GET /api/health`)

---

### Phase 1 — Auth + Users ✅
Full authentication system and user management.

**Deliverables:**
- `users` and `refresh_tokens` tables in DB schema
- Login with argon2 password hashing
- Access JWT (short-lived, Bearer header)
- Refresh token (long-lived, HttpOnly cookie, hashed in DB)
- Logout (revokes refresh token)
- Profile update (name, password)
- Admin-only user management API (list, create, update, deactivate) — frontend UI in Phase 5
- User invitation: admin creates user → temp password generated → invitation email sent (see `docs/Email System.md`)
- `EmailService` (`apps/api/src/services/email.service.ts`) — nodemailer + Hostinger SMTP
- Frontend: login page, auth store (Pinia), Axios client with 401 refresh queue
- Seed script: creates default admin user (`pnpm db:seed`)

---

### Phase 2 — App Shell + Dashboard ✅
The authenticated application wrapper: sidebar, header, dashboard home.

**Deliverables:**
- `AppLayout.vue`: dark sidebar + header + scrollable content area (Blurr colors)
- Sidebar navigation with feature links (expands as features are added)
- Dashboard home: grid of feature cards, each links to its feature screen
- Route guard: redirect to `/login` if unauthenticated; `NotFoundView.vue` for unbuilt routes
- User menu in header (name, role, logout)
- Mobile: off-canvas sidebar, hamburger button, responsive card grid

---

### Phase 3 — Jobs Infrastructure + Logs ✅
Shared job system and logging layer that every feature will reuse.

**Deliverables:**
- `jobs` table in DB (id, feature, status, options JSONB, progress, error_message, timestamps)
- `scheduled_exports` table (id, feature, name, cron, enabled, options JSONB, timestamps)
- `system_logs` table in DB — centralized log of all events (see `docs/Logs System.md`)
- `packages/db/src/logger.ts` — shared `createLogger(db)` factory; instantiated as `log()` in API and worker
- API routes: `GET /api/jobs`, `GET /api/jobs/:id` (poll status), `DELETE /api/jobs/:id` (cancel)
- API routes: `GET /api/logs` with filters (level, source, feature, jobId, search, date range)
- BullMQ queue setup in `apps/worker` (`queues.ts`)
- Worker job utilities: `startJob`, `updateJobProgress`, `completeJob`, `failJob` (`utils/job.ts`)
- Frontend: `JobStatusCard.vue` — status badge, progress bar, error, result, duration
- Frontend: `JobLogsPanel.vue` — job history list for a feature, auto-polls when jobs are active
- Frontend: `LogsView.vue` — `/app/logs` screen with filterable log table, row expand, auto-refresh

**Gaps fixed:**
- ✅ Wired `log()` calls into auth routes (`user.login`, `user.login.failed`, `user.logout`) and users routes (`user.created`, `user.updated`, `user.deactivated`)
- ✅ Fixed `createdBy` null handling in jobs routes: Drizzle `leftJoin` `{ id: null, name: null }` normalized to `null`

---

### Phase 4 — Feature: Daily Orders Export ✅
First real feature. Fetches Shopify orders for a selected date and exports them to Google Sheets.

**Deliverables:**
- ✅ Shopify client (`apps/worker/src/shopify/client.ts`) — client credentials auth, token caching (55 min TTL), cursor-based pagination, 429 retry
- ✅ Google Sheets writer (`apps/worker/src/google/sheets.ts`) — service account auth, find/create date tab, write header + rows, return sheet URL
- ✅ `DailyOrdersExportView.vue`: date picker, export button, `JobStatusCard` (live-polling active job), `JobLogsPanel`, schedule management
- ✅ `POST /api/features/daily-orders/export` — create job row, enqueue BullMQ job, log `export.triggered`
- ✅ `GET /api/features/daily-orders/schedule` + `PUT /api/features/daily-orders/schedule` — manage scheduled export config
- ✅ BullMQ worker processor (`apps/worker/src/processors/daily-orders.ts`): fetch orders → write to Sheets → log at each step
- ✅ Scheduler (`apps/worker/src/scheduler.ts`) — syncs BullMQ repeatable job with DB schedule every 5 min; scheduled jobs auto-create DB rows with `createdBy: null`
- ✅ Default schedule seeded: `0 8 * * *` America/New_York, disabled (enable via UI or `pnpm db:seed`)
- ✅ App version bumped to `0.3.0`

**Configuration (all set in `.env`):**
- `SHOPIFY_SHOP=0veqa0-fh`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` — client credentials grant auth
- `DAILY_ORDERS_SPREADSHEET_ID` — the Blurr Google Sheet
- `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` + `GOOGLE_OAUTH_REFRESH_TOKEN` — OAuth2 from pfm-tools project

**Post-launch refinements applied:**
- Export accepts date range (`dateFrom`/`dateTo`); multiple dates enqueued sequentially (worker concurrency = 1)
- Frontend: date-range picker (From → To with day count), friendly time dropdown (12h AM/PM + :00/:15/:30/:45), timezone dropdown (ET, CT, MT, PT, London, CET, Israel, Dubai, SGT, JST, Sydney)
- Google Sheets auth switched from service account to OAuth2 refresh token (reuses pfm-tools credentials)
- Shopify client: fixed `.myshopify.com` domain handling, API version `2026-01`, richer fields matching Python script output

---

### Phase 5 — Settings
Admin-accessible settings panel.

**Deliverables:**
- `SettingsView.vue` with tabs: Users, Scheduled Exports
- **Users tab:** full user management UI — list all users, invite new user (triggers email), update role, deactivate; uses existing Phase 1 API routes
- **Scheduled Exports tab:** list of configured scheduled jobs, enable/disable toggles

> All credentials (Shopify, Google Sheets, SMTP, etc.) are managed exclusively via the `.env` file — they are not surfaced in the UI.

---

## Decisions Log

| Decision | Rationale |
|----------|-----------|
| Use ob-inventory's exact auth code | Proven, already matches our stack. No need to redesign. |
| Jobs stored in PostgreSQL (not only Redis) | Persistent job history survives Redis restarts. Queryable for logs. |
| BullMQ for queue (not RQ/Python) | Matches our Node.js stack. pfm-tools uses Python RQ — we don't use Python. |
| Shopify Admin API (not webhook-first) | Simpler for scheduled pulls. Webhooks can be added later for real-time. |
| Google Sheets via service account | Same pattern as pfm-tools. No OAuth dance needed for server-to-server. |
| Monorepo (pnpm workspaces) | Single source of truth for DB schema and shared types. Same as ob-inventory. |
| Caddy for reverse proxy | Auto HTTPS, simple config. Same as ob-inventory. |
| nodemailer + Hostinger SMTP for email | Same pattern as pfm-surveys. No third-party SDK needed. SMTP optional at startup — app works without it. |
| Users management UI in Phase 5 Settings | Backend API is done in Phase 1. UI grouped into Settings/Users tab to avoid a standalone screen that duplicates Settings anyway. |
| `pnpm db:migrate` requires `DATABASE_URL` env var set manually | Drizzle-kit doesn't auto-load `.env`. Run with: `$env:DATABASE_URL="..."; pnpm db:migrate` in PowerShell. |

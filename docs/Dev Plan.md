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

## Build Phases

### Phase 0 — Scaffold (Foundation)
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

### Phase 1 — Auth + Users
Full authentication system and user management, copied directly from `ob-inventory`.

**Deliverables:**
- `users` and `refresh_tokens` tables in DB schema
- Login with argon2 password hashing
- Access JWT (short-lived, Bearer header)
- Refresh token (long-lived, HttpOnly cookie, hashed in DB)
- Logout (revokes refresh token)
- Profile update (name, password)
- Admin-only user management (list, create, update, deactivate)
- Frontend: login page, auth store (Pinia), Axios client with 401 refresh queue
- Seed script: creates default admin user

---

### Phase 2 — App Shell + Dashboard
The authenticated application wrapper: sidebar, header, dashboard home.

**Deliverables:**
- `AppLayout.vue`: dark sidebar + header + scrollable content area (same structure as ob-inventory, Blurr colors)
- Sidebar navigation with feature links (placeholder links for now, expand as features are added)
- Dashboard home: grid of feature cards (like pfm-tools `DashboardView`), each card links to its feature screen
- Route guard: redirect to `/login` if unauthenticated
- User menu in header (name, role, logout)
- Mobile: off-canvas sidebar, hamburger button, responsive card grid

---

### Phase 3 — Jobs Infrastructure + Logs
Shared job system and logging layer that every feature will reuse. Establishes the pattern once.

**Deliverables:**
- `jobs` table in DB (id, feature, status, options JSONB, progress, error_message, timestamps)
- `scheduled_exports` table (id, feature, name, cron, enabled, options JSONB, timestamps)
- `system_logs` table in DB — centralized log of all events (see `docs/Logs System.md`)
- `packages/db/src/logger.ts` — shared `log()` utility used by API and worker
- API routes: `GET /api/jobs/:id` (poll status), `DELETE /api/jobs/:id` (cancel)
- API routes: `GET /api/logs` with filters (level, source, feature, search, date range)
- BullMQ queue setup in `apps/worker`
- Shared job utilities: create job row, update status/progress, handle failure, write logs
- Frontend: `JobStatusCard.vue` reusable component (shows status badge, progress, error, timestamps)
- Frontend: `JobLogsPanel.vue` reusable component (job history list for a feature, with polling)
- Frontend: `LogsView.vue` — `/app/logs` screen with filterable log table, row expand, auto-refresh

---

### Phase 4 — Feature: Daily Orders Export
First real feature. Fetches Shopify orders for a selected date and exports them to Google Sheets.

**Deliverables:**
- Shopify Admin API client (authenticated via Admin API token)
- `DailyOrdersExportView.vue`: date picker, export button, status display, job history
- `POST /api/features/daily-orders/export` — create job, enqueue worker
- `GET /api/features/daily-orders/jobs` — job history for this feature
- BullMQ worker: fetch orders from Shopify → write to Google Sheets
- Google Sheets integration (service account credentials)
- Scheduled daily run (auto-exports previous day at configurable time)
- Scheduled export management UI (enable/disable, set time)

---

### Phase 5 — Settings
Admin-accessible settings panel.

**Deliverables:**
- `SettingsView.vue` with tabs: General, Shopify, Google Sheets, Users, Scheduled Exports
- Shopify credentials (store URL, Admin API token) — stored in env or DB settings table
- Google Sheets credentials (service account JSON path or inline)
- Users tab: same user management table from Phase 1
- Scheduled Exports tab: list of configured scheduled jobs, enable/disable toggles

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

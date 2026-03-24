# Architecture

## Monorepo Structure

```
blurr-tools/
├── apps/
│   ├── api/          → Fastify HTTP API
│   ├── web/          → Vue 3 SPA (frontend)
│   └── worker/       → BullMQ background worker
├── packages/
│   ├── db/           → Drizzle schema, migrations, db client (shared)
│   └── types/        → Shared TypeScript types (shared)
├── docs/
├── docker-compose.yml        → Production stack
├── docker-compose.dev.yml    → DB + Redis only (local dev)
├── Caddyfile                 → Reverse proxy + TLS
├── .env.example
└── pnpm-workspace.yaml
```

**Pattern:** pnpm monorepo. `packages/db` and `packages/types` are consumed by both `apps/api` and `apps/worker`. Schema and types have a single source of truth.

---

## Services

| Service | Image / Build | Role |
|---------|--------------|------|
| `api` | `apps/api/Dockerfile` | Fastify HTTP API, all REST routes |
| `web` | `apps/web/Dockerfile` | Nginx serving the built Vue SPA |
| `worker` | `apps/worker/Dockerfile` | BullMQ worker, processes background jobs |
| `postgres` | `postgres:16-alpine` | Primary database |
| `redis` | `redis:7-alpine` | BullMQ backing store |
| `caddy` | `caddy:2-alpine` | Reverse proxy, TLS termination |

### Traffic routing (Caddy)
```
HTTPS → caddy
  /api/*     → api:3000
  /*         → web:80
```

---

## Docker Compose

### Production (`docker-compose.yml`)
All services run as containers. Caddy handles TLS automatically via Let's Encrypt.

```
postgres  ← api, worker
redis     ← api, worker
api       ← caddy (proxied)
web       ← caddy (proxied)   ← nginx container serving built SPA
worker    (no incoming traffic, consumes queue)
caddy     (public-facing, port 80 + 443)
```

`apps/web/Dockerfile` — two-stage build:
1. **Build stage:** `node:22-alpine` installs deps and runs `vite build` → outputs to `dist/`
2. **Serve stage:** `nginx:alpine` copies `dist/` and serves static files; `/api/*` proxied to `api:3000` via `nginx.conf`

---

### Dev (`docker-compose.dev.yml`)

**Only infrastructure runs in Docker** — postgres and redis. Everything else runs on the host machine directly. This gives instant HMR, native TypeScript compilation, and no rebuild wait.

```
┌─────────────────────────────────────────────┐
│  HOST MACHINE                               │
│                                             │
│  pnpm dev:web    → Vite dev server :5173    │
│    HMR, instant reload, Vue devtools        │
│    proxies /api  → localhost:3000           │
│                                             │
│  pnpm dev:api    → Fastify :3000            │
│    ts-node-dev, restarts on file change     │
│                                             │
│  pnpm dev:worker → BullMQ worker            │
│    ts-node-dev, restarts on file change     │
│                                             │
├─────────────────────────────────────────────┤
│  DOCKER (docker-compose.dev.yml)            │
│                                             │
│  postgres :5433 → :5432                     │
│  redis    :6380 → :6379                     │
└─────────────────────────────────────────────┘
```

**Dev startup sequence:**
```bash
# 1. Start infrastructure
docker compose -f docker-compose.dev.yml up -d

# 2. Run DB migrations (first time or after schema changes)
pnpm db:migrate

# 3. Start all app processes (in separate terminals or via concurrently)
pnpm dev:api
pnpm dev:web
pnpm dev:worker
```

**Vite proxy config (`apps/web/vite.config.ts`):**
```typescript
server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    },
  },
}
```
This means the browser always talks to `localhost:5173`. Vite forwards any `/api/*` request to the Fastify server on `:3000`. No CORS issues, same origin from the browser's perspective. The `withCredentials: true` on Axios still works because the cookie is scoped to the same origin (`localhost:5173` → forwarded as `localhost:5173`).

**Dev `.env` differences vs production:**
```bash
# Dev — services on localhost with remapped ports
DATABASE_URL=postgresql://blurrtools:blurrtools@localhost:5433/blurrtools
REDIS_URL=redis://localhost:6380
NODE_ENV=development

# Production — services on Docker network by service name
DATABASE_URL=postgresql://blurrtools:blurrtools@postgres:5432/blurrtools
REDIS_URL=redis://redis:6379
NODE_ENV=production
```

Keep a `.env` file at the repo root for dev. The `.env` is git-ignored. `.env.example` documents all required variables.

---

## Apps

### `apps/api`

```
apps/api/src/
├── index.ts          → Fastify app setup, plugin registration, server start
├── env.ts            → Zod env validation (fail-fast on startup)
├── db.ts             → Drizzle client instance
├── plugins/
│   └── auth.ts       → fastify.authenticate decorator
├── routes/
│   ├── auth.ts       → /api/auth/*
│   ├── users.ts      → /api/users/* (admin only)
│   ├── jobs.ts       → /api/jobs/:id (shared job status polling)
│   └── features/
│       └── daily-orders.ts   → /api/features/daily-orders/*
└── Dockerfile
```

**Pattern:** Each domain is a `FastifyPluginAsync`, registered in `index.ts`. Auth middleware is a `fastify.decorate('authenticate', ...)` reused per-route.

### `apps/web`

```
apps/web/src/
├── main.ts
├── App.vue
├── theme.ts          → PrimeVue Aura preset with Blurr colors
├── style.css         → Global styles, CSS variables
├── router/
│   └── index.ts      → Routes + navigation guard
├── stores/
│   └── auth.ts       → useAuthStore (Pinia)
├── api/
│   ├── client.ts     → Axios singleton + interceptors + 401 refresh queue
│   └── features/
│       └── dailyOrders.ts
├── components/
│   ├── AppLayout.vue         → Shell: sidebar + header + <RouterView>
│   ├── JobStatusCard.vue     → Reusable job status display
│   └── JobLogsPanel.vue      → Reusable job history list
└── views/
    ├── LoginView.vue
    ├── DashboardView.vue     → Feature card grid
    └── features/
        └── DailyOrdersView.vue
```

### `apps/worker`

```
apps/worker/src/
├── index.ts          → BullMQ Worker setup, registers all job processors
├── env.ts            → Zod env validation
└── processors/
    └── daily-orders.ts   → Job processor for daily orders export
```

### `packages/db`

```
packages/db/src/
├── index.ts          → Exports db client + schema
├── client.ts         → Drizzle client (postgres.js)
├── schema/
│   ├── index.ts      → Re-exports all schema files
│   ├── auth.ts       → users, refresh_tokens
│   └── jobs.ts       → jobs, scheduled_exports
└── migrations/       → SQL migration files (drizzle-kit generate)
```

### `packages/types`

```
packages/types/src/
└── index.ts          → Shared TS types (User, Job, Feature enums, API response shapes)
```

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/blurrtools

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=<min 32 chars>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# App
NODE_ENV=development
API_PORT=3000

# Shopify
SHOPIFY_STORE_URL=https://your-store.myshopify.com
SHOPIFY_ADMIN_API_TOKEN=shpat_xxx

# Google Sheets
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/run/secrets/google-key.json
# or inline:
# GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# Scheduled exports
DAILY_ORDERS_SPREADSHEET_ID=<google sheets id>
DAILY_ORDERS_SCHEDULE_CRON=0 8 * * *   # 8:00 AM daily
DAILY_ORDERS_SCHEDULE_TZ=America/New_York
```

---

## Request Flow (Feature Job)

```
User clicks "Export" in browser
  → POST /api/features/daily-orders/export
    → API creates Job row (status: pending)
    → API enqueues BullMQ job { jobId, date, options }
    → API returns { jobId }
  
  Frontend polls GET /api/jobs/:jobId every 2s
    → Returns { status, progress, error }

Worker picks up job from queue
  → Updates Job row (status: running)
  → Fetches orders from Shopify API
  → Writes to Google Sheets
  → Updates Job row (status: completed / failed)

Frontend shows final status
```

---

## Key Patterns (from Stack & Patterns.md)

All patterns defined in `docs/Stack & Patterns.md` apply. Key ones to note for this project:

- **Route registration:** Each feature is a `FastifyPluginAsync`, registered in `index.ts`
- **Input validation:** Zod inside each route handler
- **Auth middleware:** `fastify.authenticate` decorator, applied per-route
- **Error responses:** Always `{ error, code, details? }`
- **Jobs as ledger:** Every job run is a persistent DB row — never deleted, queryable for history
- **Non-blocking:** API never waits for external calls (Shopify, Sheets) — always enqueued

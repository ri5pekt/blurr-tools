# Tech Stack & Design Patterns

A reusable reference for projects built with this stack.

---

## Tech Stack

### Frontend
| Tool | Role |
|------|------|
| **Vue 3** | UI framework (Composition API) |
| **Vite** | Build tool and dev server |
| **TypeScript** | Type safety across the app |
| **Pinia** | Client state management |
| **PrimeVue** | UI component library |
| **TanStack Query** | Server-state caching and async data handling |
| **Axios** | HTTP client |

### Backend
| Tool | Role |
|------|------|
| **Node.js** | Runtime |
| **TypeScript** | Type safety |
| **Fastify** | Web framework (plugin-based, fast) |
| **Drizzle ORM** | Type-safe SQL query builder and schema manager |
| **Zod** | Runtime input validation and schema parsing |
| **argon2** | Password hashing |

### Database & Async
| Tool | Role |
|------|------|
| **PostgreSQL** | Primary relational database |
| **Redis** | Job queue backing store |
| **BullMQ** | Job queue and background worker management |

### Auth
| Tool | Role |
|------|------|
| **@fastify/jwt** | JWT signing and verification |
| **@fastify/cookie** | HttpOnly cookie for refresh tokens |
| **crypto** (Node built-in) | Secure random token generation and hashing |

### Infrastructure
| Tool | Role |
|------|------|
| **Docker Compose** | Multi-container orchestration |
| **Caddy** | Reverse proxy with automatic HTTPS |

---

## Project Structure

```
apps/
  api/       → Fastify backend
  web/       → Vue 3 frontend
  worker/    → BullMQ background worker
packages/
  db/        → Drizzle schema, migrations, db client (shared)
  types/     → Shared TypeScript types (shared)
```

**Pattern:** pnpm monorepo with workspaces. Shared packages (`db`, `types`) are consumed by both `api` and `worker`, keeping schema and types as a single source of truth.

---

## Backend Patterns

### Route Registration (Fastify Plugin Pattern)
Each domain gets its own route file, exported as a `FastifyPluginAsync` and registered in `index.ts`.

```typescript
// routes/sales.ts
export const salesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/sales', { onRequest: [fastify.authenticate] }, async (request) => { ... })
}

// index.ts
await fastify.register(salesRoutes)
```

### Input Validation with Zod
All query params and request bodies are parsed with Zod inside the route handler. Validation errors return structured responses.

```typescript
const qSchema = z.object({
  limit:  z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})
const q = qSchema.parse(request.query)
```

### Auth Middleware via Fastify Decorator
The `authenticate` decorator is registered once and reused across any route.

```typescript
fastify.decorate('authenticate', async (request, reply) => {
  try {
    await request.jwtVerify()
  } catch {
    reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
  }
})

// Used as:
fastify.get('/api/resource', { onRequest: [fastify.authenticate] }, handler)
```

### Structured Error Responses
Errors always return `{ error, code, details? }` so the frontend can handle them predictably.

```typescript
reply.status(400).send({ error: 'Invalid input', code: 'VALIDATION_ERROR', details: body.error.flatten() })
reply.status(401).send({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' })
reply.status(404).send({ error: 'Not found', code: 'NOT_FOUND' })
```

### Environment Validation
A dedicated `env.ts` file parses and validates all environment variables with Zod on startup. The app fails fast if anything is missing.

```typescript
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  REDIS_URL: z.string(),
  // ...
})
export const env = envSchema.parse(process.env)
```

---

## Database Patterns (Drizzle + PostgreSQL)

### Schema as Code
All tables are defined in TypeScript using Drizzle's schema DSL. Enums, constraints, and foreign keys are all declared at the schema level.

```typescript
export const ledgerActionTypeEnum = pgEnum('ledger_action_type', [
  'receive', 'transfer_in', 'transfer_out', 'sale', 'return', 'adjustment',
])

export const inventoryLedger = pgTable('inventory_ledger', {
  id:            uuid('id').primaryKey().defaultRandom(),
  productId:     uuid('product_id').notNull().references(() => products.id),
  warehouseId:   uuid('warehouse_id').notNull().references(() => warehouses.id),
  actionType:    ledgerActionTypeEnum('action_type').notNull(),
  quantityDelta: integer('quantity_delta').notNull(),
  createdBy:     uuid('created_by').references(() => users.id),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

### UUID Primary Keys
All tables use `uuid().primaryKey().defaultRandom()` — no sequential integer IDs. This is safe for distributed systems and avoids exposing row counts.

### Database-level Constraints
Use `check()` constraints to enforce business rules at the database level, not just in application code.

```typescript
export const inventoryStock = pgTable('inventory_stock', {
  quantity: integer('quantity').notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.productId, t.warehouseId] }),
  check('quantity_non_negative', sql`${t.quantity} >= 0`),
])
```

### Timestamps with Timezone
All `createdAt` / `updatedAt` fields use `{ withTimezone: true }` to store timezone-aware timestamps. `updatedAt` uses `.$onUpdate(() => new Date())` for automatic updates.

---

## Authentication Patterns

### Dual-Token Auth (Access + Refresh)
- **Access token**: short-lived JWT, sent in `Authorization: Bearer` header.
- **Refresh token**: long-lived, stored as a hashed value in the database, delivered via `HttpOnly` cookie.

```typescript
// Refresh token is never stored raw — only its SHA-256 hash
const rawToken = crypto.randomBytes(48).toString('hex')
const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
await db.insert(refreshTokens).values({ userId, tokenHash, expiresAt })
```

### Password Hashing with argon2
```typescript
const hash = await argon2.hash(password)
const valid = await argon2.verify(hash, inputPassword)
```

---

## Async / Queue Patterns (BullMQ)

### Job Deduplication
Before enqueuing a job, remove any pending jobs for the same entity. Only the most recent update matters.

```typescript
const [waiting, delayed] = await Promise.all([
  queue.getJobs(['wait']),
  queue.getJobs(['delayed']),
])
const obsolete = [...waiting, ...delayed].filter(j => j.data.productId === productId)
for (const job of obsolete) await job.remove()
await queue.add('sync', { productId })
```

### Retry with Exponential Backoff
Configure retries and backoff at queue level so all jobs inherit the policy automatically.

```typescript
defaultJobOptions: {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000 },
}
```

### Scheduled / Repeatable Jobs
BullMQ supports cron-style scheduling natively — no extra tools needed.

```typescript
await queue.add('daily-report', {}, {
  repeat: { cron: '0 8 * * *' }, // every day at 08:00
})
```

---

## Frontend Patterns

### Pinia Store with Setup Syntax
Use the Composition API style for Pinia stores — same mental model as Vue `setup()`.

```typescript
export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const isAuthenticated = computed(() => !!user.value)

  async function login(email: string, password: string) { ... }
  async function logout() { ... }

  return { user, isAuthenticated, login, logout }
})
```

### API Client as a Singleton
A single Axios instance with base URL and interceptors for token injection and refresh-on-401.

```typescript
// api/client.ts
export const apiClient = axios.create({ baseURL: '/api', withCredentials: true })

apiClient.interceptors.request.use(config => {
  const token = useAuthStore().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
```

### Composables for Reusable Logic
Extract complex or repeated async logic into composable functions (`use*.ts`).

```typescript
// composables/useSyncExport.ts
export function useSyncExport() {
  const loading = ref(false)
  async function exportData() { ... }
  return { loading, exportData }
}
```

---

## Architecture Principles

### Inventory as a Ledger
Stock is never edited directly. Every change writes an immutable `inventory_ledger` entry with a `quantityDelta`. Current stock is derived from (or materialized from) these entries. This gives a complete, auditable history of every stock movement.

### Domain Separation
Code is organized by domain, not by technical layer:
- **Catalog** — what a product is
- **Inventory** — where it is and how much exists
- **Sales** — how stock leaves
- **Transfers** — movement between locations

### Non-Blocking Integrations
External service calls (e.g. syncing stock to a third-party platform) are always queued as background jobs. The API response never waits for the external call to complete.

### Audit Trail
Every write action records `createdBy` (user ID) and `createdAt`. Sensitive actions also log a reason. This makes the system fully auditable with no extra effort.

### Shared Types Package
All TypeScript types shared between frontend and backend live in `packages/types`. This prevents type drift and removes the need for manual type duplication.

---

## Docker Compose Structure

```
services:
  api       → Fastify API server
  worker    → BullMQ background worker (same codebase, different entry point)
  postgres  → PostgreSQL database
  redis     → Redis for BullMQ
```

The `api` and `worker` share the same `packages/db` and can share environment variables. The worker runs as a separate container so it can be scaled or restarted independently.

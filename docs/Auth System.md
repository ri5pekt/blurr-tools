# Auth System

Copied directly from `ob-inventory`. All patterns, flows, and code structure are the same. Only names and colors change.

---

## Overview

- **Access token:** Short-lived JWT, sent in `Authorization: Bearer` header on every API request
- **Refresh token:** Long-lived opaque token, stored as SHA-256 hash in DB, delivered via `HttpOnly` cookie
- **Roles:** `admin` | `staff` — enforced on user management routes; all other routes require only authentication
- **Password hashing:** argon2

---

## Database Tables

See `docs/Database Schema.md` → `users` and `refresh_tokens` tables.

---

## API Routes

All auth routes under `/api/auth/`. No authentication required unless stated.

### `POST /api/auth/login`

**Body:**
```json
{ "email": "user@example.com", "password": "..." }
```

**Flow:**
1. Find user by email (case-insensitive)
2. Verify password with argon2
3. If invalid → `401 { error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }`
4. If user inactive → `403 { error: 'Account disabled', code: 'ACCOUNT_DISABLED' }`
5. Sign access JWT (`id`, `email`, `name`, `role`, expires in `JWT_ACCESS_EXPIRES_IN`)
6. Generate random refresh token → hash with SHA-256 → insert into `refresh_tokens`
7. Set `HttpOnly` cookie `refreshToken` (path: `/api/auth`, secure in prod, sameSite: lax)
8. Return `{ accessToken, user: { id, email, name, role } }`

---

### `POST /api/auth/refresh`

**Cookie required:** `refreshToken`

**Flow:**
1. Read cookie → hash with SHA-256
2. Find row in `refresh_tokens` where `tokenHash` matches, `revokedAt IS NULL`, `expiresAt > now()`
3. If not found → `401 { error: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' }`, clear cookie
4. Load user → sign new access JWT
5. Return `{ accessToken, user: { id, email, name, role } }`

*(Refresh token itself is not rotated — same cookie persists until its own expiry.)*

---

### `POST /api/auth/logout`

**Flow:**
1. Read cookie → hash it
2. If found in DB → set `revokedAt = now()`
3. Clear `refreshToken` cookie
4. Return `{ success: true }`

---

### `GET /api/auth/me`

**Auth required.** Returns current user profile from JWT.

```json
{ "id": "...", "email": "...", "name": "...", "role": "admin" }
```

---

### `PUT /api/auth/profile`

**Auth required.** Update own name or password.

**Body:**
```json
{
  "name": "New Name",           // optional
  "oldPassword": "current",     // required if changing password
  "newPassword": "new"          // optional
}
```

---

## User Management Routes

All routes under `/api/users/`. **Admin role required** for all.

### `GET /api/users`
Returns list of all users: `[{ id, email, name, role, isActive, createdAt }]`

### `POST /api/users`
Create a new user.
```json
{ "email": "...", "name": "...", "password": "...", "role": "staff" }
```

### `PUT /api/users/:id`
Update user: name, role, isActive.

### `DELETE /api/users/:id`
Soft-deactivates: sets `isActive = false`. Does not delete the row.

---

## Backend Implementation

### `fastify.authenticate` decorator (`apps/api/src/plugins/auth.ts`)

```typescript
fastify.decorate('authenticate', async (request, reply) => {
  try {
    await request.jwtVerify()
  } catch {
    reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
  }
})
```

Applied per-route:
```typescript
fastify.get('/api/users', { onRequest: [fastify.authenticate] }, handler)
```

Admin check inside handler:
```typescript
if (request.user.role !== 'admin') {
  return reply.status(403).send({ error: 'Forbidden', code: 'FORBIDDEN' })
}
```

---

## Frontend Implementation

### Auth Store (`apps/web/src/stores/auth.ts`)

```typescript
export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const accessToken = ref<string | null>(null)
  const isAuthenticated = computed(() => !!accessToken.value && !!user.value)

  async function login(email: string, password: string) { ... }
  async function logout() { ... }
  async function fetchMe() { ... }       // validates token on app load
  async function refreshToken() { ... }  // called by Axios interceptor on 401
  function setAuth(token: string, u: AuthUser) { ... }
  function clearAuth() { ... }

  return { user, accessToken, isAuthenticated, login, logout, fetchMe, refreshToken, setAuth, clearAuth }
})
```

**Persistence:** `accessToken` and `user` stored in `localStorage`. On app mount, `fetchMe()` is called to validate the stored token.

---

### Axios Client (`apps/web/src/api/client.ts`)

```typescript
export const apiClient = axios.create({ baseURL: '/api', withCredentials: true })

// Inject access token
apiClient.interceptors.request.use(config => {
  const token = useAuthStore().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 401 handler: queue requests → refresh → retry
apiClient.interceptors.response.use(
  response => response,
  async error => {
    const isAuthRoute = error.config?.url?.includes('/auth/')
    if (error.response?.status === 401 && !error.config._retry && !isAuthRoute) {
      // queue concurrent requests, call auth.refreshToken() once, retry all
      // on refresh failure: clearAuth() + redirect to /login
    }
    return Promise.reject(error)
  }
)
```

---

### Route Guard (`apps/web/src/router/index.ts`)

```typescript
router.beforeEach(async (to) => {
  if (to.meta.requiresAuth && !useAuthStore().isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && useAuthStore().isAuthenticated) {
    return { name: 'dashboard' }
  }
})
```

---

## Seed Script

`apps/api/src/seed.ts` — creates default admin on first run (idempotent):

```typescript
await db.insert(users).values({
  email: 'admin@blurr.com',
  passwordHash: await argon2.hash('admin123'),
  name: 'Admin',
  role: 'admin',
}).onConflictDoNothing()
```

Run via: `pnpm db:seed`

---

## Security Notes

- Refresh tokens are never stored raw — only SHA-256 hash in DB
- Access tokens are short-lived (15 min default); refresh tokens are 30 days
- `HttpOnly` cookie prevents JavaScript access to refresh token
- `withCredentials: true` on Axios ensures cookies are sent cross-origin in dev
- Password changes require the current password (`oldPassword`)
- Deactivated users (`isActive = false`) are rejected at login even with valid credentials

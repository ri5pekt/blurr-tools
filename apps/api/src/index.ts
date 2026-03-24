import './env.js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { createDb } from '@blurr-tools/db'
import { env } from './env.js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCookie from '@fastify/cookie'
import fastifyCors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import { authRoutes } from './routes/auth.js'
import { usersRoutes } from './routes/users.js'
import { jobsRoutes } from './routes/jobs.js'
import { logsRoutes } from './routes/logs.js'
import { dailyOrdersRoutes } from './routes/features/daily-orders.js'
import { priorityExportRoutes } from './routes/features/priority-export.js'

// ─── Run DB migrations before starting the server ────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
// __dirname = /app/apps/api/dist  →  ../../../ = /app
const migrationsFolder = join(__dirname, '../../../packages/db/src/migrations')

{
  const migrationDb = createDb(env.DATABASE_URL)
  await migrate(migrationDb, { migrationsFolder })
}

const fastify = Fastify({
  logger: env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : true,
})

await fastify.register(fastifyCookie)

await fastify.register(fastifyJwt, {
  secret: env.JWT_SECRET,
})

await fastify.register(fastifyCors, {
  origin: env.NODE_ENV === 'development',
  credentials: true,
})

await fastify.register(fastifyHelmet, {
  contentSecurityPolicy: false,
})

// ─── Auth decorator ───────────────────────────────────────────────────────────

fastify.decorate('authenticate', async function (
  request: Parameters<typeof fastify.authenticate>[0],
  reply: Parameters<typeof fastify.authenticate>[1],
) {
  try {
    await request.jwtVerify()
  } catch {
    reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
  }
})

// ─── Routes ───────────────────────────────────────────────────────────────────

fastify.get('/api/health', async () => ({
  status: 'ok',
    version: '0.5.0',
  timestamp: new Date().toISOString(),
}))

await fastify.register(authRoutes)
await fastify.register(usersRoutes)
await fastify.register(jobsRoutes)
await fastify.register(logsRoutes)
await fastify.register(dailyOrdersRoutes)
await fastify.register(priorityExportRoutes)

// ─── Start ────────────────────────────────────────────────────────────────────

try {
  await fastify.listen({ port: env.API_PORT, host: '0.0.0.0' })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index.js'

export * from './schema/index.js'
export { createLogger } from './logger.js'
export type { LogInput, LogFn } from './logger.js'

export function createDb(connectionString: string) {
  const client = postgres(connectionString)
  return drizzle(client, { schema })
}

export type Db = ReturnType<typeof createDb>

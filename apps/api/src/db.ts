import { createDb, type Db } from '@blurr-tools/db'
import { env } from './env.js'

export const db: Db = createDb(env.DATABASE_URL)

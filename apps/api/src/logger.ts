import { createLogger } from '@blurr-tools/db'
import { db } from './db.js'

export const log = createLogger(db)

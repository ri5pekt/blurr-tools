import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { env } from './env.js'

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
})

// Type cast resolves ioredis version mismatch between worker and bullmq's internal copy
export const queues = {
  dailyOrdersExport: new Queue('daily_orders_export', { connection: connection as any }),
  priorityExport:    new Queue('priority_export',     { connection: connection as any }),
}

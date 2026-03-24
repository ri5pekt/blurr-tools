import './env.js'
import { connection } from './queues.js'
import { registerDailyOrdersProcessor } from './processors/daily-orders.js'
import { startScheduler } from './scheduler.js'

connection.on('connect', () => {
  console.log('[worker] Redis connected')
})

connection.on('error', (err: Error) => {
  console.error('[worker] Redis error:', err.message)
})

const dailyOrdersWorker = registerDailyOrdersProcessor()

await startScheduler()

console.log('[worker] Ready. Waiting for jobs...')

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received, shutting down...`)
  try {
    await dailyOrdersWorker.close()
    await connection.quit()
    console.log('[worker] Shutdown complete.')
    process.exit(0)
  } catch (err) {
    console.error('[worker] Shutdown error:', err)
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

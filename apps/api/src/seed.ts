import './env.js'
import argon2 from 'argon2'
import { db } from './db.js'
import { users, scheduledExports } from '@blurr-tools/db'

async function seed() {
  console.log('Seeding database...')

  await db
    .insert(users)
    .values({
      email:        'admin@blurr.com',
      passwordHash: await argon2.hash('admin123'),
      name:         'Admin',
      role:         'admin',
    })
    .onConflictDoNothing()

  console.log('✓ Admin user ready (admin@blurr.com / admin123)')
  console.log('  → Change the password after first login!')

  await db
    .insert(scheduledExports)
    .values({
      feature:  'daily_orders_export',
      name:     'Daily Orders Export',
      cron:     '0 8 * * *',
      timezone: 'America/New_York',
      enabled:  false,
    })
    .onConflictDoNothing()

  console.log('✓ Default schedule seeded (daily at 08:00 ET, disabled)')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})

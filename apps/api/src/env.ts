import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV:               z.enum(['development', 'production', 'test']).default('development'),
  API_PORT:               z.coerce.number().default(3000),
  DATABASE_URL:           z.string().min(1),
  REDIS_URL:              z.string().min(1),
  JWT_SECRET:             z.string().min(16),
  JWT_REFRESH_SECRET:     z.string().min(16),
  JWT_ACCESS_EXPIRES_IN:  z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  // Email (optional — app starts without it)
  SMTP_HOST:              z.string().optional(),
  SMTP_PORT:              z.coerce.number().optional().default(465),
  SMTP_USER:              z.string().optional(),
  SMTP_PASS:              z.string().optional(),
  EMAIL_FROM:             z.string().email().optional(),
  EMAIL_FROM_NAME:        z.string().optional().default('Blurr Tools'),
  APP_URL:                z.string().url().optional().default('http://localhost:5173'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌  Invalid environment variables:')
  for (const [field, errors] of Object.entries(parsed.error.flatten().fieldErrors)) {
    console.error(`   ${field}: ${errors?.join(', ')}`)
  }
  process.exit(1)
}

export const env = parsed.data

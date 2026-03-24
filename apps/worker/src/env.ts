import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV:              z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL:          z.string().min(1),
  REDIS_URL:             z.string().min(1),
  // Shopify (optional at startup — required when running Shopify jobs)
  SHOPIFY_SHOP:          z.string().optional(),
  SHOPIFY_CLIENT_ID:     z.string().optional(),
  SHOPIFY_CLIENT_SECRET: z.string().optional(),
  // Google Sheets — OAuth2 (optional at startup)
  GOOGLE_OAUTH_CLIENT_ID:     z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REFRESH_TOKEN: z.string().optional(),
  DAILY_ORDERS_SPREADSHEET_ID: z.string().optional(),
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

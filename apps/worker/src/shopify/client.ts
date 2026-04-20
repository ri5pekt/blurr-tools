import { env } from '../env.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShopifyLineItem {
  id:       number
  title:    string
  quantity: number
  price:    string
  sku:      string | null
  vendor:   string | null
}

export interface ShopifyRefundTransaction {
  kind:   string
  status: string
  amount: string
}

export interface ShopifyRefund {
  id:           number
  created_at:   string
  transactions: ShopifyRefundTransaction[]
  refund_line_items: Array<{ quantity: number }>
}

export interface ShopifyCustomer {
  id:         number
  first_name: string | null
  last_name:  string | null
  email:      string | null
  phone:      string | null
  created_at: string
}

export interface ShopifyOrder {
  id:                  number
  name:                string
  email:               string
  created_at:          string
  processed_at:        string
  source_name:         string
  cancel_reason:       string | null
  financial_status:    string
  fulfillment_status:  string | null
  total_price:         string
  current_total_price: string   // current value after any refunds
  subtotal_price:      string
  total_tax:          string
  total_discounts:    string
  total_shipping_price_set?: {
    shop_money?: { amount: string }
  }
  currency:           string
  gateway?:           string
  phone?:             string
  customer?:          ShopifyCustomer
  billing_address?: {
    phone?: string
  }
  shipping_address?:  {
    name?:          string
    address1?:      string
    address2?:      string
    city?:          string
    province?:      string
    province_code?: string
    zip?:           string
    country?:       string
    country_code?:  string
    phone?:         string
  }
  line_items:   ShopifyLineItem[]
  refunds:      ShopifyRefund[]
  tags:         string
  note:         string | null
}

interface AccessTokenResponse {
  access_token: string
  expires_in?:  number
}

// ─── Token cache ──────────────────────────────────────────────────────────────

let cachedToken:    string | null = null
let tokenExpiresAt: number        = 0

function getShopDomain(): string {
  const shop = env.SHOPIFY_SHOP
  if (!shop) throw new Error('SHOPIFY_SHOP is not configured.')
  return shop.includes('.') ? shop : `${shop}.myshopify.com`
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken
  }

  if (!env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) {
    throw new Error('Shopify credentials not configured. Set SHOPIFY_SHOP, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET.')
  }

  const shop = getShopDomain()
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     env.SHOPIFY_CLIENT_ID,
    client_secret: env.SHOPIFY_CLIENT_SECRET,
  })

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Shopify token fetch failed (${res.status}): ${text}`)
  }

  const data = await res.json() as AccessTokenResponse
  cachedToken    = data.access_token
  tokenExpiresAt = Date.now() + (data.expires_in ?? 86400) * 1000
  return cachedToken
}

// ─── Fetch with 429 retry ─────────────────────────────────────────────────────

const API_VERSION     = '2026-01'
const MAX_429_RETRIES = 3

async function shopifyFetch(path: string, token: string): Promise<Response> {
  const shop = getShopDomain()
  const url  = `https://${shop}/admin/api/${API_VERSION}${path}`

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token },
    })

    if (res.status === 429) {
      if (attempt === MAX_429_RETRIES) {
        throw new Error(`Shopify rate limit exceeded after ${MAX_429_RETRIES} retries`)
      }
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '2', 10)
      await sleep(Math.max(retryAfter * 1000, 2000))
      continue
    }

    return res
  }

  throw new Error('Unreachable')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Store timezone (cached) ──────────────────────────────────────────────────

let cachedStoreTz: string | null = null

/**
 * Fetches the store's IANA timezone from shop.json and caches it for the
 * lifetime of the process. Returns 'UTC' as a safe fallback.
 */
export async function getStoreTimezone(): Promise<string> {
  if (cachedStoreTz) return cachedStoreTz

  try {
    const token = await getAccessToken()
    const shop  = getShopDomain()
    const res   = await shopifyFetch('/shop.json', token)
    if (res.ok) {
      const data = await res.json() as { shop: { iana_timezone: string } }
      cachedStoreTz = data.shop.iana_timezone ?? 'UTC'
    } else {
      cachedStoreTz = 'UTC'
    }
  } catch {
    cachedStoreTz = 'UTC'
  }

  return cachedStoreTz
}

/**
 * Converts a YYYY-MM-DD date string to UTC ISO boundaries for 00:00:00–23:59:59
 * in the given IANA timezone.
 */
export function localDayToUtcWindow(dateStr: string, ianaTimezone: string): { min: string; max: string } {
  const [yr, mo, dy] = dateStr.split('-').map(Number)

  // Use noon UTC on that date as a stable reference point to derive the UTC offset,
  // avoiding any DST edge cases that happen at midnight.
  const refUtcNoon    = new Date(Date.UTC(yr, mo - 1, dy, 12, 0, 0))
  const parts         = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaTimezone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  }).formatToParts(refUtcNoon)

  const get = (type: string): number => {
    const v = parseInt(parts.find(p => p.type === type)?.value ?? '0', 10)
    return isNaN(v) ? 0 : (type === 'hour' ? v % 24 : v)
  }

  const localNoonAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  const offsetMs       = refUtcNoon.getTime() - localNoonAsUtc  // positive = tz is behind UTC

  const startUtc = new Date(Date.UTC(yr, mo - 1, dy,  0,  0,  0) + offsetMs)
  const endUtc   = new Date(Date.UTC(yr, mo - 1, dy, 23, 59, 59) + offsetMs)

  return {
    min: startUtc.toISOString(),
    max: endUtc.toISOString(),
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

const ORDERS_FIELDS = [
  'id', 'name', 'email', 'created_at', 'processed_at', 'source_name', 'cancel_reason',
  'financial_status', 'fulfillment_status',
  'total_price', 'current_total_price', 'subtotal_price', 'total_tax', 'total_discounts',
  'total_shipping_price_set', 'currency',
  'customer', 'shipping_address',
  'line_items', 'refunds', 'tags', 'note',
].join(',')

const PRIORITY_ORDERS_FIELDS = [
  'id', 'name', 'email', 'created_at', 'financial_status',
  'total_price', 'subtotal_price', 'total_tax', 'total_discounts',
  'total_shipping_price_set', 'currency', 'gateway', 'phone',
  'customer', 'billing_address', 'shipping_address',
  'line_items', 'refunds', 'tags',
].join(',')

/**
 * Fetches all orders in a date range (YYYY-MM-DD to YYYY-MM-DD), all at once.
 * Uses the store's IANA timezone for day boundaries so that selected dates match
 * the store's local calendar (same logic as fetchOrdersForDate).
 * Includes extra fields needed for Priority export (gateway, phone, billing_address).
 */
export async function fetchOrdersForPriorityRange(dateFrom: string, dateTo: string): Promise<ShopifyOrder[]> {
  const token    = await getAccessToken()
  const storeTz  = await getStoreTimezone()
  const { min: startIso } = localDayToUtcWindow(dateFrom, storeTz)
  const { max: endIso }   = localDayToUtcWindow(dateTo,   storeTz)

  const orders: ShopifyOrder[] = []
  let pageInfo: string | null = null
  let firstPage = true

  while (firstPage || pageInfo !== null) {
    let path: string

    if (firstPage) {
      const params = new URLSearchParams({
        created_at_min: startIso,
        created_at_max: endIso,
        status:         'any',
        limit:          '250',
        fields:         PRIORITY_ORDERS_FIELDS,
      })
      path      = `/orders.json?${params.toString()}`
      firstPage = false
    } else {
      path = `/orders.json?page_info=${pageInfo!}&limit=250`
    }

    const res = await shopifyFetch(path, token)

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Shopify orders fetch failed (${res.status}): ${text}`)
    }

    const data = await res.json() as { orders: ShopifyOrder[] }
    orders.push(...data.orders)

    const link      = res.headers.get('Link') ?? ''
    const nextMatch = link.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/)
    pageInfo = nextMatch ? decodeURIComponent(nextMatch[1]) : null
  }

  return orders
}

/**
 * Fetches specific orders by their Shopify IDs.
 * Batches requests in groups of 250 to stay within Shopify limits.
 */
export async function fetchOrdersByIds(orderIds: (string | number)[]): Promise<ShopifyOrder[]> {
  const token = await getAccessToken()
  const all: ShopifyOrder[] = []

  for (let i = 0; i < orderIds.length; i += 250) {
    const batch = orderIds.slice(i, i + 250)
    const params = new URLSearchParams({
      ids:    batch.join(','),
      status: 'any',
      limit:  '250',
      fields: PRIORITY_ORDERS_FIELDS,
    })
    const path = `/orders.json?${params.toString()}`

    const res = await shopifyFetch(path, token)

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Shopify orders fetch failed (${res.status}): ${text}`)
    }

    const data = await res.json() as { orders: ShopifyOrder[] }
    all.push(...data.orders)
  }

  return all
}

/**
 * Fetches orders_count for a list of customer IDs in one batched request.
 * Returns a map of { customerId → ordersCount }.
 * Used to distinguish new customers (count === 1) from returning (count > 1).
 */
export async function getCustomerOrderCounts(customerIds: number[]): Promise<Record<number, number>> {
  const token  = await getAccessToken()
  const result: Record<number, number> = {}

  // Shopify allows up to 250 IDs per request
  for (let i = 0; i < customerIds.length; i += 250) {
    const batch  = customerIds.slice(i, i + 250)
    const params = new URLSearchParams({
      ids:    batch.join(','),
      limit:  '250',
      fields: 'id,orders_count',
    })
    const res = await shopifyFetch(`/customers.json?${params.toString()}`, token)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Shopify customers fetch failed (${res.status}): ${text}`)
    }
    const data = await res.json() as { customers: { id: number; orders_count: number }[] }
    for (const c of data.customers) {
      result[c.id] = c.orders_count
    }
  }

  return result
}

/**
 * Fetches all orders created on the given date (YYYY-MM-DD).
 * Uses the store's IANA timezone to determine the correct UTC window so that
 * the day boundaries match Shopify's own timezone and tools like Metorik.
 * Handles cursor-based pagination automatically.
 */
export async function fetchOrdersForDate(date: string): Promise<ShopifyOrder[]> {
  const token    = await getAccessToken()
  const storeTz  = await getStoreTimezone()
  const { min: startIso, max: endIso } = localDayToUtcWindow(date, storeTz)

  const orders: ShopifyOrder[] = []
  let pageInfo: string | null = null
  let firstPage = true

  while (firstPage || pageInfo !== null) {
    let path: string

    if (firstPage) {
      const params = new URLSearchParams({
        created_at_min: startIso,
        created_at_max: endIso,
        status:         'any',
        limit:          '250',
        fields:         ORDERS_FIELDS,
      })
      path      = `/orders.json?${params.toString()}`
      firstPage = false
    } else {
      path = `/orders.json?page_info=${pageInfo!}&limit=250`
    }

    const res = await shopifyFetch(path, token)

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Shopify orders fetch failed (${res.status}): ${text}`)
    }

    const data = await res.json() as { orders: ShopifyOrder[] }
    orders.push(...data.orders)

    const link      = res.headers.get('Link') ?? ''
    const nextMatch = link.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/)
    pageInfo = nextMatch ? decodeURIComponent(nextMatch[1]) : null
  }

  return orders
}

import { env } from '../env.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MetorikDailyStats {
  grossSales:              number   // gross revenue before discounts/refunds
  totalOrders:             number
  totalUnits:              number   // items sold
  totalRefunds:            number   // refund amount (by refund date, matches dashboard)
  refundsCount:            number
  discounts:               number
  salesTax:                number
  netRevenue:              number   // = Metorik dashboard "Net Revenue"
  newCustomers:            number   // = Metorik dashboard "New Customers" (customers-by-date)
  returningCustomerOrders: number   // orders from returning customers
  productUnits:            Record<string, number>  // productTitle → gross units sold
}

interface RevenueByDateResponse {
  data: Array<{
    gross:          number
    orders:         number
    items:          number
    refunds:        number
    refunds_count:  number
    discounts:      number
    taxes:          number
    net:            number
  }>
}

interface CustomersByDateResponse {
  data: Array<{ customers: number }>
}

interface NewReturningResponse {
  data: Array<{
    new_customers:     number
    returning_orders:  number
  }>
}

interface ProductsResponse {
  data: Array<{
    title:             string
    gross_items_sold:  number
  }>
  pagination: {
    current_page:   number
    per_page:       number
    has_more_pages: boolean
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_URL = 'https://app.metorik.com/api/v1/store'

async function metorikFetch(path: string): Promise<Response> {
  const apiKey = env.METORIK_API_KEY
  if (!apiKey) throw new Error('METORIK_API_KEY is not configured.')

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '5', 10)
    await new Promise(r => setTimeout(r, retryAfter * 1000))
    return metorikFetch(path)
  }

  return res
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches aggregated daily stats from Metorik for a single date (YYYY-MM-DD).
 *
 * Uses two Metorik endpoints:
 *   - /reports/revenue-by-date  — gross sales, orders, items, refunds, taxes, net
 *   - /products                 — per-product gross units sold (paginated)
 *
 * Refunds are deducted on the day they are processed (matching Metorik's
 * own dashboard), so the numbers here are always consistent with what you
 * see in the Metorik UI regardless of which day the original order was placed.
 */
export async function fetchMetorikDailyStats(date: string): Promise<MetorikDailyStats> {
  const dateParams = new URLSearchParams({ start_date: date, end_date: date, group_by: 'day' })

  // ── Revenue totals + customer counts — fire in parallel ────────────────────
  const [revRes, custRes, nrRes] = await Promise.all([
    metorikFetch(`/reports/revenue-by-date?${dateParams.toString()}`),
    metorikFetch(`/reports/customers-by-date?${dateParams.toString()}`),
    metorikFetch(`/reports/orders-new-returning-customers-by-date?${dateParams.toString()}`),
  ])

  if (!revRes.ok) {
    const text = await revRes.text()
    throw new Error(`Metorik revenue-by-date failed (${revRes.status}): ${text}`)
  }
  if (!custRes.ok) {
    const text = await custRes.text()
    throw new Error(`Metorik customers-by-date failed (${custRes.status}): ${text}`)
  }
  if (!nrRes.ok) {
    const text = await nrRes.text()
    throw new Error(`Metorik new-returning-customers-by-date failed (${nrRes.status}): ${text}`)
  }

  const revData  = await revRes.json()  as RevenueByDateResponse
  const custData = await custRes.json() as CustomersByDateResponse
  const nrData   = await nrRes.json()   as NewReturningResponse

  const rev  = revData.data[0]
  const cust = custData.data[0]
  const nr   = nrData.data[0]

  if (!rev) {
    return {
      grossSales:              0,
      totalOrders:             0,
      totalUnits:              0,
      totalRefunds:            0,
      refundsCount:            0,
      discounts:               0,
      salesTax:                0,
      netRevenue:              0,
      newCustomers:            0,
      returningCustomerOrders: 0,
      productUnits:            {},
    }
  }

  // ── Per-product units (paginated) ───────────────────────────────────────────
  const productUnits: Record<string, number> = {}
  let page     = 1
  let hasMore  = true

  while (hasMore) {
    const prodParams = new URLSearchParams({
      start_date: date,
      end_date:   date,
      per_page:   '100',
      page:       String(page),
      order_by:   'gross_items_sold',
      order_dir:  'desc',
    })
    const prodRes = await metorikFetch(`/products?${prodParams.toString()}`)
    if (!prodRes.ok) {
      const text = await prodRes.text()
      throw new Error(`Metorik products failed (${prodRes.status}): ${text}`)
    }
    const prodData = await prodRes.json() as ProductsResponse

    for (const product of prodData.data) {
      if (product.gross_items_sold > 0) {
        productUnits[product.title] = (productUnits[product.title] ?? 0) + product.gross_items_sold
      }
    }

    hasMore = prodData.pagination.has_more_pages
    page++
  }

  return {
    grossSales:              Math.round(rev.gross         * 100) / 100,
    totalOrders:             rev.orders,
    totalUnits:              rev.items,
    totalRefunds:            Math.round(rev.refunds       * 100) / 100,
    refundsCount:            rev.refunds_count,
    discounts:               Math.round(rev.discounts     * 100) / 100,
    salesTax:                Math.round(rev.taxes         * 100) / 100,
    netRevenue:              Math.round(rev.net           * 100) / 100,
    newCustomers:            cust?.customers              ?? 0,
    returningCustomerOrders: nr?.returning_orders         ?? 0,
    productUnits,
  }
}

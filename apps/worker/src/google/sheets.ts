import { google } from 'googleapis'
import { env } from '../env.js'
import type { ShopifyOrder } from '../shopify/client.js'
import { getCustomerOrderCounts } from '../shopify/client.js'

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getSheetsClient() {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET || !env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    throw new Error(
      'Google Sheets credentials not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN.',
    )
  }

  const auth = new google.auth.OAuth2(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN })
  return google.sheets({ version: 'v4', auth })
}

// ─── Sheet name helpers ───────────────────────────────────────────────────────

/**
 * "2026-03-23" → "March'26"
 */
function getTabName(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const month = d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
  const year  = String(d.getUTCFullYear()).slice(-2)
  return `${month}'${year}`
}

/**
 * "2026-03-23" → "Monday, March 23, 2026"
 * Matches the format pre-filled in column A.
 */
function getDateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  return d.toLocaleString('en-US', {
    weekday: 'long',
    month:   'long',
    day:     '2-digit',
    year:    'numeric',
    timeZone: 'UTC',
  })
}

// ─── Stats aggregation ────────────────────────────────────────────────────────

interface DailyStats {
  grossRevenue:      number  // sum of total_price (before refunds)
  totalRefunds:      number  // sum of all refund transaction amounts
  netRevenue:        number  // grossRevenue - totalRefunds
  newCustomers:      number
  returningOrders:   number
  totalOrders:       number
  unitsSold:         number
}

function computeRefundTotal(order: ShopifyOrder): number {
  // Two complementary approaches — take the larger to handle all refund types:
  // 1. total_price - current_total_price  → catches line-item / full refunds
  // 2. sum of refund transactions         → catches adjustment-only partial refunds
  const byPrice = Math.max(
    0,
    parseFloat(order.total_price) - parseFloat(order.current_total_price ?? order.total_price),
  )
  let byTxn = 0
  for (const r of order.refunds ?? []) {
    for (const txn of r.transactions ?? []) {
      if (txn.kind === 'refund' && txn.status === 'success') {
        byTxn += parseFloat(txn.amount ?? '0')
      }
    }
  }
  return Math.max(byPrice, byTxn)
}

async function aggregateStats(orders: ShopifyOrder[], date: string): Promise<DailyStats> {
  let grossRevenue    = 0
  let totalRefunds    = 0
  let newCustomers    = 0
  let returningOrders = 0
  let unitsSold       = 0

  // Exclude $0 orders (test/draft checkouts, voided $0 cancellations) and
  // Shopify admin draft orders. Cancelled orders that had real revenue are kept
  // because Metorik counts them — their gross and refund both appear, netting $0.
  const billableOrders = orders.filter(o =>
    o.source_name !== 'shopify_draft_order' &&
    parseFloat(o.total_price) > 0,
  )

  // Fetch orders_count for all unique customers in one batch call.
  // orders_count === 1 means this is their first-ever order → new customer.
  // Guest checkouts (no customer) are always counted as new.
  const customerIds    = [...new Set(billableOrders.map(o => o.customer?.id).filter((id): id is number => id != null))]
  const ordersCounts   = customerIds.length > 0 ? await getCustomerOrderCounts(customerIds) : {}

  for (const o of billableOrders) {
    grossRevenue  += parseFloat(o.total_price)
    totalRefunds  += computeRefundTotal(o)
    unitsSold     += o.line_items.reduce((s, li) => s + (li.quantity ?? 0), 0)

    const count       = o.customer?.id != null ? (ordersCounts[o.customer.id] ?? 0) : 0
    const isReturning = count > 1
    if (isReturning) {
      returningOrders++
    } else {
      newCustomers++ // first-ever order, or guest checkout
    }
  }

  // Round to 2 dp
  grossRevenue = Math.round(grossRevenue * 100) / 100
  totalRefunds = Math.round(totalRefunds * 100) / 100
  const netRevenue = Math.round((grossRevenue - totalRefunds) * 100) / 100

  return {
    grossRevenue,
    totalRefunds,
    netRevenue,
    newCustomers,
    returningOrders,
    totalOrders: billableOrders.length,
    unitsSold,
  }
}

// ─── Row finder ───────────────────────────────────────────────────────────────

/**
 * Reads column A of the tab and finds the 1-indexed row whose cell matches
 * the date label (e.g. "Monday, March 23, 2026").
 * Dates live in rows 3–40 based on the sheet structure.
 */
async function findDateRow(
  sheets:        ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  tabName:       string,
  dateLabel:     string,
): Promise<number | null> {
  const range  = `'${tabName}'!A3:A40`
  const res    = await sheets.spreadsheets.values.get({ spreadsheetId, range })
  const values = res.data.values ?? []

  for (let i = 0; i < values.length; i++) {
    const cell = String(values[i]?.[0] ?? '').trim()
    if (cell === dateLabel) {
      return i + 3 // 1-indexed; range starts at row 3
    }
  }
  return null
}

// ─── Delete a tab by title (cleanup helper) ───────────────────────────────────

export async function deleteTabIfExists(tabTitle: string): Promise<void> {
  const spreadsheetId = env.DAILY_ORDERS_SPREADSHEET_ID
  if (!spreadsheetId) return

  const sheets = getSheetsClient()
  const meta   = await sheets.spreadsheets.get({ spreadsheetId })
  const sheet  = meta.data.sheets?.find(s => s.properties?.title === tabTitle)
  if (!sheet) return

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ deleteSheet: { sheetId: sheet.properties!.sheetId! } }],
    },
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface WriteOrdersResult {
  sheetUrl:    string
  rowsWritten: number   // = 1 (always a single row per date)
  ordersCount: number
  tabName:     string
  rowNumber:   number
}

/**
 * Writes aggregated Shopify stats for `date` (YYYY-MM-DD) into the
 * pre-existing monthly tab (e.g. "March'26"), filling columns F–M
 * of the row that already has the date label in column A.
 *
 * Column mapping (matches sheet headers):
 *   F = Last Update (timestamp)
 *   G = Gross Website Revenue
 *   H = Net Website Revenue
 *   I = Website Refunds
 *   J = New Customers
 *   K = Returning Customer Orders
 *   L = Total Website Orders
 *   M = Website Units
 */
export async function writeOrdersToSheet(
  date:   string,
  orders: ShopifyOrder[],
): Promise<WriteOrdersResult> {
  const spreadsheetId = env.DAILY_ORDERS_SPREADSHEET_ID
  if (!spreadsheetId) {
    throw new Error('DAILY_ORDERS_SPREADSHEET_ID is not configured.')
  }

  const sheets    = getSheetsClient()
  const tabName   = getTabName(date)      // e.g. "March'26"
  const dateLabel = getDateLabel(date)    // e.g. "Monday, March 23, 2026"

  const rowNumber = await findDateRow(sheets, spreadsheetId, tabName, dateLabel)
  if (rowNumber === null) {
    throw new Error(
      `Date "${dateLabel}" not found in tab "${tabName}". ` +
      `Make sure the monthly sheet exists and column A is pre-filled with dates.`,
    )
  }

  const stats = await aggregateStats(orders, date)

  // ISO timestamp for the "Last Update" column (F)
  const lastUpdate = new Date().toISOString().replace('T', ' ').slice(0, 19)

  // Write F:M — 8 columns
  // F: Last Update timestamp
  // G: Gross Website Revenue
  // H: Net Website Revenue
  // I: Website Refunds
  // J: New Customers
  // K: Returning Customer Orders
  // L: Total Website Orders
  // M: Website Units
  const values = [[
    lastUpdate,
    stats.grossRevenue,
    stats.netRevenue,
    stats.totalRefunds,
    stats.newCustomers,
    stats.returningOrders,
    stats.totalOrders,
    stats.unitsSold,
  ]]

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range:            `'${tabName}'!F${rowNumber}:M${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody:      { values },
  })

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`

  return { sheetUrl, rowsWritten: 1, ordersCount: orders.length, tabName, rowNumber }
}

// ─── Blurr Daily Stats ────────────────────────────────────────────────────────

/**
 * "2026-05-11" → "May 11, 2026"
 * Matches the format used in the reference CSV export.
 */
function getBlurrDateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  return d.toLocaleString('en-US', {
    month:    'long',
    day:      'numeric',
    year:     'numeric',
    timeZone: 'UTC',
  })
}

/**
 * "2026-05-11" → "May 2026"
 * Each month gets its own tab.
 */
function getBlurrTabName(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

// Tabs we have already confirmed exist (or created) in this worker process
const blurrTabCache = new Set<string>()

const BLURR_STATS_FIXED_HEADERS = [
  'Date',
  'Total Daily Gross Sales',
  'Net Website Revenue',
  'Total Orders',
  'Shopify Fees',
  'Collected Sales Tax',
  'Total Units',
  'Total Daily Refunds',
  'New Customers',
  'Returning Customer Orders',
]

export interface BlurrDailyStats {
  grossSales:              number
  netRevenue:              number
  totalOrders:             number
  shopifyFees:             number
  salesTax:                number
  totalUnits:              number
  totalRefunds:            number
  newCustomers:            number
  returningCustomerOrders: number
  productUnits:            Record<string, number>  // productTitle → units sold
}

export interface WriteBlurrStatsResult {
  sheetUrl:    string
  rowNumber:   number
  ordersCount: number
  date:        string
  tabName:     string
}

/**
 * Ensures the monthly tab exists in the spreadsheet, creating it if needed.
 * Results are cached in-process so parallel jobs for the same month only hit
 * the API once.
 */
async function ensureBlurrTab(
  sheets:        ReturnType<typeof getSheetsClient>,
  spreadsheetId: string,
  tabName:       string,
): Promise<void> {
  if (blurrTabCache.has(tabName)) return

  const meta   = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = meta.data.sheets?.some(s => s.properties?.title === tabName)

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabName } } }],
      },
    })
  }

  blurrTabCache.add(tabName)
}

/**
 * Writes aggregated Blurr Daily Stats for `date` (YYYY-MM-DD) into the
 * dedicated stats spreadsheet (BLURR_DAILY_STATS_SPREADSHEET_ID).
 *
 * One tab per calendar month (e.g. "May 2026"). The tab is created
 * automatically if it does not yet exist.
 *
 * Sheet layout per tab:
 *   Row 1: headers  — Date | Total Daily Gross Sales | Total Orders | Shopify Fees |
 *                     Collected Sales Tax | Total Units | Total Daily Refunds | [products…]
 *   Row 2+: one data row per date
 *
 * Write logic:
 *   1. Ensure the monthly tab exists (create if missing).
 *   2. Read header row — create it if missing, extend with new product columns if needed.
 *   3. Scan column A for the date label — update in place if found, append if not.
 */
export async function writeBlurrDailyStatsToSheet(
  date:  string,
  stats: BlurrDailyStats,
): Promise<WriteBlurrStatsResult> {
  const spreadsheetId = env.BLURR_DAILY_STATS_SPREADSHEET_ID
  if (!spreadsheetId) {
    throw new Error('BLURR_DAILY_STATS_SPREADSHEET_ID is not configured.')
  }

  const sheets    = getSheetsClient()
  const tabName   = getBlurrTabName(date)    // e.g. "May 2026"
  const dateLabel = getBlurrDateLabel(date)  // e.g. "May 11, 2026"
  const q         = (range: string) => `'${tabName}'!${range}`

  // ── 0. Ensure the monthly tab exists ──────────────────────────────────────
  await ensureBlurrTab(sheets, spreadsheetId, tabName)

  // ── 1. Read header row ────────────────────────────────────────────────────

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: q('A1:ZZ1'),
  })
  let headers: string[] = (headerRes.data.values?.[0] ?? []).map(String)

  const newProducts = Object.keys(stats.productUnits)
    .filter(p => !headers.includes(p))
    .sort()

  // Also catch any fixed headers that weren't in the tab yet (e.g. newly added columns)
  const missingFixed = BLURR_STATS_FIXED_HEADERS.filter(h => !headers.includes(h))
  const columnsToAdd = [...missingFixed, ...newProducts]

  if (headers.length === 0) {
    headers = [...BLURR_STATS_FIXED_HEADERS, ...Object.keys(stats.productUnits).sort()]
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range:            q('A1'),
      valueInputOption: 'USER_ENTERED',
      requestBody:      { values: [headers] },
    })
  } else if (columnsToAdd.length > 0) {
    headers = [...headers, ...columnsToAdd]
    const startCol = columnLetter(headers.length - columnsToAdd.length + 1)
    const endCol   = columnLetter(headers.length)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range:            q(`${startCol}1:${endCol}1`),
      valueInputOption: 'USER_ENTERED',
      requestBody:      { values: [columnsToAdd] },
    })
  }

  // ── 2. Find or create the data row ───────────────────────────────────────

  const colARes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: q('A:A'),
  })
  const colAValues = (colARes.data.values ?? []).map(r => String(r[0] ?? '').trim())

  let rowNumber = colAValues.findIndex(v => v === dateLabel)
  rowNumber = rowNumber === -1
    ? colAValues.length + 1   // append
    : rowNumber + 1           // 0-indexed → 1-indexed

  // ── 3. Build the row values in header order ───────────────────────────────

  const row: (string | number)[] = headers.map(h => {
    switch (h) {
      case 'Date':                         return dateLabel
      case 'Total Daily Gross Sales':      return stats.grossSales
      case 'Net Website Revenue':          return stats.netRevenue
      case 'Total Orders':                 return stats.totalOrders
      case 'Shopify Fees':                 return stats.shopifyFees
      case 'Collected Sales Tax':          return stats.salesTax
      case 'Total Units':                  return stats.totalUnits
      case 'Total Daily Refunds':          return stats.totalRefunds
      case 'New Customers':                return stats.newCustomers
      case 'Returning Customer Orders':    return stats.returningCustomerOrders
      default:                             return stats.productUnits[h] ?? 0
    }
  })

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range:            q(`A${rowNumber}`),
    valueInputOption: 'USER_ENTERED',
    requestBody:      { values: [row] },
  })

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`

  return {
    sheetUrl,
    rowNumber,
    ordersCount: stats.totalOrders,
    date,
    tabName,
  }
}

/**
 * Converts a 1-based column index to a spreadsheet column letter (A, B, … Z, AA, …).
 */
function columnLetter(n: number): string {
  let result = ''
  while (n > 0) {
    const remainder = (n - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}
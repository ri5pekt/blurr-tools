import { google } from 'googleapis'
import { env } from '../env.js'
import type { ShopifyOrder } from '../shopify/client.js'

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
    day:     'numeric',
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

function aggregateStats(orders: ShopifyOrder[], date: string): DailyStats {
  let grossRevenue    = 0
  let totalRefunds    = 0
  let newCustomers    = 0
  let returningOrders = 0
  let unitsSold       = 0

  for (const o of orders) {
    const gross   = parseFloat(o.total_price)
    // current_total_price is what Shopify reports after all refunds are applied.
    // Subtracting it from total_price gives the exact refunded amount without
    // having to parse nested refund transactions (which are unreliable via fields=).
    const current = parseFloat(o.current_total_price ?? o.total_price)
    grossRevenue  += gross
    totalRefunds  += Math.max(0, gross - current)
    unitsSold     += o.line_items.reduce((s, li) => s + (li.quantity ?? 0), 0)

    // Shopify omits orders_count in the customer object embedded in order
    // responses. Use customer.created_at instead:
    // if the account existed before this order's date → returning customer.
    const customerCreatedDate = o.customer?.created_at
      ? o.customer.created_at.slice(0, 10)   // "2026-03-06T..." → "2026-03-06"
      : null
    const isReturning = customerCreatedDate !== null && customerCreatedDate < date
    if (isReturning) {
      returningOrders++
    } else {
      newCustomers++
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
    totalOrders: orders.length,
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

  const stats = aggregateStats(orders, date)

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

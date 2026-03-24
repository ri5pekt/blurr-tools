# Feature: Daily Orders Export

**Route:** `/app/daily-orders`  
**Feature key:** `daily_orders_export`  
**Reference:** `pfm-tools` → `DailyOrdersDataView.vue` + `daily_orders_data` backend feature

---

## What It Does

Fetches all orders from Shopify for a selected date and writes them to a configured Google Sheet. Runs on demand (user picks a date and clicks Export) and automatically on a daily schedule (exports the previous day's orders each morning).

---

## User Interface

### Screen: `/app/daily-orders`

**Layout:**

```
┌──────────────────────────────────────────────────┐
│  Daily Orders Export                             │
│  Export Shopify orders for any date to Google    │
│  Sheets.                                         │
├──────────────────────────────────────────────────┤
│  CONTROL PANEL (white card)                      │
│                                                  │
│  Date: [date picker]   [Export to Sheets]        │
│                                                  │
│  ○ Auto-schedule: Daily at 08:00 AM ET  [toggle] │
└──────────────────────────────────────────────────┤
│  CURRENT JOB (JobStatusCard — shown when active) │
├──────────────────────────────────────────────────┤
│  JOB HISTORY (JobLogsPanel)                      │
│  Table of past runs with status, date, duration  │
└──────────────────────────────────────────────────┘
```

### Control Panel

- **Date picker:** defaults to yesterday. User selects a date for manual export.
- **Export button:** triggers `POST /api/features/daily-orders/export`. Disabled while a job is already running.
- **Auto-schedule toggle:** enables/disables the scheduled daily export. Shows next run time when enabled.

### Job Status (during/after run)
Uses `JobStatusCard.vue`. Appears after clicking Export. Shows:
- Status badge (pending → running → completed/failed)
- Progress bar (e.g. "Fetching orders... 47% — page 3/7")
- Duration
- On completion: "✓ 247 orders written" + link to Google Sheet
- On failure: error message with details

### Job History
Uses `JobLogsPanel.vue`. Shows last 20 runs:
- Date exported
- Status badge
- Trigger (Manual — username, or Scheduled)
- Orders written
- Duration
- Link to Sheet (if completed)

---

## API Routes

All under `/api/features/daily-orders/`. Auth required on all.

### `POST /api/features/daily-orders/export`

Triggers a manual export.

**Auth:** required  
**Body:**
```json
{ "date": "2026-03-23" }
```

**Flow:**
1. Validate `date` (ISO date string, not in future, required)
2. Create `jobs` row: `{ feature: 'daily_orders_export', status: 'pending', options: { date }, createdBy: userId }`
3. Enqueue BullMQ job: `{ jobId, date }`
4. Return `{ jobId }`

**Response:**
```json
{ "jobId": "uuid" }
```

---

### `GET /api/features/daily-orders/jobs`

Returns job history for this feature.

**Query params:** `limit` (default 20), `offset` (default 0)

**Response:**
```json
{
  "jobs": [
    {
      "id": "uuid",
      "status": "completed",
      "options": { "date": "2026-03-23" },
      "result": { "ordersCount": 247, "sheetUrl": "https://..." },
      "progress": 100,
      "createdBy": { "id": "...", "name": "Denis" },
      "createdAt": "2026-03-24T08:00:00Z",
      "startedAt": "2026-03-24T08:00:01Z",
      "completedAt": "2026-03-24T08:02:15Z"
    }
  ],
  "total": 45
}
```

---

### `GET /api/jobs/:jobId`

Shared route — polls a single job's current status. Used by the frontend for live polling.

---

### `GET /api/features/daily-orders/schedule`

Returns the current scheduled export config.

**Response:**
```json
{
  "id": "uuid",
  "enabled": true,
  "cron": "0 8 * * *",
  "timezone": "America/New_York",
  "nextRunAt": "2026-03-25T08:00:00-04:00"
}
```

---

### `PUT /api/features/daily-orders/schedule`

Enable or disable the scheduled export, or update its cron.

**Body:**
```json
{ "enabled": true }
```

---

## Worker: `processors/daily-orders.ts`

BullMQ job processor. Called with `{ jobId, date }`.

### Steps

```
1. Update job row: status = 'running', startedAt = now()

2. Authenticate with Shopify
   - POST to /admin/oauth/access_token with client_credentials grant
   - Cache token in memory, reuse until 60s before expiry
   - progress → 5%

3. Get store timezone
   - GET /admin/api/2026-01/shop.json → shop.iana_timezone
   - Cache timezone in DB or memory for subsequent runs
   - progress → 10%

4. Compute UTC date window for the requested local day
   - Convert date (e.g. "2026-03-23") to UTC range using store IANA timezone
   - e.g. America/New_York → 2026-03-23T05:00:00Z to 2026-03-24T04:59:59Z

5. Fetch NEW orders (created on that local day)
   - GET /orders.json?status=any&limit=250&created_at_min=...&created_at_max=...&fields=...
   - Paginate via Link header rel="next" (full URL in header, follow until no next)
   - Update progress as pages complete
   - progress → 50%

6. Fetch REFUNDED orders (refunds processed on that local day, on any order)
   - GET /orders.json?status=any&limit=250&updated_at_min=...&updated_at_max=...&fields=...
   - updated_at window = 3 days from local midnight (Shopify updated_at lags ~24h after refund)
   - Filter client-side: keep only orders where any refund.created_at == target local date
   - Exclude orders already in step 5 (same-day orders) to avoid duplication
   - progress → 70%

7. Flatten and compute metrics
   - For each new order: compute gross_sales, discounts, refund_total, net_revenue,
     sold_units, customer_type (new/returning via customer.orders_count)
   - For refunded orders: compute refunds_on_date (only refund txns from that local day)
   - progress → 80%

8. Write to Google Sheets
   - Open spreadsheet by DAILY_ORDERS_SPREADSHEET_ID
   - Find or create tab named after the date (e.g. "2026-03-23")
   - Clear tab, write header row, write all data rows in one batch call
   - progress → 95%

9. Update job row:
   - status = 'completed'
   - result = { ordersCount, refundedOrdersCount, sheetUrl, tabName }
   - completedAt = now()
   - progress = 100

On any error:
   - Update job row: status = 'failed', errorMessage = error.message, completedAt = now()
   - Write error log via logger
   - Re-throw (BullMQ handles retry with backoff)
```

### Retry Policy
```typescript
defaultJobOptions: {
  attempts: 3,
  backoff: { type: 'exponential', delay: 10000 },  // 10s, 20s, 40s
}
```

---

## Shopify Integration

### Authentication — Client Credentials Flow

Shopify uses a **client credentials** grant (server-to-server). There is no static "Admin API token" — instead, a short-lived access token is obtained by exchanging `client_id` + `client_secret`.

```typescript
// POST https://{SHOPIFY_SHOP}.myshopify.com/admin/oauth/access_token
// Body (form-encoded): grant_type=client_credentials&client_id=...&client_secret=...
// Response: { access_token, expires_in (seconds) }
// Use: X-Shopify-Access-Token: <access_token> on all API calls
```

**Token caching:** The token is cached in memory and reused. It is refreshed automatically when it is within 60 seconds of expiry (`expires_in` defaults to 86400s = 24h if not returned).

```typescript
// apps/worker/src/shopify/client.ts
let cachedToken: string | null = null
let tokenExpiresAt = 0

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken
  const res = await fetch(`https://${env.SHOPIFY_SHOP}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.SHOPIFY_CLIENT_ID,
      client_secret: env.SHOPIFY_CLIENT_SECRET,
    }),
  })
  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiresAt = Date.now() + (data.expires_in ?? 86400) * 1000
  return cachedToken
}
```

### API Version and Base URL

```
API Version: 2026-01
Base URL:    https://{SHOPIFY_SHOP}.myshopify.com/admin/api/2026-01
```

### Store Timezone

Fetched once from the Shopify store settings and cached:

```typescript
// GET /admin/api/2026-01/shop.json → body.shop.iana_timezone
// e.g. "America/New_York"
```

Used to convert the requested `date` string (e.g. `"2026-03-23"`) into the correct UTC boundaries for API filtering.

### Date Filtering

```typescript
// For date = "2026-03-23", storeTimezone = "America/New_York":
const start = new Date('2026-03-23T00:00:00').toLocaleString('en-US', { timeZone: storeTimezone })
// created_at_min = 2026-03-23T05:00:00+00:00  (UTC equivalent of midnight ET)
// created_at_max = 2026-03-24T04:59:59+00:00  (UTC equivalent of 23:59:59 ET)
```

### Pagination

Shopify cursor pagination via the **`Link`** response header:

```
Link: <https://shop.myshopify.com/admin/api/2026-01/orders.json?page_info=abc123>; rel="next"
```

The worker follows `rel="next"` URLs sequentially until no next link is returned. Each page: 250 orders (Shopify maximum).

```typescript
function parseNextUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null
  for (const part of linkHeader.split(',')) {
    if (part.includes('rel="next"')) {
      return part.split(';')[0].trim().replace(/[<>]/g, '')
    }
  }
  return null
}
```

### Request Fields

The `fields` query parameter limits what Shopify returns (reduces payload size):

```
id, name, email, created_at, processed_at,
financial_status, fulfillment_status,
total_price, subtotal_price, total_tax,
total_shipping_price_set, total_discounts,
currency, customer, shipping_address,
line_items, refunds, tags, note, source_name
```

### Rate Limiting

Shopify returns `429 Too Many Requests` when the rate limit is hit. The worker handles this with retry + `Retry-After` header respect:

```typescript
if (res.status === 429) {
  const retryAfter = parseInt(res.headers.get('Retry-After') ?? '2', 10)
  await sleep(retryAfter * 1000)
  return shopifyGet(path, params)  // retry
}
```

---

## Google Sheets Integration

### Auth
Service account credentials from env: `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` (path to JSON file) or `GOOGLE_SERVICE_ACCOUNT_KEY` (inline JSON string).

### Write Pattern
1. Open spreadsheet by ID (`DAILY_ORDERS_SPREADSHEET_ID`)
2. Find or create tab named after the export date (e.g. `2026-03-23`)
3. Clear tab
4. Write header row
5. Write all data rows in a single batch `values.update` call

### Column Mapping

Matches the `flatten_order` output from the reference implementation (`daily_orders.py`):

| Sheet Column | Source | Notes |
|-------------|--------|-------|
| `order_id` | `order.id` | Shopify internal ID |
| `order_name` | `order.name` | e.g. `#1234` |
| `channel` | `order.source_name` | e.g. `web`, `pos`, `shopify_draft_orders` |
| `created_at` | `order.created_at` | ISO timestamp |
| `refunded_at` | `refund.created_at` (earliest) | comma-separated if multiple dates |
| `financial_status` | `order.financial_status` | `paid`, `refunded`, `partially_refunded`, etc. |
| `fulfillment_status` | `order.fulfillment_status` | `fulfilled`, `unfulfilled`, `partial` |
| `customer_type` | `customer.orders_count` | `new` (=1) or `returning` (>1) |
| `currency` | `order.currency` | |
| `gross_sales` | `order.subtotal_price` | post-discount, pre-refund/tax/shipping |
| `discounts` | `order.total_discounts` | |
| `refunds` | sum of successful refund transactions | only `kind=refund, status=success` txns |
| `net_revenue` | `gross_sales - refunds` | |
| `total_tax` | `order.total_tax` | |
| `shipping` | `order.total_shipping_price_set.shop_money.amount` | |
| `total_price` | `order.total_price` | grand total |
| `sold_units` | sum of `line_item.quantity` | |
| `customer_first` | `customer.first_name` | |
| `customer_last` | `customer.last_name` | |
| `customer_email` | `order.email` or `customer.email` | |
| `customer_phone` | `customer.phone` | |
| `ship_city` | `shipping_address.city` | |
| `ship_province` | `shipping_address.province_code` | |
| `ship_zip` | `shipping_address.zip` | |
| `ship_country` | `shipping_address.country_code` | |
| `line_items` | formatted string | `"Product A x2 @ 29.99; Product B x1 @ 14.99"` |
| `tags` | `order.tags` | |
| `note` | `order.note` | newlines replaced with spaces |

**Refund rows (separate sheet tab or appended section):** For refunded orders on the same day, an additional set of rows is written showing the refunded amounts attributed to that date — matching Metorik's date attribution method.

---

## Scheduled Daily Export

### How It Works
- BullMQ repeatable job registered on worker startup
- Reads schedule from `scheduled_exports` table: feature = `daily_orders_export`
- If `enabled = true`: registers repeatable job with `cron` and `timezone`
- If `enabled = false`: removes repeatable job if it exists
- On trigger: creates a `jobs` row with `createdBy = null` (scheduled), date = yesterday, enqueues the same processor

### Default Schedule
```
Cron:     0 8 * * *
Timezone: America/New_York
→ Runs every day at 08:00 AM Eastern, exports previous day's orders
```

---

## Frontend API Client (`apps/web/src/api/features/dailyOrders.ts`)

```typescript
export const dailyOrdersApi = {
  exportOrders: (date: string) =>
    apiClient.post<{ jobId: string }>('/features/daily-orders/export', { date }),

  getJobs: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<{ jobs: Job[]; total: number }>('/features/daily-orders/jobs', { params }),

  getSchedule: () =>
    apiClient.get<ScheduledExport>('/features/daily-orders/schedule'),

  updateSchedule: (data: { enabled: boolean }) =>
    apiClient.put<ScheduledExport>('/features/daily-orders/schedule', data),
}
```

---

## Environment Variables Required

```bash
# Shopify — client credentials (custom app Client ID + Secret)
SHOPIFY_SHOP=your-store.myshopify.com          # shop subdomain only, no https://
SHOPIFY_CLIENT_ID=efab04b3xxxxxxxxxxxxxxxx
SHOPIFY_CLIENT_SECRET=shpss_xxxxxxxxxxxxxxxx
# Store timezone is auto-fetched from GET /shop.json → shop.iana_timezone
# No need to set it manually.

# Google Sheets
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/run/secrets/google-sa-key.json
# or inline JSON string:
# GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# Daily Orders feature config
DAILY_ORDERS_SPREADSHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
DAILY_ORDERS_SCHEDULE_CRON=0 8 * * *
DAILY_ORDERS_SCHEDULE_TZ=America/New_York
```

---

## Dashboard Card

```
┌─────────────────────────────┐
│  📊  Daily Orders Export    │
│  Export Shopify orders to   │
│  Google Sheets daily.       │
│                   [Open →]  │
└─────────────────────────────┘
```

Sidebar entry: `pi-file-export` icon + "Daily Orders"

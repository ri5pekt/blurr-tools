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

2. Build Shopify API request
   - Endpoint: GET /admin/api/2024-01/orders.json
   - Params: created_at_min, created_at_max (full day in store timezone)
   - Headers: X-Shopify-Access-Token: <SHOPIFY_ADMIN_API_TOKEN>
   - Paginate via `page_info` cursor (Shopify cursor-based pagination)
   - Update progress % as pages load

3. Transform orders to rows
   - Map each order to a flat row: order id, order number, date, customer name,
     email, total, line items summary, payment status, fulfillment status, etc.
   - (Exact columns defined in column mapping section below)

4. Write to Google Sheets
   - Clear existing tab content (or append, configurable)
   - Write header row
   - Write data rows in batch
   - Update progress to 90%

5. Update job row: 
   - status = 'completed'
   - result = { ordersCount, sheetUrl, tabName }
   - completedAt = now()
   - progress = 100

On any error:
   - Update job row: status = 'failed', errorMessage = error.message, completedAt = now()
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

### API Details
- **Base URL:** `https://{SHOPIFY_STORE_URL}/admin/api/2024-01`
- **Auth:** `X-Shopify-Access-Token: {SHOPIFY_ADMIN_API_TOKEN}`
- **Orders endpoint:** `GET /orders.json`

### Date Filtering
Shopify orders are filtered by `created_at_min` and `created_at_max` using the **store's timezone** (configured in Shopify — usually matches the business timezone). The worker computes full-day boundaries:

```
created_at_min = 2026-03-23T00:00:00-05:00
created_at_max = 2026-03-23T23:59:59-05:00
```

### Pagination
Shopify uses cursor-based pagination (Link header with `page_info`). The worker iterates all pages with 250 orders per page.

### Order Fields to Fetch
```
id, order_number, created_at, email, phone,
billing_address, shipping_address,
financial_status, fulfillment_status,
total_price, subtotal_price, total_tax, total_discounts,
currency, line_items (name, quantity, price, sku),
tags, note, customer (id, first_name, last_name)
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

| Sheet Column | Shopify Field |
|-------------|---------------|
| Order Number | `order_number` |
| Date | `created_at` (formatted) |
| Customer Name | `billing_address.first_name + last_name` |
| Email | `email` |
| Phone | `phone` |
| Items | `line_items` joined as "Product x2, Product2 x1" |
| Subtotal | `subtotal_price` |
| Discounts | `total_discounts` |
| Tax | `total_tax` |
| Total | `total_price` |
| Currency | `currency` |
| Payment Status | `financial_status` |
| Fulfillment Status | `fulfillment_status` |
| Tags | `tags` |
| Shopify Order ID | `id` |

*(Exact columns can be adjusted — this is the initial set.)*

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
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ADMIN_API_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxx
SHOPIFY_STORE_TIMEZONE=America/New_York   # used for date boundary calculation

GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/run/secrets/google-sa-key.json
# or
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

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

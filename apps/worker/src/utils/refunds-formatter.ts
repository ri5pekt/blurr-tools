import type { ShopifyOrder, ShopifyRefund } from '../shopify/client.js'

export interface RefundRow {
  order:  ShopifyOrder
  refund: ShopifyRefund
}

const CSV_HEADER = [
  'Order Number',
  'Order Date',
  'Refund Date',
  'Customer Name',
  'Customer Email',
  'Refund Amount',
  'Currency',
  'Refunded Items',
  'Reason',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Escapes a value for CSV: wraps in quotes and doubles any embedded quotes if needed. */
function csvEscape(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function buildRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(csvEscape).join(',') + '\r\n'
}

/** Sums the successful refund transactions on a single refund object. */
function computeRefundAmount(refund: ShopifyRefund): number {
  let total = 0
  for (const txn of refund.transactions ?? []) {
    if (txn.kind === 'refund' && txn.status === 'success') {
      total += parseFloat(txn.amount ?? '0')
    }
  }
  return Math.round(total * 100) / 100
}

/** Summarizes a refund's line items as "SKU (qty)" or "Title (qty)" joined by "; ". */
function summarizeRefundedItems(refund: ShopifyRefund): string {
  const items = refund.refund_line_items ?? []
  if (items.length === 0) return ''
  return items
    .map((item) => {
      const label = item.line_item?.sku || item.line_item?.title || 'Unknown item'
      return `${label} (${item.quantity})`
    })
    .join('; ')
}

// ─── Main export ────────────────────────────────────────────────────────────

/**
 * Converts a list of { order, refund } pairs into a CSV string, one row per
 * refund event (not per refunded line item).
 */
export function formatRefundsToCsv(rows: RefundRow[]): string {
  let output = buildRow(CSV_HEADER)

  for (const { order, refund } of rows) {
    const orderNumber = order.name.replace(/^#/, '')
    const orderDate    = order.created_at?.slice(0, 10) ?? ''
    const refundDate   = refund.created_at?.slice(0, 10) ?? ''

    const firstName    = order.customer?.first_name ?? ''
    const lastName     = order.customer?.last_name  ?? ''
    const customerName = `${firstName} ${lastName}`.trim()
    const customerEmail = order.customer?.email ?? order.email ?? ''

    const refundAmount = computeRefundAmount(refund)
    const refundedItems = summarizeRefundedItems(refund)
    const reason = refund.note ?? ''

    output += buildRow([
      orderNumber,
      orderDate,
      refundDate,
      customerName,
      customerEmail,
      refundAmount.toFixed(2),
      order.currency,
      refundedItems,
      reason,
    ])
  }

  return output
}

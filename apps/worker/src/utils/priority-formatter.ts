import type { ShopifyOrder } from '../shopify/client.js'

// ─── Currency → Priority customer code + warehouse ────────────────────────────

interface CurrencyMapping {
  custCode:  string
  warehouse: string
}

function getCurrencyMapping(currency: string): CurrencyMapping {
  switch (currency) {
    case 'USD': return { custCode: '1060001', warehouse: 'SbNJ' }
    case 'EUR': return { custCode: '78',      warehouse: 'SbCA' }
    case 'AUD': return { custCode: '79',      warehouse: 'SbCA' }
    case 'CAD': return { custCode: '292',     warehouse: 'SbCA' }
    case 'GBP': return { custCode: '291',     warehouse: 'SbCA' }
    case 'ILS': return { custCode: '76',      warehouse: 'Gre'  }
    case 'BRL': return { custCode: '100001',  warehouse: 'SbCA' }
    case 'MXN': return { custCode: '100002',  warehouse: 'SbCA' }
    case 'KRW': return { custCode: '100003',  warehouse: 'SbCA' }
    case 'JPX': return { custCode: '100004',  warehouse: 'SbCA' }
    case 'JPY': return { custCode: '100005',  warehouse: 'SbCA' }
    default:    return { custCode: '1060001', warehouse: 'SbCA' }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Write a TAB-separated line, stripping trailing empty fields (matching the
 * PHP plugin's write_txt_line behaviour).
 */
function buildLine(fields: (string | number)[]): string {
  const strs = fields.map(f => (f === null || f === undefined) ? '' : String(f))
  while (strs.length > 0 && strs[strs.length - 1] === '') {
    strs.pop()
  }
  return strs.join('\t') + '\n'
}

/**
 * Convert Shopify ISO date "YYYY-MM-DDTHH:mm:ssZ" → "DD/MM/YYYY"
 * Uses the date as-is from the UTC timestamp (matching fetchOrdersForDate boundaries).
 */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

// ─── SKU rewrites ─────────────────────────────────────────────────────────────
// Maps Shopify SKUs to the barcode value that Priority expects.
// Add new entries here whenever a SKU needs to be remapped.

const SKU_REWRITES: Record<string, string> = {
  'Insure01': '0001',
}

function rewriteSku(sku: string): string {
  return SKU_REWRITES[sku] ?? sku
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Convert an array of Shopify orders into a Priority-compatible TXT string.
 * Matches the exact format produced by the post-orders-to-priority WP plugin.
 */
export function formatOrdersToPriorityTxt(orders: ShopifyOrder[]): string {
  let output = ''

  for (const order of orders) {
    const { custCode, warehouse } = getCurrencyMapping(order.currency)

    const orderNumber   = order.name.replace(/^#/, '')
    const orderDate     = formatDate(order.created_at)
    const paymentMethod = order.gateway ?? ''

    const firstName    = order.customer?.first_name ?? ''
    const lastName     = order.customer?.last_name  ?? ''
    const customerName = order.shipping_address?.name
      || `${firstName} ${lastName}`.trim()
      || ''

    // ── Line 1: order header ──────────────────────────────────────────────────
    // 1  CUSTNAME  CDES  IVDATE  DETAILS  payment_method  WARHSNAME
    output += buildLine(['1', custCode, customerName, orderDate, orderNumber, paymentMethod, warehouse])

    // ── Line 2 ────────────────────────────────────────────────────────────────
    output += buildLine(['2'])

    // ── Line 3: billing/contact ───────────────────────────────────────────────
    // 3  PHONE  EMAIL  NAME  ADRS  ADRS2(city)  ZIP
    const phone   = order.phone
      || order.customer?.phone
      || order.billing_address?.phone
      || order.shipping_address?.phone
      || ''
    const email   = order.email ?? ''
    const address = order.shipping_address?.address1 ?? ''
    const city    = order.shipping_address?.city ?? ''
    const zip     = order.shipping_address?.zip ?? ''

    output += buildLine(['3', phone, email, customerName, address, city, zip])

    // Split line items: regular products vs. package-protection fee items.
    // Protection items are emitted after shipping as barcode-100 fee rows,
    // matching the PHP plugin's fee loop (same as WooCommerce order fees).
    const regularItems    = order.line_items.filter(li => li.title.toLowerCase() !== 'package protection')
    const protectionItems = order.line_items.filter(li => li.title.toLowerCase() === 'package protection')

    // ── Line 5: line items ────────────────────────────────────────────────────
    // 5  BARCODE  TQUANT  PRICE  PERCENT  TOTPRICE
    for (const item of regularItems) {
      const barcode    = rewriteSku(item.sku || String(item.id))
      const qty        = item.quantity
      const lineTotal  = parseFloat(item.price) * item.quantity

      output += buildLine(['5', barcode, qty, 0, 0, lineTotal])
    }

    // ── Discount (barcode 000) ────────────────────────────────────────────────
    const discount = parseFloat(order.total_discounts ?? '0')
    if (discount > 0) {
      output += buildLine(['5', '000', '-1', '', '', -discount])
    }

    // ── Tax (barcode 998) ─────────────────────────────────────────────────────
    const tax = parseFloat(order.total_tax ?? '0')
    if (tax > 0) {
      output += buildLine(['5', '998', '1', '', '', tax])
    }

    // ── Shipping (barcode 999) ────────────────────────────────────────────────
    const shipping = parseFloat(
      order.total_shipping_price_set?.shop_money?.amount ?? '0',
    )
    if (shipping > 0) {
      output += buildLine(['5', '999', '1', '', '', shipping])
    }

    // ── Package Protection fee (barcode 100) ──────────────────────────────────
    // Mirrors the PHP plugin's fee loop: any WC fee with no special name → barcode 100.
    // On Shopify this fee arrives as a line item (added by UpCart), so we emit it here
    // after shipping to preserve the same row order as the WP plugin.
    for (const item of protectionItems) {
      const feeTotal = parseFloat(item.price) * item.quantity
      output += buildLine(['5', '100', '1', '', '', feeTotal])
    }
  }

  return output
}

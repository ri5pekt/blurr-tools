# Shopify Fees

## How fees are loaded

**Source: Shopify GraphQL Admin API — `order.transactions.fees`**

When an order is paid, Shopify creates one or more **transactions** (authorization, capture, sale, refund). Each transaction that involves a card charge has a `fees` array attached to it, queried via GraphQL:

```
order → transactions → fees[]
```

Only **capture** and **sale** transaction types carry fees. Authorization transactions always have an empty `fees` array.

API version: `2026-01`  
Required scope: `read_orders` (already approved)

---

## Fee record fields

| Field | Example | Meaning |
|-------|---------|---------|
| `type` | `processing_fee` | Type of fee — always `processing_fee` for card charges |
| `amount` | `1.78 USD` | Actual dollar amount charged |
| `taxAmount` | `0.00 USD` | Tax on the fee (0 for US stores) |
| `rateName` | `domestic_card_not_present` | Card/payment category used to determine the rate |
| `rate` | `0.025` | Percentage rate applied (e.g. `0.025` = 2.5%) |
| `flatFeeName` | `null` | Populated only if the fee is flat rather than percentage-based |

---

## How the fee amount is calculated

```
fee amount = transaction amount × rate
```

Example:
- Transaction: `$59.00`
- Rate: `2.5%` (`domestic_card_not_present`)
- Fee: `$59.00 × 0.025 = $1.475` → rounded to `$1.48`

### Known rate names and rates

| Rate name | Rate | Card type |
|-----------|------|-----------|
| `domestic_card_not_present` | 2.5% | Standard US Visa / Mastercard |
| `amex_card_not_present` | 3.1% | US Amex |
| `premium_domestic_card_not_present` | ~2.9% | Premium US cards |
| `paypal_domestic_card_not_present` | 3.49% | PayPal |
| `amex_international_card_not_present` | 4.3% | International Amex |

Orders with multiple capture transactions (e.g. split shipments) will produce multiple fee rows — one per transaction.

---

## CSV export

Run the ad-hoc export script from the repo root to generate a fee report for any window:

```bash
# Two-month window (adjust dates as needed)
node --env-file=.env export-fees.mjs
```

The script paginates through all orders (50 per GraphQL page) and writes one CSV row per fee record.

### CSV columns

| Column | Description |
|--------|-------------|
| `order_gid` | Shopify GID for the order |
| `order_name` | Order number e.g. `#1433` |
| `order_created_at` | ISO timestamp of order creation |
| `order_processed_at` | ISO timestamp of order processing |
| `order_financial_status` | e.g. `PAID`, `REFUNDED` |
| `order_total_amount` | Order total in shop currency |
| `order_currency` | Currency code e.g. `USD` |
| `transaction_gid` | Shopify GID for the transaction |
| `transaction_kind` | `CAPTURE`, `SALE`, `REFUND`, etc. |
| `transaction_status` | `SUCCESS`, `FAILURE`, etc. |
| `transaction_gateway` | e.g. `shopify_payments` |
| `transaction_created_at` | ISO timestamp |
| `transaction_processed_at` | ISO timestamp |
| `transaction_amount` | Transaction amount |
| `transaction_currency` | Currency code |
| `fee_type` | Always `processing_fee` |
| `fee_amount` | Fee charged in USD |
| `fee_currency` | Currency code |
| `fee_tax_amount` | Tax on the fee (usually `0.00`) |
| `fee_tax_currency` | Currency code |
| `fee_rate_name` | Card category name |
| `fee_flat_fee_name` | Flat fee name if applicable |
| `fee_rate` | Rate as a decimal e.g. `0.025` |

---

## What is NOT available without extra permissions

The `read_shopify_payments_payouts` scope is **not** approved for this app. The following endpoints return `403`:

- `GET /shopify_payments/payouts.json`
- `GET /shopify_payments/balance/transactions.json`

These would provide the broader payout ledger including chargebacks, adjustments, dispute fees, and shipping-label charges. Enabling them requires merchant approval via the Shopify Partners dashboard.

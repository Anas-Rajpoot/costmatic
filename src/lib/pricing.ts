import type { ProductUnit } from '@/types'
import { round2, round3 } from '@/lib/format'

// Retail vs wholesale — the POS mode toggle picks which price column is used.
export type SaleMode = 'retail' | 'wholesale'

// The per-unit list price for the current sale mode. Prices are numeric in the DB
// (PostgREST returns them as strings), so coerce.
export function getListPrice(unit: ProductUnit, mode: SaleMode): number {
  return Number(mode === 'retail' ? unit.retail_price : unit.wholesale_price)
}

export interface LineMoney {
  list_price: number
  unit_price: number
  line_total: number
}

// Quantity / weight / pack line: line = discounted unit price × quantity.
// These are client-side PREVIEW figures; create_sale recomputes authoritatively.
export function computeLine(
  unit: ProductUnit,
  quantity: number,
  discount_pct: number,
  mode: SaleMode,
): LineMoney {
  const list_price = getListPrice(unit, mode)
  const unit_price = list_price * (1 - discount_pct / 100)
  return { list_price, unit_price, line_total: round2(unit_price * quantity) }
}

export interface AmountLineMoney extends LineMoney {
  quantity: number
}

// Loose "Rs X worth": the line total is pinned to the exact amount (confirmed rule);
// the weight is derived from the mode's per-unit rate and is approximate. Discount
// does not apply in amount mode.
export function computeAmountLine(
  unit: ProductUnit,
  amount: number,
  mode: SaleMode,
): AmountLineMoney {
  const list_price = getListPrice(unit, mode)
  const quantity = list_price > 0 ? round3(amount / list_price) : 0
  return { list_price, unit_price: list_price, quantity, line_total: round2(amount) }
}

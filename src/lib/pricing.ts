import type { Product, ProductUnit } from '@/types'
import { round2, round3 } from '@/lib/format'

// Retail vs wholesale — the POS mode toggle picks which price column is used.
export type SaleMode = 'retail' | 'wholesale'

// ── Unit selection ────────────────────────────────────────────────────────────

export function isLooseProduct(p: Product): boolean {
  return p.product_kind === 'loose'
}

/** The factor-1 base unit (kg / litre / piece / bottle) used for weight & amount modes. */
export function baseUnitOf(p: Product): ProductUnit {
  return p.units!.find(u => u.unit_name === p.base_unit) ?? p.units![0]
}

/** Non-base units (packs like 250g / 5kg, or a crate) sold as whole counts. */
export function packUnitsOf(p: Product): ProductUnit[] {
  return (p.units ?? []).filter(u => u.unit_name !== p.base_unit)
}

/** Retail/wholesale eligibility (migration 0008). Undefined (old rows) → allowed. */
export function unitEligible(u: ProductUnit, mode: SaleMode): boolean {
  return mode === 'retail' ? (u.retail_eligible ?? true) : (u.wholesale_eligible ?? true)
}

export function eligibleUnits(p: Product, mode: SaleMode): ProductUnit[] {
  return (p.units ?? []).filter(u => unitEligible(u, mode))
}

/**
 * The unit a line should sell in for a mode: retail → the smallest eligible unit
 * (piece / bottle / kg), wholesale → the biggest eligible bulk unit (carton /
 * crate / bag). A product with only one unit keeps that unit in both modes.
 * factor can arrive as a string from PostgREST, so compare numerically.
 */
export function defaultUnitFor(p: Product, mode: SaleMode): ProductUnit {
  const base = baseUnitOf(p)
  const elig = eligibleUnits(p, mode)
  if (elig.length === 0) return base
  const bySize = [...elig].sort((a, b) => Number(a.factor) - Number(b.factor))
  if (mode === 'retail') return bySize[0]
  const bulk = bySize.filter(u => u.unit_name !== p.base_unit)
  const pool = bulk.length ? bulk : bySize
  return pool[pool.length - 1]
}

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

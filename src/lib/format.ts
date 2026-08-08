const pkrFormatter = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatPKR(amount: number): string {
  return pkrFormatter.format(amount)
}

/** Round to 2 decimals (money). */
export const round2 = (n: number) => Math.round(n * 100) / 100
/** Round to 3 decimals (weight/volume — 1 gram / 1 ml precision). */
export const round3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * Display a quantity: whole numbers plainly (2), fractional ones with up to 3
 * trimmed decimals (0.8, 0.35, 0.851). Used for loose weights on screen,
 * receipts, and reports.
 */
export function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : String(round3(q))
}

/** Short caption for a product's base unit (kg / L / btl / pack / pcs). */
export function unitShort(base_unit: string): string {
  if (base_unit === 'kg') return 'kg'
  if (base_unit === 'litre') return 'L'
  if (base_unit === 'bottle') return 'btl'
  if (base_unit === 'pack') return 'pack'
  return 'pcs'
}

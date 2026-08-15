/**
 * POS search-box entry parsing.
 *
 * Cashiers bill fast with one hand on the scanner: the quantity prefix lets them
 * type "3*sugar" (or "3 x sugar") to bill three at once, and "3*" on its own to
 * set the selected line's quantity — instead of pressing + three times.
 */
export interface PosEntry {
  qty: number
  term: string
}

export function parseEntry(raw: string): PosEntry {
  const m = raw.match(/^(\d+(?:\.\d+)?)\s*[*x]\s*(.*)$/i)
  if (!m) return { qty: 1, term: raw.trim() }
  return { qty: Math.max(parseFloat(m[1]) || 1, 0), term: m[2].trim() }
}

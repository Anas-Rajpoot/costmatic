/**
 * Escape a DB/user-controlled value before interpolating it into an HTML string.
 *
 * Several print flows (sales receipt, barcode labels, statements) build HTML by
 * string interpolation and hand it to `window.open(...).document.write(...)`.
 * Product / customer / shop names are attacker-controllable, so any unescaped
 * interpolation is a stored-XSS sink (review finding H1). Route every such value
 * through this helper. Values produced by the app itself (e.g. formatPKR output,
 * canvas data: URLs) are safe and don't need it.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

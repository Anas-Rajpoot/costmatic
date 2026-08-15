import { formatPKR, formatQty } from '@/lib/format'
import { escapeHtml } from '@/lib/escapeHtml'

// Sales receipt: HTML builder (pure, unit-testable) + the browser print path.

export interface ReceiptData {
  invoice_no: string
  date: string
  customer_name: string | null
  items: {
    product_name: string
    unit_name: string
    quantity: number
    unit_price: number
    discount_pct: number
    line_total: number
  }[]
  subtotal: number
  total: number
  paid: number
  due: number
  tendered?: number
  change?: number
  // Khata (running account) — only for a named customer with a balance:
  previous_balance?: number // owed before this sale
  khata_paid?: number       // extra cash put on the old balance with this sale
  new_balance?: number      // owed after this sale (previous + udhaar − khata payment)
}

export interface ShopInfo {
  name: string
  address: string
  phone: string
  footer: string
  // Thermal roll width in mm (80mm is the common POS printer; 58mm the small one).
  widthMm: 58 | 80
}

export function buildReceiptHtml(data: ReceiptData, shop: ShopInfo) {
  // Standard POS rolls: 80mm desktop (72mm actual print area) and 58mm mobile
  // (48mm print area). The side padding is exactly the printer's dead margin,
  // so the content fills the full printable width without being clipped.
  const paper = shop.widthMm === 58 ? 58 : 80
  const narrow = paper === 58
  const pad = narrow ? 5 : 4 // mm each side → 48mm / 72mm of print
  // 58mm has only 48mm of print — everything steps down a size there so totals
  // and labels stay on one line instead of wrapping.
  const px = {
    body:  narrow ? 11 : 14, // ~3.7mm caps at 203dpi — the size shops print at
    shop:  narrow ? 13 : 17, // longer shop names still fit on one line
    sub:   narrow ? 9  : 12,
    line:  narrow ? 10 : 13,
    total: narrow ? 14 : 20,
    khata: narrow ? 12 : 16,
    urdu:  narrow ? 9  : 12, // Nastaliq reads large for its point size — step it down
  }

  // One item = two lines: name + line amount, then quantity and unit price
  // underneath, closed by a dotted rule. No arithmetic on the paper — just the
  // name, how many, and the rate. Names all start at the same left edge and
  // every amount lands in one right-hand column.
  const rows = data.items
    .map(item => {
      const qty = `${escapeHtml(formatQty(item.quantity))} ${escapeHtml(item.unit_name)}`
      const rate = `${formatPKR(item.unit_price)}${item.discount_pct > 0 ? ` -${escapeHtml(item.discount_pct)}%` : ''}`
      // Only Arabic-script names get the Nastaliq face; Latin names stay in Inter.
      const nameCls = /[؀-ۿ]/.test(item.product_name) ? 'nm ur' : 'nm'
      return `
      <tr><td class="${nameCls}">${escapeHtml(item.product_name)}</td><td class="r nm">${formatPKR(item.line_total)}</td></tr>
      <tr><td class="ln sep">${qty}</td><td class="ln r sep">${rate}</td></tr>`
    })
    .join('')

  const printedAt = new Date()
  const dateStr = new Date(data.date).toLocaleDateString('en-PK')
  const timeStr = printedAt.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Receipt ${data.invoice_no}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&family=Noto+Nastaliq+Urdu&display=swap" rel="stylesheet">
<style>
@page{size:${paper}mm auto;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${paper}mm;background:#fff}
/* Inter, not a typewriter face: it stays crisp at 203dpi and prints solid at
   weight 500+. Tabular figures keep every amount in one straight column, which
   is the only thing monospace was buying us. */
body{font-family:'Inter',system-ui,'Segoe UI',Roboto,Arial,sans-serif;font-weight:500;
  font-size:${px.body}px;line-height:1.45;color:#000;font-variant-numeric:tabular-nums;
  font-feature-settings:'tnum' 1;
  padding:4mm ${pad}mm 12mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1{font-size:${px.shop}px;text-align:center;font-weight:700;line-height:1.2;letter-spacing:.3px}
.sub{text-align:center;font-size:${px.sub}px;margin-top:1px}
.meta{font-size:${px.sub}px}
.rule{border-top:1px solid #000;margin:5px 0}
.dash{border-top:1px dashed #000;margin:5px 0}
table{width:100%;border-collapse:collapse;table-layout:fixed}
col.lbl{width:${narrow ? 54 : 62}%}
col.amt{width:${narrow ? 46 : 38}%}
td{vertical-align:top;word-wrap:break-word;overflow-wrap:break-word}
.hd td{font-size:${px.sub}px;font-weight:600;letter-spacing:.6px;border-bottom:1px solid #000;padding-bottom:3px}
.nm{font-weight:700;padding-top:5px;text-align:left}
.ln{font-size:${px.line}px;padding-left:${narrow ? 3 : pad}mm;padding-top:3px}
.sep{border-bottom:1px dotted #666;padding-bottom:4px}
.r{text-align:right}
.bold{font-weight:700}
.tot td{padding:2px 0;font-size:${px.line}px}
.tot tr.big td{font-size:${px.total}px;font-weight:700;letter-spacing:.2px;padding:4px 0}
.tot tr.mid td{font-size:${px.khata}px;font-weight:700;padding:3px 0}
.sect{font-weight:600;letter-spacing:.6px;font-size:${px.sub}px;margin-bottom:2px}
.ft{text-align:center;margin-top:8px;font-size:${px.sub}px}
.ur{font-family:'Noto Nastaliq Urdu','Jameel Noori Nastaleeq',serif;direction:rtl;unicode-bidi:plaintext;
  line-height:1.8;font-size:${px.urdu}px}
</style></head><body>
<h1>${escapeHtml(shop.name)}</h1>
${shop.address ? `<div class="sub">${escapeHtml(shop.address)}</div>` : ''}
${shop.phone ? `<div class="sub">Ph: ${escapeHtml(shop.phone)}</div>` : ''}
<div class="rule"></div>
<div class="meta">Bill: <strong>${escapeHtml(data.invoice_no)}</strong></div>
<div class="meta">Date: ${escapeHtml(dateStr)} &nbsp; ${escapeHtml(timeStr)}</div>
${data.customer_name ? `<div class="meta">Customer: <strong>${escapeHtml(data.customer_name)}</strong></div>` : ''}
<div class="dash"></div>
<table><colgroup><col class="lbl"><col class="amt"></colgroup>
  <tr class="hd"><td>ITEM</td><td class="r">AMOUNT</td></tr>${rows}</table>
<table class="tot"><colgroup><col class="lbl"><col class="amt"></colgroup>
  <tr class="big"><td>TOTAL</td><td class="r">${formatPKR(data.total)}</td></tr>
  ${data.tendered != null ? `<tr><td>Received</td><td class="r">${formatPKR(data.tendered)}</td></tr>` : ''}
  ${data.change != null ? `<tr class="bold"><td>Change</td><td class="r">${formatPKR(data.change)}</td></tr>` : ''}
  <tr><td>Paid</td><td class="r">${formatPKR(data.paid)}</td></tr>
  ${data.due > 0 ? `<tr class="mid"><td>Udhaar (This Bill)</td><td class="r">${formatPKR(data.due)}</td></tr>` : ''}
</table>
${data.new_balance != null && ((data.previous_balance ?? 0) > 0 || data.due > 0) ? `
<div class="dash"></div>
<div class="sect">ACCOUNT (KHATA)</div>
<table class="tot"><colgroup><col class="lbl"><col class="amt"></colgroup>
  <tr><td>Previous Balance</td><td class="r">${formatPKR(data.previous_balance ?? 0)}</td></tr>
  ${data.due > 0 ? `<tr><td>+ This Bill Udhaar</td><td class="r">${formatPKR(data.due)}</td></tr>` : ''}
  ${(data.khata_paid ?? 0) > 0 ? `<tr><td>- Paid to Khata</td><td class="r">${formatPKR(data.khata_paid ?? 0)}</td></tr>` : ''}
  <tr class="mid"><td>Balance Due</td><td class="r">${formatPKR(data.new_balance)}</td></tr>
</table>` : ''}
<div class="rule"></div>
<div class="ft">${escapeHtml(shop.footer)}</div>
</body></html>`

  return html
}


// Print through a hidden iframe rather than a popup window: the receipt is
// printed automatically right after the sale RPC resolves, and by then the
// browser no longer treats window.open() as user-initiated (popup blocked).
export function printReceipt(data: ReceiptData, shop: ShopInfo) {
  const html = buildReceiptHtml(data, shop)

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(frame)

  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) {
    frame.remove()
    // Fallback: a real window (only reachable straight from a user click).
    const w = window.open('', '_blank', 'width=420,height=620')
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 600) }
    return
  }

  doc.open()
  doc.write(html)
  doc.close()

  // Wait for the Nastaliq web font so the Urdu names render correctly on the
  // first print; fall back to a fixed delay if the Font Loading API is absent
  // or never resolves (e.g. offline). Print exactly once, then drop the frame.
  let printed = false
  const doPrint = () => {
    if (printed) return
    printed = true
    try { win.focus(); win.print() } catch { /* printing unavailable */ }
    setTimeout(() => frame.remove(), 3000)
  }
  if (doc.fonts?.ready) {
    doc.fonts.ready.then(() => setTimeout(doPrint, 150)).catch(() => doPrint())
    setTimeout(doPrint, 1500) // safety net
  } else {
    setTimeout(doPrint, 600)
  }
}

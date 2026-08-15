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

// Receipt laid out for a thermal POS printer: fixed roll width, auto page height,
// zero page margin (that also drops Chrome's date/URL header+footer), monochrome
// (thermal heads print colour as muddy grey, so emphasis is weight, not colour),
// and one item per two lines so long Urdu names never squash the amount column.
export function buildReceiptHtml(data: ReceiptData, shop: ShopInfo) {
  const w = shop.widthMm === 58 ? 58 : 80
  const narrow = w === 58
  const px = {
    body:  narrow ? 10 : 12,
    shop:  narrow ? 13 : 16,
    small: narrow ? 9  : 10,
    line:  narrow ? 9  : 11,
    total: narrow ? 13 : 15,
  }

  const rows = data.items
    .map(item => {
      const qtyLine = `${escapeHtml(formatQty(item.quantity))} ${escapeHtml(item.unit_name)} × ${formatPKR(item.unit_price)}`
      const disc = item.discount_pct > 0 ? `  (-${escapeHtml(item.discount_pct)}%)` : ''
      return `
      <tr><td colspan="2" class="nm ur">${escapeHtml(item.product_name)}</td></tr>
      <tr><td class="ln">${qtyLine}${disc}</td><td class="r bold">${formatPKR(item.line_total)}</td></tr>`
    })
    .join('')

  const printedAt = new Date()

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Receipt ${data.invoice_no}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu&display=swap" rel="stylesheet">
<style>
@page{size:${w}mm auto;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}mm;background:#fff}
body{font-family:'Courier New',monospace;font-size:${px.body}px;line-height:1.35;color:#000;
  padding:${narrow ? '2mm 2mm 8mm' : '3mm 3mm 10mm'};-webkit-print-color-adjust:exact}
h1{font-size:${px.shop}px;text-align:center;font-weight:bold;line-height:1.2}
.sub{text-align:center;font-size:${px.small}px}
.meta{font-size:${px.line}px}
.div{border-top:1px dashed #000;margin:${narrow ? 3 : 4}px 0}
/* fixed layout + explicit split so the money column is never squeezed and the
   qty/rate line wraps instead */
table{width:100%;border-collapse:collapse;table-layout:fixed}
col.lbl{width:${narrow ? 60 : 63}%}
col.amt{width:${narrow ? 40 : 37}%}
td{vertical-align:top;word-wrap:break-word;overflow-wrap:break-word}
.nm{font-weight:bold;padding-top:${narrow ? 2 : 3}px}
.ln{font-size:${px.line}px}
.r{text-align:right}
.bold{font-weight:bold}
.tot td{padding:1px 0}
.big td{font-size:${px.total}px;font-weight:bold;padding-top:2px}
.ft{text-align:center;margin-top:${narrow ? 5 : 7}px;font-size:${px.small}px}
.ur{font-family:'Noto Nastaliq Urdu','Jameel Noori Nastaleeq',serif;direction:rtl;unicode-bidi:plaintext;
  line-height:1.9;font-size:${px.body}px}
</style></head><body>
<h1>${escapeHtml(shop.name)}</h1>
${shop.address ? `<div class="sub">${escapeHtml(shop.address)}</div>` : ''}
${shop.phone ? `<div class="sub">Ph: ${escapeHtml(shop.phone)}</div>` : ''}
<div class="div"></div>
<div class="meta">${escapeHtml(data.invoice_no)}</div>
<div class="meta">${escapeHtml(new Date(data.date).toLocaleDateString('en-PK'))} ${escapeHtml(printedAt.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }))}</div>
${data.customer_name ? `<div class="meta">Customer: <strong>${escapeHtml(data.customer_name)}</strong></div>` : ''}
<div class="div"></div>
<table><colgroup><col class="lbl"><col class="amt"></colgroup>${rows}</table>
<div class="div"></div>
<table class="tot"><colgroup><col class="lbl"><col class="amt"></colgroup>
  <tr class="big"><td>TOTAL</td><td class="r">${formatPKR(data.total)}</td></tr>
  ${data.tendered != null ? `<tr><td>Received</td><td class="r">${formatPKR(data.tendered)}</td></tr>` : ''}
  ${data.change != null ? `<tr class="bold"><td>Change</td><td class="r">${formatPKR(data.change)}</td></tr>` : ''}
  <tr><td>Paid</td><td class="r">${formatPKR(data.paid)}</td></tr>
  ${data.due > 0 ? `<tr class="bold"><td>Udhaar (This Bill)</td><td class="r">${formatPKR(data.due)}</td></tr>` : ''}
</table>
${data.new_balance != null && ((data.previous_balance ?? 0) > 0 || data.due > 0) ? `
<div class="div"></div>
<div class="bold" style="font-size:${px.small}px">ACCOUNT (KHATA)</div>
<table class="tot"><colgroup><col class="lbl"><col class="amt"></colgroup>
  <tr><td>Previous Balance</td><td class="r">${formatPKR(data.previous_balance ?? 0)}</td></tr>
  ${data.due > 0 ? `<tr><td>+ This Bill Udhaar</td><td class="r">${formatPKR(data.due)}</td></tr>` : ''}
  ${(data.khata_paid ?? 0) > 0 ? `<tr><td>- Paid to Khata</td><td class="r">${formatPKR(data.khata_paid ?? 0)}</td></tr>` : ''}
  <tr class="big"><td>Balance Due</td><td class="r">${formatPKR(data.new_balance)}</td></tr>
</table>` : ''}
<div class="div"></div>
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

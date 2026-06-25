import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Trash2, Plus, Minus, ChevronDown, CheckCircle2, User, X } from 'lucide-react'
import { useProducts } from '@/features/products/hooks/useProducts'
import { useCustomers, useCreateCustomer } from './hooks/useCustomers'
import { useCreateSale } from './hooks/useSales'
import { useAuth } from '@/features/auth/AuthContext'
import { formatPKR } from '@/lib/format'
import type { Product, ProductUnit, Customer } from '@/types'
import CameraScanner from './components/CameraScanner'

interface CartLine {
  _key: number
  product: Product
  unit: ProductUnit
  quantity: number
  discount_pct: number
  list_price: number
  unit_price: number
  line_total: number
}

interface ReceiptData {
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
}

function getListPrice(unit: ProductUnit, customer: Customer | null): number {
  return customer?.customer_type === 'retail' ? unit.retail_price : unit.wholesale_price
}

function computeLine(
  unit: ProductUnit,
  quantity: number,
  discount_pct: number,
  customer: Customer | null,
): Pick<CartLine, 'list_price' | 'unit_price' | 'line_total'> {
  const list_price = getListPrice(unit, customer)
  const unit_price = list_price * (1 - discount_pct / 100)
  return { list_price, unit_price, line_total: Math.round(unit_price * quantity * 100) / 100 }
}

function openReceiptWindow(data: ReceiptData) {
  const rows = data.items
    .map(
      item => `
      <tr>
        <td class="ur">${item.product_name}</td>
        <td style="text-align:center">${item.quantity}&nbsp;${item.unit_name}</td>
        <td style="text-align:right">${formatPKR(item.unit_price)}</td>
        <td style="text-align:center">${item.discount_pct > 0 ? item.discount_pct + '%' : ''}</td>
        <td style="text-align:right">${formatPKR(item.line_total)}</td>
      </tr>`,
    )
    .join('')

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Receipt ${data.invoice_no}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:12px;padding:8mm}
h1{font-size:16px;text-align:center;margin-bottom:2px}
.sub{text-align:center;font-size:10px;color:#555;margin-bottom:6px}
.div{border-top:1px dashed #000;margin:5px 0}
table{width:100%;border-collapse:collapse}
th{border-bottom:1px solid #000;padding:2px 3px;font-size:11px}
td{padding:2px 3px;vertical-align:top}
.r{text-align:right}.c{text-align:center}
.tot td{padding:1px 3px}
.bold{font-weight:bold}
.due{color:#D33A4F;font-weight:bold}
.ft{text-align:center;margin-top:8px;font-size:10px;color:#555}
.ur{font-family:'Noto Nastaliq Urdu','Jameel Noori Nastaleeq',serif;direction:rtl;unicode-bidi:plaintext;line-height:2.1;font-size:13px}
</style></head><body>
<h1>Costmatic</h1>
<div class="sub">Wholesale Beauty &amp; Cosmetics</div>
<div class="div"></div>
<div>Invoice: <strong>${data.invoice_no}</strong> &nbsp; Date: ${new Date(data.date).toLocaleDateString('en-PK')}</div>
${data.customer_name ? `<div>Customer: <strong>${data.customer_name}</strong></div>` : ''}
<div class="div"></div>
<table><thead><tr>
  <th>Item</th><th class="c">Qty</th><th class="r">Rate</th><th class="c">Disc</th><th class="r">Amt</th>
</tr></thead><tbody>${rows}</tbody></table>
<div class="div"></div>
<table class="tot">
  <tr class="bold"><td>TOTAL</td><td class="r">${formatPKR(data.total)}</td></tr>
  <tr><td>Paid (Cash)</td><td class="r">${formatPKR(data.paid)}</td></tr>
  ${data.due > 0 ? `<tr class="due"><td>Udhaar</td><td class="r">${formatPKR(data.due)}</td></tr>` : ''}
</table>
<div class="div"></div>
<div class="ft">Thank you for your business!</div>
</body></html>`

  const w = window.open('', '_blank', 'width=420,height=620')
  if (w) {
    w.document.write(html)
    w.document.close()
    w.focus()
    // Wait for the Nastaliq web font so the Urdu names render correctly on the
    // first print; fall back to a fixed delay if the Font Loading API is absent
    // or never resolves (e.g. offline). Print exactly once.
    let printed = false
    const doPrint = () => { if (!printed) { printed = true; w.print() } }
    if (w.document.fonts?.ready) {
      w.document.fonts.ready.then(() => setTimeout(doPrint, 150))
      setTimeout(doPrint, 1500) // safety net
    } else {
      setTimeout(doPrint, 600)
    }
  }
}

export default function SalesPage() {
  const { t } = useTranslation()
  const { profile, session } = useAuth()

  const { data: products = [] } = useProducts()
  const { data: customers = [] } = useCustomers()
  const createCustomer = useCreateCustomer()
  const createSale = useCreateSale()

  // ── Cart ──
  const [cart, setCart] = useState<CartLine[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)

  // ── Barcode / search ──
  const [barcodeInput, setBarcodeInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const barcodeRef = useRef<HTMLInputElement>(null)
  const [scanError, setScanError] = useState('')
  const [showCamera, setShowCamera] = useState(false)

  // ── Customer UI ──
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDrop, setShowCustomerDrop] = useState(false)
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [newCust, setNewCust] = useState<{ name: string; phone: string; customer_type: 'wholesale' | 'retail' }>({ name: '', phone: '', customer_type: 'wholesale' })

  // ── Payment ──
  const [paymentType, setPaymentType] = useState<'cash' | 'udhaar' | 'mixed'>('cash')
  const [cashAmount, setCashAmount] = useState('')

  // ── Sale result ──
  const [saleResult, setSaleResult] = useState<{ data: ReceiptData } | null>(null)

  // Keep barcode input focused
  const refocusBarcode = useCallback(() => {
    setTimeout(() => barcodeRef.current?.focus(), 50)
  }, [])

  useEffect(() => { refocusBarcode() }, [])

  // ── Totals ──
  const subtotal = cart.reduce((s, l) => s + l.line_total, 0)
  const total = subtotal
  const cashPaid =
    paymentType === 'cash' ? total
    : paymentType === 'udhaar' ? 0
    : Math.min(Math.max(parseFloat(cashAmount) || 0, 0), total)
  const due = total - cashPaid

  // ── Add product to cart ──
  function addProduct(product: Product, unit?: ProductUnit) {
    if (!product.units?.length) return
    const u = unit ?? product.units.find(x => x.unit_name === 'piece') ?? product.units[0]
    const computed = computeLine(u, 1, 0, customer)
    setCart(prev => {
      const idx = prev.findIndex(l => l.product.id === product.id && l.unit.unit_name === u.unit_name)
      if (idx >= 0) {
        return prev.map((l, i) => {
          if (i !== idx) return l
          const qty = l.quantity + 1
          return { ...l, quantity: qty, line_total: Math.round(l.unit_price * qty * 100) / 100 }
        })
      }
      return [...prev, { _key: Date.now(), product, unit: u, quantity: 1, discount_pct: 0, ...computed }]
    })
    setScanError('')
    setSearchQuery('')
    setShowSuggestions(false)
  }

  // ── Barcode lookup ──
  function handleBarcodeScan(code: string) {
    const trimmed = code.trim()
    if (!trimmed) return
    const match = products.find(p => p.barcode === trimmed && p.is_active)
    if (match) {
      addProduct(match)
    } else {
      setScanError(t('pos.productNotFound') + ': ' + trimmed)
    }
    setBarcodeInput('')
    refocusBarcode()
  }

  function handleBarcodeKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      if (barcodeInput.trim()) handleBarcodeScan(barcodeInput)
    }
  }

  // ── Cart mutations ──
  function changeQty(key: number, delta: number) {
    setCart(prev =>
      prev
        .map(l => {
          if (l._key !== key) return l
          const qty = l.quantity + delta
          if (qty <= 0) return null as unknown as CartLine
          return { ...l, quantity: qty, line_total: Math.round(l.unit_price * qty * 100) / 100 }
        })
        .filter(Boolean),
    )
  }

  function changeUnit(key: number, unit: ProductUnit) {
    setCart(prev =>
      prev.map(l => {
        if (l._key !== key) return l
        const computed = computeLine(unit, l.quantity, l.discount_pct, customer)
        return { ...l, unit, ...computed }
      }),
    )
  }

  function changeDiscount(key: number, raw: string) {
    const maxDisc = profile?.role === 'admin' ? 100 : (profile?.discount_limit ?? 0)
    let val = parseFloat(raw) || 0
    if (val > maxDisc) val = maxDisc
    if (val < 0) val = 0
    setCart(prev =>
      prev.map(l => {
        if (l._key !== key) return l
        const computed = computeLine(l.unit, l.quantity, val, customer)
        return { ...l, discount_pct: val, ...computed }
      }),
    )
  }

  function removeItem(key: number) {
    setCart(prev => prev.filter(l => l._key !== key))
    refocusBarcode()
  }

  // ── Customer selection ──
  function selectCustomer(c: Customer | null) {
    setCustomer(c)
    setShowCustomerDrop(false)
    setCustomerSearch('')
    // Recalculate prices for new customer type
    setCart(prev =>
      prev.map(l => ({ ...l, ...computeLine(l.unit, l.quantity, l.discount_pct, c) })),
    )
    refocusBarcode()
  }

  async function handleCreateCustomer() {
    if (!newCust.name.trim()) return
    const created = await createCustomer.mutateAsync({
      name: newCust.name.trim(),
      phone: newCust.phone.trim() || null,
      customer_type: newCust.customer_type,
    })
    setShowNewCustomer(false)
    setNewCust({ name: '', phone: '', customer_type: 'wholesale' })
    selectCustomer(created)
  }

  // ── Complete sale ──
  async function completeSale() {
    if (cart.length === 0) return
    if ((paymentType === 'udhaar' || paymentType === 'mixed') && !customer) {
      setScanError(t('pos.udhaarNeedsCustomer'))
      return
    }
    if (paymentType === 'mixed' && cashPaid >= total) {
      setPaymentType('cash')
    }

    const today = new Date().toISOString().split('T')[0]
    const result = await createSale.mutateAsync({
      customer_id: customer?.id ?? null,
      date: today,
      subtotal: total,
      discount: 0,
      tax: 0,
      total,
      paid: cashPaid,
      due,
      payment_type: paymentType,
      created_by: session!.user.id,
      items: cart.map(l => ({
        product_id: l.product.id,
        unit_name: l.unit.unit_name,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_pct: l.discount_pct,
        line_total: l.line_total,
      })),
    })

    const receiptData: ReceiptData = {
      invoice_no: result.invoice_no,
      date: today,
      customer_name: customer?.name ?? null,
      items: cart.map(l => ({
        // Receipt prints the Urdu product name (falls back to English if missing)
        product_name: l.product.name_ur || l.product.name_en,
        unit_name: l.unit.unit_name,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_pct: l.discount_pct,
        line_total: l.line_total,
      })),
      subtotal: total,
      total,
      paid: cashPaid,
      due,
    }
    setSaleResult({ data: receiptData })
  }

  function startNewSale() {
    setCart([])
    setCustomer(null)
    setPaymentType('cash')
    setCashAmount('')
    setScanError('')
    setSaleResult(null)
    refocusBarcode()
  }

  // ── Search suggestions ──
  const suggestions = searchQuery.trim().length > 1
    ? products
        .filter(p => p.is_active && (
          p.name_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.name_ur && p.name_ur.includes(searchQuery))
        ))
        .slice(0, 8)
    : []

  const filteredCustomers = customerSearch
    ? customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone?.includes(customerSearch))
    : customers

  const discountMax = profile?.role === 'admin' ? 100 : (profile?.discount_limit ?? 0)

  return (
    <div className="flex flex-col lg:flex-row gap-3 -m-4 lg:-m-6 lg:overflow-hidden"
      style={{ minHeight: 'calc(100vh - 4rem)' }}>

      {/* ═══ Left Column: barcode + cart ═══ */}
      <div className="flex-1 flex flex-col min-w-0 p-3 lg:p-4 gap-3">
        {/* Barcode row */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={barcodeRef}
              value={barcodeInput}
              onChange={e => {
                setBarcodeInput(e.target.value)
                setSearchQuery(e.target.value)
                setShowSuggestions(e.target.value.trim().length > 1)
                setScanError('')
              }}
              onKeyDown={handleBarcodeKey}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onFocus={() => setShowSuggestions(barcodeInput.trim().length > 1)}
              placeholder={t('pos.barcodePlaceholder')}
              className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
            {/* Name-search suggestions */}
            <AnimatePresence>
              {showSuggestions && suggestions.length > 0 && (
                <motion.ul
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute z-30 top-full mt-1 w-full bg-surface border border-line rounded-card shadow-lg overflow-hidden"
                >
                  {suggestions.map(p => (
                    <li key={p.id}>
                      <button
                        onMouseDown={() => addProduct(p)}
                        className="w-full text-start px-3 py-2 text-sm text-ink hover:bg-brand/5 transition-colors flex items-center justify-between gap-2"
                      >
                        <span className="font-medium truncate">{p.name_en}</span>
                        <span className="text-xs text-ink-muted shrink-0">
                          {p.units?.find(u => u.unit_name === 'piece')
                            ? formatPKR(getListPrice(p.units.find(u => u.unit_name === 'piece')!, customer))
                            : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
          <button
            onClick={() => { setShowCamera(true); refocusBarcode() }}
            title={t('pos.scanCamera')}
            className="h-10 px-3 rounded-input border border-line bg-surface text-ink-muted hover:text-brand hover:border-brand transition-colors flex items-center gap-1.5 text-sm"
          >
            <Camera size={16} />
            <span className="hidden sm:inline">{t('pos.scanCamera')}</span>
          </button>
        </div>

        {/* Scan error */}
        <AnimatePresence>
          {scanError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-due text-xs px-2 py-1 bg-due/10 rounded-input border border-due/20"
            >
              {scanError}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cart table */}
        <div className="flex-1 min-h-[200px] lg:min-h-0 overflow-y-auto rounded-card border border-line bg-surface">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-ink-muted gap-2">
              <div className="text-4xl opacity-30">🛒</div>
              <p className="text-sm">{t('pos.emptyCart')}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface border-b border-line z-10">
                <tr className="text-xs text-ink-muted uppercase tracking-wide">
                  <th className="text-start px-3 py-2 font-medium">{t('pos.unit')}</th>
                  <th className="text-start px-3 py-2 font-medium w-32">{t('pos.qty')}</th>
                  <th className="text-start px-3 py-2 font-medium">{t('pos.price')}</th>
                  {discountMax > 0 && (
                    <th className="text-start px-3 py-2 font-medium w-16">{t('pos.discountPct')}</th>
                  )}
                  <th className="text-end px-3 py-2 font-medium">{t('pos.lineTotal')}</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {cart.map(line => (
                    <motion.tr
                      key={line._key}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12, height: 0 }}
                      transition={{ duration: 0.18 }}
                      className="border-b border-line last:border-0 hover:bg-brand/[0.03]"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-ink leading-tight">{line.product.name_en}</div>
                        {line.product.units && line.product.units.length > 1 ? (
                          <select
                            value={line.unit.unit_name}
                            onChange={e => {
                              const u = line.product.units!.find(x => x.unit_name === e.target.value)
                              if (u) changeUnit(line._key, u)
                            }}
                            className="mt-0.5 text-xs text-ink-muted bg-transparent border border-line rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand"
                          >
                            {line.product.units.map(u => (
                              <option key={u.unit_name} value={u.unit_name}>{u.unit_name}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="text-xs text-ink-muted mt-0.5">{line.unit.unit_name}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => changeQty(line._key, -1)}
                            className="w-6 h-6 rounded-full border border-line flex items-center justify-center hover:border-due hover:text-due transition-colors"
                          >
                            <Minus size={11} />
                          </button>
                          <span className="w-8 text-center font-semibold tabular-nums">{line.quantity}</span>
                          <button
                            onClick={() => changeQty(line._key, 1)}
                            className="w-6 h-6 rounded-full border border-line flex items-center justify-center hover:border-brand hover:text-brand transition-colors"
                          >
                            <Plus size={11} />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-ink-muted tabular-nums text-xs">
                        {formatPKR(line.list_price)}
                      </td>
                      {discountMax > 0 && (
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            max={discountMax}
                            step={1}
                            value={line.discount_pct || ''}
                            onChange={e => changeDiscount(line._key, e.target.value)}
                            placeholder="0"
                            className="w-14 border border-line rounded px-1.5 py-0.5 text-xs text-ink bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
                          />
                        </td>
                      )}
                      <td className="px-3 py-2 text-end font-semibold tabular-nums text-ink">
                        {formatPKR(line.line_total)}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => removeItem(line._key)}
                          className="text-ink-muted hover:text-due transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ═══ Right Column: customer + payment ═══ */}
      <div className="w-full lg:w-72 shrink-0 flex flex-col p-3 lg:p-4 lg:ps-0 gap-3 lg:overflow-y-auto">
        {/* Customer selector */}
        <div className="rounded-card border border-line bg-surface p-3 flex flex-col gap-2">
          <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide flex items-center gap-1.5">
            <User size={12} />
            {t('pos.customer')}
          </label>
          <div className="relative">
            <button
              onClick={() => { setShowCustomerDrop(v => !v); setCustomerSearch('') }}
              className="w-full h-9 rounded-input border border-line bg-page text-start px-3 text-sm flex items-center justify-between gap-2 hover:border-brand transition-colors"
            >
              <span className={customer ? 'text-ink font-medium' : 'text-ink-muted'}>
                {customer ? customer.name : t('pos.walkIn')}
              </span>
              {customer ? (
                <X
                  size={14}
                  className="text-ink-muted hover:text-due shrink-0"
                  onClick={e => { e.stopPropagation(); selectCustomer(null) }}
                />
              ) : (
                <ChevronDown size={14} className="text-ink-muted shrink-0" />
              )}
            </button>

            <AnimatePresence>
              {showCustomerDrop && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute z-30 top-full mt-1 w-full bg-surface border border-line rounded-card shadow-lg overflow-hidden"
                >
                  <div className="p-2 border-b border-line">
                    <input
                      autoFocus
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                      placeholder={t('pos.selectCustomer')}
                      className="w-full h-7 rounded-sm border border-line bg-page px-2 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    <button
                      onClick={() => selectCustomer(null)}
                      className="w-full text-start px-3 py-2 text-sm text-ink-muted hover:bg-brand/5 transition-colors"
                    >
                      {t('pos.walkIn')}
                    </button>
                    {filteredCustomers.map(c => (
                      <button
                        key={c.id}
                        onClick={() => selectCustomer(c)}
                        className="w-full text-start px-3 py-2 text-sm text-ink hover:bg-brand/5 transition-colors flex items-center justify-between gap-1"
                      >
                        <span className="truncate">{c.name}</span>
                        <span className="text-xs text-ink-muted shrink-0">{c.customer_type}</span>
                      </button>
                    ))}
                    {filteredCustomers.length === 0 && (
                      <div className="px-3 py-2 text-xs text-ink-muted">{t('customers.noCustomers')}</div>
                    )}
                  </div>
                  <div className="border-t border-line p-2">
                    <button
                      onClick={() => { setShowNewCustomer(true); setShowCustomerDrop(false) }}
                      className="w-full text-center text-xs text-brand font-medium hover:underline py-1"
                    >
                      {t('pos.newCustomer')}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {customer && (
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span>{customer.customer_type}</span>
              {customer.current_balance > 0 && (
                <span className="text-due font-medium">{t('pos.due')}: {formatPKR(customer.current_balance)}</span>
              )}
            </div>
          )}
        </div>

        {/* Payment mode */}
        <div className="rounded-card border border-line bg-surface p-3 flex flex-col gap-2">
          <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t('pos.paymentType')}</label>
          <div className="grid grid-cols-3 gap-1">
            {(['cash', 'udhaar', 'mixed'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setPaymentType(mode)}
                className={`py-1.5 rounded-input text-xs font-semibold transition-colors border ${
                  paymentType === mode
                    ? mode === 'udhaar'
                      ? 'bg-due text-white border-due'
                      : mode === 'cash'
                      ? 'bg-cash text-white border-cash'
                      : 'bg-brand text-white border-brand'
                    : 'bg-page border-line text-ink hover:border-brand'
                }`}
              >
                {t(`pos.${mode}`)}
              </button>
            ))}
          </div>
          {paymentType === 'mixed' && (
            <div>
              <label className="text-xs text-ink-muted mb-1 block">{t('pos.cashNow')}</label>
              <input
                type="number"
                min={0}
                max={total}
                step={1}
                value={cashAmount}
                onChange={e => setCashAmount(e.target.value)}
                placeholder="0"
                className="w-full h-9 rounded-input border border-line bg-page px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="rounded-card border border-line bg-surface p-3 flex flex-col gap-1">
          <div className="flex items-center justify-between text-sm text-ink-muted">
            <span>{t('pos.subtotal')}</span>
            <span className="tabular-nums">{formatPKR(total)}</span>
          </div>
          {cart.some(l => l.discount_pct > 0) && (
            <div className="flex items-center justify-between text-sm text-cash">
              <span>{t('pos.discount')}</span>
              <span className="tabular-nums">
                -{formatPKR(cart.reduce((s, l) => s + (l.list_price - l.unit_price) * l.quantity, 0))}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between font-bold text-base text-ink border-t border-line pt-2 mt-1">
            <span>{t('pos.total')}</span>
            <span className="tabular-nums">{formatPKR(total)}</span>
          </div>
          {paymentType !== 'udhaar' && (
            <div className="flex items-center justify-between text-sm text-cash">
              <span>{t('pos.paid')}</span>
              <span className="tabular-nums">{formatPKR(cashPaid)}</span>
            </div>
          )}
          {due > 0 && (
            <div className="flex items-center justify-between text-sm font-semibold text-due">
              <span>{t('pos.due')}</span>
              <span className="tabular-nums">{formatPKR(due)}</span>
            </div>
          )}
        </div>

        {/* Complete button */}
        <button
          onClick={completeSale}
          disabled={cart.length === 0 || createSale.isPending}
          className="w-full h-12 rounded-card bg-brand text-white font-bold text-base hover:bg-brand/90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          {createSale.isPending ? t('pos.completing') : t('pos.completeSale')}
        </button>

        {createSale.isError && (
          <div className="text-due text-xs text-center px-1">
            {(createSale.error as Error)?.message ?? 'Error completing sale'}
          </div>
        )}
      </div>

      {/* ═══ Camera scanner overlay ═══ */}
      <AnimatePresence>
        {showCamera && (
          <CameraScanner
            onScan={code => { setShowCamera(false); handleBarcodeScan(code) }}
            onClose={() => { setShowCamera(false); refocusBarcode() }}
          />
        )}
      </AnimatePresence>

      {/* ═══ New Customer quick-add ═══ */}
      <AnimatePresence>
        {showNewCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50"
              onClick={() => setShowNewCustomer(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-surface rounded-card border border-line shadow-2xl w-full max-w-sm p-5"
            >
              <h3 className="font-semibold text-ink mb-4">{t('customers.add')}</h3>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs font-medium text-ink-muted block mb-1">{t('customers.name')} *</label>
                  <input
                    autoFocus
                    value={newCust.name}
                    onChange={e => setNewCust(p => ({ ...p, name: e.target.value }))}
                    className="w-full h-9 rounded-input border border-line bg-page px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-muted block mb-1">{t('customers.phone')}</label>
                  <input
                    value={newCust.phone}
                    onChange={e => setNewCust(p => ({ ...p, phone: e.target.value }))}
                    className="w-full h-9 rounded-input border border-line bg-page px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-muted block mb-1">{t('customers.type')}</label>
                  <select
                    value={newCust.customer_type}
                    onChange={e => setNewCust(p => ({ ...p, customer_type: e.target.value as 'wholesale' | 'retail' }))}
                    className="w-full h-9 rounded-input border border-line bg-page px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    <option value="wholesale">{t('customers.wholesale')}</option>
                    <option value="retail">{t('customers.retail')}</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setShowNewCustomer(false)}
                  className="px-4 py-2 text-sm text-ink border border-line rounded-input hover:bg-page transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCreateCustomer}
                  disabled={!newCust.name.trim() || createCustomer.isPending}
                  className="px-4 py-2 text-sm bg-brand text-white rounded-input font-medium hover:bg-brand/90 disabled:opacity-40 transition-colors"
                >
                  {createCustomer.isPending ? '…' : t('common.save')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══ Sale success modal ═══ */}
      <AnimatePresence>
        {saleResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative bg-surface rounded-card border border-line shadow-2xl w-full max-w-sm p-6 text-center"
            >
              <div className="flex justify-center mb-4">
                <CheckCircle2 size={48} className="text-cash" />
              </div>
              <h3 className="font-bold text-xl text-ink mb-1">{t('pos.saleComplete')}</h3>
              <p className="text-ink-muted text-sm mb-5">
                {t('pos.invoiceNo')}: <strong>{saleResult.data.invoice_no}</strong>
              </p>
              {saleResult.data.due > 0 && (
                <div className="mb-4 py-2 px-3 bg-due/10 rounded-input border border-due/20 text-due text-sm font-medium">
                  {t('pos.due')}: {formatPKR(saleResult.data.due)}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => openReceiptWindow(saleResult.data)}
                  className="flex-1 py-2.5 rounded-input border border-line text-ink text-sm font-medium hover:bg-page transition-colors"
                >
                  {t('pos.printReceipt')}
                </button>
                <button
                  onClick={startNewSale}
                  className="flex-1 py-2.5 rounded-input bg-brand text-white text-sm font-bold hover:bg-brand/90 transition-colors"
                >
                  {t('pos.newSale')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

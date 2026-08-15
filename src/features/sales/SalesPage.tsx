import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Trash2, Plus, Minus, ChevronDown, CheckCircle2, User, X, Printer, Keyboard, RotateCcw } from 'lucide-react'
import { useProducts } from '@/features/products/hooks/useProducts'
import { useCustomers, useCreateCustomer } from './hooks/useCustomers'
import { useCreateSale, useRecentSales, type RecentSale } from './hooks/useSales'
import { useSettings } from '@/features/settings/hooks/useSettings'
import { useAuth } from '@/features/auth/AuthContext'
import { get, set } from 'idb-keyval'
import { formatPKR, formatQty, round2, unitShort } from '@/lib/format'
import {
  computeLine, computeAmountLine, getListPrice, isLooseProduct, baseUnitOf, packUnitsOf,
  unitEligible, defaultUnitFor, type SaleMode,
} from '@/lib/pricing'
import { printReceipt, type ReceiptData, type ShopInfo } from '@/lib/receipt'
import { parseEntry } from '@/lib/posEntry'
import { cn } from '@/lib/utils'
import type { Product, ProductUnit, Customer } from '@/types'
import CameraScanner from './components/CameraScanner'
import ReturnDialog from './components/ReturnDialog'

interface CartLine {
  _key: number
  product: Product
  unit: ProductUnit
  // 'qty' = weight / pack / counted quantity; 'amount' = loose "Rs X worth"
  input_mode: 'qty' | 'amount'
  quantity: number // for loose weight this is fractional; for amount it's the preview weight
  amount: number   // Rs, only used in amount mode
  discount_pct: number
  list_price: number
  unit_price: number
  line_total: number
}

let _cartKeySeq = 1
const nextCartKey = () => _cartKeySeq++
// Keep the cart-line key counter ahead of any restored keys to avoid collisions
// after a page reload (the counter resets to 1 but restored keys may be higher).
const ensureCartKeyAbove = (n: number) => { if (_cartKeySeq <= n) _cartKeySeq = n + 1 }

// One open/parked sale. Fully JSON-serialisable so the whole set can be persisted
// to IndexedDB and survive an accidental refresh.
interface SaleTab {
  id: string
  cart: CartLine[]
  customer: Customer | null
  saleMode: SaleMode
  paymentType: 'cash' | 'udhaar' | 'mixed'
  received: string
  // Customer handed over more than this bill and has an old balance: put the
  // extra on the khata (true) or return it as change (false, the default).
  extraToKhata?: boolean
}
function freshTab(): SaleTab {
  return { id: crypto.randomUUID(), cart: [], customer: null, saleMode: 'retail', paymentType: 'cash', received: '', extraToKhata: false }
}
const MAX_TABS = 6
const PARKED_KEY = 'costmatic_parked_sales'

// Small on-screen shortcut hint chip.
function Kbd({ k, dark }: { k: string; dark?: boolean }) {
  return (
    <kbd className={cn(
      'text-[10px] leading-none font-mono px-1 py-0.5 rounded border',
      dark ? 'border-white/40 text-white/90' : 'border-line text-ink-muted bg-page',
    )}>
      {k}
    </kbd>
  )
}

// Rows for the F1 cheat sheet: [key combo, i18n action key].
const SHORTCUTS: [string, string][] = [
  ['F2', 'pos.sc_search'],
  ['3*name / 3*', 'pos.sc_multiply'],
  ['↵', 'pos.sc_enterAdd'],
  ['F3', 'pos.sc_customer'],
  ['F4', 'pos.sc_received'],
  ['F5', 'pos.sc_payment'],
  ['F6', 'pos.sc_mode'],
  ['F7', 'pos.sc_unit'],
  ['F8', 'pos.sc_disc'],
  ['F9 / Ctrl+Enter', 'pos.sc_complete'],
  ['F10', 'pos.sc_return'],
  ['PgUp / PgDn', 'pos.sc_cycle'],
  ['↑ / ↓', 'pos.sc_navline'],
  ['+ / −', 'pos.sc_qty'],
  ['Del', 'pos.sc_remove'],
  ['*', 'pos.sc_exact'],
  ['+ (in Received)', 'pos.sc_billPlusOld'],
  ['Alt+N / Alt+H', 'pos.sc_newtab'],
  ['Alt+1…6', 'pos.sc_switchtab'],
  ['Alt+C', 'pos.sc_new'],
  ['Esc', 'pos.sc_close'],
  ['F1', 'pos.sc_help'],
]


// Pricing/qty math (getListPrice, computeLine, computeAmountLine, SaleMode) lives in
// @/lib/pricing; numeric helpers (round2, formatQty) in @/lib/format — both unit-tested.


export default function SalesPage() {
  const { t } = useTranslation()
  const { profile, session } = useAuth()

  const { data: products = [] } = useProducts()
  const { data: customers = [] } = useCustomers()
  const { data: recentSales = [] } = useRecentSales(10)
  const { data: settings = {} } = useSettings()
  const createCustomer = useCreateCustomer()
  const createSale = useCreateSale()

  // Shop header/footer for printed receipts (from Settings)
  const shop: ShopInfo = {
    name: settings.shop_name || 'Costmatic',
    address: settings.shop_address || '',
    phone: settings.shop_phone || '',
    footer: settings.receipt_footer || 'Thank you for your business!',
    widthMm: settings.receipt_width === '58' ? 58 : 80,
  }

  // ── Sale tabs (parked / parallel sales) ──
  // A single source of truth: every open sale lives in `tabs`; the active tab's
  // fields are exposed as `cart`/`customer`/… + shim setters so the rest of the
  // component (and all its handlers) keep working unchanged.
  const [tabs, setTabs] = useState<SaleTab[]>(() => [freshTab()])
  const [activeId, setActiveId] = useState<string>('')
  const [restored, setRestored] = useState(false)

  const active = tabs.find(t => t.id === activeId) ?? tabs[0]
  const cart = active.cart
  const customer = active.customer
  const saleMode = active.saleMode

  function patchActive(patch: (t: SaleTab) => Partial<SaleTab>) {
    setTabs(prev => prev.map(t => (t.id === active.id ? { ...t, ...patch(t) } : t)))
  }
  const setCart = (u: CartLine[] | ((prev: CartLine[]) => CartLine[])) =>
    patchActive(t => ({ cart: typeof u === 'function' ? (u as (p: CartLine[]) => CartLine[])(t.cart) : u }))
  const setCustomer = (c: Customer | null) => patchActive(() => ({ customer: c }))
  const setSaleMode = (m: SaleMode) => patchActive(() => ({ saleMode: m }))

  // ── Barcode / search ──
  const [barcodeInput, setBarcodeInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const barcodeRef = useRef<HTMLInputElement>(null)
  const receivedRef = useRef<HTMLInputElement>(null)
  const customerBtnRef = useRef<HTMLButtonElement>(null)
  const [scanError, setScanError] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const [showReturn, setShowReturn] = useState(false)
  const [highlight, setHighlight] = useState(0) // keyboard-selected suggestion

  // ── Keyboard ──
  const [selectedKey, setSelectedKey] = useState<number | null>(null) // highlighted cart line
  const [showHelp, setShowHelp] = useState(false)                     // F1 cheat sheet

  // Admin-only: bypass eligibility + loose wholesale-minimum for this sale.
  const [allowOverride, setAllowOverride] = useState(false)

  // ── Customer UI ──
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDrop, setShowCustomerDrop] = useState(false)
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [newCust, setNewCust] = useState<{ name: string; phone: string; customer_type: 'wholesale' | 'retail' }>({ name: '', phone: '', customer_type: 'wholesale' })

  // ── Payment (derived from the active tab) ──
  const paymentType = active.paymentType
  // Amount the customer handed over — drives change (cash) and the paid portion (mixed).
  const received = active.received
  const setPaymentType = (p: 'cash' | 'udhaar' | 'mixed') => patchActive(() => ({ paymentType: p }))
  const setReceived = (r: string) => patchActive(() => ({ received: r }))
  const setExtraToKhata = (v: boolean) => patchActive(() => ({ extraToKhata: v }))

  // ── Sale result ──
  const [saleResult, setSaleResult] = useState<{ data: ReceiptData } | null>(null)

  // Keep barcode input focused
  const refocusBarcode = useCallback(() => {
    setTimeout(() => barcodeRef.current?.focus(), 50)
  }, [])

  useEffect(() => { refocusBarcode() }, [])

  // Restore parked tabs from IndexedDB once, on mount (refresh-safe).
  useEffect(() => {
    (async () => {
      try {
        const saved = await get<{ tabs: SaleTab[]; activeId: string }>(PARKED_KEY)
        if (saved?.tabs?.length) {
          const maxKey = Math.max(0, ...saved.tabs.flatMap(t => t.cart.map(l => l._key)))
          ensureCartKeyAbove(maxKey)
          setTabs(saved.tabs)
          setActiveId(saved.tabs.some(t => t.id === saved.activeId) ? saved.activeId : saved.tabs[0].id)
        }
      } catch { /* ignore corrupt cache */ }
      setRestored(true)
    })()
  }, [])

  // Keep activeId pointing at a real tab.
  useEffect(() => {
    if (!tabs.some(t => t.id === activeId)) setActiveId(tabs[0].id)
  }, [tabs, activeId])

  // Persist tabs after the initial restore (so we never clobber saved data with the seed tab).
  useEffect(() => {
    if (!restored) return
    set(PARKED_KEY, { tabs, activeId }).catch(() => {})
  }, [tabs, activeId, restored])

  // ── Tab operations ──
  function newTab() {
    if (tabs.length >= MAX_TABS) return
    const t = freshTab()
    setTabs(prev => [...prev, t])
    setActiveId(t.id)
    setSelectedKey(null)
    setAllowOverride(false)
    refocusBarcode()
  }
  function switchTab(id: string) {
    setActiveId(id)
    setSelectedKey(null)
    setAllowOverride(false)
    refocusBarcode()
  }
  function closeTab(id: string) {
    const rest = tabs.filter(t => t.id !== id)
    if (rest.length === 0) {
      const t = freshTab()
      setTabs([t]); setActiveId(t.id)
    } else {
      setTabs(rest)
      if (id === activeId) setActiveId(rest[0].id)
    }
    setSelectedKey(null)
  }

  // ── Totals ──
  const subtotal = cart.reduce((s, l) => s + l.line_total, 0)
  const total = subtotal
  const receivedNum = Math.max(parseFloat(received) || 0, 0)
  const cashPaid =
    paymentType === 'cash' ? total
    : paymentType === 'udhaar' ? 0
    : Math.min(receivedNum, total) // mixed: cash portion, rest is udhaar
  const due = total - cashPaid

  // ── Old khata (running account) ──
  // What this customer already owed before this bill.
  const previousBalance = customer ? Math.max(Number(customer.current_balance) || 0, 0) : 0
  // Cash handed over above this bill: either returned as change, or (when the
  // customer has an old balance) put on the khata — the cashier picks.
  const extraCash = paymentType === 'udhaar' ? 0 : Math.max(0, receivedNum - total)
  const canApplyExtra = previousBalance > 0 && extraCash > 0
  const applyExtraToKhata = canApplyExtra && !!active.extraToKhata
  // Never pay more than is owed — the server clamps this again.
  const khataPayment = applyExtraToKhata ? Math.min(extraCash, previousBalance) : 0
  const changeDue = extraCash - khataPayment
  // Balance the customer walks out with: old + this bill's udhaar − khata payment.
  const newBalance = previousBalance + due - khataPayment

  // ── Retail/Wholesale rule violations (client preview; server also enforces) ──
  const isAdmin = profile?.role === 'admin'
  const minViolationKeys = cart
    .filter(l => saleMode === 'wholesale' && isLooseProduct(l.product)
      && l.product.wholesale_min_qty != null && l.quantity < Number(l.product.wholesale_min_qty))
    .map(l => l._key)
  const eligViolation = cart.some(l => !unitEligible(l.unit, saleMode))
  const ruleBlocked = (minViolationKeys.length > 0 || eligViolation) && !(isAdmin && allowOverride)

  // ── Add product to cart ──
  function addProduct(product: Product, unit?: ProductUnit, addQty = 1) {
    if (!product.units?.length) return
    const loose = isLooseProduct(product)
    const base = baseUnitOf(product)
    // Default unit: explicit → loose base (weight) → mode's eligible unit
    // (retail=smallest, wholesale=bulk; cigarette pack⇄carton, beverage bottle⇄crate).
    const chosen = unit ?? (loose ? base : defaultUnitFor(product, saleMode))
    const qtyIn = addQty > 0 ? addQty : 1
    const computed = computeLine(chosen, qtyIn, 0, saleMode)
    setCart(prev => {
      const idx = prev.findIndex(
        l => l.product.id === product.id && l.unit.unit_name === chosen.unit_name && l.input_mode === 'qty',
      )
      // Loose lines aren't auto-stacked — the cashier sets weight/amount on the existing one.
      if (idx >= 0 && loose) return prev
      if (idx >= 0) {
        return prev.map((l, i) => {
          if (i !== idx) return l
          const qty = l.quantity + qtyIn
          return { ...l, quantity: qty, line_total: round2(l.unit_price * qty) }
        })
      }
      return [...prev, {
        _key: nextCartKey(), product, unit: chosen, input_mode: 'qty' as const,
        quantity: qtyIn, amount: 0, discount_pct: 0, ...computed,
      }]
    })
    setScanError('')
    setSearchQuery('')
    setShowSuggestions(false)
    setHighlight(0)
  }

  // Recompute a line's money for the current sale mode, respecting its input mode.
  function recomputeLine(l: CartLine, mode: SaleMode): CartLine {
    if (l.input_mode === 'amount') return { ...l, ...computeAmountLine(l.unit, l.amount, mode) }
    return { ...l, ...computeLine(l.unit, l.quantity, l.discount_pct, mode) }
  }

  // On a mode switch every counted line moves to that mode's selling unit —
  // wholesale sells the bulk unit (crate / carton / dozen), retail the smallest —
  // so flipping to Wholesale never leaves the cart billing single pieces.
  // Loose lines (weight / Rs-amount) keep their unit; only ineligibility moves them.
  function fixLineForMode(l: CartLine, mode: SaleMode): CartLine {
    const loose = isLooseProduct(l.product)
    if (loose && unitEligible(l.unit, mode)) return recomputeLine(l, mode)
    const newUnit = defaultUnitFor(l.product, mode)
    if (newUnit.unit_name === l.unit.unit_name) return recomputeLine(l, mode)
    // Quantity carries over as typed (1 piece → 1 crate); the cashier sets the count.
    const qty = l.input_mode === 'qty' ? l.quantity : 1
    return { ...l, unit: newUnit, input_mode: 'qty', quantity: qty, ...computeLine(newUnit, qty, l.discount_pct, mode) }
  }

  // ── Loose line controls ──
  type LooseMode = 'weight' | 'amount' | 'pack'
  function looseSetMode(key: number, mode: LooseMode) {
    setCart(prev => prev.map(l => {
      if (l._key !== key) return l
      const base = baseUnitOf(l.product)
      if (mode === 'amount') {
        const amount = l.amount || l.line_total || 0
        return { ...l, unit: base, input_mode: 'amount', amount, discount_pct: 0, ...computeAmountLine(base, amount, saleMode) }
      }
      if (mode === 'weight') {
        const qty = l.quantity > 0 ? l.quantity : 1
        return { ...l, unit: base, input_mode: 'qty', quantity: qty, ...computeLine(base, qty, l.discount_pct, saleMode) }
      }
      const packs = packUnitsOf(l.product)
      const pack = packs.find(u => unitEligible(u, saleMode)) ?? packs[0]
      if (!pack) return l
      return { ...l, unit: pack, input_mode: 'qty', quantity: 1, ...computeLine(pack, 1, l.discount_pct, saleMode) }
    }))
  }

  // Fractional weight entry (loose weight mode)
  function setLooseWeight(key: number, raw: string) {
    const q = Math.max(0, parseFloat(raw) || 0)
    setCart(prev => prev.map(l =>
      l._key === key ? { ...l, quantity: q, ...computeLine(l.unit, q, l.discount_pct, saleMode) } : l,
    ))
  }

  // "Rs X worth" entry (loose amount mode) — line pinned to amount, weight is preview
  function setLooseAmount(key: number, raw: string) {
    const amt = Math.max(0, parseFloat(raw) || 0)
    setCart(prev => prev.map(l =>
      l._key === key ? { ...l, amount: amt, discount_pct: 0, ...computeAmountLine(l.unit, amt, saleMode) } : l,
    ))
  }

  // ── Barcode lookup ──
  function handleBarcodeScan(code: string, qty = 1) {
    const trimmed = code.trim()
    if (!trimmed) return
    const match = products.find(p => p.barcode === trimmed && p.is_active)
    if (match) {
      addProduct(match, undefined, qty)
    } else {
      setScanError(t('pos.productNotFound') + ': ' + trimmed)
    }
    setBarcodeInput('')
    refocusBarcode()
  }

  function clearEntry() {
    setBarcodeInput('')
    setSearchQuery('')
    setShowSuggestions(false)
    setHighlight(0)
  }

  // Enter in the search box, in priority order:
  //   "3*" alone          → set the selected line's quantity to 3
  //   exact barcode match → add that product (scanner path, wins over any name match)
  //   a highlighted / only suggestion → add it (keyboard, no mouse needed)
  //   otherwise           → "not found"
  function submitEntry() {
    const raw = barcodeInput.trim()
    if (!raw) return
    const { qty, term } = parseEntry(raw)

    if (!term) {
      if (selectedKey != null && qty > 0) setQtyAbs(selectedKey, String(qty))
      clearEntry()
      return
    }

    const exact = products.find(p => p.barcode === term && p.is_active)
    if (exact) { addProduct(exact, undefined, qty); clearEntry(); return }

    if (suggestions.length > 0) {
      addProduct(suggestions[Math.min(highlight, suggestions.length - 1)], undefined, qty)
      clearEntry()
      return
    }
    handleBarcodeScan(term, qty)
  }

  function handleBarcodeKey(e: React.KeyboardEvent<HTMLInputElement>) {
    // Arrow keys walk the suggestion list while there is something to choose from.
    if (showSuggestions && suggestions.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setHighlight(h => (h + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length)
      return
    }
    if (e.key === 'Enter') { e.preventDefault(); submitEntry(); return }
    // When the field is empty it doubles as a cart navigator (no search text to type).
    if (barcodeInput.length === 0 && cart.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1) }
      else if (e.key === 'Delete') { e.preventDefault(); if (selectedKey != null) removeItem(selectedKey) }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); adjustSel(1) }
      else if (e.key === '-') { e.preventDefault(); adjustSel(-1) }
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
        const computed = computeLine(unit, l.quantity, l.discount_pct, saleMode)
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
        if (l.input_mode === 'amount') return l // discount doesn't apply to "Rs X worth"
        const computed = computeLine(l.unit, l.quantity, val, saleMode)
        return { ...l, discount_pct: val, ...computed }
      }),
    )
  }

  // Type an exact quantity (custom amounts) instead of only +/-
  function setQtyAbs(key: number, raw: string) {
    const qty = Math.max(1, Math.floor(parseFloat(raw) || 1))
    setCart(prev =>
      prev.map(l =>
        l._key === key
          ? { ...l, quantity: qty, line_total: Math.round(l.unit_price * qty * 100) / 100 }
          : l,
      ),
    )
  }

  // Switch the whole counter between Retail and Wholesale pricing
  function changeSaleMode(mode: SaleMode) {
    setSaleMode(mode)
    setCart(prev => prev.map(l => fixLineForMode(l, mode)))
    refocusBarcode()
  }

  function removeItem(key: number) {
    setCart(prev => prev.filter(l => l._key !== key))
    refocusBarcode()
  }

  // ── Customer selection ──
  function selectCustomer(c: Customer | null) {
    setCustomer(c)
    // The khata choice belongs to the previous customer — start fresh.
    setExtraToKhata(false)
    setShowCustomerDrop(false)
    setCustomerSearch('')
    // Auto-match the price mode to the customer's type (shopkeeper can still override)
    const mode: SaleMode = c ? (c.customer_type === 'retail' ? 'retail' : 'wholesale') : saleMode
    setSaleMode(mode)
    setCart(prev => prev.map(l => fixLineForMode(l, mode)))
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
    if (ruleBlocked) {
      setScanError(minViolationKeys.length > 0 ? t('pos.belowWholesaleMin') : t('pos.wrongModeUnit'))
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
      sale_type: saleMode,
      created_by: session!.user.id,
      allow_override: isAdmin && allowOverride,
      khata_payment: khataPayment,
      items: cart.map(l => ({
        product_id: l.product.id,
        unit_name: l.unit.unit_name,
        input_mode: l.input_mode,
        quantity: l.quantity,
        amount: l.input_mode === 'amount' ? l.amount : undefined,
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
      tendered: paymentType !== 'udhaar' && receivedNum > 0 ? receivedNum : undefined,
      change: changeDue > 0 ? changeDue : undefined,
      // Khata: balance before this sale, + this bill's udhaar, − any extra cash
      // the customer put on the old account.
      ...(customer
        ? {
            previous_balance: previousBalance,
            khata_paid: khataPayment > 0 ? khataPayment : undefined,
            new_balance: newBalance,
          }
        : {}),
    }
    setSaleResult({ data: receiptData })
    // Always print — the shop hands a receipt over with every sale. The dialog's
    // "Print Receipt" button stays available for a second copy.
    printReceipt(receiptData, shop)
  }

  function startNewSale() {
    // Clear the active tab (keep its sale mode + any other parked tabs).
    patchActive(() => ({ cart: [], customer: null, paymentType: 'cash', received: '', extraToKhata: false }))
    setScanError('')
    setSaleResult(null)
    setSelectedKey(null)
    setAllowOverride(false)
    refocusBarcode()
  }

  // Re-print the receipt of a previous sale (e.g. if printing was missed)
  function reprintSale(sale: RecentSale) {
    printReceipt({
      invoice_no: sale.invoice_no,
      date: sale.date,
      customer_name: sale.customer?.name ?? null,
      items: sale.items.map(i => ({
        product_name: i.product?.name_ur || i.product?.name_en || '',
        unit_name: i.unit_name,
        // sale_items.quantity is numeric → may arrive as a string; coerce for formatQty
        quantity: Number(i.quantity),
        unit_price: i.unit_price,
        discount_pct: i.discount_pct,
        line_total: i.line_total,
      })),
      subtotal: sale.subtotal,
      total: sale.total,
      paid: sale.paid,
      due: sale.due,
    }, shop)
  }

  // ── Keyboard: cart-line selection + section cycling ──
  function moveSel(dir: 1 | -1) {
    setSelectedKey(cur => {
      if (!cart.length) return null
      const idx = cart.findIndex(l => l._key === cur)
      if (idx === -1) return dir > 0 ? cart[0]._key : cart[cart.length - 1]._key
      const next = Math.min(Math.max(idx + dir, 0), cart.length - 1)
      return cart[next]._key
    })
  }

  function adjustSel(delta: 1 | -1) {
    if (selectedKey == null) { moveSel(1); return }
    const line = cart.find(l => l._key === selectedKey)
    if (line && line.input_mode !== 'amount') changeQty(selectedKey, delta) // amount lines edit by Rs
  }

  // Cycle focus across the three POS sections: search → customer → received.
  function focusSection(dir: 1 | -1) {
    const els = [barcodeRef.current, customerBtnRef.current, receivedRef.current].filter(Boolean) as HTMLElement[]
    if (!els.length) return
    const idx = els.findIndex(el => el === document.activeElement)
    const next = els[((idx < 0 ? 0 : idx) + dir + els.length) % els.length]
    next?.focus()
  }

  function onEscape() {
    if (showReturn) { setShowReturn(false); return }
    if (showHelp) { setShowHelp(false); return }
    if (showCamera) { setShowCamera(false); return }
    if (showCustomerDrop) { setShowCustomerDrop(false); return }
    if (showNewCustomer) { setShowNewCustomer(false); return }
  }

  // Latest-state handler table, read by the mount-only key listener (avoids stale closures).
  const kbd = {
    focusBarcode: () => barcodeRef.current?.focus(),
    toggleMode: () => changeSaleMode(saleMode === 'retail' ? 'wholesale' : 'retail'),
    openCustomer: () => setShowCustomerDrop(v => !v),
    focusReceived: () => {
      if (paymentType === 'udhaar') setPaymentType('cash')
      setTimeout(() => receivedRef.current?.focus(), 30)
    },
    // F5 — cash → udhaar → mixed → cash, without reaching for the mouse.
    cyclePayment: () => {
      const order = ['cash', 'udhaar', 'mixed'] as const
      setPaymentType(order[(order.indexOf(paymentType) + 1) % order.length])
    },
    // F7 — swap the selected line between its units (piece ⇄ dozen ⇄ carton).
    cycleUnit: () => {
      if (selectedKey == null) return
      const line = cart.find(l => l._key === selectedKey)
      if (!line) return
      const units = (line.product.units ?? []).filter(u => unitEligible(u, saleMode))
      if (units.length < 2) return
      const i = units.findIndex(u => u.unit_name === line.unit.unit_name)
      changeUnit(selectedKey, units[(i + 1) % units.length])
    },
    // F8 — jump into the selected line's discount box.
    focusDiscount: () => {
      if (selectedKey == null) return
      const el = document.querySelector<HTMLInputElement>(`[data-disc="${selectedKey}"]`)
      el?.focus()
      el?.select()
    },
    // Sale-complete dialog: Enter/Esc starts the next bill, P reprints — the
    // cashier never has to reach for the mouse between customers.
    resultOpen: () => saleResult != null,
    resultNext: () => { if (saleResult) startNewSale() },
    resultPrint: () => { if (saleResult) printReceipt(saleResult.data, shop) },
    openReturn: () => setShowReturn(true),
    selectLine: (dir: 1 | -1) => moveSel(dir),
    adjustLine: (delta: 1 | -1) => adjustSel(delta),
    removeSelected: () => { if (selectedKey != null) removeItem(selectedKey) },
    // Guard against re-firing behind a blocking modal (would create a duplicate sale).
    complete: () => {
      if (saleResult || showNewCustomer || showHelp) return
      if (cart.length && !createSale.isPending) completeSale()
    },
    newSale: () => startNewSale(),
    newTab: () => newTab(),
    switchIndex: (i: number) => { if (tabs[i]) switchTab(tabs[i].id) },
    toggleHelp: () => setShowHelp(v => !v),
    cycle: (dir: 1 | -1) => focusSection(dir),
    escape: () => onEscape(),
  }
  const kbdRef = useRef(kbd)
  kbdRef.current = kbd

  // Drop a stale selection when its line leaves the cart.
  useEffect(() => {
    if (selectedKey !== null && !cart.some(l => l._key === selectedKey)) setSelectedKey(null)
  }, [cart, selectedKey])

  // Global shortcuts. Function keys work regardless of focus; we preventDefault so
  // the browser's own F1/F3/F6 behaviour doesn't fire.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = kbdRef.current
      const el = document.activeElement
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        || el instanceof HTMLSelectElement || (el as HTMLElement | null)?.isContentEditable === true

      // While the "sale complete" dialog is up it owns the keyboard.
      if (k.resultOpen()) {
        if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'F9' || e.key === ' ') {
          e.preventDefault(); k.resultNext()
        } else if (e.key.toLowerCase() === 'p') {
          e.preventDefault(); k.resultPrint()
        }
        return
      }

      switch (e.key) {
        case 'F1': e.preventDefault(); k.toggleHelp(); break
        case 'F2': e.preventDefault(); k.focusBarcode(); break
        case 'F3': e.preventDefault(); k.openCustomer(); break
        case 'F4': e.preventDefault(); k.focusReceived(); break
        case 'F5': e.preventDefault(); k.cyclePayment(); break
        case 'F6': e.preventDefault(); k.toggleMode(); break
        case 'F7': e.preventDefault(); k.cycleUnit(); break
        case 'F8': e.preventDefault(); k.focusDiscount(); break
        case 'F9': e.preventDefault(); k.complete(); break
        case 'F10': e.preventDefault(); k.openReturn(); break
        case 'Enter': if (e.ctrlKey) { e.preventDefault(); k.complete() } break
        case 'PageDown': e.preventDefault(); k.cycle(1); break
        case 'PageUp': e.preventDefault(); k.cycle(-1); break
        case 'Escape': k.escape(); break
        // Cart navigation also works when focus is nowhere in particular, so the
        // cashier never has to click back into the search box first.
        case 'ArrowDown': if (!typing) { e.preventDefault(); k.selectLine(1) } break
        case 'ArrowUp':   if (!typing) { e.preventDefault(); k.selectLine(-1) } break
        case 'Delete':    if (!typing) { e.preventDefault(); k.removeSelected() } break
        case '+': case '=': if (!typing) { e.preventDefault(); k.adjustLine(1) } break
        case '-':           if (!typing) { e.preventDefault(); k.adjustLine(-1) } break
        default:
          if (e.altKey) {
            const key = e.key.toLowerCase()
            if (key === 'c') { e.preventDefault(); k.newSale() }
            else if (key === 'n' || key === 'h') { e.preventDefault(); k.newTab() }
            else if (/^[1-6]$/.test(e.key)) { e.preventDefault(); k.switchIndex(Number(e.key) - 1) }
          }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Search suggestions (live filter from the first character) ──
  // The "3*" quantity prefix is stripped first so "3*sug" still finds Sugar.
  const entry = parseEntry(searchQuery)
  const suggestions = entry.term.length > 0
    ? products
        .filter(p => {
          const q = entry.term.toLowerCase()
          return p.is_active && (
            p.name_en.toLowerCase().includes(q) ||
            (p.name_ur && p.name_ur.includes(entry.term)) ||
            (p.brand && p.brand.toLowerCase().includes(q)) ||
            (p.barcode && p.barcode.includes(entry.term))
          )
        })
        .slice(0, 10)
    : []

  const filteredCustomers = customerSearch
    ? customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone?.includes(customerSearch))
    : customers

  const discountMax = profile?.role === 'admin' ? 100 : (profile?.discount_limit ?? 0)

  return (
    <div className="flex flex-col -m-4 lg:-m-6 lg:overflow-hidden"
      style={{ minHeight: 'calc(100vh - 4rem)' }}>

      {/* ═══ Sale tabs (parked / parallel sales) ═══ */}
      <div className="flex items-center gap-1 px-3 lg:px-4 pt-2 pb-1 overflow-x-auto shrink-0">
        {tabs.map((tab, i) => (
          <div
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={cn(
              'group flex items-center gap-1.5 h-8 ps-3 pe-1.5 rounded-t-card border-b-2 text-sm cursor-pointer shrink-0 transition-colors',
              tab.id === active.id
                ? 'bg-surface border-brand text-ink font-semibold'
                : 'bg-page border-transparent text-ink-muted hover:text-ink',
            )}
          >
            <span className="whitespace-nowrap">{t('pos.saleTab', { n: i + 1 })}</span>
            {tab.cart.length > 0 && (
              <span className="min-w-4 h-4 px-1 rounded-full bg-brand/15 text-brand text-[10px] font-bold flex items-center justify-center tabular-nums">
                {tab.cart.length}
              </span>
            )}
            <button
              onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
              title={t('pos.closeTab')}
              className="w-5 h-5 rounded flex items-center justify-center text-ink-muted/60 hover:text-due hover:bg-due/10 transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {tabs.length < MAX_TABS && (
          <button
            onClick={newTab}
            title={t('pos.newTab')}
            className="flex items-center gap-1 h-8 px-2.5 text-sm text-brand hover:bg-brand/5 rounded-t-card shrink-0 transition-colors"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">{t('pos.newTab')}</span>
            <Kbd k="Alt+N" />
          </button>
        )}
      </div>

      {/* ═══ Columns row ═══ */}
      <div className="flex flex-col lg:flex-row gap-3 flex-1 lg:overflow-hidden">

      {/* ═══ Left Column: barcode + cart ═══ */}
      <div className="flex-1 flex flex-col min-w-0 p-3 lg:p-4 gap-3">
        {/* Retail / Wholesale mode */}
        <div className="grid grid-cols-2 gap-2">
          {(['retail', 'wholesale'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => changeSaleMode(mode)}
              className={cn(
                'h-12 rounded-card font-bold text-base border-2 transition-all active:scale-[0.99] flex items-center justify-center gap-2',
                saleMode === mode
                  ? 'bg-brand text-white border-brand shadow-sm'
                  : 'bg-surface text-ink-muted border-line hover:border-brand hover:text-brand',
              )}
            >
              {t(`pos.${mode}`)}
              {saleMode === mode && <Kbd k="F6" dark />}
            </button>
          ))}
        </div>

        {/* Barcode row */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={barcodeRef}
              value={barcodeInput}
              onChange={e => {
                setBarcodeInput(e.target.value)
                setSearchQuery(e.target.value)
                setShowSuggestions(e.target.value.trim().length > 0)
                setScanError('')
              }}
              onKeyDown={handleBarcodeKey}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onFocus={() => setShowSuggestions(barcodeInput.trim().length > 0)}
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
                  {suggestions.map((p, i) => {
                    // Price shown is for the unit this mode would actually bill in.
                    const u = defaultUnitFor(p, saleMode)
                    const stock = p.stock?.[0]?.quantity_in_base_unit
                    const low = stock != null && Number(stock) <= Number(p.min_stock_level ?? 0)
                    return (
                      <li key={p.id}>
                        <button
                          onMouseDown={() => addProduct(p, undefined, entry.qty)}
                          onMouseEnter={() => setHighlight(i)}
                          className={cn(
                            'w-full text-start px-3 py-2 text-sm text-ink transition-colors flex items-center justify-between gap-2',
                            i === highlight ? 'bg-brand/10' : 'hover:bg-brand/5',
                          )}
                        >
                          <span className="min-w-0">
                            <span className="font-medium truncate block">{p.name_en}</span>
                            {stock != null && (
                              <span className={cn('text-[11px]', low ? 'text-low font-medium' : 'text-ink-muted')}>
                                {t('pos.inStock')}: {formatQty(Number(stock))} {unitShort(p.base_unit)}
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-ink-muted shrink-0 tabular-nums text-end">
                            {formatPKR(getListPrice(u, saleMode))}
                            <span className="block text-[10px]">/{u.unit_name}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
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
          <button
            onClick={() => setShowReturn(true)}
            title={t('returns.title')}
            className="h-10 px-3 rounded-input border border-line bg-surface text-ink-muted hover:text-due hover:border-due transition-colors flex items-center gap-1.5 text-sm"
          >
            <RotateCcw size={16} />
            <span className="hidden sm:inline">{t('pos.returnBtn')}</span>
            <Kbd k="F10" />
          </button>
          <button
            onClick={() => setShowHelp(true)}
            title={t('pos.shortcuts')}
            className="h-10 px-3 rounded-input border border-line bg-surface text-ink-muted hover:text-brand hover:border-brand transition-colors flex items-center gap-1.5 text-sm"
          >
            <Keyboard size={16} />
            <Kbd k="F1" />
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
            recentSales.length > 0 ? (
              <div className="p-3">
                <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2 px-1">
                  {t('pos.recentSales')}
                </div>
                <ul className="space-y-1.5">
                  {recentSales.map(s => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-card border border-line px-3 py-2 hover:bg-page/50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-ink text-sm truncate">{s.invoice_no}</div>
                        <div className="text-xs text-ink-muted truncate">
                          {s.customer?.name ?? t('pos.walkIn')}
                          {' · '}
                          {new Date(s.created_at).toLocaleString('en-PK', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-end">
                          <div className="tabular-nums font-semibold text-ink text-sm">{formatPKR(s.total)}</div>
                          {s.due > 0 && (
                            <div className="text-xs text-due tabular-nums">{t('pos.due')} {formatPKR(s.due)}</div>
                          )}
                        </div>
                        <button
                          onClick={() => reprintSale(s)}
                          className="h-8 px-3 rounded-btn border border-line text-ink-muted text-xs font-medium hover:border-brand hover:text-brand transition-colors flex items-center gap-1.5"
                        >
                          <Printer size={13} />
                          {t('pos.reprint')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-ink-muted gap-2">
                <div className="text-4xl opacity-30">🛒</div>
                <p className="text-sm">{t('pos.emptyCart')}</p>
              </div>
            )
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
                  {cart.map(line => {
                    const loose = isLooseProduct(line.product)
                    const bLabel = unitShort(line.product.base_unit)
                    const packs = packUnitsOf(line.product)
                    const eligPacks = packs.filter(u => unitEligible(u, saleMode))
                    const modeUnits = (line.product.units ?? []).filter(u => unitEligible(u, saleMode))
                    const wMin = line.product.wholesale_min_qty
                    const belowMin = saleMode === 'wholesale' && loose && wMin != null && line.quantity < Number(wMin)
                    const lmode: LooseMode =
                      line.input_mode === 'amount' ? 'amount'
                      : line.unit.unit_name === line.product.base_unit ? 'weight'
                      : 'pack'
                    return (
                    <motion.tr
                      key={line._key}
                      onClick={() => setSelectedKey(line._key)}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12, height: 0 }}
                      transition={{ duration: 0.18 }}
                      className={cn(
                        'border-b border-line last:border-0 align-top cursor-default',
                        selectedKey === line._key
                          ? 'bg-brand/[0.06] ring-1 ring-inset ring-brand/40'
                          : 'hover:bg-brand/[0.03]',
                      )}
                    >
                      {/* ── Unit / mode ── */}
                      <td className="px-3 py-2">
                        <div className="font-medium text-ink leading-tight">{line.product.name_en}</div>
                        {loose ? (
                          <div className="mt-1 inline-flex rounded border border-line overflow-hidden text-[11px]">
                            {(['weight', 'amount', ...(eligPacks.length ? ['pack'] : [])] as LooseMode[]).map(m => (
                              <button
                                key={m}
                                onClick={() => looseSetMode(line._key, m)}
                                className={cn(
                                  'px-2 py-0.5 transition-colors',
                                  lmode === m ? 'bg-brand text-white' : 'text-ink-muted hover:text-brand',
                                )}
                              >
                                {t(`pos.loose_${m}`)}
                              </button>
                            ))}
                          </div>
                        ) : modeUnits.length > 1 ? (
                          <select
                            value={line.unit.unit_name}
                            onChange={e => {
                              const u = modeUnits.find(x => x.unit_name === e.target.value)
                              if (u) changeUnit(line._key, u)
                            }}
                            className="mt-0.5 text-xs text-ink-muted bg-transparent border border-line rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand"
                          >
                            {modeUnits.map(u => (
                              <option key={u.unit_name} value={u.unit_name}>{u.unit_name}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="text-xs text-ink-muted mt-0.5">{line.unit.unit_name}</div>
                        )}
                      </td>

                      {/* ── Quantity / weight / amount ── */}
                      <td className="px-3 py-2">
                        {loose && lmode === 'weight' ? (
                          <div>
                            <div className="flex items-center gap-1">
                              <input
                                type="number" min={0} step="0.001" value={line.quantity || ''}
                                onChange={e => setLooseWeight(line._key, e.target.value)}
                                placeholder="0"
                                className={cn('w-20 h-7 text-center font-semibold tabular-nums border rounded bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand',
                                  belowMin ? 'border-due' : 'border-line')}
                              />
                              <span className="text-xs text-ink-muted">{bLabel}</span>
                            </div>
                            {saleMode === 'wholesale' && wMin != null && (
                              <div className={cn('text-[11px] mt-0.5', belowMin ? 'text-due font-medium' : 'text-ink-muted')}>
                                {t('pos.minWholesale', { qty: formatQty(Number(wMin)), unit: bLabel })}
                              </div>
                            )}
                          </div>
                        ) : loose && lmode === 'amount' ? (
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-ink-muted">Rs</span>
                              <input
                                type="number" min={0} step="1" value={line.amount || ''}
                                onChange={e => setLooseAmount(line._key, e.target.value)}
                                placeholder="0"
                                className={cn('w-20 h-7 text-center font-semibold tabular-nums border rounded bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand',
                                  belowMin ? 'border-due' : 'border-line')}
                              />
                            </div>
                            <div className={cn('text-[11px] mt-0.5', belowMin ? 'text-due font-medium' : 'text-ink-muted')}>
                              ≈ {formatQty(line.quantity)} {bLabel}
                              {saleMode === 'wholesale' && wMin != null ? ` · ${t('pos.minWholesale', { qty: formatQty(Number(wMin)), unit: bLabel })}` : ''}
                            </div>
                          </div>
                        ) : loose && lmode === 'pack' ? (
                          <div className="flex items-center gap-1">
                            <select
                              value={line.unit.unit_name}
                              onChange={e => {
                                const u = eligPacks.find(x => x.unit_name === e.target.value)
                                if (u) changeUnit(line._key, u)
                              }}
                              className="h-7 text-xs bg-surface border border-line rounded px-1 focus:outline-none focus:ring-1 focus:ring-brand"
                            >
                              {eligPacks.map(u => <option key={u.unit_name} value={u.unit_name}>{u.unit_name}</option>)}
                            </select>
                            <button onClick={() => changeQty(line._key, -1)} className="w-6 h-6 rounded-full border border-line flex items-center justify-center hover:border-due hover:text-due"><Minus size={11} /></button>
                            <input type="number" min={1} value={line.quantity}
                              onChange={e => setQtyAbs(line._key, e.target.value)}
                              className="w-10 h-7 text-center font-semibold tabular-nums border border-line rounded bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand" />
                            <button onClick={() => changeQty(line._key, 1)} className="w-6 h-6 rounded-full border border-line flex items-center justify-center hover:border-brand hover:text-brand"><Plus size={11} /></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button onClick={() => changeQty(line._key, -1)} className="w-6 h-6 rounded-full border border-line flex items-center justify-center hover:border-due hover:text-due transition-colors"><Minus size={11} /></button>
                            <input type="number" min={1} value={line.quantity}
                              onChange={e => setQtyAbs(line._key, e.target.value)}
                              className="w-12 h-7 text-center font-semibold tabular-nums border border-line rounded bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-brand" />
                            <button onClick={() => changeQty(line._key, 1)} className="w-6 h-6 rounded-full border border-line flex items-center justify-center hover:border-brand hover:text-brand transition-colors"><Plus size={11} /></button>
                          </div>
                        )}
                      </td>

                      {/* ── Rate ── */}
                      <td className="px-3 py-2 text-ink-muted tabular-nums text-xs">
                        {formatPKR(line.list_price)}{loose && lmode !== 'pack' ? `/${bLabel}` : ''}
                      </td>

                      {/* ── Discount ── */}
                      {discountMax > 0 && (
                        <td className="px-3 py-2">
                          {loose && lmode === 'amount' ? (
                            <span className="text-xs text-ink-muted/50">—</span>
                          ) : (
                            <input
                              type="number" min={0} max={discountMax} step={1}
                              data-disc={line._key}
                              value={line.discount_pct || ''}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); barcodeRef.current?.focus() } }}
                              onChange={e => changeDiscount(line._key, e.target.value)}
                              placeholder="0"
                              className="w-14 border border-line rounded px-1.5 py-0.5 text-xs text-ink bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
                            />
                          )}
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
                    )
                  })}
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
            <span className="ms-auto"><Kbd k="F3" /></span>
          </label>
          <div className="relative">
            <button
              ref={customerBtnRef}
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
          {paymentType !== 'udhaar' && (
            <div className="mt-1">
              <label className="text-xs text-ink-muted mb-1 flex items-center">
                {paymentType === 'mixed' ? t('pos.cashNow') : t('pos.received')}
                <span className="ms-auto"><Kbd k="F4" /></span>
              </label>
              <input
                ref={receivedRef}
                type="number"
                min={0}
                step={1}
                value={received}
                onChange={e => setReceived(e.target.value)}
                onKeyDown={e => {
                  // * = exact bill, + = bill + old khata, Enter = finish the sale.
                  if (e.key === '*') { e.preventDefault(); setReceived(String(total)) }
                  else if (e.key === '+' && previousBalance > 0) {
                    e.preventDefault()
                    setReceived(String(round2(total + previousBalance)))
                    setExtraToKhata(true)
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    if (cart.length && !createSale.isPending && !ruleBlocked) completeSale()
                  }
                }}
                placeholder="0"
                className="w-full h-9 rounded-input border border-line bg-page px-3 text-base font-semibold tabular-nums text-ink focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {[500, 1000, 5000].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setReceived(String(amt))}
                    className="h-7 px-2.5 rounded-btn border border-line text-xs text-ink-muted hover:border-brand hover:text-brand transition-colors tabular-nums"
                  >
                    {amt}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setReceived(String(total))}
                  className="h-7 px-2.5 rounded-btn border border-brand text-xs text-brand font-medium hover:bg-brand/5 transition-colors"
                >
                  {t('pos.exact')}
                </button>
                {/* Bill + everything the customer already owes, straight onto the khata */}
                {previousBalance > 0 && (
                  <button
                    type="button"
                    onClick={() => { setReceived(String(round2(total + previousBalance))); setExtraToKhata(true) }}
                    className="h-7 px-2.5 rounded-btn border border-due text-xs text-due font-medium hover:bg-due/5 transition-colors tabular-nums"
                  >
                    {t('pos.billPlusOld')} {formatPKR(round2(total + previousBalance))}
                  </button>
                )}
              </div>

              {/* Extra cash over the bill: return it, or settle the old khata with it */}
              {canApplyExtra && (
                <div className="mt-2 rounded-input border border-line bg-page p-2 flex flex-col gap-1.5">
                  <div className="text-xs text-ink-muted">
                    {t('pos.extraCash', { amount: formatPKR(extraCash) })}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setExtraToKhata(false)}
                      className={`py-1.5 rounded-input text-xs font-semibold border transition-colors ${
                        applyExtraToKhata
                          ? 'bg-surface border-line text-ink hover:border-brand'
                          : 'bg-cash text-white border-cash'
                      }`}
                    >
                      {t('pos.returnExtra')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExtraToKhata(true)}
                      className={`py-1.5 rounded-input text-xs font-semibold border transition-colors ${
                        applyExtraToKhata
                          ? 'bg-due text-white border-due'
                          : 'bg-surface border-line text-ink hover:border-due'
                      }`}
                    >
                      {t('pos.extraToKhata')}
                    </button>
                  </div>
                </div>
              )}

              {khataPayment > 0 && (
                <div className="mt-2 rounded-input bg-due/10 border border-due/25 px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-due uppercase tracking-wide">{t('pos.paidToKhata')}</span>
                  <span className="text-lg font-bold text-due tabular-nums">{formatPKR(khataPayment)}</span>
                </div>
              )}
              {changeDue > 0 && (
                <div className="mt-2 rounded-input bg-cash/10 border border-cash/25 px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-cash uppercase tracking-wide">{t('pos.change')}</span>
                  <span className="text-xl font-bold text-cash tabular-nums">{formatPKR(changeDue)}</span>
                </div>
              )}
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

          {/* Khata (running account): what was owed before this bill, and after it */}
          {customer && (previousBalance > 0 || khataPayment > 0) && (
            <div className="mt-2 pt-2 border-t border-line flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm text-ink-muted">
                <span>{t('pos.previousBalance')}</span>
                <span className="tabular-nums text-due">{formatPKR(previousBalance)}</span>
              </div>
              {due > 0 && (
                <div className="flex items-center justify-between text-sm text-ink-muted">
                  <span>{t('pos.plusThisBillUdhaar')}</span>
                  <span className="tabular-nums text-due">+{formatPKR(due)}</span>
                </div>
              )}
              {khataPayment > 0 && (
                <div className="flex items-center justify-between text-sm text-cash">
                  <span>{t('pos.paidToKhata')}</span>
                  <span className="tabular-nums">-{formatPKR(khataPayment)}</span>
                </div>
              )}
              <div className="flex items-center justify-between font-bold text-base text-due">
                <span>{t('pos.newBalance')}</span>
                <span className="tabular-nums">{formatPKR(newBalance)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Retail/wholesale rule violation + admin override */}
        {(minViolationKeys.length > 0 || eligViolation) && (
          <div className="rounded-input border border-due/30 bg-due/5 p-2.5 flex flex-col gap-1.5">
            <div className="text-xs text-due font-medium">
              {minViolationKeys.length > 0 ? t('pos.belowWholesaleMin') : t('pos.wrongModeUnit')}
            </div>
            {isAdmin && (
              <label className="flex items-center gap-2 text-xs text-ink cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allowOverride}
                  onChange={e => setAllowOverride(e.target.checked)}
                  className="w-4 h-4 rounded border-line text-brand focus:ring-brand/30"
                />
                {t('pos.overrideLimits')}
              </label>
            )}
          </div>
        )}

        {/* Complete button */}
        <button
          onClick={completeSale}
          disabled={cart.length === 0 || createSale.isPending || ruleBlocked}
          className="w-full h-12 rounded-card bg-brand text-white font-bold text-base hover:bg-brand/90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-2"
        >
          {createSale.isPending ? t('pos.completing') : t('pos.completeSale')}
          {!createSale.isPending && <Kbd k="F9" dark />}
        </button>

        {createSale.isError && (
          <div className="text-due text-xs text-center px-1">
            {(createSale.error as Error)?.message ?? 'Error completing sale'}
          </div>
        )}
      </div>
      </div>{/* end columns row */}

      {/* ═══ Always-visible key bar — the counter runs on the keyboard ═══ */}
      <div className="hidden lg:flex items-center gap-4 px-4 py-1.5 border-t border-line bg-surface/80 text-[11px] text-ink-muted shrink-0 overflow-x-auto">
        {([
          ['F2', 'pos.kb_search'],
          ['F3', 'pos.kb_customer'],
          ['F5', 'pos.kb_payment'],
          ['F6', 'pos.kb_mode'],
          ['F7', 'pos.kb_unit'],
          ['F9', 'pos.kb_complete'],
          ['F10', 'pos.returnBtn'],
        ] as [string, string][]).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1.5 whitespace-nowrap">
            <Kbd k={key} />
            {t(label)}
          </span>
        ))}
        <button
          onClick={() => setShowHelp(true)}
          className="ms-auto flex items-center gap-1.5 whitespace-nowrap hover:text-brand transition-colors"
        >
          <Kbd k="F1" />
          {t('pos.shortcuts')}
        </button>
      </div>

      {/* ═══ Return (wapsi) ═══ */}
      <AnimatePresence>
        {showReturn && (
          <ReturnDialog shop={shop} onClose={() => { setShowReturn(false); refocusBarcode() }} />
        )}
      </AnimatePresence>

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
              {/* Change to hand back — the number the cashier needs right now. */}
              {(saleResult.data.change ?? 0) > 0 && (
                <div className="mb-3 py-3 px-3 bg-cash/10 rounded-input border border-cash/25">
                  <div className="text-xs font-semibold text-cash uppercase tracking-wide">{t('pos.change')}</div>
                  <div className="text-3xl font-bold text-cash tabular-nums">{formatPKR(saleResult.data.change ?? 0)}</div>
                </div>
              )}
              {(saleResult.data.khata_paid ?? 0) > 0 && (
                <div className="mb-3 py-2 px-3 bg-brand/5 rounded-input border border-brand/20 text-sm text-ink flex items-center justify-between">
                  <span>{t('pos.paidToKhata')}</span>
                  <span className="font-semibold tabular-nums">{formatPKR(saleResult.data.khata_paid ?? 0)}</span>
                </div>
              )}
              {saleResult.data.due > 0 && (
                <div className="mb-3 py-2 px-3 bg-due/10 rounded-input border border-due/20 text-due text-sm font-medium flex items-center justify-between">
                  <span>{t('pos.due')}</span>
                  <span className="tabular-nums">{formatPKR(saleResult.data.due)}</span>
                </div>
              )}
              {(saleResult.data.new_balance ?? 0) > 0 && (
                <div className="mb-4 text-xs text-ink-muted flex items-center justify-between px-1">
                  <span>{t('pos.newBalance')}</span>
                  <span className="tabular-nums text-due font-medium">{formatPKR(saleResult.data.new_balance ?? 0)}</span>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => printReceipt(saleResult.data, shop)}
                  className="flex-1 py-2.5 rounded-input border border-line text-ink text-sm font-medium hover:bg-page transition-colors flex items-center justify-center gap-2"
                >
                  {t('pos.printReceipt')} <Kbd k="P" />
                </button>
                <button
                  autoFocus
                  onClick={startNewSale}
                  className="flex-1 py-2.5 rounded-input bg-brand text-white text-sm font-bold hover:bg-brand/90 transition-colors flex items-center justify-center gap-2"
                >
                  {t('pos.newSale')} <Kbd k="↵" dark />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══ Keyboard shortcuts cheat sheet (F1) ═══ */}
      <AnimatePresence>
        {showHelp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50"
              onClick={() => setShowHelp(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-surface rounded-card border border-line shadow-2xl w-full max-w-md p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-ink flex items-center gap-2">
                  <Keyboard size={16} className="text-brand" />
                  {t('pos.shortcuts')}
                </h3>
                <button onClick={() => setShowHelp(false)} className="text-ink-muted hover:text-ink transition-colors">
                  <X size={18} />
                </button>
              </div>
              <ul className="space-y-1.5">
                {SHORTCUTS.map(([combo, key]) => (
                  <li key={combo} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink-muted">{t(key)}</span>
                    <Kbd k={combo} />
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

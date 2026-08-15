import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { X, RotateCcw, Search, CheckCircle2 } from 'lucide-react'
import { formatPKR, formatQty, round2 } from '@/lib/format'
import { cn } from '@/lib/utils'
import { printReturn, type ReturnReceiptData, type ShopInfo } from '@/lib/receipt'
import { useSaleLookup, useCreateReturn, type ReturnableSale } from '../hooks/useReturns'

interface Props {
  shop: ShopInfo
  onClose: () => void
}

/**
 * Wapsi (sale return): find the original bill, say how much of each line came
 * back, and settle it as cash from the drawer or credit on the customer's khata.
 * Keyboard-first like the rest of the counter — Enter searches, Enter confirms.
 */
export default function ReturnDialog({ shop, onClose }: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')     // what the cashier typed
  const [lookupNo, setLookupNo] = useState('') // what we actually searched for
  const [qty, setQty] = useState<Record<string, number>>({})
  const [refundMode, setRefundMode] = useState<'cash' | 'khata'>('cash')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ data: ReturnReceiptData } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const lookup = useSaleLookup(lookupNo)
  const createReturn = useCreateReturn()
  const sale: ReturnableSale | null | undefined = lookup.data

  useEffect(() => { searchRef.current?.focus() }, [])

  // A walk-in sale has no account to credit.
  useEffect(() => {
    if (sale && !sale.customer && refundMode === 'khata') setRefundMode('cash')
  }, [sale, refundMode])

  const lines = sale?.items ?? []
  const refundTotal = useMemo(
    () => round2(lines.reduce((s, l) => s + (qty[l.sale_item_id] ?? 0) * l.unit_price, 0)),
    [lines, qty],
  )
  const anySelected = Object.values(qty).some(q => q > 0)

  function setLineQty(item: { sale_item_id: string; remaining: number; product_kind: string | null }, raw: number) {
    const max = item.remaining
    const stepped = item.product_kind === 'loose' ? raw : Math.floor(raw)
    const clamped = Math.min(Math.max(stepped, 0), max)
    setQty(q => ({ ...q, [item.sale_item_id]: clamped }))
    setError('')
  }

  function returnEverything() {
    if (!sale) return
    setQty(Object.fromEntries(sale.items.map(i => [i.sale_item_id, i.remaining])))
    setError('')
  }

  function runSearch() {
    const term = query.trim()
    if (!term) return
    setQty({})
    setError('')
    setLookupNo(term)
  }

  async function confirm() {
    if (!sale || !anySelected || createReturn.isPending) return
    setError('')
    try {
      const items = Object.entries(qty)
        .filter(([, q]) => q > 0)
        .map(([sale_item_id, quantity]) => ({ sale_item_id, quantity }))
      const res = await createReturn.mutateAsync({
        sale_id: sale.id,
        date: new Date().toISOString().split('T')[0],
        refund_mode: refundMode,
        note: note.trim() || null,
        items,
      })
      const receipt: ReturnReceiptData = {
        return_no: res.return_no,
        invoice_no: sale.invoice_no,
        date: new Date().toISOString().split('T')[0],
        customer_name: sale.customer?.name ?? null,
        items: lines
          .filter(l => (qty[l.sale_item_id] ?? 0) > 0)
          .map(l => ({
            product_name: l.product_name_ur || l.product_name_en,
            unit_name: l.unit_name,
            quantity: qty[l.sale_item_id],
            unit_price: l.unit_price,
            line_total: round2(qty[l.sale_item_id] * l.unit_price),
          })),
        total: Number(res.total),
        refund_mode: res.refund_mode,
        ...(res.refund_mode === 'khata' && sale.customer
          ? { new_balance: round2(sale.customer.current_balance - Number(res.total)) }
          : {}),
      }
      setDone({ data: receipt })
      printReturn(receipt, shop) // returns always print — the customer keeps the slip
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // Dialog-level keys: Esc closes, Enter confirms once items are picked.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (done && (e.key === 'Enter' || e.key === 'F9')) { e.preventDefault(); onClose(); return }
    if (e.key === 'F9' || (e.key === 'Enter' && e.ctrlKey)) { e.preventDefault(); confirm() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" onKeyDown={onKeyDown}>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50" onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="relative bg-surface rounded-card border border-line shadow-2xl w-full max-w-2xl my-8"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
          <RotateCcw size={18} className="text-due" />
          <h3 className="font-bold text-ink">{t('returns.title')}</h3>
          <button
            onClick={onClose}
            className="ms-auto w-8 h-8 rounded-btn flex items-center justify-center text-ink-muted hover:text-due hover:bg-due/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {done ? (
          /* ── Done ── */
          <div className="p-6 text-center">
            <CheckCircle2 size={44} className="text-cash mx-auto mb-3" />
            <h4 className="font-bold text-lg text-ink">{t('returns.done')}</h4>
            <p className="text-sm text-ink-muted mb-4">{done.data.return_no}</p>
            <div className="rounded-input border border-line p-3 mb-4 text-start">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">
                  {done.data.refund_mode === 'cash' ? t('returns.cashReturned') : t('returns.creditedToKhata')}
                </span>
                <span className="font-bold text-lg text-ink tabular-nums">{formatPKR(done.data.total)}</span>
              </div>
              {done.data.new_balance != null && (
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-ink-muted">{t('pos.newBalance')}</span>
                  <span className="tabular-nums text-due font-medium">{formatPKR(done.data.new_balance)}</span>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => printReturn(done.data, shop)}
                className="flex-1 py-2.5 rounded-input border border-line text-ink text-sm font-medium hover:bg-page transition-colors"
              >
                {t('returns.printSlip')}
              </button>
              <button
                autoFocus
                onClick={onClose}
                className="flex-1 py-2.5 rounded-input bg-brand text-white text-sm font-bold hover:bg-brand/90 transition-colors"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-3">
            {/* Invoice lookup */}
            <div>
              <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                {t('returns.findBill')}
              </label>
              <div className="flex gap-2 mt-1">
                <input
                  ref={searchRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runSearch() } }}
                  placeholder={t('returns.invoicePlaceholder')}
                  className="flex-1 h-10 rounded-input border border-line bg-page px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                />
                <button
                  onClick={runSearch}
                  className="h-10 px-4 rounded-input bg-brand text-white text-sm font-semibold hover:bg-brand/90 transition-colors flex items-center gap-1.5"
                >
                  <Search size={15} />
                  {t('returns.find')}
                </button>
              </div>
            </div>

            {lookup.isFetching && <p className="text-sm text-ink-muted">{t('common.loading')}</p>}
            {lookupNo && !lookup.isFetching && !sale && (
              <p className="text-sm text-due">{t('returns.notFound')}</p>
            )}

            {sale && (
              <>
                {/* Bill header */}
                <div className="rounded-input border border-line bg-page px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-semibold text-ink">{sale.invoice_no}</span>
                  <span className="text-ink-muted">{new Date(sale.date).toLocaleDateString('en-PK')}</span>
                  <span className="text-ink-muted">{sale.customer?.name ?? t('pos.walkIn')}</span>
                  <span className="ms-auto tabular-nums font-medium text-ink">{formatPKR(sale.total)}</span>
                </div>

                {/* Lines */}
                <div className="rounded-card border border-line overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-page text-xs text-ink-muted uppercase tracking-wide">
                      <tr>
                        <th className="text-start px-3 py-2 font-medium">{t('returns.item')}</th>
                        <th className="text-end px-3 py-2 font-medium w-20">{t('returns.sold')}</th>
                        <th className="text-center px-3 py-2 font-medium w-28">{t('returns.returnQty')}</th>
                        <th className="text-end px-3 py-2 font-medium w-24">{t('returns.refund')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map(l => {
                        const q = qty[l.sale_item_id] ?? 0
                        const spent = l.remaining <= 0
                        return (
                          <tr key={l.sale_item_id} className={cn('border-t border-line', spent && 'opacity-50')}>
                            <td className="px-3 py-2">
                              <div className="font-medium text-ink leading-tight">{l.product_name_en}</div>
                              <div className="text-xs text-ink-muted">
                                {l.unit_name} · {formatPKR(l.unit_price)}
                                {l.returned_quantity > 0 && (
                                  <span className="text-due ms-1">
                                    · {t('returns.alreadyReturned', { qty: formatQty(l.returned_quantity) })}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-end tabular-nums text-ink-muted">
                              {formatQty(l.sold_quantity)}
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                max={l.remaining}
                                step={l.product_kind === 'loose' ? 0.001 : 1}
                                disabled={spent}
                                value={q || ''}
                                onChange={e => setLineQty(l, parseFloat(e.target.value) || 0)}
                                placeholder="0"
                                className="w-full h-9 rounded-input border border-line bg-page px-2 text-center text-sm tabular-nums text-ink focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
                              />
                              <div className="text-[10px] text-ink-muted text-center mt-0.5">
                                {t('returns.max', { qty: formatQty(l.remaining) })}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-end tabular-nums font-medium text-ink">
                              {q > 0 ? formatPKR(round2(q * l.unit_price)) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <button
                  onClick={returnEverything}
                  className="self-start text-xs text-brand font-medium hover:underline"
                >
                  {t('returns.returnAll')}
                </button>

                {/* Refund mode */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                    {t('returns.refundMode')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setRefundMode('cash')}
                      className={cn(
                        'py-2 rounded-input text-sm font-semibold border transition-colors',
                        refundMode === 'cash' ? 'bg-cash text-white border-cash' : 'bg-page border-line text-ink hover:border-cash',
                      )}
                    >
                      {t('returns.cash')}
                    </button>
                    <button
                      onClick={() => sale.customer && setRefundMode('khata')}
                      disabled={!sale.customer}
                      title={!sale.customer ? t('returns.walkInCashOnly') : undefined}
                      className={cn(
                        'py-2 rounded-input text-sm font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                        refundMode === 'khata' ? 'bg-due text-white border-due' : 'bg-page border-line text-ink hover:border-due',
                      )}
                    >
                      {t('returns.khata')}
                    </button>
                  </div>
                  {refundMode === 'khata' && sale.customer && (
                    <p className="text-xs text-ink-muted">
                      {t('returns.khataHint', {
                        name: sale.customer.name,
                        from: formatPKR(sale.customer.current_balance),
                        to: formatPKR(round2(sale.customer.current_balance - refundTotal)),
                      })}
                    </p>
                  )}
                </div>

                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={t('returns.notePlaceholder')}
                  className="h-9 rounded-input border border-line bg-page px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                />

                {error && <p className="text-sm text-due">{error}</p>}

                {/* Footer */}
                <div className="flex items-center gap-3 border-t border-line pt-3">
                  <div className="text-sm text-ink-muted">
                    {t('returns.refundTotal')}
                    <span className="ms-2 text-xl font-bold text-ink tabular-nums">{formatPKR(refundTotal)}</span>
                  </div>
                  <button
                    onClick={confirm}
                    disabled={!anySelected || createReturn.isPending}
                    className="ms-auto h-11 px-6 rounded-card bg-due text-white font-bold hover:bg-due/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {createReturn.isPending ? t('pos.completing') : t('returns.confirm')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </motion.div>
    </div>
  )
}

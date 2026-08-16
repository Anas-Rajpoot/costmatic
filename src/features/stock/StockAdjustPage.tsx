import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { PackageMinus, PackagePlus, ClipboardCheck, Search, CheckCircle2 } from 'lucide-react'
import { formatQty } from '@/lib/format'
import { cn } from '@/lib/utils'
import { unitShort } from '@/lib/format'
import { useProducts } from '@/features/products/hooks/useProducts'
import { isLooseProduct } from '@/lib/pricing'
import type { Product } from '@/types'
import {
  useAdjustStock, useStockAdjustments, type AdjustMode, type AdjustReason, type AdjustResult,
} from './hooks/useStockAdjust'
import { PageFade, PageHeader, EmptyState } from '@/components/Page'

const MODES: { id: AdjustMode; icon: typeof PackageMinus; labelKey: string; tone: string }[] = [
  { id: 'remove', icon: PackageMinus,   labelKey: 'stockAdjust.modeRemove', tone: 'due' },
  { id: 'add',    icon: PackagePlus,    labelKey: 'stockAdjust.modeAdd',    tone: 'cash' },
  { id: 'set',    icon: ClipboardCheck, labelKey: 'stockAdjust.modeSet',    tone: 'brand' },
]

const REASONS: Record<AdjustMode, AdjustReason[]> = {
  remove: ['wastage', 'expiry', 'damage', 'theft', 'other'],
  add:    ['correction', 'other'],
  set:    ['count', 'correction'],
}

export default function StockAdjustPage() {
  const { t, i18n } = useTranslation()
  const ur = i18n.language === 'ur'

  const [search, setSearch] = useState('')
  const [product, setProduct] = useState<Product | null>(null)
  const [mode, setMode] = useState<AdjustMode>('remove')
  const [reason, setReason] = useState<AdjustReason>('wastage')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState<AdjustResult | null>(null)
  const qtyRef = useRef<HTMLInputElement>(null)

  const { data: products = [] } = useProducts()
  const adjust = useAdjustStock()
  const history = useStockAdjustments()

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return products
      .filter(p => p.is_active && (
        p.name_en.toLowerCase().includes(q) ||
        (p.name_ur ?? '').includes(search.trim()) ||
        (p.barcode ?? '').includes(search.trim())
      ))
      .slice(0, 8)
  }, [products, search])

  const currentStock = product ? Number(product.stock?.[0]?.quantity_in_base_unit ?? 0) : 0
  const baseLabel = product ? unitShort(product.base_unit) : ''
  const qtyNum = Math.max(parseFloat(qty) || 0, 0)
  const after = mode === 'set' ? qtyNum : mode === 'add' ? currentStock + qtyNum : currentStock - qtyNum

  function pick(p: Product) {
    setProduct(p)
    setSearch('')
    setDone(null)
    setError('')
    setTimeout(() => qtyRef.current?.focus(), 30)
  }

  function changeMode(m: AdjustMode) {
    setMode(m)
    setReason(REASONS[m][0])
    setDone(null)
    qtyRef.current?.focus()
  }

  async function submit() {
    if (!product) { setError(t('stockAdjust.pickProduct')); return }
    if (mode !== 'set' && qtyNum <= 0) { setError(t('stockAdjust.qtyRequired')); return }
    setError('')
    try {
      const res = await adjust.mutateAsync({
        product_id: product.id, mode, quantity: qtyNum, reason, note: note.trim() || null,
      })
      setDone(res)
      setQty(''); setNote('')
      // Reflect the new stock immediately in the picked product card.
      setProduct(p => p ? { ...p, stock: [{ ...(p.stock?.[0] ?? {}), quantity_in_base_unit: res.after }] } as Product : p)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <PageFade className="flex flex-col gap-4 max-w-5xl">
      <PageHeader title={t('stockAdjust.title')} subtitle={t('stockAdjust.intro')} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Adjust ── */}
        <div className="rounded-card border border-line bg-surface p-4 flex flex-col gap-3">
          {/* Product picker */}
          <div className="relative">
            <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">
              {t('stockAdjust.product')}
            </label>
            <div className="flex items-center gap-2">
              <Search size={15} className="text-ink-muted shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && matches[0]) { e.preventDefault(); pick(matches[0]) } }}
                placeholder={t('stockAdjust.searchPlaceholder')}
                className="flex-1 h-10 rounded-input border border-line bg-page px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            {matches.length > 0 && (
              <ul className="absolute z-20 top-full mt-1 w-full bg-surface border border-line rounded-card shadow-lg overflow-hidden">
                {matches.map(p => (
                  <li key={p.id}>
                    <button
                      onMouseDown={() => pick(p)}
                      className="w-full text-start px-3 py-2 text-sm hover:bg-brand/5 flex items-center justify-between gap-2"
                    >
                      <span className="truncate text-ink">{ur && p.name_ur ? p.name_ur : p.name_en}</span>
                      <span className="text-xs text-ink-muted shrink-0 tabular-nums">
                        {formatQty(Number(p.stock?.[0]?.quantity_in_base_unit ?? 0))} {unitShort(p.base_unit)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {product && (
            <>
              <div className="rounded-input border border-line bg-page px-3 py-2 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-semibold text-ink truncate">{product.name_en}</div>
                  {product.name_ur && <div className="text-xs text-ink-muted truncate">{product.name_ur}</div>}
                </div>
                <div className="text-end shrink-0">
                  <div className="text-xs text-ink-muted">{t('stockAdjust.inStock')}</div>
                  <div className="font-bold text-ink tabular-nums">
                    {formatQty(currentStock)} {baseLabel}
                  </div>
                </div>
              </div>

              {/* Mode */}
              <div className="grid grid-cols-3 gap-1.5">
                {MODES.map(({ id, icon: Icon, labelKey, tone }) => (
                  <button
                    key={id}
                    onClick={() => changeMode(id)}
                    className={cn(
                      'py-2 rounded-input text-xs font-semibold border transition-colors flex flex-col items-center gap-1',
                      mode === id
                        ? tone === 'due' ? 'bg-due text-white border-due'
                          : tone === 'cash' ? 'bg-cash text-white border-cash'
                          : 'bg-brand text-white border-brand'
                        : 'bg-page border-line text-ink hover:border-brand',
                    )}
                  >
                    <Icon size={16} />
                    {t(labelKey)}
                  </button>
                ))}
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-xs text-ink-muted mb-1">
                  {mode === 'set' ? t('stockAdjust.countedQty') : t('stockAdjust.quantity')} ({baseLabel})
                </label>
                <input
                  ref={qtyRef}
                  type="number"
                  min={0}
                  step={product && isLooseProduct(product) ? 0.001 : 1}
                  value={qty}
                  onChange={e => { setQty(e.target.value); setDone(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
                  placeholder="0"
                  className="w-full h-11 rounded-input border border-line bg-page px-3 text-lg font-semibold tabular-nums text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              {/* Reason chips */}
              <div>
                <label className="block text-xs text-ink-muted mb-1">{t('stockAdjust.reason')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {REASONS[mode].map(r => (
                    <button
                      key={r}
                      onClick={() => setReason(r)}
                      className={cn(
                        'h-8 px-3 rounded-btn border text-xs font-medium transition-colors',
                        reason === r ? 'bg-ink text-white border-ink' : 'bg-page border-line text-ink hover:border-ink',
                      )}
                    >
                      {t(`stockAdjust.reason_${r}`)}
                    </button>
                  ))}
                </div>
              </div>

              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
                placeholder={t('stockAdjust.notePlaceholder')}
                className="h-9 rounded-input border border-line bg-page px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
              />

              {/* Preview */}
              {qtyNum > 0 && (
                <div className="rounded-input border border-line bg-page px-3 py-2 flex items-center justify-between text-sm">
                  <span className="text-ink-muted">{t('stockAdjust.afterAdjust')}</span>
                  <span className={cn(
                    'font-bold tabular-nums',
                    after < currentStock ? 'text-due' : after > currentStock ? 'text-cash' : 'text-ink',
                  )}>
                    {formatQty(Math.max(after, 0))} {baseLabel}
                  </span>
                </div>
              )}

              {error && <p className="text-sm text-due">{error}</p>}

              {done && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-input border border-cash/25 bg-cash/10 px-3 py-2 text-sm text-cash flex items-center gap-2"
                >
                  <CheckCircle2 size={15} />
                  {t('stockAdjust.saved', {
                    product: done.product,
                    delta: `${done.delta > 0 ? '+' : '−'}${formatQty(Math.abs(done.delta))}`,
                    after: formatQty(done.after),
                    unit: baseLabel,
                  })}
                </motion.div>
              )}

              <button
                onClick={submit}
                disabled={adjust.isPending}
                className="h-11 rounded-card bg-brand text-white font-bold hover:bg-brand/90 disabled:opacity-40 transition-colors"
              >
                {adjust.isPending ? t('pos.completing') : t('stockAdjust.save')}
              </button>
            </>
          )}
        </div>

        {/* ── History ── */}
        <div className="rounded-card border border-line bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line">
            <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
              {t('stockAdjust.history')}
            </h2>
          </div>
          {(history.data?.length ?? 0) === 0 ? (
            <EmptyState icon={<PackageMinus size={28} />} title={t('stockAdjust.noHistory')} />
          ) : (
            <ul className="max-h-[28rem] overflow-y-auto divide-y divide-line">
              {history.data!.map(a => (
                <li key={a.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink truncate">
                      {ur && a.product?.name_ur ? a.product.name_ur : a.product?.name_en}
                    </div>
                    <div className="text-xs text-ink-muted truncate">
                      {t(`stockAdjust.reason_${a.reason}`)}
                      {a.note ? ` · ${a.note}` : ''}
                      {' · '}
                      {new Date(a.date).toLocaleDateString('en-PK')}
                    </div>
                  </div>
                  <div className="ms-auto text-end shrink-0">
                    <div className={cn(
                      'font-bold tabular-nums text-sm',
                      a.delta < 0 ? 'text-due' : 'text-cash',
                    )}>
                      {a.delta > 0 ? '+' : '−'}{formatQty(Math.abs(a.delta))}
                    </div>
                    <div className="text-[11px] text-ink-muted tabular-nums">
                      {formatQty(a.before_qty)} → {formatQty(a.after_qty)} {unitShort(a.product?.base_unit ?? '')}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PageFade>
  )
}

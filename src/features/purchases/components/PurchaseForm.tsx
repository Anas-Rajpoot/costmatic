import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { X, Plus, Trash2 } from 'lucide-react'
import { useCreatePurchase } from '../hooks/usePurchases'
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers'
import { useProducts } from '@/features/products/hooks/useProducts'
import { useAuth } from '@/features/auth/AuthContext'
import { formatPKR } from '@/lib/format'
import type { Product, ProductUnit } from '@/types'
import { cn } from '@/lib/utils'

interface Props { onClose: () => void }

interface LineItem {
  _key: number
  product_id: string
  product: Product | null
  unit_name: string
  available_units: ProductUnit[]
  quantity: string
  unit_cost: string
  line_total: number
}

let _k = 1
const freshKey = () => _k++

const blankLine = (): LineItem => ({
  _key: freshKey(), product_id: '', product: null,
  unit_name: 'piece', available_units: [], quantity: '1', unit_cost: '0', line_total: 0,
})

export default function PurchaseForm({ onClose }: Props) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { data: suppliers = [] } = useSuppliers()
  const { data: products = [] } = useProducts()
  const create = useCreatePurchase()

  const [supplier_id, setSupplier] = useState('')
  const [invoice_no, setInvoice] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [discount, setDiscount] = useState('0')
  const [paid, setPaid] = useState('0')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<LineItem[]>([blankLine()])
  const [err, setErr] = useState('')

  function setLine(key: number, patch: Partial<LineItem>) {
    setLines(ls => ls.map(l => {
      if (l._key !== key) return l
      const updated = { ...l, ...patch }
      const qty = parseFloat(updated.quantity) || 0
      const cost = parseFloat(updated.unit_cost) || 0
      updated.line_total = qty * cost
      return updated
    }))
  }

  function pickProduct(key: number, pid: string) {
    const p = products.find(x => x.id === pid) ?? null
    const units = p?.units ?? []
    const pieceUnit = units.find(u => u.unit_name === 'piece')
    const defaultUnit = units[0]?.unit_name ?? 'piece'
    const lastCost = Number(p?.product_costs?.[0]?.cost_price) || 0
    const defaultCost = pieceUnit
      ? Number(pieceUnit.wholesale_price) || lastCost
      : lastCost
    setLine(key, {
      product_id: pid,
      product: p,
      available_units: units,
      unit_name: defaultUnit,
      unit_cost: String(defaultCost),
    })
  }

  function pickUnit(key: number, unit_name: string) {
    const line = lines.find(l => l._key === key)
    if (!line) return
    const unit = line.available_units.find(u => u.unit_name === unit_name)
    const cost = unit ? Number(unit.wholesale_price) || Number(line.product?.product_costs?.[0]?.cost_price) || 0 : 0
    setLine(key, { unit_name, unit_cost: String(cost) })
  }

  const subtotal = lines.reduce((s, l) => s + l.line_total, 0)
  const discountVal = parseFloat(discount) || 0
  const total = Math.max(0, subtotal - discountVal)
  const paidVal = parseFloat(paid) || 0
  const due = Math.max(0, total - paidVal)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplier_id) { setErr(t('purchases.supplier')); return }
    const validLines = lines.filter(l => l.product_id && parseFloat(l.quantity) > 0)
    if (!validLines.length) { setErr(t('purchases.addItem')); return }
    setErr('')
    try {
      await create.mutateAsync({
        supplier_id,
        invoice_no,
        date,
        subtotal,
        discount: discountVal,
        total,
        paid: paidVal,
        note,
        created_by: profile!.id,
        items: validLines.map(l => ({
          product_id: l.product_id,
          unit_name: l.unit_name,
          quantity: parseInt(l.quantity),
          unit_cost: parseFloat(l.unit_cost),
          line_total: l.line_total,
        })),
      })
      onClose()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />
      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="fixed inset-y-0 end-0 w-full max-w-3xl bg-surface shadow-2xl z-50 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line shrink-0">
          <h2 className="font-semibold text-ink">{t('purchases.new')}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink transition-colors"><X size={18} /></button>
        </div>

        <form id="purchase-form" onSubmit={submit} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Top fields */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <label className="block text-sm text-ink-muted mb-1.5">{t('purchases.supplier')} *</label>
              <select
                value={supplier_id}
                onChange={e => setSupplier(e.target.value)}
                className="w-full h-10 rounded-input border border-line bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                <option value="">—</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-ink-muted mb-1.5">{t('purchases.invoiceNo')}</label>
              <input
                value={invoice_no}
                onChange={e => setInvoice(e.target.value)}
                placeholder="e.g. INV-2024-001"
                className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-ink-muted mb-1.5">{t('purchases.date')}</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
              />
            </div>
          </div>

          {/* Items table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('purchases.items')}</h3>
              <p className="text-xs text-ink-muted">{t('purchases.stockNote')}</p>
            </div>
            <div className="rounded-card border border-line overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-page border-b border-line">
                    <th className="text-start px-3 py-2 text-xs text-ink-muted font-medium w-[35%]">{t('purchases.product')}</th>
                    <th className="text-start px-3 py-2 text-xs text-ink-muted font-medium w-[15%]">{t('purchases.unit')}</th>
                    <th className="text-start px-3 py-2 text-xs text-ink-muted font-medium w-[10%]">{t('purchases.qty')}</th>
                    <th className="text-start px-3 py-2 text-xs text-ink-muted font-medium w-[18%]">{t('purchases.unitCost')}</th>
                    <th className="text-start px-3 py-2 text-xs text-ink-muted font-medium w-[15%]">{t('purchases.lineTotal')}</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={line._key} className="border-b border-line last:border-0">
                      <td className="px-3 py-2">
                        <select
                          value={line.product_id}
                          onChange={e => pickProduct(line._key, e.target.value)}
                          className="w-full h-8 rounded border border-line bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand/30"
                        >
                          <option value="">—</option>
                          {products.filter(p => p.is_active).map(p => (
                            <option key={p.id} value={p.id}>{p.name_en}{p.brand ? ` (${p.brand})` : ''}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={line.unit_name}
                          onChange={e => pickUnit(line._key, e.target.value)}
                          disabled={!line.product_id}
                          className="w-full h-8 rounded border border-line bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand/30 disabled:opacity-50"
                        >
                          {line.available_units.length > 0
                            ? line.available_units.map(u => <option key={u.unit_name} value={u.unit_name}>{u.unit_name}</option>)
                            : <option value="piece">piece</option>}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number" min="1" step="1"
                          value={line.quantity}
                          onChange={e => setLine(line._key, { quantity: e.target.value })}
                          className="w-full h-8 rounded border border-line bg-surface px-2 text-sm text-ink tabular focus:outline-none focus:ring-1 focus:ring-brand/30"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number" min="0" step="0.01"
                          value={line.unit_cost}
                          onChange={e => setLine(line._key, { unit_cost: e.target.value })}
                          className="w-full h-8 rounded border border-line bg-surface px-2 text-sm text-ink tabular focus:outline-none focus:ring-1 focus:ring-brand/30"
                        />
                      </td>
                      <td className="px-3 py-2 text-ink tabular font-medium">
                        {formatPKR(line.line_total)}
                      </td>
                      <td className="px-2 py-2">
                        {lines.length > 1 && (
                          <button type="button"
                            onClick={() => setLines(ls => ls.filter(l => l._key !== line._key))}
                            className="p-1 text-ink-muted hover:text-due transition-colors">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button"
              onClick={() => setLines(ls => [...ls, blankLine()])}
              className="mt-2 flex items-center gap-1.5 text-sm text-brand hover:text-brand-dark transition-colors">
              <Plus size={14} />
              {t('purchases.addItem')}
            </button>
          </div>

          {/* Totals + note */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-ink-muted mb-1.5">{t('purchases.note')}</label>
              <textarea
                rows={3}
                value={note}
                onChange={e => setNote(e.target.value)}
                className="w-full rounded-input border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors resize-none"
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">{t('purchases.subtotal')}</span>
                <span className="tabular font-medium">{formatPKR(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm gap-4">
                <span className="text-ink-muted shrink-0">{t('purchases.discount')}</span>
                <input
                  type="number" min="0" step="0.01"
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  className="w-32 h-8 rounded border border-line bg-surface px-2 text-sm text-ink tabular text-end focus:outline-none focus:ring-1 focus:ring-brand/30"
                />
              </div>
              <div className="flex justify-between text-sm font-semibold border-t border-line pt-2">
                <span className="text-ink">{t('purchases.total')}</span>
                <span className="tabular">{formatPKR(total)}</span>
              </div>
              <div className="flex items-center justify-between text-sm gap-4">
                <span className="text-cash shrink-0">{t('purchases.paid')}</span>
                <input
                  type="number" min="0" step="0.01"
                  value={paid}
                  onChange={e => setPaid(e.target.value)}
                  className="w-32 h-8 rounded border border-line bg-surface px-2 text-sm text-cash tabular text-end focus:outline-none focus:ring-1 focus:ring-brand/30"
                />
              </div>
              <div className={cn('flex justify-between text-sm font-semibold', due > 0 ? 'text-due' : 'text-cash')}>
                <span>{t('purchases.due')}</span>
                <span className="tabular">{formatPKR(due)}</span>
              </div>
            </div>
          </div>

          {err && (
            <div className="text-due text-sm px-3 py-2 bg-due-soft rounded-input border border-due/20">{err}</div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-line shrink-0 flex gap-3 justify-end">
          <button type="button" onClick={onClose}
            className="h-10 px-5 border border-line text-ink-muted rounded-btn text-sm font-medium hover:border-brand hover:text-brand transition-colors">
            {t('common.cancel')}
          </button>
          <button type="submit" form="purchase-form" disabled={create.isPending}
            className="h-10 px-6 bg-brand text-white rounded-btn text-sm font-semibold hover:bg-brand-dark disabled:opacity-60 transition-colors">
            {create.isPending ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </motion.div>
    </>
  )
}

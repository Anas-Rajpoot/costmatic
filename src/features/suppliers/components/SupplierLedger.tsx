import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { X, Package } from 'lucide-react'
import { useSupplierLedger } from '../hooks/useSuppliers'
import { useSupplierPurchases, useSupplierProducts } from '@/features/purchases/hooks/useSupplierHistory'
import { formatPKR, formatQty } from '@/lib/format'
import type { Supplier } from '@/types'
import { cn } from '@/lib/utils'

type Tab = 'khata' | 'deliveries' | 'items'

interface Props {
  supplier: Supplier
  onClose: () => void
}

const TYPE_LABELS: Record<string, string> = {
  opening: 'suppliers.typeOpening',
  purchase: 'suppliers.typePurchase',
  payment: 'suppliers.typePayment',
  return: 'suppliers.typeReturn',
  adjustment: 'suppliers.typeAdjustment',
}

export default function SupplierLedger({ supplier, onClose }: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('khata')
  const { data: rows = [], isLoading } = useSupplierLedger(supplier.id)
  // The khata says what you owe; these say what actually arrived for it.
  const deliveriesQuery = useSupplierPurchases(supplier.id)
  const itemsQuery = useSupplierProducts(supplier.id)
  const deliveries = deliveriesQuery.data ?? []
  const supplied = itemsQuery.data ?? []

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'khata',      label: t('suppliers.tabKhata') },
    { id: 'deliveries', label: t('suppliers.tabDeliveries'), count: deliveries.length },
    { id: 'items',      label: t('suppliers.tabItems'),      count: supplied.length },
  ]

  // Compute running balance
  let running = 0
  const ledger = rows.map(r => {
    running += Number(r.amount)
    return { ...r, running }
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        className="relative bg-surface rounded-card border border-line shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <div>
            <h2 className="font-semibold text-ink">{t('suppliers.ledgerTitle')}</h2>
            <p className="text-xs text-ink-muted mt-0.5">{supplier.name}</p>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tabs — the money, the goods, and what this supplier actually deals in */}
        <div className="flex gap-1 px-5 pt-3 border-b border-line shrink-0">
          {TABS.map(tb => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === tb.id
                  ? 'border-brand text-brand'
                  : 'border-transparent text-ink-muted hover:text-brand',
              )}
            >
              {tb.label}
              {tb.count != null && tb.count > 0 && (
                <span className="text-[11px] text-ink-muted tabular">({tb.count})</span>
              )}
            </button>
          ))}
        </div>

        <div className={cn('flex-1 overflow-y-auto', tab !== 'khata' && 'hidden')}>
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin" />
            </div>
          ) : ledger.length === 0 ? (
            <p className="p-8 text-center text-ink-muted text-sm">No transactions yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-page">
                  <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">Date</th>
                  <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('suppliers.typePurchase')}</th>
                  <th className="text-end px-4 py-3 text-xs text-ink-muted font-medium">Amount</th>
                  <th className="text-end px-4 py-3 text-xs text-ink-muted font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map(row => {
                  const isPayment = row.amount < 0
                  return (
                    <tr key={row.id} className="border-b border-line last:border-0 hover:bg-page/50 transition-colors">
                      <td className="px-4 py-3 text-ink-muted tabular">{row.date}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                          isPayment ? 'bg-cash-soft text-cash' : 'bg-due-soft text-due'
                        )}>
                          {t(TYPE_LABELS[row.type] ?? row.type)}
                        </span>
                        {row.note && <span className="ms-2 text-ink-muted text-xs">{row.note}</span>}
                      </td>
                      <td className={cn('px-4 py-3 text-end tabular font-medium', isPayment ? 'text-cash' : 'text-due')}>
                        {isPayment ? '-' : '+'}{formatPKR(Math.abs(Number(row.amount)))}
                      </td>
                      <td className={cn('px-4 py-3 text-end tabular', row.running > 0 ? 'text-due' : 'text-cash')}>
                        {formatPKR(Math.abs(row.running))}
                        {row.running > 0 && <span className="text-xs text-ink-muted ms-1">owe</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Deliveries: what arrived, when, and on what terms ── */}
        {tab === 'deliveries' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {deliveriesQuery.isLoading ? (
              <div className="p-8 flex justify-center">
                <div className="w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin" />
              </div>
            ) : deliveries.length === 0 ? (
              <p className="p-8 text-center text-ink-muted text-sm">{t('suppliers.noDeliveries')}</p>
            ) : deliveries.map(d => (
              <div key={d.id} className="rounded-card border border-line overflow-hidden">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 bg-page border-b border-line">
                  <span className="text-sm font-medium text-ink">
                    {new Date(d.date).toLocaleDateString('en-PK')}
                  </span>
                  {d.invoice_no && (
                    <span className="text-xs text-ink-muted">{d.invoice_no}</span>
                  )}
                  <span className="ms-auto text-sm font-semibold text-ink tabular">{formatPKR(d.total)}</span>
                  {d.due > 0 && (
                    <span className="text-xs text-due tabular">{t('suppliers.stillDue')} {formatPKR(d.due)}</span>
                  )}
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {d.items.map((it, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        <td className="px-3 py-1.5 text-ink">{it.product_name}</td>
                        <td className="px-3 py-1.5 text-end text-ink-muted tabular whitespace-nowrap">
                          {formatQty(it.quantity)} {it.unit_name} &times; {formatPKR(it.unit_cost)}
                        </td>
                        <td className="px-3 py-1.5 text-end text-ink tabular whitespace-nowrap">
                          {formatPKR(it.line_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {/* ── Items: the running list of what this supplier deals in ── */}
        {tab === 'items' && (
          <div className="flex-1 overflow-y-auto">
            {itemsQuery.isLoading ? (
              <div className="p-8 flex justify-center">
                <div className="w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin" />
              </div>
            ) : supplied.length === 0 ? (
              <p className="p-8 text-center text-ink-muted text-sm">{t('suppliers.noDeliveries')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-page">
                    <th className="text-start px-4 py-2.5 text-xs text-ink-muted font-medium">{t('purchases.product')}</th>
                    <th className="text-start px-4 py-2.5 text-xs text-ink-muted font-medium">{t('purchases.unit')}</th>
                    <th className="text-end px-4 py-2.5 text-xs text-ink-muted font-medium">{t('suppliers.lastCost')}</th>
                    <th className="text-end px-4 py-2.5 text-xs text-ink-muted font-medium">{t('suppliers.lastSeen')}</th>
                  </tr>
                </thead>
                <tbody>
                  {supplied.map(sp => (
                    <tr key={sp.product_id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 text-ink">
                        <Package size={13} className="inline-block me-1.5 text-ink-muted/50" />
                        {sp.product_name}
                        {sp.times > 1 && <span className="text-xs text-ink-muted ms-1.5 tabular">{sp.times}&times;</span>}
                      </td>
                      <td className="px-4 py-2.5 text-ink-muted">{sp.unit_name}</td>
                      <td className="px-4 py-2.5 text-end text-ink tabular">{formatPKR(sp.last_cost)}</td>
                      <td className="px-4 py-2.5 text-end text-ink-muted tabular">
                        {sp.last_date ? new Date(sp.last_date).toLocaleDateString('en-PK') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="px-5 py-3 border-t border-line shrink-0 flex items-center justify-between">
          <div>
            <span className="text-xs text-ink-muted me-2">{t('suppliers.youOwe')}:</span>
            <span className={cn('font-bold tabular', Number(supplier.current_balance) > 0 ? 'text-due' : 'text-cash')}>
              {formatPKR(Math.abs(Number(supplier.current_balance)))}
            </span>
          </div>
          <button onClick={onClose}
            className="h-8 px-4 border border-line text-ink-muted rounded-btn text-sm hover:border-brand hover:text-brand transition-colors">
            {t('common.cancel')}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

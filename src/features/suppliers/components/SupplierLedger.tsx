import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useSupplierLedger } from '../hooks/useSuppliers'
import { formatPKR } from '@/lib/format'
import type { Supplier } from '@/types'
import { cn } from '@/lib/utils'

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
  const { data: rows = [], isLoading } = useSupplierLedger(supplier.id)

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

        <div className="flex-1 overflow-y-auto">
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

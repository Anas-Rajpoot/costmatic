import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence } from 'framer-motion'
import { ClipboardList, Plus } from 'lucide-react'
import { usePurchases } from './hooks/usePurchases'
import PurchaseForm from './components/PurchaseForm'
import { formatPKR } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function PurchasesPage() {
  const { t } = useTranslation()
  const { data: purchases = [], isLoading } = usePurchases()
  const [showForm, setShowForm] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-btn bg-brand-soft flex items-center justify-center">
            <ClipboardList size={18} className="text-brand" />
          </div>
          <h1 className="text-xl font-semibold text-ink">{t('purchases.title')}</h1>
          <span className="text-sm text-ink-muted tabular">({purchases.length})</span>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 h-9 px-4 rounded-btn bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors"
        >
          <Plus size={15} />
          {t('purchases.new')}
        </button>
      </div>

      <div className="bg-surface rounded-card border border-line overflow-hidden">
        {isLoading ? (
          <div className="p-10 flex justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          </div>
        ) : purchases.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList size={36} className="mx-auto text-ink-muted/30 mb-3" />
            <p className="text-ink-muted text-sm">{t('purchases.noPurchases')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-page">
                <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('purchases.date')}</th>
                <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('purchases.invoiceNo')}</th>
                <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('purchases.supplier')}</th>
                <th className="text-end px-4 py-3 text-ink-muted font-medium">{t('purchases.total')}</th>
                <th className="text-end px-4 py-3 text-ink-muted font-medium">{t('purchases.paid')}</th>
                <th className="text-end px-4 py-3 text-ink-muted font-medium">{t('purchases.due')}</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map(p => {
                const due = Number(p.due)
                return (
                  <tr key={p.id} className="border-b border-line last:border-0 hover:bg-page/50 transition-colors">
                    <td className="px-4 py-3 text-ink-muted tabular">{p.date}</td>
                    <td className="px-4 py-3 text-ink font-mono text-xs">{p.invoice_no || '—'}</td>
                    <td className="px-4 py-3 text-ink font-medium">{p.supplier?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-end tabular font-medium text-ink">{formatPKR(Number(p.total))}</td>
                    <td className="px-4 py-3 text-end tabular text-cash">{formatPKR(Number(p.paid))}</td>
                    <td className="px-4 py-3 text-end">
                      <span className={cn('tabular font-medium', due > 0 ? 'text-due' : 'text-cash')}>
                        {due > 0 ? formatPKR(due) : '✓'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <AnimatePresence>
        {showForm && <PurchaseForm onClose={() => setShowForm(false)} />}
      </AnimatePresence>
    </div>
  )
}

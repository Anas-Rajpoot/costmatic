import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence } from 'framer-motion'
import { Truck, Plus, Pencil, Trash2, BookOpen } from 'lucide-react'
import { useSuppliers, useDeleteSupplier } from './hooks/useSuppliers'
import SupplierDialog from './components/SupplierDialog'
import PaySupplierDialog from './components/PaySupplierDialog'
import SupplierLedger from './components/SupplierLedger'
import { formatPKR } from '@/lib/format'
import type { Supplier } from '@/types'
import { cn } from '@/lib/utils'

export default function SuppliersPage() {
  const { t } = useTranslation()
  const { data: suppliers = [], isLoading } = useSuppliers()
  const del = useDeleteSupplier()

  const [dialog, setDialog] = useState<Supplier | null | undefined>(undefined)
  const [paying, setPaying] = useState<Supplier | null>(null)
  const [ledger, setLedger] = useState<Supplier | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  async function handleDelete(id: string) {
    await del.mutateAsync(id)
    setConfirmDel(null)
  }

  const totalOwed = suppliers.reduce((s, x) => s + Number(x.current_balance), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-btn bg-brand-soft flex items-center justify-center">
            <Truck size={18} className="text-brand" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-ink">{t('suppliers.title')}</h1>
            {totalOwed > 0 && (
              <p className="text-xs text-due mt-0.5">{t('suppliers.youOwe')} {formatPKR(totalOwed)}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => setDialog(null)}
          className="flex items-center gap-2 h-9 px-4 rounded-btn bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors"
        >
          <Plus size={15} />
          {t('suppliers.add')}
        </button>
      </div>

      <div className="bg-surface rounded-card border border-line overflow-hidden">
        {isLoading ? (
          <div className="p-10 flex justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          </div>
        ) : suppliers.length === 0 ? (
          <div className="p-12 text-center">
            <Truck size={36} className="mx-auto text-ink-muted/30 mb-3" />
            <p className="text-ink-muted text-sm">{t('suppliers.noSuppliers')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-page">
                <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('suppliers.name')}</th>
                <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('suppliers.phone')}</th>
                <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('suppliers.address')}</th>
                <th className="text-end px-4 py-3 text-ink-muted font-medium">{t('suppliers.balance')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {suppliers.map(s => {
                const balance = Number(s.current_balance)
                return (
                  <tr key={s.id} className="border-b border-line last:border-0 hover:bg-page/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-ink">{s.name}</td>
                    <td className="px-4 py-3 text-ink-muted">{s.phone || '—'}</td>
                    <td className="px-4 py-3 text-ink-muted">{s.address || '—'}</td>
                    <td className="px-4 py-3 text-end">
                      {balance > 0 ? (
                        <span className="text-due font-semibold tabular">{formatPKR(balance)}</span>
                      ) : (
                        <span className="text-cash text-sm">{t('suppliers.settled')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {confirmDel === s.id ? (
                          <>
                            <button onClick={() => handleDelete(s.id)} disabled={del.isPending}
                              className="h-7 px-3 bg-due text-white rounded-btn text-xs font-medium hover:bg-due/80 disabled:opacity-60 transition-colors">
                              {t('common.confirm')}
                            </button>
                            <button onClick={() => setConfirmDel(null)}
                              className="h-7 px-3 border border-line text-ink-muted rounded-btn text-xs hover:border-brand hover:text-brand transition-colors">
                              {t('common.cancel')}
                            </button>
                          </>
                        ) : (
                          <>
                            {balance > 0 && (
                              <button onClick={() => setPaying(s)}
                                className="h-7 px-3 bg-cash text-white rounded-btn text-xs font-medium hover:bg-cash/80 transition-colors">
                                {t('suppliers.pay')}
                              </button>
                            )}
                            <button onClick={() => setLedger(s)}
                              className="p-1.5 text-ink-muted hover:text-brand hover:bg-brand-soft rounded transition-colors"
                              title={t('suppliers.viewLedger')}>
                              <BookOpen size={14} />
                            </button>
                            <button onClick={() => setDialog(s)}
                              className="p-1.5 text-ink-muted hover:text-brand hover:bg-brand-soft rounded transition-colors"
                              title={t('common.edit')}>
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => setConfirmDel(s.id)}
                              className="p-1.5 text-ink-muted hover:text-due hover:bg-due-soft rounded transition-colors"
                              title={t('common.delete')}>
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <AnimatePresence>
        {dialog !== undefined && (
          <SupplierDialog supplier={dialog} onClose={() => setDialog(undefined)} />
        )}
        {paying && <PaySupplierDialog supplier={paying} onClose={() => setPaying(null)} />}
        {ledger && <SupplierLedger supplier={ledger} onClose={() => setLedger(null)} />}
      </AnimatePresence>
    </div>
  )
}

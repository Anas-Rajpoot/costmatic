import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Search, BookOpen, Wallet, Pencil, Trash2, Users } from 'lucide-react'
import { useCustomers, useDeleteCustomer } from './hooks/useCustomers'
import { useAuth } from '@/features/auth/AuthContext'
import { formatPKR } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Customer } from '@/types'
import CustomerDialog from './components/CustomerDialog'
import PayCustomerDialog from './components/PayCustomerDialog'
import CustomerLedger from './components/CustomerLedger'

export default function CustomersPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const { data: customers = [], isLoading } = useCustomers()
  const deleteCustomer = useDeleteCustomer()

  const [search, setSearch] = useState('')
  const [dialogCustomer, setDialogCustomer] = useState<Customer | null | false>(false) // false=closed, null=create, Customer=edit
  const [payCustomer, setPayCustomer] = useState<Customer | null>(null)
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)

  const filtered = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  )

  const totalReceivable = customers.reduce((s, c) => s + Math.max(0, Number(c.current_balance)), 0)

  async function confirmDelete() {
    if (!deleteTarget) return
    await deleteCustomer.mutateAsync(deleteTarget.id)
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t('customers.title')}</h1>
          <p className="text-sm text-ink-muted mt-0.5">{t('customers.totalCustomers')}: {customers.length}</p>
        </div>
        <button
          onClick={() => setDialogCustomer(null)}
          className="h-9 px-4 bg-brand text-white rounded-btn text-sm font-semibold hover:bg-brand-dark transition-colors flex items-center gap-2"
        >
          <Plus size={16} />
          {t('customers.add')}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-card border border-line bg-surface p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center">
            <Users size={18} className="text-brand" />
          </div>
          <div>
            <div className="text-2xl font-bold text-ink tabular-nums">{customers.length}</div>
            <div className="text-xs text-ink-muted">{t('customers.totalCustomers')}</div>
          </div>
        </div>
        <div className="rounded-card border border-line bg-surface p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-due/10 flex items-center justify-center">
            <Wallet size={18} className="text-due" />
          </div>
          <div>
            <div className="text-2xl font-bold text-due tabular-nums">{formatPKR(totalReceivable)}</div>
            <div className="text-xs text-ink-muted">{t('customers.totalReceivable')}</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('products.search')}
          className="w-full h-9 rounded-input border border-line bg-surface ps-9 pe-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
        />
      </div>

      {/* Table */}
      <div className="rounded-card border border-line bg-surface overflow-x-auto">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-ink-muted text-sm">{t('customers.noCustomers')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-page">
                <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('customers.name')}</th>
                <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('customers.phone')}</th>
                <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('customers.type')}</th>
                <th className="text-end px-4 py-3 text-xs text-ink-muted font-medium">{t('customers.balance')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {filtered.map(c => {
                  const balance = Number(c.current_balance)
                  return (
                    <motion.tr
                      key={c.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-b border-line last:border-0 hover:bg-page/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                      <td className="px-4 py-3 text-ink-muted">{c.phone ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                          c.customer_type === 'wholesale'
                            ? 'bg-brand/10 text-brand'
                            : 'bg-accent/10 text-accent'
                        )}>
                          {t(`customers.${c.customer_type}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums">
                        {balance > 0 ? (
                          <span className="font-semibold text-due">{formatPKR(balance)}</span>
                        ) : balance < 0 ? (
                          <span className="text-cash text-xs">cr {formatPKR(Math.abs(balance))}</span>
                        ) : (
                          <span className="text-cash text-xs">{t('customers.settled')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setLedgerCustomer(c)}
                            title={t('customers.viewLedger')}
                            className="h-7 px-2 rounded text-ink-muted hover:text-brand hover:bg-brand/5 transition-colors text-xs flex items-center gap-1"
                          >
                            <BookOpen size={13} />
                            <span className="hidden sm:inline">{t('customers.viewLedger')}</span>
                          </button>
                          <button
                            onClick={() => setPayCustomer(c)}
                            title={t('customers.pay')}
                            className="h-7 px-2 rounded text-ink-muted hover:text-cash hover:bg-cash/5 transition-colors text-xs flex items-center gap-1"
                          >
                            <Wallet size={13} />
                            <span className="hidden sm:inline">{t('customers.pay')}</span>
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                onClick={() => setDialogCustomer(c)}
                                title={t('common.edit')}
                                className="h-7 w-7 rounded flex items-center justify-center text-ink-muted hover:text-brand hover:bg-brand/5 transition-colors"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(c)}
                                title={t('common.delete')}
                                className="h-7 w-7 rounded flex items-center justify-center text-ink-muted hover:text-due hover:bg-due/5 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {dialogCustomer !== false && (
          <CustomerDialog
            customer={dialogCustomer}
            onClose={() => setDialogCustomer(false)}
          />
        )}
        {payCustomer && (
          <PayCustomerDialog
            customer={payCustomer}
            onClose={() => setPayCustomer(null)}
          />
        )}
        {ledgerCustomer && (
          <CustomerLedger
            customer={ledgerCustomer}
            onClose={() => setLedgerCustomer(null)}
          />
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40"
              onClick={() => setDeleteTarget(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="relative bg-surface rounded-card border border-line shadow-2xl w-full max-w-sm p-5"
            >
              <h3 className="font-semibold text-ink mb-2">{t('customers.deleteConfirm')}</h3>
              <p className="text-sm text-ink-muted mb-5">{deleteTarget.name}</p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setDeleteTarget(null)}
                  className="h-9 px-4 border border-line text-ink-muted rounded-btn text-sm hover:border-brand hover:text-brand transition-colors">
                  {t('common.cancel')}
                </button>
                <button onClick={confirmDelete} disabled={deleteCustomer.isPending}
                  className="h-9 px-5 bg-due text-white rounded-btn text-sm font-semibold hover:bg-due/90 disabled:opacity-60 transition-colors">
                  {t('common.delete')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

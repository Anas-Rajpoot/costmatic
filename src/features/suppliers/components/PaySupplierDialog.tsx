import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { usePaySupplier } from '../hooks/useSuppliers'
import { useAuth } from '@/features/auth/AuthContext'
import { formatPKR } from '@/lib/format'
import type { Supplier } from '@/types'

interface Props {
  supplier: Supplier
  onClose: () => void
}

export default function PaySupplierDialog({ supplier, onClose }: Props) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const pay = usePaySupplier()

  const [amount, setAmount] = useState(String(Math.max(0, Number(supplier.current_balance))))
  const [method, setMethod] = useState('cash')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setErr('Enter a valid amount'); return }
    setErr('')
    try {
      await pay.mutateAsync({
        supplier_id: supplier.id,
        amount: amt,
        method,
        date,
        note,
        created_by: profile!.id,
      })
      onClose()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const methods = [
    { value: 'cash',      label: t('suppliers.cash') },
    { value: 'bank',      label: t('suppliers.bank') },
    { value: 'easypaisa', label: t('suppliers.easypaisa') },
    { value: 'jazzcash',  label: t('suppliers.jazzcash') },
  ]

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
        className="relative bg-surface rounded-card border border-line shadow-2xl w-full max-w-sm"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div>
            <h2 className="font-semibold text-ink">{t('suppliers.payTitle')}</h2>
            <p className="text-xs text-ink-muted mt-0.5">{supplier.name}</p>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 bg-due-soft border-b border-due/10">
          <span className="text-xs text-due font-medium">{t('suppliers.youOwe')}: </span>
          <span className="text-sm font-bold text-due tabular">{formatPKR(Number(supplier.current_balance))}</span>
        </div>

        <form onSubmit={submit} className="px-5 py-5 space-y-4">
          {err && <p className="text-due text-sm">{err}</p>}

          <div>
            <label className="block text-sm text-ink-muted mb-1.5">{t('suppliers.payAmount')}</label>
            <input
              autoFocus
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink tabular focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-ink-muted mb-1.5">{t('suppliers.payMethod')}</label>
              <select
                value={method}
                onChange={e => setMethod(e.target.value)}
                className="w-full h-10 rounded-input border border-line bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                {methods.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-ink-muted mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-ink-muted mb-1.5">{t('suppliers.payNote')}</label>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
            />
          </div>

          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose}
              className="h-9 px-4 border border-line text-ink-muted rounded-btn text-sm hover:border-brand hover:text-brand transition-colors">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={pay.isPending}
              className="h-9 px-5 bg-cash text-white rounded-btn text-sm font-semibold hover:bg-cash/80 disabled:opacity-60 transition-colors">
              {pay.isPending ? t('common.loading') : t('suppliers.pay')}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

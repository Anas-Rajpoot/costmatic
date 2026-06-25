import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { usePayCustomer } from '../hooks/useCustomers'
import { useAuth } from '@/features/auth/AuthContext'
import { formatPKR } from '@/lib/format'
import type { Customer } from '@/types'

interface Props {
  customer: Customer
  onClose: () => void
}

export default function PayCustomerDialog({ customer, onClose }: Props) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const pay = usePayCustomer()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setErr('Enter a valid amount'); return }
    setErr('')
    try {
      await pay.mutateAsync({
        customer_id: customer.id,
        amount: amt,
        date: new Date().toISOString().split('T')[0],
        note: note.trim(),
        created_by: session!.user.id,
      })
      onClose()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

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
            <h2 className="font-semibold text-ink">{t('customers.payTitle')}</h2>
            <p className="text-xs text-ink-muted mt-0.5">{customer.name}</p>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-5 space-y-4">
          {customer.current_balance > 0 && (
            <div className="py-2 px-3 bg-due/10 rounded-input border border-due/20 text-due text-sm">
              {t('customers.youAreOwed')}: <strong>{formatPKR(customer.current_balance)}</strong>
            </div>
          )}

          {err && <p className="text-due text-sm">{err}</p>}

          <div>
            <label className="block text-sm text-ink-muted mb-1.5">{t('customers.payAmount')} *</label>
            <input
              autoFocus
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink tabular focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm text-ink-muted mb-1.5">{t('customers.payNote')}</label>
            <input
              type="text"
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
              className="h-9 px-5 bg-cash text-white rounded-btn text-sm font-semibold hover:bg-cash/90 disabled:opacity-60 transition-colors">
              {pay.isPending ? '…' : t('customers.pay')}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useUpsertCustomer } from '../hooks/useCustomers'
import type { Customer } from '@/types'

interface Props {
  customer: Customer | null
  onClose: () => void
}

interface Form {
  name: string
  phone: string
  address: string
  customer_type: 'wholesale' | 'retail'
  opening_balance: string
}

const BLANK: Form = { name: '', phone: '', address: '', customer_type: 'wholesale', opening_balance: '0' }

function toForm(c: Customer): Form {
  return {
    name: c.name,
    phone: c.phone ?? '',
    address: c.address ?? '',
    customer_type: c.customer_type,
    opening_balance: String(c.opening_balance),
  }
}

export default function CustomerDialog({ customer, onClose }: Props) {
  const { t } = useTranslation()
  const upsert = useUpsertCustomer()
  const isEdit = !!customer
  const [form, setForm] = useState<Form>(customer ? toForm(customer) : BLANK)
  const [err, setErr] = useState('')

  useEffect(() => {
    setForm(customer ? toForm(customer) : BLANK)
    setErr('')
  }, [customer?.id])

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setErr(t('customers.name')); return }
    setErr('')
    try {
      await upsert.mutateAsync({
        ...(isEdit ? { id: customer!.id } : {}),
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        customer_type: form.customer_type,
        opening_balance: parseFloat(form.opening_balance) || 0,
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
        className="relative bg-surface rounded-card border border-line shadow-2xl w-full max-w-md"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-semibold text-ink">
            {isEdit ? t('customers.edit') : t('customers.add')}
          </h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-5 space-y-4">
          {err && <p className="text-due text-sm">{err}</p>}

          <div>
            <label className="block text-sm text-ink-muted mb-1.5">{t('customers.name')} *</label>
            <input
              autoFocus
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-ink-muted mb-1.5">{t('customers.phone')}</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-ink-muted mb-1.5">{t('customers.type')}</label>
              <select
                value={form.customer_type}
                onChange={e => set('customer_type', e.target.value as 'wholesale' | 'retail')}
                className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
              >
                <option value="wholesale">{t('customers.wholesale')}</option>
                <option value="retail">{t('customers.retail')}</option>
              </select>
            </div>
          </div>

          {!isEdit && (
            <div>
              <label className="block text-sm text-ink-muted mb-1.5">{t('customers.openingBalance')}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.opening_balance}
                onChange={e => set('opening_balance', e.target.value)}
                className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink tabular focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-ink-muted mb-1.5">{t('customers.address')}</label>
            <textarea
              rows={2}
              value={form.address}
              onChange={e => set('address', e.target.value)}
              className="w-full rounded-input border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors resize-none"
            />
          </div>

          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose}
              className="h-9 px-4 border border-line text-ink-muted rounded-btn text-sm hover:border-brand hover:text-brand transition-colors">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={upsert.isPending}
              className="h-9 px-5 bg-brand text-white rounded-btn text-sm font-semibold hover:bg-brand-dark disabled:opacity-60 transition-colors">
              {t('common.save')}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Trash2, Wallet, Banknote, Receipt } from 'lucide-react'
import { formatPKR } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthContext'
import {
  useExpenseCategories, useExpenses, useAddExpense, useDeleteExpense, type Expense,
} from './hooks/useExpenses'
import { PageFade, PageHeader, EmptyState } from '@/components/Page'

const today = () => new Date().toISOString().split('T')[0]
const monthStart = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
}

export default function ExpensesPage() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const ur = i18n.language === 'ur'

  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())

  // Quick-add form
  const [date, setDate] = useState(today())
  const [categoryId, setCategoryId] = useState<string>('')
  const [amount, setAmount] = useState('')
  const [isCash, setIsCash] = useState(true)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)

  const categories = useExpenseCategories()
  const list = useExpenses(from, to)
  const addExpense = useAddExpense()
  const deleteExpense = useDeleteExpense()

  const cats = categories.data ?? []
  const rows = list.data ?? []
  const total = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows])
  const cashTotal = useMemo(() => rows.filter(r => r.is_cash).reduce((s, r) => s + r.amount, 0), [rows])

  // Group by date so a month reads as days, not one long list.
  const byDate = useMemo(() => {
    const m = new Map<string, Expense[]>()
    for (const r of rows) {
      const arr = m.get(r.date) ?? []
      arr.push(r)
      m.set(r.date, arr)
    }
    return [...m.entries()]
  }, [rows])

  const catLabel = (c: { name_en: string; name_ur: string } | null) =>
    !c ? t('expenses.uncategorised') : (ur && c.name_ur ? c.name_ur : c.name_en)

  async function submit() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError(t('expenses.amountRequired')); amountRef.current?.focus(); return }
    setError('')
    try {
      await addExpense.mutateAsync({
        date, category_id: categoryId || null, amount: amt, is_cash: isCash, note: note.trim() || null,
      })
      setAmount(''); setNote('')
      amountRef.current?.focus()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <PageFade className="flex flex-col gap-4 max-w-5xl">
      <PageHeader title={t('expenses.title')} subtitle={t('expenses.subtitle')} actions={
        <div className="flex items-center gap-2 text-sm">
          <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
            className="h-9 rounded-input border border-line bg-surface px-2 text-ink focus:outline-none focus:ring-2 focus:ring-brand" />
          <span className="text-ink-muted">→</span>
          <input type="date" value={to} min={from} max={today()} onChange={e => setTo(e.target.value)}
            className="h-9 rounded-input border border-line bg-surface px-2 text-ink focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
      } />

      {/* ── Quick add ── */}
      <div className="rounded-card border border-line bg-surface p-4 flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t('expenses.addTitle')}</h2>

        {/* Category chips — one tap, no dropdown */}
        <div className="flex flex-wrap gap-1.5">
          {cats.map(c => (
            <button
              key={c.id}
              onClick={() => { setCategoryId(id => id === c.id ? '' : c.id); amountRef.current?.focus() }}
              className={cn(
                'h-8 px-3 rounded-btn border text-sm transition-colors',
                categoryId === c.id
                  ? 'bg-brand text-white border-brand'
                  : 'bg-page border-line text-ink hover:border-brand',
              )}
            >
              {ur && c.name_ur ? c.name_ur : c.name_en}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-ink-muted mb-1">{t('expenses.date')}</label>
            <input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)}
              className="h-10 rounded-input border border-line bg-page px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">{t('expenses.amount')}</label>
            <input
              ref={amountRef} type="number" min={0} step={1} value={amount} autoFocus
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
              placeholder="0"
              className="h-10 w-32 rounded-input border border-line bg-page px-3 text-base font-semibold tabular-nums text-ink focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div className="flex rounded-input border border-line overflow-hidden h-10">
            {([true, false] as const).map(cash => (
              <button
                key={String(cash)}
                onClick={() => setIsCash(cash)}
                className={cn(
                  'px-3 text-sm font-medium transition-colors flex items-center gap-1.5',
                  isCash === cash ? 'bg-brand text-white' : 'bg-page text-ink-muted hover:text-brand',
                )}
              >
                {cash ? <Banknote size={14} /> : <Wallet size={14} />}
                {cash ? t('expenses.cash') : t('expenses.bank')}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-xs text-ink-muted mb-1">{t('expenses.note')}</label>
            <input
              value={note} onChange={e => setNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
              placeholder={t('expenses.notePlaceholder')}
              className="w-full h-10 rounded-input border border-line bg-page px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <button
            onClick={submit}
            disabled={addExpense.isPending}
            className="h-10 px-5 rounded-input bg-brand text-white font-semibold text-sm hover:bg-brand/90 disabled:opacity-40 transition-colors flex items-center gap-1.5"
          >
            <Plus size={16} />
            {t('common.add')}
          </button>
        </div>
        {error && <p className="text-sm text-due">{error}</p>}
      </div>

      {/* ── Totals ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-card border border-line bg-surface p-4">
          <div className="text-xs text-ink-muted uppercase tracking-wide">{t('expenses.periodTotal')}</div>
          <div className="text-2xl font-bold text-ink tabular-nums mt-1">{formatPKR(total)}</div>
        </div>
        <div className="rounded-card border border-line bg-surface p-4">
          <div className="text-xs text-ink-muted uppercase tracking-wide">{t('expenses.cashOut')}</div>
          <div className="text-2xl font-bold text-due tabular-nums mt-1">{formatPKR(cashTotal)}</div>
        </div>
        <div className="rounded-card border border-line bg-surface p-4">
          <div className="text-xs text-ink-muted uppercase tracking-wide">{t('expenses.entries')}</div>
          <div className="text-2xl font-bold text-ink tabular-nums mt-1">{rows.length}</div>
        </div>
      </div>

      {/* ── List ── */}
      <div className="rounded-card border border-line bg-surface overflow-hidden">
        {list.isLoading ? (
          <p className="p-4 text-sm text-ink-muted">{t('common.loading')}</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Receipt size={28} />} title={t('expenses.empty')} hint={t('expenses.emptyHint')} />
        ) : (
          byDate.map(([d, items]) => (
            <div key={d}>
              <div className="px-4 py-2 bg-page border-y border-line flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                  {new Date(d).toLocaleDateString('en-PK', { weekday: 'short', day: '2-digit', month: 'short' })}
                </span>
                <span className="text-xs font-semibold text-ink tabular-nums">
                  {formatPKR(items.reduce((s, r) => s + r.amount, 0))}
                </span>
              </div>
              <AnimatePresence initial={false}>
                {items.map(r => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-4 py-2.5 border-b border-line last:border-0 flex items-center gap-3"
                  >
                    <span className="text-sm font-medium text-ink min-w-0 truncate">
                      {catLabel(r.category)}
                    </span>
                    {r.note && <span className="text-xs text-ink-muted truncate">{r.note}</span>}
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full shrink-0',
                      r.is_cash ? 'bg-due/10 text-due' : 'bg-brand/10 text-brand',
                    )}>
                      {r.is_cash ? t('expenses.cash') : t('expenses.bank')}
                    </span>
                    <span className="ms-auto tabular-nums font-semibold text-ink shrink-0">
                      {formatPKR(r.amount)}
                    </span>
                    {isAdmin && (
                      <button
                        onClick={() => deleteExpense.mutate(r.id)}
                        title={t('common.delete')}
                        className="w-8 h-8 rounded-btn flex items-center justify-center text-ink-muted/60 hover:text-due hover:bg-due/10 transition-colors shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ))
        )}
      </div>
    </PageFade>
  )
}

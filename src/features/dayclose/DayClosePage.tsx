import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Lock, Printer, CheckCircle2 } from 'lucide-react'
import { formatPKR, round2 } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSettings } from '@/features/settings/hooks/useSettings'
import { useAuth } from '@/features/auth/AuthContext'
import { printDayClose, type ShopInfo } from '@/lib/receipt'
import { useDaySummary, useCloseDay, useRecentCloses } from './hooks/useDayClose'
import { PageFade, PageHeader } from '@/components/Page'

/** Pakistani currency notes + the coins worth counting. */
const DENOMS = [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1]

const today = () => new Date().toISOString().split('T')[0]

function Row({ label, value, tone, strong }: {
  label: string; value: number; tone?: 'cash' | 'due' | 'muted'; strong?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between py-1.5', strong && 'font-bold')}>
      <span className={cn('text-sm', tone === 'muted' ? 'text-ink-muted' : 'text-ink')}>{label}</span>
      <span className={cn(
        'tabular-nums',
        strong ? 'text-2xl' : 'text-sm',
        tone === 'cash' ? 'text-cash' : tone === 'due' ? 'text-due' : 'text-ink',
      )}>
        {formatPKR(value)}
      </span>
    </div>
  )
}

export default function DayClosePage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { data: settings = {} } = useSettings()
  const [date, setDate] = useState(today())
  const [counts, setCounts] = useState<Record<number, string>>({})
  const [manual, setManual] = useState('')      // typed straight into "counted"
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const countedRef = useRef<HTMLInputElement>(null)

  const summary = useDaySummary(date)
  const closeDay = useCloseDay()
  const recent = useRecentCloses()
  const s = summary.data

  const shop: ShopInfo = {
    name: settings.shop_name || 'Costmatic',
    address: settings.shop_address || '',
    phone: settings.shop_phone || '',
    footer: settings.receipt_footer || '',
    widthMm: settings.receipt_width === '58' ? 58 : 80,
  }

  // Counting the notes fills the total; typing a total overrides the notes.
  const notesTotal = useMemo(
    () => DENOMS.reduce((sum, d) => sum + d * (parseInt(counts[d] ?? '', 10) || 0), 0),
    [counts],
  )
  const counted = manual.trim() !== '' ? Math.max(parseFloat(manual) || 0, 0) : notesTotal
  const expected = s?.expected_cash ?? 0
  const difference = round2(counted - expected)

  useEffect(() => {
    if (s?.closed && s.note && note === '') setNote(s.note)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.closed])

  async function submit() {
    if (!s) return
    setError('')
    try {
      const res = await closeDay.mutateAsync({ date, counted, note: note.trim() || null })
      printDayClose({
        date: res.date,
        opening_cash: res.opening_cash,
        cash_sales: res.cash_sales,
        khata_collected: res.khata_collected,
        returns_cash: res.returns_cash,
        supplier_paid: res.supplier_paid,
        purchases_cash: res.purchases_cash,
        expenses_cash: res.expenses_cash,
        expected_cash: res.expected_cash,
        counted_cash: res.counted_cash ?? counted,
        difference: res.difference ?? difference,
        invoices: res.invoices,
        sales_total: res.sales_total,
        udhaar_given: res.udhaar_given,
        note: res.note,
        closed_by: profile?.full_name ?? null,
      }, shop)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <PageFade className="flex flex-col gap-4 max-w-5xl">
      <PageHeader title={t('dayClose.title')} subtitle={t('dayClose.subtitle')} actions={<>
        <input
          type="date"
          value={date}
          max={today()}
          onChange={e => { setDate(e.target.value); setCounts({}); setManual(''); setNote('') }}
          className="h-9 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
        />
        {s?.closed && (
          <span className="flex items-center gap-1.5 text-sm text-cash font-medium">
            <CheckCircle2 size={16} />
            {t('dayClose.alreadyClosed')}
          </span>
        )}
      </>} />

      {summary.isLoading && <p className="text-ink-muted text-sm">{t('common.loading')}</p>}

      {s && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* ── What the drawer should hold ── */}
          <div className="rounded-card border border-line bg-surface p-4">
            <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">
              {t('dayClose.cashIn')}
            </h2>
            <Row label={t('dayClose.opening')} value={s.opening_cash} />
            <Row label={t('dayClose.cashSales')} value={s.cash_sales} tone="cash" />
            <Row label={t('dayClose.khataCollected')} value={s.khata_collected} tone="cash" />

            <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mt-4 mb-2">
              {t('dayClose.cashOut')}
            </h2>
            <Row label={t('dayClose.returnsCash')} value={s.returns_cash} tone="due" />
            <Row label={t('dayClose.supplierPaid')} value={s.supplier_paid} tone="due" />
            <Row label={t('dayClose.purchasesCash')} value={s.purchases_cash} tone="due" />
            <Row label={t('dayClose.expensesCash')} value={s.expenses_cash} tone="due" />

            <div className="border-t border-line mt-3 pt-2">
              <Row label={t('dayClose.expected')} value={s.expected_cash} strong />
            </div>

            <div className="mt-4 pt-3 border-t border-line grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-xs text-ink-muted">{t('dayClose.bills')}</div>
                <div className="font-bold text-ink tabular-nums">{s.invoices}</div>
              </div>
              <div>
                <div className="text-xs text-ink-muted">{t('dayClose.salesTotal')}</div>
                <div className="font-bold text-ink tabular-nums">{formatPKR(s.sales_total)}</div>
              </div>
              <div>
                <div className="text-xs text-ink-muted">{t('dayClose.udhaarGiven')}</div>
                <div className="font-bold text-due tabular-nums">{formatPKR(s.udhaar_given)}</div>
              </div>
            </div>
          </div>

          {/* ── What is actually in it ── */}
          <div className="rounded-card border border-line bg-surface p-4 flex flex-col">
            <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">
              {t('dayClose.countDrawer')}
            </h2>

            {/* Note counter — no calculator needed */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {DENOMS.map(d => {
                const n = parseInt(counts[d] ?? '', 10) || 0
                return (
                  <label key={d} className="flex items-center gap-2">
                    <span className="w-12 text-sm text-ink-muted tabular-nums text-end">{d}</span>
                    <span className="text-ink-muted text-xs">×</span>
                    <input
                      type="number"
                      min={0}
                      value={counts[d] ?? ''}
                      onChange={e => { setCounts(c => ({ ...c, [d]: e.target.value })); setManual('') }}
                      placeholder="0"
                      className="w-16 h-8 rounded-input border border-line bg-page px-2 text-sm text-center tabular-nums text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                    <span className="text-xs text-ink-muted tabular-nums ms-auto">
                      {n > 0 ? formatPKR(d * n) : ''}
                    </span>
                  </label>
                )
              })}
            </div>

            <div className="mt-3 pt-3 border-t border-line">
              <label className="text-xs text-ink-muted">{t('dayClose.countedTotal')}</label>
              <input
                ref={countedRef}
                type="number"
                min={0}
                value={manual !== '' ? manual : (notesTotal || '')}
                onChange={e => setManual(e.target.value)}
                placeholder="0"
                className="w-full h-14 rounded-input border border-line bg-page px-3 text-3xl font-bold tabular-nums text-ink focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>

            {/* Over / short */}
            <div className={cn(
              'mt-3 rounded-input border px-3 py-3 flex items-center justify-between',
              difference === 0 ? 'bg-cash/10 border-cash/25'
                : difference < 0 ? 'bg-due/10 border-due/25' : 'bg-low/10 border-low/30',
            )}>
              <span className={cn(
                'text-sm font-semibold uppercase tracking-wide',
                difference === 0 ? 'text-cash' : difference < 0 ? 'text-due' : 'text-low',
              )}>
                {difference === 0 ? t('dayClose.tallies') : difference < 0 ? t('dayClose.short') : t('dayClose.over')}
              </span>
              <span className={cn(
                'text-3xl font-bold tabular-nums',
                difference === 0 ? 'text-cash' : difference < 0 ? 'text-due' : 'text-low',
              )}>
                {formatPKR(Math.abs(difference))}
              </span>
            </div>

            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={t('dayClose.notePlaceholder')}
              className="mt-3 h-9 rounded-input border border-line bg-page px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
            />

            {error && <p className="mt-2 text-sm text-due">{error}</p>}

            <button
              onClick={submit}
              disabled={closeDay.isPending}
              className="mt-3 h-12 rounded-card bg-brand text-white font-bold hover:bg-brand/90 active:scale-[0.99] disabled:opacity-40 transition-all flex items-center justify-center gap-2"
            >
              <Lock size={16} />
              {closeDay.isPending ? t('pos.completing') : s.closed ? t('dayClose.recloseAndPrint') : t('dayClose.closeAndPrint')}
            </button>

            {s.closed && s.closed_at && (
              <p className="mt-2 text-xs text-ink-muted text-center">
                {t('dayClose.closedAt', { time: new Date(s.closed_at).toLocaleString('en-PK') })}
                {s.difference != null && ` · ${formatPKR(Math.abs(s.difference))} ${s.difference < 0 ? t('dayClose.short') : s.difference > 0 ? t('dayClose.over') : ''}`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── History ── */}
      {(recent.data?.length ?? 0) > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-card border border-line bg-surface overflow-hidden"
        >
          <div className="px-4 py-2.5 border-b border-line flex items-center justify-between">
            <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
              {t('dayClose.history')}
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-ink-muted uppercase tracking-wide bg-page">
              <tr>
                <th className="text-start px-4 py-2 font-medium">{t('reports.date')}</th>
                <th className="text-end px-4 py-2 font-medium">{t('dayClose.expected')}</th>
                <th className="text-end px-4 py-2 font-medium">{t('dayClose.countedTotal')}</th>
                <th className="text-end px-4 py-2 font-medium">{t('dayClose.difference')}</th>
              </tr>
            </thead>
            <tbody>
              {recent.data!.map(r => (
                <tr key={r.date} className="border-t border-line">
                  <td className="px-4 py-2 text-ink">{new Date(r.date).toLocaleDateString('en-PK')}</td>
                  <td className="px-4 py-2 text-end tabular-nums text-ink-muted">{formatPKR(r.expected_cash)}</td>
                  <td className="px-4 py-2 text-end tabular-nums text-ink">{formatPKR(r.counted_cash)}</td>
                  <td className={cn(
                    'px-4 py-2 text-end tabular-nums font-medium',
                    r.difference === 0 ? 'text-cash' : r.difference < 0 ? 'text-due' : 'text-low',
                  )}>
                    {r.difference === 0 ? '—' : (r.difference > 0 ? '+' : '−') + formatPKR(Math.abs(r.difference))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-line text-xs text-ink-muted flex items-center gap-1.5">
            <Printer size={12} />
            {t('dayClose.printHint')}
          </div>
        </motion.div>
      )}
    </PageFade>
  )
}

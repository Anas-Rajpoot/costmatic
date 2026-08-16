import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { useSalesByDay, useItemSales, usePeriodProfit, useSalesSplit, type SaleTypeFilter } from './hooks/useReports'
import { useCustomers } from '@/features/customers/hooks/useCustomers'
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers'
import { useProducts } from '@/features/products/hooks/useProducts'
import { useAuth } from '@/features/auth/AuthContext'
import { useReturnsReport, usePeriodReturnsMargin } from './hooks/useReturnsReport'
import { usePeriodExpenses } from '@/features/expenses/hooks/useExpenses'
import { formatPKR, formatQty, unitShort } from '@/lib/format'
import { downloadCSV } from '@/lib/exportCSV'
import { cn } from '@/lib/utils'

type Tab = 'sales' | 'items' | 'returns' | 'expenses' | 'receivables' | 'payables' | 'lowstock'

function monthStart() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
}
function today() { return new Date().toISOString().split('T')[0] }

function Spinner() {
  return (
    <div className="p-12 flex justify-center">
      <div className="w-7 h-7 rounded-full border-2 border-brand border-t-transparent animate-spin" />
    </div>
  )
}

export default function ReportsPage() {
  const { t, i18n } = useTranslation()
  const isUrdu = i18n.language === 'ur'
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [activeTab, setActiveTab] = useState<Tab>('sales')
  const [saleType, setSaleType] = useState<'all' | 'retail' | 'wholesale'>('all')
  const saleTypeParam: SaleTypeFilter = saleType === 'all' ? null : saleType

  const salesQuery   = useSalesByDay(from, to, saleTypeParam)
  const itemsQuery   = useItemSales(from, to, saleTypeParam)
  const profitQuery  = usePeriodProfit(from, to, saleTypeParam)
  const splitQuery   = useSalesSplit(from, to)
  const returnsQuery = useReturnsReport(from, to)
  const returnsMarginQuery = usePeriodReturnsMargin(from, to, saleTypeParam, isAdmin)
  const expensesQuery = usePeriodExpenses(from, to, isAdmin)
  const { data: customers = [] } = useCustomers()
  const { data: suppliers = [] } = useSuppliers()
  const { data: products = [] } = useProducts()
  const split = splitQuery.data

  const salesRows    = salesQuery.data ?? []
  const itemRows     = itemsQuery.data ?? []
  const profitTotal  = profitQuery.data ?? 0

  const returnRows   = returnsQuery.data ?? []
  const returnsTotal = returnRows.reduce((s, r) => s + r.total, 0)
  const expenses     = expensesQuery.data
  const expensesTotal = expenses?.total ?? 0
  // Only the margin on returned goods is lost — the stock itself came back, so
  // its cost is recovered. Deducting the refunded value here would overstate
  // the loss by exactly the cost of the goods.
  const returnsMargin = returnsMarginQuery.data ?? 0
  const netProfit    = profitTotal - returnsMargin - expensesTotal

  const salesGrandTotal = salesRows.reduce((s, r) => s + r.day_total, 0)
  const salesGrandCash  = salesRows.reduce((s, r) => s + r.cash_total, 0)
  const salesGrandUdh   = salesRows.reduce((s, r) => s + r.udhaar_total, 0)

  const receivables = customers
    .filter(c => Number(c.current_balance) > 0)
    .sort((a, b) => Number(b.current_balance) - Number(a.current_balance))

  const payables = suppliers
    .filter(s => Number(s.current_balance) > 0)
    .sort((a, b) => Number(b.current_balance) - Number(a.current_balance))

  const lowStockItems = products
    .filter(p => p.is_active && (p.stock?.[0]?.quantity_in_base_unit ?? 0) <= p.min_stock_level)
    .sort((a, b) => (a.stock?.[0]?.quantity_in_base_unit ?? 0) - (b.stock?.[0]?.quantity_in_base_unit ?? 0))

  const TABS: { id: Tab; label: string }[] = [
    { id: 'sales',       label: t('reports.tabSales') },
    { id: 'items',       label: t('reports.tabItems') },
    { id: 'returns',     label: t('reports.tabReturns') },
    ...(isAdmin ? [{ id: 'expenses' as Tab, label: t('reports.tabExpenses') }] : []),
    { id: 'receivables', label: t('reports.tabReceivables') },
    { id: 'payables',    label: t('reports.tabPayables') },
    { id: 'lowstock',    label: t('reports.tabLowStock') },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-bold text-ink">{t('reports.title')}</h1>

      {/* Date range */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-ink-muted mb-1">{t('reports.dateFrom')}</label>
          <input
            type="date"
            value={from}
            max={to}
            onChange={e => setFrom(e.target.value)}
            className="h-9 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">{t('reports.dateTo')}</label>
          <input
            type="date"
            value={to}
            min={from}
            max={today()}
            onChange={e => setTo(e.target.value)}
            className="h-9 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        </div>
        <div className="text-xs text-ink-muted ps-1 pb-1">
          {t('reports.period')}: {from} → {to}
        </div>

        {/* Retail / Wholesale filter (defaults to All = combined) */}
        <div className="flex items-center gap-2 ms-auto">
          <span className="text-xs text-ink-muted">{t('reports.saleType')}</span>
          <div className="inline-flex rounded-input border border-line overflow-hidden">
            {(['all', 'retail', 'wholesale'] as const).map(m => (
              <button
                key={m}
                onClick={() => setSaleType(m)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  saleType === m ? 'bg-brand text-white' : 'bg-surface text-ink-muted hover:text-ink'
                )}
              >
                {t(`reports.${m}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Retail vs Wholesale split (always shows both, for the owner) */}
      {activeTab === 'sales' && split && (split.retail_count > 0 || split.wholesale_count > 0) && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-card border border-line bg-surface p-3">
            <p className="text-xs text-ink-muted mb-1">
              {t('reports.retailSales')} · {split.retail_count}
            </p>
            <p className="text-xl font-bold text-ink tabular-nums">{formatPKR(split.retail_total)}</p>
          </div>
          <div className="rounded-card border border-line bg-surface p-3">
            <p className="text-xs text-ink-muted mb-1">
              {t('reports.wholesaleSales')} · {split.wholesale_count}
            </p>
            <p className="text-xl font-bold text-ink tabular-nums">{formatPKR(split.wholesale_total)}</p>
          </div>
        </div>
      )}

      {/* Summary strip for sales tab */}
      {activeTab === 'sales' && salesRows.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-card border border-line bg-surface p-3 text-center">
            <p className="text-xs text-ink-muted mb-1">{t('reports.total')}</p>
            <p className="text-xl font-bold text-ink tabular-nums">{formatPKR(salesGrandTotal)}</p>
          </div>
          <div className="rounded-card border border-line bg-surface p-3 text-center">
            <p className="text-xs text-ink-muted mb-1">{t('reports.cashTotal')}</p>
            <p className="text-xl font-bold text-cash tabular-nums">{formatPKR(salesGrandCash)}</p>
          </div>
          <div className="rounded-card border border-line bg-surface p-3 text-center">
            <p className="text-xs text-ink-muted mb-1">{t('reports.udhaarTotal')}</p>
            <p className="text-xl font-bold text-due tabular-nums">{formatPKR(salesGrandUdh)}</p>
          </div>
          {isAdmin && (
            /* Gross margin, then what actually leaves the shop: goods that came
               back and the money spent running the place. */
            <div className="col-span-3 rounded-card border border-line bg-brand/5 p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">{t('reports.profit')}</span>
                <span className="tabular-nums text-ink font-medium">{formatPKR(profitTotal)}</span>
              </div>
              {returnsMargin !== 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-muted">− {t('reports.returnsMargin')}</span>
                  <span className="tabular-nums text-due">{formatPKR(returnsMargin)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">− {t('reports.tabExpenses')}</span>
                <span className="tabular-nums text-due">{formatPKR(expensesTotal)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-1.5 mt-0.5">
                <span className="text-sm font-medium text-ink">{t('reports.netProfit')}</span>
                <span className={cn('text-xl font-bold tabular-nums', netProfit >= 0 ? 'text-brand' : 'text-due')}>
                  {formatPKR(netProfit)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs + table */}
      <div className="rounded-card border border-line bg-surface overflow-x-auto">
        <div className="flex items-center border-b border-line overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-3 text-sm font-medium shrink-0 transition-colors border-b-2 -mb-px',
                activeTab === tab.id
                  ? 'text-brand border-brand'
                  : 'text-ink-muted border-transparent hover:text-ink'
              )}
            >
              {tab.label}
            </button>
          ))}
          <div className="ms-auto pe-3">
            <button
              onClick={() => {
                if (activeTab === 'sales')
                  downloadCSV(salesRows.map(r => ({ Date: r.sale_date, Invoices: r.invoice_count, Cash: r.cash_total, Udhaar: r.udhaar_total, Total: r.day_total })), `sales-${from}-${to}`)
                else if (activeTab === 'items')
                  downloadCSV(itemRows.map(r => ({ Product: r.product_name, Unit: r.unit_name, QtySold: r.total_qty, Revenue: r.revenue })), `items-${from}-${to}`)
                else if (activeTab === 'returns')
                  downloadCSV(returnRows.map(r => ({ Date: r.date, Return: r.return_no, Bill: r.sale?.invoice_no ?? '', Customer: r.customer?.name ?? '', Items: r.item_count, Refund: r.refund_mode, Total: r.total })), `returns-${from}-${to}`)
                else if (activeTab === 'expenses')
                  downloadCSV((expenses?.by_category ?? []).map(c => ({ Category: c.category, Entries: c.count, Total: c.total })), `expenses-${from}-${to}`)
                else if (activeTab === 'receivables')
                  downloadCSV(receivables.map(c => ({ Customer: c.name, Phone: c.phone ?? '', Balance: c.current_balance })), `receivables-${from}-${to}`)
                else if (activeTab === 'payables')
                  downloadCSV(payables.map(s => ({ Supplier: s.name, Phone: s.phone ?? '', Balance: s.current_balance })), `payables-${from}-${to}`)
                else if (activeTab === 'lowstock')
                  downloadCSV(lowStockItems.map(p => ({ Product: p.name_en, Stock: p.stock?.[0]?.quantity_in_base_unit ?? 0, MinStock: p.min_stock_level })), `low-stock-${from}-${to}`)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-input border border-line text-xs text-ink-muted hover:text-brand hover:border-brand transition-colors"
            >
              <Download size={13} />
              {t('reports.exportCSV')}
            </button>
          </div>
        </div>

        {/* ── Sales by Day ── */}
        {activeTab === 'sales' && (
          salesQuery.isLoading ? <Spinner /> :
          salesRows.length === 0 ? <p className="p-10 text-center text-sm text-ink-muted">{t('reports.noData')}</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-page">
                  <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.date')}</th>
                  <th className="text-end px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.invoices')}</th>
                  <th className="text-end px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.cashTotal')}</th>
                  <th className="text-end px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.udhaarTotal')}</th>
                  <th className="text-end px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.total')}</th>
                </tr>
              </thead>
              <tbody>
                {salesRows.map(r => (
                  <tr key={r.sale_date} className="border-b border-line last:border-0 hover:bg-page/50 transition-colors">
                    <td className="px-4 py-3 text-ink font-medium">{r.sale_date}</td>
                    <td className="px-4 py-3 text-end text-ink-muted tabular-nums">{r.invoice_count}</td>
                    <td className="px-4 py-3 text-end text-cash tabular-nums">{formatPKR(r.cash_total)}</td>
                    <td className="px-4 py-3 text-end text-due tabular-nums">{formatPKR(r.udhaar_total)}</td>
                    <td className="px-4 py-3 text-end font-semibold tabular-nums text-ink">{formatPKR(r.day_total)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line bg-page font-bold">
                  <td className="px-4 py-3 text-ink">{t('reports.grandTotal')}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-ink-muted">
                    {salesRows.reduce((s, r) => s + r.invoice_count, 0)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums text-cash">{formatPKR(salesGrandCash)}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-due">{formatPKR(salesGrandUdh)}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-ink">{formatPKR(salesGrandTotal)}</td>
                </tr>
              </tbody>
            </table>
          )
        )}

        {/* ── Item-wise ── */}
        {activeTab === 'items' && (
          itemsQuery.isLoading ? <Spinner /> :
          itemRows.length === 0 ? <p className="p-10 text-center text-sm text-ink-muted">{t('reports.noData')}</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-page">
                  <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.product')}</th>
                  <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.unit')}</th>
                  <th className="text-end px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.qtySold')}</th>
                  <th className="text-end px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.revenue')}</th>
                </tr>
              </thead>
              <tbody>
                {itemRows.map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0 hover:bg-page/50 transition-colors">
                    <td className="px-4 py-3 text-ink font-medium">{r.product_name}</td>
                    <td className="px-4 py-3 text-ink-muted capitalize">{r.unit_name}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-ink">{formatQty(r.total_qty)}</td>
                    <td className="px-4 py-3 text-end font-semibold tabular-nums text-ink">{formatPKR(r.revenue)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line bg-page font-bold">
                  <td colSpan={3} className="px-4 py-3 text-ink">{t('reports.grandTotal')}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-ink">
                    {formatPKR(itemRows.reduce((s, r) => s + r.revenue, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          )
        )}

        {/* ── Returns ── */}
        {activeTab === 'returns' && (
          returnsQuery.isLoading ? <Spinner /> :
          returnRows.length === 0 ? <p className="p-10 text-center text-sm text-ink-muted">{t('reports.noData')}</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-page">
                  <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.date')}</th>
                  <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.returnNo')}</th>
                  <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.againstBill')}</th>
                  <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.customer')}</th>
                  <th className="text-end px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.itemsCount')}</th>
                  <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.refundMode')}</th>
                  <th className="text-end px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.total')}</th>
                </tr>
              </thead>
              <tbody>
                {returnRows.map(r => (
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-page/50 transition-colors">
                    <td className="px-4 py-3 text-ink-muted">{new Date(r.date).toLocaleDateString('en-PK')}</td>
                    <td className="px-4 py-3 font-medium text-ink">{r.return_no}</td>
                    <td className="px-4 py-3 text-ink-muted">{r.sale?.invoice_no ?? '—'}</td>
                    <td className="px-4 py-3 text-ink">{r.customer?.name ?? t('pos.walkIn')}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-ink-muted">{r.item_count}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full',
                        r.refund_mode === 'cash' ? 'bg-cash/10 text-cash' : 'bg-due/10 text-due',
                      )}>
                        {r.refund_mode === 'cash' ? t('returns.cash') : t('returns.khata')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end font-semibold tabular-nums text-due">{formatPKR(r.total)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line bg-page font-bold">
                  <td className="px-4 py-3 text-ink" colSpan={6}>{t('reports.grandTotal')}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-due">{formatPKR(returnsTotal)}</td>
                </tr>
              </tbody>
            </table>
          )
        )}

        {/* ── Expenses (admin) ── */}
        {activeTab === 'expenses' && isAdmin && (
          expensesQuery.isLoading ? <Spinner /> :
          (expenses?.by_category.length ?? 0) === 0
            ? <p className="p-10 text-center text-sm text-ink-muted">{t('reports.noData')}</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-page">
                  <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.category')}</th>
                  <th className="text-end px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.entries')}</th>
                  <th className="text-end px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.total')}</th>
                </tr>
              </thead>
              <tbody>
                {expenses!.by_category.map(c => (
                  <tr key={c.category} className="border-b border-line last:border-0 hover:bg-page/50 transition-colors">
                    <td className="px-4 py-3 text-ink font-medium">
                      {isUrdu && c.category_ur ? c.category_ur : c.category}
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums text-ink-muted">{c.count}</td>
                    <td className="px-4 py-3 text-end font-semibold tabular-nums text-due">{formatPKR(c.total)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line bg-page font-bold">
                  <td className="px-4 py-3 text-ink" colSpan={2}>{t('reports.grandTotal')}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-due">{formatPKR(expensesTotal)}</td>
                </tr>
              </tbody>
            </table>
          )
        )}

        {/* ── Receivables ── */}
        {activeTab === 'receivables' && (
          receivables.length === 0 ? <p className="p-10 text-center text-sm text-ink-muted">{t('reports.noData')}</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-page">
                  <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.customer')}</th>
                  <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('customers.phone')}</th>
                  <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('customers.type')}</th>
                  <th className="text-end px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.balance')}</th>
                </tr>
              </thead>
              <tbody>
                {receivables.map(c => (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-page/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                    <td className="px-4 py-3 text-ink-muted">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 capitalize text-ink-muted">{c.customer_type}</td>
                    <td className="px-4 py-3 text-end font-semibold tabular-nums text-due">
                      {formatPKR(Number(c.current_balance))}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line bg-page font-bold">
                  <td colSpan={3} className="px-4 py-3 text-ink">{t('reports.grandTotal')}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-due">
                    {formatPKR(receivables.reduce((s, c) => s + Number(c.current_balance), 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          )
        )}

        {/* ── Payables ── */}
        {activeTab === 'payables' && (
          payables.length === 0 ? <p className="p-10 text-center text-sm text-ink-muted">{t('reports.noData')}</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-page">
                  <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.supplier')}</th>
                  <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('suppliers.phone')}</th>
                  <th className="text-end px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.balance')}</th>
                </tr>
              </thead>
              <tbody>
                {payables.map(s => (
                  <tr key={s.id} className="border-b border-line last:border-0 hover:bg-page/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-ink">{s.name}</td>
                    <td className="px-4 py-3 text-ink-muted">{s.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-end font-semibold tabular-nums text-low">
                      {formatPKR(Number(s.current_balance))}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line bg-page font-bold">
                  <td colSpan={2} className="px-4 py-3 text-ink">{t('reports.grandTotal')}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-low">
                    {formatPKR(payables.reduce((s, x) => s + Number(x.current_balance), 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          )
        )}

        {/* ── Low Stock ── */}
        {activeTab === 'lowstock' && (
          lowStockItems.length === 0 ? (
            <p className="p-10 text-center text-sm text-ink-muted">{t('dashboard.noLowStock')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-page">
                  <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('products.title')}</th>
                  <th className="text-start px-4 py-3 text-xs text-ink-muted font-medium">{t('products.category')}</th>
                  <th className="text-end px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.stockLevel')}</th>
                  <th className="text-end px-4 py-3 text-xs text-ink-muted font-medium">{t('reports.minStock')}</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.map(p => {
                  const qty = Number(p.stock?.[0]?.quantity_in_base_unit ?? 0)
                  return (
                    <tr key={p.id} className="border-b border-line last:border-0 hover:bg-page/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-ink">{p.name_en}</td>
                      <td className="px-4 py-3 text-ink-muted">{p.category?.name_en ?? '—'}</td>
                      <td className="px-4 py-3 text-end font-bold tabular-nums text-low">{formatQty(qty)} {unitShort(p.base_unit)}</td>
                      <td className="px-4 py-3 text-end tabular-nums text-ink-muted">{p.min_stock_level}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import { ShoppingBag, Wallet, TrendingUp, AlertTriangle, DollarSign, Users, Truck } from 'lucide-react'
import { useDashboardStats, useTodayProfit, useRecentSales } from './hooks/useDashboardStats'
import { useProducts } from '@/features/products/hooks/useProducts'
import { useAuth } from '@/features/auth/AuthContext'
import { formatPKR } from '@/lib/format'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string
  sub?: string
  icon: React.ElementType
  color?: 'brand' | 'cash' | 'due' | 'low' | 'default'
  loading?: boolean
}

function StatCard({ title, value, sub, icon: Icon, color = 'default', loading }: StatCardProps) {
  const colorMap = {
    brand:   { bg: 'bg-brand/10', text: 'text-brand',    icon: 'text-brand' },
    cash:    { bg: 'bg-cash/10',  text: 'text-cash',     icon: 'text-cash' },
    due:     { bg: 'bg-due/10',   text: 'text-due',      icon: 'text-due' },
    low:     { bg: 'bg-low/10',   text: 'text-low',      icon: 'text-low' },
    default: { bg: 'bg-brand/5',  text: 'text-ink',      icon: 'text-ink-muted' },
  }
  const c = colorMap[color]

  return (
    <div className="rounded-card border border-line bg-surface p-3 md:p-4 flex items-start gap-2 md:gap-3">
      <div className={cn('w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center shrink-0', c.bg)}>
        <Icon size={16} className={c.icon} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] md:text-xs text-ink-muted font-medium uppercase tracking-wide leading-tight">{title}</p>
        {loading ? (
          <div className="h-6 w-20 bg-line animate-pulse rounded mt-1" />
        ) : (
          <p className={cn('text-lg md:text-2xl font-bold tabular-nums leading-tight mt-0.5', c.text)}>{value}</p>
        )}
        {sub && <p className="text-[10px] md:text-xs text-ink-muted mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: profit, isLoading: profitLoading } = useTodayProfit()
  const { data: recentSales = [], isLoading: salesLoading } = useRecentSales()
  const { data: products = [] } = useProducts()

  const lowStockItems = products.filter(p => {
    const qty = p.stock?.[0]?.quantity_in_base_unit ?? 0
    return p.is_active && qty <= p.min_stock_level
  }).slice(0, 10)

  const today = new Date().toLocaleDateString('en-PK', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-ink">{t('dashboard.title')}</h1>
        <p className="text-xs md:text-sm text-ink-muted mt-0.5">{today}</p>
      </div>

      {/* Today's stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title={t('dashboard.todaySales')}
          value={formatPKR(stats?.today_total ?? 0)}
          sub={`${stats?.today_invoices ?? 0} ${t('dashboard.invoices')}`}
          icon={ShoppingBag}
          loading={statsLoading}
        />
        <StatCard
          title={t('dashboard.cashToday')}
          value={formatPKR(stats?.today_cash ?? 0)}
          icon={DollarSign}
          color="cash"
          loading={statsLoading}
        />
        <StatCard
          title={t('dashboard.udhaarToday')}
          value={formatPKR(stats?.today_udhaar ?? 0)}
          icon={Wallet}
          color="due"
          loading={statsLoading}
        />
        {isAdmin && (
          <StatCard
            title={t('dashboard.profitToday')}
            value={formatPKR(profit ?? 0)}
            icon={TrendingUp}
            color="brand"
            loading={profitLoading}
          />
        )}
      </div>

      {/* Receivables / Payables / Low Stock row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          title={t('dashboard.totalReceivable')}
          value={formatPKR(stats?.total_receivable ?? 0)}
          icon={Users}
          color="due"
          loading={statsLoading}
        />
        <StatCard
          title={t('dashboard.totalPayable')}
          value={formatPKR(stats?.total_payable ?? 0)}
          icon={Truck}
          color="low"
          loading={statsLoading}
        />
        <StatCard
          title={t('dashboard.lowStockItems')}
          value={String(stats?.low_stock_count ?? 0)}
          icon={AlertTriangle}
          color={stats?.low_stock_count ? 'low' : 'default'}
          loading={statsLoading}
        />
      </div>

      {/* Recent Sales + Low Stock panels */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Recent Sales — full width on mobile, 3/5 on desktop */}
        <div className="lg:col-span-3 rounded-card border border-line bg-surface overflow-hidden">
          <div className="px-3 md:px-4 py-2.5 md:py-3 border-b border-line">
            <h2 className="text-sm font-semibold text-ink">{t('dashboard.recentSales')}</h2>
          </div>
          {salesLoading ? (
            <div className="p-6 flex justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin" />
            </div>
          ) : recentSales.length === 0 ? (
            <p className="p-8 text-center text-sm text-ink-muted">{t('dashboard.noSalesToday')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs md:text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-start px-3 md:px-4 py-2 text-[10px] md:text-xs text-ink-muted font-medium">{t('dashboard.invoice')}</th>
                    <th className="text-start px-3 md:px-4 py-2 text-[10px] md:text-xs text-ink-muted font-medium">{t('dashboard.customer')}</th>
                    <th className="text-start px-3 md:px-4 py-2 text-[10px] md:text-xs text-ink-muted font-medium hidden sm:table-cell">{t('dashboard.type')}</th>
                    <th className="text-end px-3 md:px-4 py-2 text-[10px] md:text-xs text-ink-muted font-medium">{t('reports.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map(s => (
                    <tr key={s.id} className="border-b border-line last:border-0 hover:bg-page/50 transition-colors">
                      <td className="px-3 md:px-4 py-2 font-mono text-[10px] md:text-xs text-ink-muted">{s.invoice_no}</td>
                      <td className="px-3 md:px-4 py-2 text-ink text-xs md:text-sm">{s.customer_name ?? t('dashboard.walkIn')}</td>
                      <td className="px-3 md:px-4 py-2 hidden sm:table-cell">
                        <span className={cn(
                          'inline-flex px-1.5 py-0.5 rounded text-[10px] md:text-xs font-medium',
                          s.payment_type === 'cash'   ? 'bg-cash/10 text-cash'
                          : s.payment_type === 'udhaar' ? 'bg-due/10 text-due'
                          : 'bg-brand/10 text-brand'
                        )}>
                          {t(`pos.${s.payment_type}`)}
                        </span>
                      </td>
                      <td className="px-3 md:px-4 py-2 text-end font-semibold tabular-nums text-ink text-xs md:text-sm">{formatPKR(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Low Stock Alerts — full width on mobile, 2/5 on desktop */}
        <div className="lg:col-span-2 rounded-card border border-line bg-surface overflow-hidden">
          <div className="px-3 md:px-4 py-2.5 md:py-3 border-b border-line flex items-center gap-2">
            <AlertTriangle size={13} className="text-low" />
            <h2 className="text-sm font-semibold text-ink">{t('dashboard.lowStockAlerts')}</h2>
          </div>
          {lowStockItems.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-muted">{t('dashboard.noLowStock')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {lowStockItems.map(p => {
                const qty = p.stock?.[0]?.quantity_in_base_unit ?? 0
                return (
                  <li key={p.id} className="px-3 md:px-4 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs md:text-sm text-ink truncate">{p.name_en}</span>
                    <div className="text-end shrink-0">
                      <span className="text-low font-semibold tabular-nums text-xs md:text-sm">{qty}</span>
                      <span className="text-ink-muted text-[10px] md:text-xs ms-1">/ {p.min_stock_level}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

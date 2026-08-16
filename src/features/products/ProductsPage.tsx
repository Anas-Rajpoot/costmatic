import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence } from 'framer-motion'
import { Package, Plus, Settings2, Pencil, Trash2, Search } from 'lucide-react'
import {
  useProducts, useDeleteProduct, useBulkDeleteProducts, type BulkDeleteResult,
} from './hooks/useProducts'
import { useCategories, categoryOptions } from './hooks/useCategories'
import CategoryDialog from './components/CategoryDialog'
import ProductDrawer from './components/ProductDrawer'
import { formatPKR, formatQty, unitShort } from '@/lib/format'
import { useAuth } from '@/features/auth/AuthContext'
import type { Product } from '@/types'
import { cn } from '@/lib/utils'
import { PageFade, PageHeader } from '@/components/Page'

export default function ProductsPage() {
  const { t, i18n } = useTranslation()
  const isUrdu = i18n.language === 'ur'
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const { data: products = [], isLoading } = useProducts()
  const { data: categories = [] } = useCategories()
  const deleteProduct = useDeleteProduct()

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  // The catalog now carries a whole market's worth of beverages, most of it
  // parked inactive. Default to showing only what the shop actually sells —
  // seeing 166 dormant SKUs on open would bury the real stock.
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active')
  const [companyFilter, setCompanyFilter] = useState('')

  const companies = [...new Set(
    products.map(p => (p.company ?? '').trim()).filter(Boolean),
  )].sort((a, b) => a.localeCompare(b))
  const [showCatDialog, setShowCatDialog] = useState(false)
  const [drawerProduct, setDrawerProduct] = useState<Product | null | undefined>(undefined) // undefined = closed, null = new
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [bulkResult, setBulkResult] = useState<BulkDeleteResult | null>(null)
  const bulkDelete = useBulkDeleteProducts()

  function toggleOne(id: string) {
    setSelected(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const filtered = products.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !q
      || p.name_en.toLowerCase().includes(q)
      || p.name_ur.includes(q)
      || (p.brand ?? '').toLowerCase().includes(q)
      || (p.company ?? '').toLowerCase().includes(q)
      || (p.barcode ?? '').includes(q)
    const matchCat = !catFilter || p.category_id === catFilter
    const matchCompany = !companyFilter || (p.company ?? '') === companyFilter
    const matchStatus = statusFilter === 'all'
      || (statusFilter === 'active' ? p.is_active : !p.is_active)
    return matchSearch && matchCat && matchCompany && matchStatus
  })

  async function handleDelete(id: string) {
    await deleteProduct.mutateAsync(id)
    setConfirmDelId(null)
  }

  // Only ever acts on what is on screen — selecting 166 beverages and then
  // switching filters should not delete something you can no longer see.
  const visibleSelected = filtered.filter(p => selected.has(p.id))
  const allVisibleSelected = filtered.length > 0 && visibleSelected.length === filtered.length

  function toggleAllVisible() {
    setSelected(s => {
      const n = new Set(s)
      if (allVisibleSelected) filtered.forEach(p => n.delete(p.id))
      else filtered.forEach(p => n.add(p.id))
      return n
    })
  }

  async function handleBulkDelete() {
    const res = await bulkDelete.mutateAsync(
      visibleSelected.map(p => ({ id: p.id, name: p.name_en })),
    )
    setConfirmBulk(false)
    setSelected(new Set(res.blocked.map(b => b.id))) // keep the ones that survived
    setBulkResult(res.blocked.length > 0 ? res : null)
  }

  function stockQty(p: Product): number {
    // quantity_in_base_unit is numeric → PostgREST returns it as a string; coerce.
    return Number(p.stock?.[0]?.quantity_in_base_unit ?? 0)
  }

  function isLowStock(p: Product): boolean {
    return stockQty(p) <= p.min_stock_level
  }

  function unitBadges(p: Product) {
    return (p.units ?? []).map(u => u.unit_name).join(' · ')
  }

  return (
    <PageFade>
      <div className="mb-6">
        <PageHeader
          icon={<Package size={18} className="text-brand" />}
          title={t('products.title')}
          count={products.length}
          actions={<>
            <button
              onClick={() => setShowCatDialog(true)}
              className="flex items-center gap-2 h-9 px-4 rounded-btn border border-line text-ink-muted text-sm font-medium hover:border-brand hover:text-brand transition-colors"
            >
              <Settings2 size={15} />
              {t('products.manageCategories')}
            </button>
            <button
              onClick={() => setDrawerProduct(null)}
              className="flex items-center gap-2 h-9 px-4 rounded-btn bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors"
            >
              <Plus size={15} />
              {t('products.addProduct')}
            </button>
          </>}
        />
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('products.search')}
            className="w-full h-9 ps-9 pe-3 rounded-input border border-line bg-surface text-sm text-ink placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
          />
        </div>
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          className="h-9 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
        >
          <option value="">{t('products.allCategories')}</option>
          {categoryOptions(categories, isUrdu).map(o => (
            <option key={o.id} value={o.id}>{o.depth ? `   — ${o.label}` : o.label}</option>
          ))}
        </select>

        {/* Company — the shop orders by supplier line, not by brand */}
        {companies.length > 0 && (
          <select
            value={companyFilter}
            onChange={e => setCompanyFilter(e.target.value)}
            className="h-9 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="">{t('products.allCompanies')}</option>
            {companies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {/* Active / inactive — a segmented control, because this one is
            switched constantly while pricing up a newly seeded range. */}
        <div className="flex rounded-input border border-line overflow-hidden">
          {([
            ['active',   t('products.filterActive')],
            ['inactive', t('products.filterInactive')],
            ['all',      t('products.filterAll')],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatusFilter(id)}
              className={cn(
                'h-9 px-3 text-sm font-medium transition-colors',
                statusFilter === id
                  ? 'bg-brand text-white'
                  : 'bg-surface text-ink-muted hover:text-brand',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="text-xs text-ink-muted tabular ms-auto">
          {filtered.length} / {products.length}
        </span>
      </div>

      {/* Bulk bar — only while something is picked, so it never adds noise */}
      {visibleSelected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-3 px-4 py-2.5 rounded-card border border-brand bg-brand-soft">
          <span className="text-sm font-medium text-brand">
            {t('products.selectedCount', { count: visibleSelected.length })}
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-sm text-ink-muted hover:text-brand transition-colors"
          >
            {t('products.clearSelection')}
          </button>
          <button
            type="button"
            onClick={() => { setBulkResult(null); setConfirmBulk(true) }}
            className="ms-auto flex items-center gap-2 h-9 px-4 rounded-btn bg-due text-white text-sm font-semibold hover:bg-due/90 transition-colors"
          >
            <Trash2 size={15} />
            {t('products.deleteSelected')}
          </button>
        </div>
      )}

      {/* What the database refused to drop, and why */}
      {bulkResult && bulkResult.blocked.length > 0 && (
        <div className="mb-3 px-4 py-3 rounded-card border border-low/30 bg-low/10 text-sm">
          <p className="text-ink font-medium">
            {t('products.bulkPartial', {
              deleted: bulkResult.deleted, kept: bulkResult.blocked.length,
            })}
          </p>
          <p className="text-ink-muted text-xs mt-1">{t('products.bulkTradedHint')}</p>
          <ul className="mt-1.5 text-xs text-ink-muted list-disc ps-5">
            {bulkResult.blocked.slice(0, 8).map(b => <li key={b.id}>{b.name}</li>)}
            {bulkResult.blocked.length > 8 && (
              <li>+{bulkResult.blocked.length - 8}</li>
            )}
          </ul>
        </div>
      )}

      {/* Products table */}
      <div className="bg-surface rounded-card border border-line overflow-x-auto">
        {isLoading ? (
          <div className="p-10 flex justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={36} className="mx-auto text-ink-muted/30 mb-3" />
            <p className="text-ink-muted text-sm">{t('products.noProducts')}</p>
          </div>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line bg-page">
                <th className="ps-4 pe-1 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    title={t('products.selectAllVisible')}
                    className="w-4 h-4 rounded border-line text-brand focus:ring-brand/30 cursor-pointer"
                  />
                </th>
                <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('products.nameEn')}</th>
                <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('products.category')}</th>
                <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('products.brand')}</th>
                <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('products.units')}</th>
                {isAdmin && (
                  <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('products.costPrice')}</th>
                )}
                <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('products.minStock')}</th>
                <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('products.stockLevel')}</th>
                <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('products.isActive')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const qty = stockQty(p)
                const low = isLowStock(p)
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      'border-b border-line last:border-0 transition-colors',
                      selected.has(p.id) ? 'bg-brand-soft/60'
                        : low ? 'bg-low/5 hover:bg-low/10' : 'hover:bg-page/50'
                    )}
                  >
                    <td className="ps-4 pe-1 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                        className="w-4 h-4 rounded border-line text-brand focus:ring-brand/30 cursor-pointer"
                      />
                    </td>
                    {/* Name */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">
                        {isUrdu ? p.name_ur || p.name_en : p.name_en}
                      </div>
                      <div className="text-xs text-ink-muted" dir={isUrdu ? 'ltr' : 'rtl'}>
                        {isUrdu ? p.name_en : p.name_ur}
                      </div>
                      {p.barcode && (
                        <div className="text-xs text-ink-muted/60 font-mono mt-0.5">{p.barcode}</div>
                      )}
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3 text-ink-muted">
                      {p.category
                        ? (isUrdu ? p.category.name_ur || p.category.name_en : p.category.name_en)
                        : '—'}
                    </td>

                    {/* Brand */}
                    <td className="px-4 py-3 text-ink-muted">{p.brand || '—'}</td>

                    {/* Units */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-ink-muted font-mono">{unitBadges(p) || '—'}</span>
                    </td>

                    {/* Cost price (admin only) */}
                    {isAdmin && (
                      <td className="px-4 py-3 text-ink tabular">
                        {formatPKR(Number(p.product_costs?.[0]?.cost_price ?? 0))}
                      </td>
                    )}

                    {/* Min stock */}
                    <td className="px-4 py-3 text-ink-muted tabular">{p.min_stock_level}</td>

                    {/* Stock level */}
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium tabular',
                        low
                          ? 'bg-low/15 text-low'
                          : 'bg-cash-soft text-cash'
                      )}>
                        {formatQty(qty)} {unitShort(p.base_unit)}
                        {low && <span className="font-normal">{t('products.lowStock')}</span>}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                        p.is_active ? 'bg-cash-soft text-cash' : 'bg-line text-ink-muted'
                      )}>
                        {p.is_active ? t('users.active') : t('users.inactive')}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {confirmDelId === p.id ? (
                          <>
                            <button
                              onClick={() => handleDelete(p.id)}
                              disabled={deleteProduct.isPending}
                              className="h-7 px-3 bg-due text-white rounded-btn text-xs font-medium hover:bg-due/80 disabled:opacity-60 transition-colors"
                            >
                              {t('common.confirm')}
                            </button>
                            <button
                              onClick={() => setConfirmDelId(null)}
                              className="h-7 px-3 border border-line text-ink-muted rounded-btn text-xs hover:border-brand hover:text-brand transition-colors"
                            >
                              {t('common.cancel')}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setDrawerProduct(p)}
                              className="p-1.5 text-ink-muted hover:text-brand hover:bg-brand-soft rounded transition-colors"
                              title={t('common.edit')}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setConfirmDelId(p.id)}
                              className="p-1.5 text-ink-muted hover:text-due hover:bg-due-soft rounded transition-colors"
                              title={t('common.delete')}
                            >
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

      {/* Modals */}
      <AnimatePresence>
        {showCatDialog && (
          <CategoryDialog onClose={() => setShowCatDialog(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {drawerProduct !== undefined && (
          <ProductDrawer
            product={drawerProduct}
            onClose={() => setDrawerProduct(undefined)}
          />
        )}
      </AnimatePresence>

      {/* Bulk delete confirmation — deleting 100+ rows deserves a real stop,
          not the inline yes/no used for a single row. */}
      {confirmBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmBulk(false)} />
          <div className="relative bg-surface rounded-card border border-line shadow-2xl w-full max-w-md p-5">
            <h3 className="font-semibold text-ink">{t('products.deleteSelected')}</h3>
            <p className="text-sm text-ink-muted mt-2">
              {t('products.bulkConfirm', { count: visibleSelected.length })}
            </p>
            <p className="text-xs text-ink-muted mt-1">{t('products.bulkTradedHint')}</p>
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => setConfirmBulk(false)}
                className="h-9 px-4 border border-line text-ink-muted rounded-btn text-sm hover:border-brand hover:text-brand transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDelete.isPending}
                className="h-9 px-5 bg-due text-white rounded-btn text-sm font-semibold hover:bg-due/90 disabled:opacity-60 transition-colors"
              >
                {bulkDelete.isPending ? t('common.loading') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageFade>
  )
}

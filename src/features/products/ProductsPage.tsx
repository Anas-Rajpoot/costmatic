import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence } from 'framer-motion'
import { Package, Plus, Settings2, Pencil, Trash2, Search } from 'lucide-react'
import { useProducts, useDeleteProduct } from './hooks/useProducts'
import { useCategories } from './hooks/useCategories'
import CategoryDialog from './components/CategoryDialog'
import ProductDrawer from './components/ProductDrawer'
import { formatPKR } from '@/lib/format'
import { useAuth } from '@/features/auth/AuthContext'
import type { Product } from '@/types'
import { cn } from '@/lib/utils'

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
  const [showCatDialog, setShowCatDialog] = useState(false)
  const [drawerProduct, setDrawerProduct] = useState<Product | null | undefined>(undefined) // undefined = closed, null = new
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)

  const filtered = products.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !q
      || p.name_en.toLowerCase().includes(q)
      || p.name_ur.includes(q)
      || (p.brand ?? '').toLowerCase().includes(q)
      || (p.barcode ?? '').includes(q)
    const matchCat = !catFilter || p.category_id === catFilter
    return matchSearch && matchCat
  })

  async function handleDelete(id: string) {
    await deleteProduct.mutateAsync(id)
    setConfirmDelId(null)
  }

  function stockQty(p: Product): number {
    return p.stock?.[0]?.quantity_in_base_unit ?? 0
  }

  function isLowStock(p: Product): boolean {
    return stockQty(p) <= p.min_stock_level
  }

  function unitBadges(p: Product) {
    return (p.units ?? []).map(u => u.unit_name.charAt(0).toUpperCase()).join(' · ')
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-btn bg-brand-soft flex items-center justify-center">
            <Package size={18} className="text-brand" />
          </div>
          <h1 className="text-xl font-semibold text-ink">{t('products.title')}</h1>
          <span className="text-sm text-ink-muted tabular">({products.length})</span>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-3 mb-4">
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
          {categories.map(c => (
            <option key={c.id} value={c.id}>
              {isUrdu ? c.name_ur || c.name_en : c.name_en}
            </option>
          ))}
        </select>
      </div>

      {/* Products table */}
      <div className="bg-surface rounded-card border border-line overflow-hidden">
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-page">
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
                      low ? 'bg-low/5 hover:bg-low/10' : 'hover:bg-page/50'
                    )}
                  >
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
                        {formatPKR(Number(p.cost_price))}
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
                        {qty}
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
    </div>
  )
}

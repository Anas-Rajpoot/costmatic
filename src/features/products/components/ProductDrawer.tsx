import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { X, Plus, Trash2, ScanLine } from 'lucide-react'
import { useSaveProduct, useProducts, type UnitInput } from '../hooks/useProducts'
import { useCategories } from '../hooks/useCategories'
import { useAuth } from '@/features/auth/AuthContext'
import CameraScanner from '@/features/sales/components/CameraScanner'
import type { Product } from '@/types'
import { cn } from '@/lib/utils'

interface Props {
  product: Product | null // null = create mode
  onClose: () => void
}

interface UnitRow extends UnitInput {
  _key: number
  _isPiece: boolean
}

interface FormState {
  name_en: string
  name_ur: string
  category_id: string
  brand: string
  barcode: string
  cost_price: string
  min_stock_level: string
  opening_stock: string
  has_expiry: boolean
  is_active: boolean
}

const BLANK: FormState = {
  name_en: '',
  name_ur: '',
  category_id: '',
  brand: '',
  barcode: '',
  cost_price: '0',
  min_stock_level: '0',
  opening_stock: '0',
  has_expiry: false,
  is_active: true,
}

const PIECE_UNIT: UnitRow = {
  _key: 0,
  _isPiece: true,
  unit_name: 'piece',
  factor: 1,
  wholesale_price: 0,
  retail_price: 0,
  barcode: null,
}

let _keyCounter = 1

function freshKey() { return _keyCounter++ }

function productToForm(p: Product): FormState {
  return {
    name_en: p.name_en,
    name_ur: p.name_ur,
    category_id: p.category_id ?? '',
    brand: p.brand ?? '',
    barcode: p.barcode ?? '',
    cost_price: String(p.product_costs?.[0]?.cost_price ?? 0),
    min_stock_level: String(p.min_stock_level),
    opening_stock: '0',
    has_expiry: p.has_expiry,
    is_active: p.is_active,
  }
}

function productToUnits(p: Product): UnitRow[] {
  const units = p.units ?? []
  if (!units.some(u => u.unit_name === 'piece')) {
    return [{ ...PIECE_UNIT, _key: freshKey() }, ...units.map(u => ({
      _key: freshKey(),
      _isPiece: false,
      unit_name: u.unit_name,
      factor: u.factor,
      wholesale_price: Number(u.wholesale_price),
      retail_price: Number(u.retail_price),
      barcode: u.barcode,
    }))]
  }
  return units.map(u => ({
    _key: freshKey(),
    _isPiece: u.unit_name === 'piece',
    unit_name: u.unit_name,
    factor: u.factor,
    wholesale_price: Number(u.wholesale_price),
    retail_price: Number(u.retail_price),
    barcode: u.barcode,
  }))
}

const PRESET_UNITS = [
  { label: '3-Pack', unit_name: '3-pack', factor: 3 },
  { label: '6-Pack', unit_name: '6-pack', factor: 6 },
  { label: '10-Pack', unit_name: '10-pack', factor: 10 },
  { label: 'Dozen', unit_name: 'dozen', factor: 12 },
  { label: 'Carton', unit_name: 'carton', factor: 144 },
]

export default function ProductDrawer({ product, onClose }: Props) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const { data: categories = [] } = useCategories()
  const { data: products = [] } = useProducts()
  const save = useSaveProduct()

  const isEdit = !!product

  const [form, setForm] = useState<FormState>(product ? productToForm(product) : BLANK)
  const [units, setUnits] = useState<UnitRow[]>(
    product ? productToUnits(product) : [{ ...PIECE_UNIT, _key: freshKey() }]
  )
  const [addingUnit, setAddingUnit] = useState(false)
  const [newUnit, setNewUnit] = useState({ unit_name: 'dozen', factor: '12', wholesale_price: '0', retail_price: '0', custom: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitErr, setSubmitErr] = useState('')
  const [showScanner, setShowScanner] = useState(false)

  // Warn if the entered/scanned barcode is already on another product
  const trimmedBarcode = form.barcode.trim()
  const barcodeDup = trimmedBarcode
    ? (products.find(p => p.barcode === trimmedBarcode && p.id !== product?.id)?.name_en ?? '')
    : ''

  useEffect(() => {
    if (product) {
      setForm(productToForm(product))
      setUnits(productToUnits(product))
    }
  }, [product?.id])

  function setField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(f => ({ ...f, [key]: val }))
    setErrors(e => { const n = { ...e }; delete n[key]; return n })
  }

  function updateUnit(key: number, field: keyof UnitInput, val: string | number | null) {
    setUnits(us => us.map(u => u._key === key ? { ...u, [field]: val } : u))
  }

  function addUnit() {
    const name = newUnit.unit_name === 'custom' ? newUnit.custom.trim() : newUnit.unit_name
    if (!name) return
    if (units.some(u => u.unit_name === name)) return
    setUnits(us => [...us, {
      _key: freshKey(),
      _isPiece: false,
      unit_name: name,
      factor: parseInt(newUnit.factor) || 1,
      wholesale_price: parseFloat(newUnit.wholesale_price) || 0,
      retail_price: parseFloat(newUnit.retail_price) || 0,
      barcode: null,
    }])
    setNewUnit({ unit_name: 'dozen', factor: '12', wholesale_price: '0', retail_price: '0', custom: '' })
    setAddingUnit(false)
  }

  function removeUnit(key: number) {
    setUnits(us => us.filter(u => u._key !== key))
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.name_en.trim()) errs.name_en = 'Required'
    if (!form.name_ur.trim()) errs.name_ur = 'Required'
    if (units.length === 0) errs.units = 'At least one unit required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitErr('')

    const pieceUnit = units.find(u => u._isPiece)
    const unitPayload: UnitInput[] = units.map(({ _key, _isPiece, ...u }) => ({
      ...u,
      wholesale_price: Number(u.wholesale_price),
      retail_price: Number(u.retail_price),
    }))

    try {
      await save.mutateAsync({
        product: {
          ...(isEdit ? { id: product!.id } : {}),
          name_en: form.name_en.trim(),
          name_ur: form.name_ur.trim(),
          category_id: form.category_id || null,
          brand: form.brand.trim() || null,
          barcode: form.barcode.trim() || null,
          image_url: null,
          base_unit: 'piece',
          min_stock_level: parseInt(form.min_stock_level) || 0,
          has_expiry: form.has_expiry,
          is_active: form.is_active,
        },
        units: unitPayload,
        opening_stock: isEdit ? undefined : parseInt(form.opening_stock) || 0,
        // Only admins may write cost; employees never send it.
        cost_price: isAdmin ? parseFloat(form.cost_price) || 0 : undefined,
      })
      onClose()
    } catch (err: unknown) {
      setSubmitErr(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="fixed inset-y-0 end-0 w-full max-w-lg bg-surface shadow-2xl z-50 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line shrink-0">
          <h2 className="font-semibold text-ink">
            {isEdit ? t('products.editProduct') : t('products.addProduct')}
          </h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable form body */}
        <form id="product-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-7">

          {/* ── Section 1: Product Details ── */}
          <section>
            <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">
              {t('products.sectionBasic')}
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-ink-muted mb-1.5">{t('products.nameEn')} *</label>
                  <input
                    autoFocus
                    value={form.name_en}
                    onChange={e => setField('name_en', e.target.value)}
                    className={cn(
                      'w-full h-10 rounded-input border bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors',
                      errors.name_en ? 'border-due' : 'border-line'
                    )}
                  />
                  {errors.name_en && <p className="text-due text-xs mt-1">{errors.name_en}</p>}
                </div>
                <div>
                  <label className="block text-sm text-ink-muted mb-1.5">{t('products.nameUr')} *</label>
                  <input
                    dir="rtl"
                    value={form.name_ur}
                    onChange={e => setField('name_ur', e.target.value)}
                    className={cn(
                      'w-full h-10 rounded-input border bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors',
                      errors.name_ur ? 'border-due' : 'border-line'
                    )}
                  />
                  {errors.name_ur && <p className="text-due text-xs mt-1">{errors.name_ur}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-ink-muted mb-1.5">{t('products.category')}</label>
                  <select
                    value={form.category_id}
                    onChange={e => setField('category_id', e.target.value)}
                    className="w-full h-10 rounded-input border border-line bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                  >
                    <option value="">—</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name_en}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-ink-muted mb-1.5">{t('products.brand')}</label>
                  <input
                    value={form.brand}
                    onChange={e => setField('brand', e.target.value)}
                    className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-ink-muted mb-1.5">{t('products.barcode')}</label>
                  <div className="flex gap-2">
                    <input
                      value={form.barcode}
                      onChange={e => setField('barcode', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
                      className="flex-1 min-w-0 h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink font-mono focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowScanner(true)}
                      title={t('products.scan')}
                      className="h-10 px-3 rounded-input border border-line text-ink-muted hover:text-brand hover:border-brand transition-colors flex items-center gap-1.5 text-sm shrink-0"
                    >
                      <ScanLine size={16} />
                      <span className="hidden sm:inline">{t('products.scan')}</span>
                    </button>
                  </div>
                  {barcodeDup && (
                    <p className="text-due text-xs mt-1">{t('products.barcodeExists')} ({barcodeDup})</p>
                  )}
                  <p className="text-xs text-ink-muted mt-1">{t('products.scanHint')}</p>
                </div>
                <div className="flex flex-col gap-2 pt-6">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.has_expiry}
                      onChange={e => setField('has_expiry', e.target.checked)}
                      className="w-4 h-4 rounded border-line text-brand focus:ring-brand/30"
                    />
                    <span className="text-sm text-ink">{t('products.hasExpiry')}</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={e => setField('is_active', e.target.checked)}
                      className="w-4 h-4 rounded border-line text-brand focus:ring-brand/30"
                    />
                    <span className="text-sm text-ink">{t('products.isActive')}</span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          {/* ── Section 2: Pricing & Stock ── */}
          <section>
            <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">
              {t('products.sectionPricing')}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {isAdmin && (
                <div>
                  <label className="block text-sm text-ink-muted mb-1.5">{t('products.costPrice')}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.cost_price}
                    onChange={e => setField('cost_price', e.target.value)}
                    className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink tabular focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm text-ink-muted mb-1.5">{t('products.minStock')}</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.min_stock_level}
                  onChange={e => setField('min_stock_level', e.target.value)}
                  className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink tabular focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
                />
              </div>
              {!isEdit && (
                <div>
                  <label className="block text-sm text-ink-muted mb-1.5">{t('products.openingStock')}</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.opening_stock}
                    onChange={e => setField('opening_stock', e.target.value)}
                    className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink tabular focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
                  />
                </div>
              )}
            </div>
          </section>

          {/* ── Section 3: Selling Units ── */}
          <section>
            <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">
              {t('products.sectionUnits')}
            </h3>
            {errors.units && <p className="text-due text-xs mb-2">{errors.units}</p>}

            <div className="rounded-card border border-line overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-page border-b border-line">
                    <th className="text-start px-3 py-2 text-xs text-ink-muted font-medium">{t('products.unitName')}</th>
                    <th className="text-start px-3 py-2 text-xs text-ink-muted font-medium">{t('products.factor')}</th>
                    <th className="text-start px-3 py-2 text-xs text-ink-muted font-medium">{t('products.wholesalePrice')}</th>
                    <th className="text-start px-3 py-2 text-xs text-ink-muted font-medium">{t('products.retailPrice')}</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {units.map(u => (
                    <tr key={u._key} className="border-b border-line last:border-0">
                      <td className="px-3 py-2">
                        {u._isPiece ? (
                          <span className="text-ink-muted text-xs font-medium uppercase tracking-wide">piece</span>
                        ) : (
                          <input
                            value={u.unit_name}
                            onChange={e => updateUnit(u._key, 'unit_name', e.target.value)}
                            className="w-full h-8 rounded border border-line bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand/30"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {u._isPiece ? (
                          <span className="text-ink-muted tabular">1</span>
                        ) : (
                          <input
                            type="number"
                            min="1"
                            value={u.factor}
                            onChange={e => updateUnit(u._key, 'factor', parseInt(e.target.value) || 1)}
                            className="w-16 h-8 rounded border border-line bg-surface px-2 text-sm text-ink tabular focus:outline-none focus:ring-1 focus:ring-brand/30"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={u.wholesale_price}
                          onChange={e => updateUnit(u._key, 'wholesale_price', parseFloat(e.target.value) || 0)}
                          className="w-24 h-8 rounded border border-line bg-surface px-2 text-sm text-ink tabular focus:outline-none focus:ring-1 focus:ring-brand/30"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={u.retail_price}
                          onChange={e => updateUnit(u._key, 'retail_price', parseFloat(e.target.value) || 0)}
                          className="w-24 h-8 rounded border border-line bg-surface px-2 text-sm text-ink tabular focus:outline-none focus:ring-1 focus:ring-brand/30"
                        />
                      </td>
                      <td className="px-2 py-2">
                        {!u._isPiece && (
                          <button
                            type="button"
                            onClick={() => removeUnit(u._key)}
                            className="p-1 text-ink-muted hover:text-due transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Add unit inline row */}
              {addingUnit && (
                <div className="px-3 py-3 bg-page border-t border-line space-y-2">
                  <div className="grid grid-cols-4 gap-2">
                    <select
                      value={newUnit.unit_name}
                      onChange={e => {
                        const preset = PRESET_UNITS.find(p => p.unit_name === e.target.value)
                        setNewUnit(n => ({
                          ...n,
                          unit_name: e.target.value,
                          factor: preset ? String(preset.factor) : n.factor,
                        }))
                      }}
                      className="h-8 rounded border border-line bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand/30"
                    >
                      {PRESET_UNITS.map(p => (
                        <option key={p.unit_name} value={p.unit_name}>{p.label}</option>
                      ))}
                      <option value="custom">Custom…</option>
                    </select>
                    {newUnit.unit_name === 'custom' && (
                      <input
                        placeholder="Unit name"
                        value={newUnit.custom}
                        onChange={e => setNewUnit(n => ({ ...n, custom: e.target.value }))}
                        className="h-8 rounded border border-line bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand/30"
                      />
                    )}
                    <input
                      type="number"
                      placeholder="Factor"
                      min="1"
                      value={newUnit.factor}
                      onChange={e => setNewUnit(n => ({ ...n, factor: e.target.value }))}
                      className="h-8 rounded border border-line bg-surface px-2 text-sm text-ink tabular focus:outline-none focus:ring-1 focus:ring-brand/30"
                    />
                    <input
                      type="number"
                      placeholder="Wholesale"
                      min="0"
                      step="0.01"
                      value={newUnit.wholesale_price}
                      onChange={e => setNewUnit(n => ({ ...n, wholesale_price: e.target.value }))}
                      className="h-8 rounded border border-line bg-surface px-2 text-sm text-ink tabular focus:outline-none focus:ring-1 focus:ring-brand/30"
                    />
                    <input
                      type="number"
                      placeholder="Retail"
                      min="0"
                      step="0.01"
                      value={newUnit.retail_price}
                      onChange={e => setNewUnit(n => ({ ...n, retail_price: e.target.value }))}
                      className="h-8 rounded border border-line bg-surface px-2 text-sm text-ink tabular focus:outline-none focus:ring-1 focus:ring-brand/30"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={addUnit}
                      className="h-7 px-3 bg-brand text-white rounded-btn text-xs font-medium hover:bg-brand-dark transition-colors"
                    >
                      {t('common.add')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingUnit(false)}
                      className="h-7 px-3 border border-line text-ink-muted rounded-btn text-xs hover:border-brand hover:text-brand transition-colors"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!addingUnit && (
              <button
                type="button"
                onClick={() => setAddingUnit(true)}
                className="mt-2 flex items-center gap-1.5 text-sm text-brand hover:text-brand-dark transition-colors"
              >
                <Plus size={14} />
                {t('products.addUnit')}
              </button>
            )}
          </section>

          {submitErr && (
            <div className="text-due text-sm px-3 py-2 bg-due-soft rounded-input border border-due/20">
              {submitErr}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-line shrink-0 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-5 border border-line text-ink-muted rounded-btn text-sm font-medium hover:border-brand hover:text-brand transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="product-form"
            disabled={save.isPending}
            className="h-10 px-6 bg-brand text-white rounded-btn text-sm font-semibold hover:bg-brand-dark disabled:opacity-60 transition-colors"
          >
            {save.isPending ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </motion.div>

      {showScanner && (
        <CameraScanner
          onScan={code => setField('barcode', code)}
          onClose={() => setShowScanner(false)}
        />
      )}
    </>
  )
}

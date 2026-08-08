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

type ProductKind = 'standard' | 'loose'

interface UnitRow extends UnitInput {
  _key: number
  _isBase: boolean // the factor-1 base unit (piece / kg / litre) — non-removable
}

interface FormState {
  name_en: string
  name_ur: string
  category_id: string
  brand: string
  barcode: string
  product_kind: ProductKind
  base_unit: string
  cost_price: string
  min_stock_level: string
  opening_stock: string
  wholesale_min_qty: string // loose only; '' = no minimum
  has_expiry: boolean
  is_active: boolean
}

const BLANK: FormState = {
  name_en: '',
  name_ur: '',
  category_id: '',
  brand: '',
  barcode: '',
  product_kind: 'standard',
  base_unit: 'piece',
  cost_price: '0',
  min_stock_level: '0',
  opening_stock: '0',
  wholesale_min_qty: '',
  has_expiry: false,
  is_active: true,
}

// Base-unit options per kind. Standard: piece (packaged) / bottle (beverage) /
// pack (cigarette). Loose: kg / litre.
const BASE_UNITS: Record<ProductKind, string[]> = {
  standard: ['piece', 'bottle', 'pack'],
  loose: ['kg', 'litre'],
}

// Smart eligibility defaults matching the retail=smallest / wholesale=bulk rule.
// pack (cigarette) + bottle (beverage) are "strict smallest" → base = retail-only,
// their bulk unit = wholesale-only. piece/kg/litre base stays sellable both ways.
function defaultElig(base_unit: string, isBase: boolean): { retail_eligible: boolean; wholesale_eligible: boolean } {
  const strictSmallest = base_unit === 'pack' || base_unit === 'bottle'
  if (isBase) return { retail_eligible: true, wholesale_eligible: !strictSmallest }
  if (base_unit === 'kg' || base_unit === 'litre') return { retail_eligible: true, wholesale_eligible: false } // loose packs = retail convenience
  if (strictSmallest) return { retail_eligible: false, wholesale_eligible: true } // cigarette carton / beverage crate
  return { retail_eligible: true, wholesale_eligible: true } // standard piece-based packs
}

let _keyCounter = 1

function freshKey() { return _keyCounter++ }

function makeBaseRow(base_unit: string): UnitRow {
  return {
    _key: freshKey(), _isBase: true, unit_name: base_unit, factor: 1,
    wholesale_price: 0, retail_price: 0, barcode: null, ...defaultElig(base_unit, true),
  }
}

function productToForm(p: Product): FormState {
  return {
    name_en: p.name_en,
    name_ur: p.name_ur,
    category_id: p.category_id ?? '',
    brand: p.brand ?? '',
    barcode: p.barcode ?? '',
    product_kind: p.product_kind === 'loose' ? 'loose' : 'standard',
    base_unit: p.base_unit || 'piece',
    cost_price: String(p.product_costs?.[0]?.cost_price ?? 0),
    min_stock_level: String(p.min_stock_level),
    opening_stock: '0',
    wholesale_min_qty: p.wholesale_min_qty == null ? '' : String(p.wholesale_min_qty),
    has_expiry: p.has_expiry,
    is_active: p.is_active,
  }
}

function productToUnits(p: Product): UnitRow[] {
  const base = p.base_unit || 'piece'
  const rows: UnitRow[] = (p.units ?? []).map(u => ({
    _key: freshKey(),
    _isBase: u.unit_name === base,
    unit_name: u.unit_name,
    factor: Number(u.factor),
    wholesale_price: Number(u.wholesale_price),
    retail_price: Number(u.retail_price),
    barcode: u.barcode,
    retail_eligible: u.retail_eligible ?? true,
    wholesale_eligible: u.wholesale_eligible ?? true,
  }))
  if (!rows.some(r => r._isBase)) rows.unshift(makeBaseRow(base))
  // Base row always first
  rows.sort((a, b) => (a._isBase === b._isBase ? 0 : a._isBase ? -1 : 1))
  return rows
}

interface PresetUnit { label: string; unit_name: string; factor: number }

// Standard bulk presets adapt to the base unit: cigarette (pack) → carton of 10,
// beverage (bottle) → crate of 24, otherwise the usual piece-based packs.
function standardPresets(base_unit: string): PresetUnit[] {
  if (base_unit === 'pack') return [{ label: 'Carton (10 packs)', unit_name: 'carton', factor: 10 }]
  if (base_unit === 'bottle') return [{ label: 'Crate (24)', unit_name: 'crate', factor: 24 }]
  return [
    { label: '3-Pack', unit_name: '3-pack', factor: 3 },
    { label: '6-Pack', unit_name: '6-pack', factor: 6 },
    { label: 'Dozen', unit_name: 'dozen', factor: 12 },
    { label: 'Carton', unit_name: 'carton', factor: 144 },
  ]
}

// Loose packs are fractions/multiples of the base unit (kg or litre). Labels adapt
// to weight vs volume; factor is the number of base units the pack contains.
function loosePresets(base_unit: string): PresetUnit[] {
  const vol = base_unit === 'litre'
  return [
    { label: vol ? '250 ml' : '250 g', unit_name: vol ? '250ml' : '250g', factor: 0.25 },
    { label: vol ? '500 ml' : '500 g', unit_name: vol ? '500ml' : '500g', factor: 0.5 },
    { label: vol ? '750 ml' : '750 g', unit_name: vol ? '750ml' : '750g', factor: 0.75 },
    { label: vol ? '2 L' : '2 kg', unit_name: vol ? '2L' : '2kg', factor: 2 },
    { label: vol ? '5 L' : '5 kg', unit_name: vol ? '5L' : '5kg', factor: 5 },
  ]
}

// Short display label for the base unit (used in stock/factor captions).
function baseUnitShort(base_unit: string): string {
  if (base_unit === 'kg') return 'kg'
  if (base_unit === 'litre') return 'L'
  if (base_unit === 'bottle') return 'btl'
  if (base_unit === 'pack') return 'pack'
  return 'pcs'
}

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
    product ? productToUnits(product) : [makeBaseRow('piece')]
  )
  const [addingUnit, setAddingUnit] = useState(false)
  const [newUnit, setNewUnit] = useState({ unit_name: 'dozen', factor: '12', wholesale_price: '0', retail_price: '0', custom: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitErr, setSubmitErr] = useState('')
  const [showScanner, setShowScanner] = useState(false)

  const isLoose = form.product_kind === 'loose'
  const presets: PresetUnit[] = isLoose ? loosePresets(form.base_unit) : standardPresets(form.base_unit)
  const baseLabel = baseUnitShort(form.base_unit)

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

  function updateUnit(key: number, field: keyof UnitInput, val: string | number | boolean | null) {
    setUnits(us => us.map(u => u._key === key ? { ...u, [field]: val } : u))
  }

  // Switch product kind: reset the base unit + its eligibility, rename the base row.
  function changeKind(kind: ProductKind) {
    const newBase = BASE_UNITS[kind][0]
    setForm(f => ({ ...f, product_kind: kind, base_unit: newBase }))
    setUnits(us => us.map(u => (u._isBase ? { ...u, unit_name: newBase, ...defaultElig(newBase, true) } : u)))
    setAddingUnit(false)
    setErrors(e => { const n = { ...e }; delete n.units; return n })
  }

  // Change the base unit (piece/bottle/pack or kg/litre) and re-default its eligibility.
  function changeBaseUnit(base_unit: string) {
    setForm(f => ({ ...f, base_unit }))
    setUnits(us => us.map(u => (u._isBase ? { ...u, unit_name: base_unit, ...defaultElig(base_unit, true) } : u)))
  }

  function addUnit() {
    const name = newUnit.unit_name === 'custom' ? newUnit.custom.trim() : newUnit.unit_name
    if (!name) return
    if (units.some(u => u.unit_name === name)) return
    setUnits(us => [...us, {
      _key: freshKey(),
      _isBase: false,
      unit_name: name,
      factor: parseFloat(newUnit.factor) || (isLoose ? 0 : 1),
      wholesale_price: parseFloat(newUnit.wholesale_price) || 0,
      retail_price: parseFloat(newUnit.retail_price) || 0,
      barcode: null,
      ...defaultElig(form.base_unit, false),
    }])
    const d = presets[0]
    if (d) setNewUnit({ unit_name: d.unit_name, factor: String(d.factor), wholesale_price: '0', retail_price: '0', custom: '' })
    setAddingUnit(false)
  }

  // Quick-add a preset pack/unit directly (price starts at 0 for the user to fill).
  function addPreset(p: PresetUnit) {
    if (units.some(u => u.unit_name === p.unit_name)) return
    setUnits(us => [...us, {
      _key: freshKey(), _isBase: false, unit_name: p.unit_name,
      factor: p.factor, wholesale_price: 0, retail_price: 0, barcode: null,
      ...defaultElig(form.base_unit, false),
    }])
  }

  function removeUnit(key: number) {
    setUnits(us => us.filter(u => u._key !== key))
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.name_en.trim()) errs.name_en = 'Required'
    if (!form.name_ur.trim()) errs.name_ur = 'Required'
    if (units.length === 0) errs.units = 'At least one unit required'
    // Every non-base pack/unit must contain a positive number of base units.
    if (units.some(u => !u._isBase && (Number(u.factor) || 0) <= 0)) {
      errs.units = t('products.factorPositive')
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitErr('')

    const unitPayload: UnitInput[] = units.map(({ _key, _isBase, ...u }) => ({
      ...u,
      factor: Number(u.factor),
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
          base_unit: form.base_unit,
          product_kind: form.product_kind,
          // Wholesale minimum only meaningful for loose; blank/standard → null.
          wholesale_min_qty: isLoose && form.wholesale_min_qty.trim() !== ''
            ? parseFloat(form.wholesale_min_qty) || null
            : null,
          min_stock_level: parseInt(form.min_stock_level) || 0,
          has_expiry: form.has_expiry,
          is_active: form.is_active,
        },
        units: unitPayload,
        // Loose opening stock can be fractional (e.g. 12.5 kg); standard is whole.
        opening_stock: isEdit ? undefined : (isLoose ? parseFloat(form.opening_stock) || 0 : parseInt(form.opening_stock) || 0),
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
              {/* Product kind — decides counted vs weight/volume selling */}
              <div>
                <label className="block text-sm text-ink-muted mb-1.5">{t('products.productKind')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['standard', 'loose'] as const).map(kind => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => changeKind(kind)}
                      className={cn(
                        'h-10 rounded-input border-2 text-sm font-medium transition-all active:scale-[0.99]',
                        form.product_kind === kind
                          ? 'bg-brand text-white border-brand'
                          : 'bg-surface text-ink-muted border-line hover:border-brand hover:text-brand',
                      )}
                    >
                      {t(`products.kind_${kind}`)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-ink-muted mt-1">
                  {t(isLoose ? 'products.kindLooseHint' : 'products.kindStandardHint')}
                </p>
              </div>

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
                  <label className="block text-sm text-ink-muted mb-1.5">
                    {t('products.costPrice')}{isLoose ? ` / ${baseLabel}` : ''}
                  </label>
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
                <label className="block text-sm text-ink-muted mb-1.5">
                  {t('products.minStockLabel')} ({baseLabel})
                </label>
                <input
                  type="number"
                  min="0"
                  step={isLoose ? '0.001' : '1'}
                  value={form.min_stock_level}
                  onChange={e => setField('min_stock_level', e.target.value)}
                  className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink tabular focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
                />
              </div>
              {!isEdit && (
                <div>
                  <label className="block text-sm text-ink-muted mb-1.5">
                    {t('products.openingStockLabel')} ({baseLabel})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step={isLoose ? '0.001' : '1'}
                    value={form.opening_stock}
                    onChange={e => setField('opening_stock', e.target.value)}
                    className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink tabular focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
                  />
                </div>
              )}
              {isLoose && (
                <div className="col-span-2">
                  <label className="block text-sm text-ink-muted mb-1.5">
                    {t('products.wholesaleMinQty')} ({baseLabel})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.wholesale_min_qty}
                    onChange={e => setField('wholesale_min_qty', e.target.value)}
                    placeholder={t('products.noMinimum')}
                    className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink tabular focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
                  />
                  <p className="text-xs text-ink-muted mt-1">{t('products.wholesaleMinHint')}</p>
                </div>
              )}
            </div>
          </section>

          {/* ── Section 3: Selling Units ── */}
          <section>
            <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">
              {t('products.sectionUnits')}
            </h3>
            <p className="text-xs text-ink-muted mb-3">
              {t(isLoose ? 'products.unitsLooseHint' : 'products.unitsStandardHint')}
            </p>
            {errors.units && <p className="text-due text-xs mb-2">{errors.units}</p>}

            <div className="rounded-card border border-line overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-page border-b border-line">
                    <th className="text-start px-3 py-2 text-xs text-ink-muted font-medium">{t('products.unitName')}</th>
                    <th className="text-start px-3 py-2 text-xs text-ink-muted font-medium">
                      {t('products.factorLabel')} ({baseLabel})
                    </th>
                    <th className="text-start px-3 py-2 text-xs text-ink-muted font-medium">{t('products.wholesalePrice')}</th>
                    <th className="text-start px-3 py-2 text-xs text-ink-muted font-medium">{t('products.retailPrice')}</th>
                    <th className="text-center px-2 py-2 text-xs text-ink-muted font-medium" title={t('products.sellInHint')}>{t('products.sellIn')}</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {units.map(u => (
                    <tr key={u._key} className="border-b border-line last:border-0">
                      <td className="px-3 py-2">
                        {u._isBase ? (
                          <select
                            value={form.base_unit}
                            onChange={e => changeBaseUnit(e.target.value)}
                            className="h-8 rounded border border-line bg-surface px-2 text-sm text-ink font-medium focus:outline-none focus:ring-1 focus:ring-brand/30"
                          >
                            {BASE_UNITS[form.product_kind].map(bu => (
                              <option key={bu} value={bu}>{t(`products.unit_${bu}`)}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={u.unit_name}
                            onChange={e => updateUnit(u._key, 'unit_name', e.target.value)}
                            className="w-full h-8 rounded border border-line bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand/30"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {u._isBase ? (
                          <span className="text-ink-muted tabular">1</span>
                        ) : (
                          <input
                            type="number"
                            min={isLoose ? '0.001' : '1'}
                            step={isLoose ? '0.001' : '1'}
                            value={u.factor}
                            onChange={e => updateUnit(u._key, 'factor', parseFloat(e.target.value) || 0)}
                            className="w-20 h-8 rounded border border-line bg-surface px-2 text-sm text-ink tabular focus:outline-none focus:ring-1 focus:ring-brand/30"
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
                        <div className="flex items-center gap-2 justify-center">
                          <label className="flex items-center gap-0.5 text-[11px] text-ink-muted cursor-pointer" title={t('products.retailEligible')}>
                            <input
                              type="checkbox"
                              checked={u.retail_eligible}
                              onChange={e => updateUnit(u._key, 'retail_eligible', e.target.checked)}
                              className="w-3.5 h-3.5 rounded border-line text-brand focus:ring-brand/30"
                            />
                            R
                          </label>
                          <label className="flex items-center gap-0.5 text-[11px] text-ink-muted cursor-pointer" title={t('products.wholesaleEligible')}>
                            <input
                              type="checkbox"
                              checked={u.wholesale_eligible}
                              onChange={e => updateUnit(u._key, 'wholesale_eligible', e.target.checked)}
                              className="w-3.5 h-3.5 rounded border-line text-brand focus:ring-brand/30"
                            />
                            W
                          </label>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        {!u._isBase && (
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
                        const preset = presets.find(p => p.unit_name === e.target.value)
                        setNewUnit(n => ({
                          ...n,
                          unit_name: e.target.value,
                          factor: preset ? String(preset.factor) : n.factor,
                        }))
                      }}
                      className="h-8 rounded border border-line bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand/30"
                    >
                      {presets.map(p => (
                        <option key={p.unit_name} value={p.unit_name}>{p.label}</option>
                      ))}
                      <option value="custom">{t('products.custom')}</option>
                    </select>
                    {newUnit.unit_name === 'custom' && (
                      <input
                        placeholder={t('products.unitName')}
                        value={newUnit.custom}
                        onChange={e => setNewUnit(n => ({ ...n, custom: e.target.value }))}
                        className="h-8 rounded border border-line bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand/30"
                      />
                    )}
                    <input
                      type="number"
                      placeholder={t('products.factorLabel')}
                      min={isLoose ? '0.001' : '1'}
                      step={isLoose ? '0.001' : '1'}
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
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* Quick-add preset packs/units (price starts at 0, fill it in the row) */}
                {presets.map(p => {
                  const already = units.some(u => u.unit_name === p.unit_name)
                  return (
                    <button
                      key={p.unit_name}
                      type="button"
                      disabled={already}
                      onClick={() => addPreset(p)}
                      className={cn(
                        'h-7 px-2.5 rounded-btn border text-xs font-medium transition-colors',
                        already
                          ? 'border-line text-ink-muted/40 cursor-not-allowed'
                          : 'border-line text-ink-muted hover:border-brand hover:text-brand',
                      )}
                    >
                      + {p.label}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => {
                    const d = presets[0]
                    setNewUnit({ unit_name: d.unit_name, factor: String(d.factor), wholesale_price: '0', retail_price: '0', custom: '' })
                    setAddingUnit(true)
                  }}
                  className="flex items-center gap-1.5 text-sm text-brand hover:text-brand-dark transition-colors ms-1"
                >
                  <Plus size={14} />
                  {t(isLoose ? 'products.addPack' : 'products.addUnit')}
                </button>
              </div>
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

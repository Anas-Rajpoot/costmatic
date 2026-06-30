import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Save, Printer, Clock, Store, SlidersHorizontal, CheckCircle, X } from 'lucide-react'
import { useSettings, useSaveSettings, useAuditLog } from './hooks/useSettings'
import { useProducts } from '@/features/products/hooks/useProducts'
import { cn } from '@/lib/utils'

type Tab = 'shop' | 'prefs' | 'labels' | 'audit'

export default function SettingsPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('shop')

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'shop',   label: t('settings.tabShop'),   icon: <Store size={15} /> },
    { id: 'prefs',  label: t('settings.tabPrefs'),  icon: <SlidersHorizontal size={15} /> },
    { id: 'labels', label: t('settings.tabLabels'), icon: <Printer size={15} /> },
    { id: 'audit',  label: t('settings.tabAudit'),  icon: <Clock size={15} /> },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-ink">{t('settings.title')}</h1>

      <div className="flex gap-1 bg-surface-alt rounded-card p-1">
        {tabs.map(tb => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={cn(
              'flex items-center gap-2 flex-1 justify-center py-2 px-3 rounded-[10px] text-sm font-medium transition-all duration-150',
              tab === tb.id
                ? 'bg-surface text-brand shadow-sm'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {tb.icon}
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'shop'   && <ShopInfoTab />}
      {tab === 'prefs'  && <PreferencesTab />}
      {tab === 'labels' && <BarcodeLabelPrinter />}
      {tab === 'audit'  && <AuditLogViewer />}
    </div>
  )
}

// ─── Shop Info ────────────────────────────────────────────────────────────────
function ShopInfoTab() {
  const { t } = useTranslation()
  const { data: settings, isLoading } = useSettings()
  const save = useSaveSettings()
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({ shop_name: '', shop_address: '', shop_phone: '', receipt_footer: '' })

  useEffect(() => {
    if (settings) setForm({
      shop_name:      settings.shop_name      ?? '',
      shop_address:   settings.shop_address   ?? '',
      shop_phone:     settings.shop_phone     ?? '',
      receipt_footer: settings.receipt_footer ?? '',
    })
  }, [settings])

  if (isLoading) return <p className="text-ink-muted text-sm">{t('common.loading')}</p>

  async function handleSave() {
    await save.mutateAsync(form)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="bg-surface border border-line rounded-card p-6 space-y-5">
      <Field label={t('settings.shopName')}>
        <input className="input" value={form.shop_name}
          onChange={e => setForm(f => ({ ...f, shop_name: e.target.value }))} />
      </Field>
      <Field label={t('settings.shopPhone')}>
        <input className="input" dir="ltr" value={form.shop_phone}
          onChange={e => setForm(f => ({ ...f, shop_phone: e.target.value }))} />
      </Field>
      <Field label={t('settings.shopAddress')}>
        <textarea className="input resize-none" rows={2} value={form.shop_address}
          onChange={e => setForm(f => ({ ...f, shop_address: e.target.value }))} />
      </Field>
      <Field label={t('settings.receiptFooter')}>
        <textarea className="input resize-none" rows={2} value={form.receipt_footer}
          onChange={e => setForm(f => ({ ...f, receipt_footer: e.target.value }))} />
      </Field>
      <SaveBtn saving={save.isPending} saved={saved} onSave={handleSave} />
    </div>
  )
}

// ─── Preferences ─────────────────────────────────────────────────────────────
function PreferencesTab() {
  const { t, i18n } = useTranslation()
  const { data: settings, isLoading } = useSettings()
  const save = useSaveSettings()
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({ tax_rate: '0', default_language: 'en' })

  useEffect(() => {
    if (settings) setForm({
      tax_rate:         settings.tax_rate         ?? '0',
      default_language: settings.default_language ?? 'en',
    })
  }, [settings])

  if (isLoading) return <p className="text-ink-muted text-sm">{t('common.loading')}</p>

  async function handleSave() {
    await save.mutateAsync(form)
    i18n.changeLanguage(form.default_language)
    document.documentElement.dir = form.default_language === 'ur' ? 'rtl' : 'ltr'
    document.documentElement.lang = form.default_language
    localStorage.setItem('lang', form.default_language)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="bg-surface border border-line rounded-card p-6 space-y-5">
      <Field label={t('settings.taxRate')}>
        <input className="input w-40" type="number" min="0" max="100" step="0.5"
          dir="ltr" value={form.tax_rate}
          onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))} />
        <p className="text-xs text-ink-muted mt-1">{t('settings.taxNote')}</p>
      </Field>
      <Field label={t('settings.defaultLanguage')}>
        <select className="input w-48" value={form.default_language}
          onChange={e => setForm(f => ({ ...f, default_language: e.target.value }))}>
          <option value="en">English</option>
          <option value="ur">اردو</option>
        </select>
      </Field>
      <SaveBtn saving={save.isPending} saved={saved} onSave={handleSave} />
    </div>
  )
}

// ─── Barcode Label Printer ────────────────────────────────────────────────────
interface LabelItem { product_id: string; name: string; barcode: string; price: string; qty: number }

function BarcodeLabelPrinter() {
  const { t } = useTranslation()
  const { data: products } = useProducts()
  const [search, setSearch] = useState('')
  const [sheet, setSheet] = useState<LabelItem[]>([])
  const [printing, setPrinting] = useState(false)

  const filtered = (products ?? []).filter(p =>
    p.barcode && (
      p.name_en.toLowerCase().includes(search.toLowerCase()) ||
      (p.name_ur ?? '').includes(search)
    )
  )

  function addToSheet(p: { id: string; name_en: string; barcode: string | null }) {
    if (!p.barcode) return
    setSheet(prev => {
      const ex = prev.find(i => i.product_id === p.id)
      if (ex) return prev.map(i => i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { product_id: p.id, name: p.name_en, barcode: p.barcode!, price: '', qty: 1 }]
    })
  }

  async function printSheet() {
    if (!sheet.length) return
    setPrinting(true)
    try {
      // bwip-js is ~900 kB — load it only when labels are actually printed,
      // so opening Settings doesn't pull in the whole barcode library.
      const { toCanvas: bwipToCanvas } = await import('bwip-js')
      const rendered: { name: string; img: string }[] = []
      for (const item of sheet) {
        const canvas = document.createElement('canvas')
        try {
          bwipToCanvas(canvas, {
            bcid: 'code128', text: item.barcode,
            scale: 3, height: 10, includetext: true, textxalign: 'center',
          })
          for (let i = 0; i < item.qty; i++) {
            rendered.push({ name: item.name, img: canvas.toDataURL('image/png') })
          }
        } catch { /* skip invalid barcode */ }
      }

      const labels = rendered.map(l => `
        <div class="label">
          <div class="name">${l.name}</div>
          <img src="${l.img}" />
        </div>`).join('')

      const html = `<!DOCTYPE html><html><head><style>
        body{margin:0;font-family:sans-serif;}
        @page{size:A4;margin:8mm;}
        .sheet{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;}
        .label{border:1px solid #ccc;padding:3mm;text-align:center;break-inside:avoid;}
        .name{font-size:8pt;font-weight:bold;margin-bottom:2mm;line-height:1.2;}
        img{max-width:100%;height:auto;}
      </style></head><body><div class="sheet">${labels}</div></body></html>`

      const w = window.open('', '_blank', 'width=900,height=700')
      if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400) }
    } finally { setPrinting(false) }
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-surface border border-line rounded-card p-4 space-y-3">
        <h3 className="font-semibold text-sm text-ink">{t('settings.labels.searchTitle')}</h3>
        <input className="input text-sm" placeholder={t('settings.labels.searchPlaceholder')}
          value={search} onChange={e => setSearch(e.target.value)} />
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {filtered.slice(0, 40).map(p => (
            <button key={p.id} onClick={() => addToSheet(p)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-input text-sm hover:bg-surface-alt transition-colors text-start">
              <span className="font-medium text-ink truncate">{p.name_en}</span>
              <span className="text-xs text-ink-muted font-mono shrink-0 ms-2">{p.barcode}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-ink-muted text-xs text-center py-4">{t('settings.labels.noBarcodes')}</p>
          )}
        </div>
      </div>

      <div className="bg-surface border border-line rounded-card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-ink">
            {t('settings.labels.sheet')} ({sheet.reduce((s, i) => s + i.qty, 0)} {t('settings.labels.labels')})
          </h3>
          {sheet.length > 0 && (
            <button onClick={() => setSheet([])} className="text-xs text-ink-muted hover:text-due transition-colors">
              {t('settings.labels.clear')}
            </button>
          )}
        </div>

        <div className="flex-1 space-y-1 max-h-64 overflow-y-auto">
          {sheet.map(item => (
            <div key={item.product_id} className="flex items-center gap-2 px-3 py-1.5 rounded-input bg-surface-alt text-sm">
              <span className="flex-1 truncate text-ink font-medium">{item.name}</span>
              <button onClick={() => setSheet(p => p.map(i => i.product_id === item.product_id ? { ...i, qty: Math.max(1, i.qty - 1) } : i))}
                className="w-5 h-5 rounded border border-line flex items-center justify-center text-ink-muted text-xs hover:bg-surface">−</button>
              <span className="w-6 text-center text-xs font-bold">{item.qty}</span>
              <button onClick={() => setSheet(p => p.map(i => i.product_id === item.product_id ? { ...i, qty: i.qty + 1 } : i))}
                className="w-5 h-5 rounded border border-line flex items-center justify-center text-ink-muted text-xs hover:bg-surface">+</button>
              <button onClick={() => setSheet(p => p.filter(i => i.product_id !== item.product_id))}
                className="text-ink-muted hover:text-due"><X size={13} /></button>
            </div>
          ))}
          {sheet.length === 0 && (
            <p className="text-ink-muted text-xs text-center py-6">{t('settings.labels.emptySheet')}</p>
          )}
        </div>

        <button onClick={printSheet} disabled={!sheet.length || printing}
          className="btn-brand flex items-center gap-2 justify-center disabled:opacity-50">
          <Printer size={15} />
          {printing ? t('common.loading') : t('settings.labels.print')}
        </button>
      </div>
    </div>
  )
}

// ─── Audit Log ────────────────────────────────────────────────────────────────
const ACTION_COLORS: Record<string, string> = {
  INSERT: 'bg-cash/10 text-cash',
  UPDATE: 'bg-low/10 text-low',
  DELETE: 'bg-due/10 text-due',
}
const TABLE_LABELS: Record<string, string> = {
  sales: 'Sale', purchases: 'Purchase', products: 'Product',
  customers: 'Customer', suppliers: 'Supplier',
  customer_ledger: 'Customer Ledger', supplier_ledger: 'Supplier Ledger',
}

function AuditLogViewer() {
  const { t } = useTranslation()
  const { data, isLoading } = useAuditLog(200)

  if (isLoading) return <p className="text-ink-muted text-sm">{t('common.loading')}</p>

  return (
    <div className="bg-surface border border-line rounded-card overflow-hidden">
      <div className="px-4 py-3 border-b border-line">
        <h3 className="font-semibold text-sm text-ink">{t('settings.audit.title')}</h3>
      </div>
      {(!data || data.length === 0) ? (
        <p className="text-ink-muted text-sm text-center py-10">{t('settings.audit.noLogs')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt text-ink-muted text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-start">{t('settings.audit.time')}</th>
                <th className="px-4 py-2 text-start">{t('settings.audit.action')}</th>
                <th className="px-4 py-2 text-start">{t('settings.audit.table')}</th>
                <th className="px-4 py-2 text-start">{t('settings.audit.summary')}</th>
                <th className="px-4 py-2 text-start">{t('settings.audit.user')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map(row => (
                <motion.tr key={row.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="hover:bg-surface-alt/50 transition-colors">
                  <td className="px-4 py-2 text-ink-muted font-mono text-xs whitespace-nowrap">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', ACTION_COLORS[row.action] ?? 'bg-surface-alt text-ink-muted')}>
                      {row.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-ink-muted text-xs">
                    {TABLE_LABELS[row.table_name] ?? row.table_name}
                  </td>
                  <td className="px-4 py-2 text-ink text-xs max-w-xs truncate">{row.summary ?? '—'}</td>
                  <td className="px-4 py-2 text-ink-muted text-xs">{row.user_name ?? '—'}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function SaveBtn({ saving, saved, onSave }: { saving: boolean; saved: boolean; onSave: () => void }) {
  const { t } = useTranslation()
  return (
    <button onClick={onSave} disabled={saving}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-input text-sm font-semibold transition-all disabled:opacity-50',
        saved ? 'bg-cash/10 text-cash border border-cash/30' : 'btn-brand',
      )}>
      {saved ? <CheckCircle size={15} /> : <Save size={15} />}
      {saved ? t('settings.saved') : saving ? t('common.loading') : t('settings.save')}
    </button>
  )
}

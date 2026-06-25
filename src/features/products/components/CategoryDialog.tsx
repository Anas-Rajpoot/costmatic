import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Pencil, Trash2, Plus, Check } from 'lucide-react'
import { useCategories, useUpsertCategory, useDeleteCategory } from '../hooks/useCategories'
import type { Category } from '@/types'
import { cn } from '@/lib/utils'

interface Props {
  onClose: () => void
}

interface EditState {
  id?: string
  name_en: string
  name_ur: string
  parent_id: string
  sort_order: number
}

const BLANK: EditState = { name_en: '', name_ur: '', parent_id: '', sort_order: 0 }

export default function CategoryDialog({ onClose }: Props) {
  const { t } = useTranslation()
  const { data: categories = [] } = useCategories()
  const upsert = useUpsertCategory()
  const del = useDeleteCategory()

  const [editing, setEditing] = useState<EditState | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [err, setErr] = useState('')

  function startAdd() {
    setEditing(BLANK)
    setErr('')
  }

  function startEdit(cat: Category) {
    setEditing({
      id: cat.id,
      name_en: cat.name_en,
      name_ur: cat.name_ur,
      parent_id: cat.parent_id ?? '',
      sort_order: cat.sort_order,
    })
    setErr('')
  }

  async function save() {
    if (!editing) return
    if (!editing.name_en.trim()) { setErr(t('categories.nameEn')); return }
    setErr('')
    await upsert.mutateAsync({
      ...(editing.id ? { id: editing.id } : {}),
      name_en: editing.name_en.trim(),
      name_ur: editing.name_ur.trim(),
      parent_id: editing.parent_id || null,
      sort_order: editing.sort_order,
    })
    setEditing(null)
  }

  async function remove(id: string) {
    await del.mutateAsync(id)
    setConfirmDel(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.15 }}
        className="relative bg-surface rounded-card border border-line shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <h2 className="font-semibold text-ink">{t('categories.title')}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Add/Edit form */}
          <AnimatePresence>
            {editing && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-5 py-4 bg-page border-b border-line space-y-3">
                  {err && (
                    <p className="text-due text-xs">{err}</p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-ink-muted mb-1">{t('categories.nameEn')} *</label>
                      <input
                        autoFocus
                        value={editing.name_en}
                        onChange={e => setEditing(v => v && ({ ...v, name_en: e.target.value }))}
                        className="w-full h-9 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-ink-muted mb-1">{t('categories.nameUr')}</label>
                      <input
                        dir="rtl"
                        value={editing.name_ur}
                        onChange={e => setEditing(v => v && ({ ...v, name_ur: e.target.value }))}
                        className="w-full h-9 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-ink-muted mb-1">{t('categories.parent')}</label>
                      <select
                        value={editing.parent_id}
                        onChange={e => setEditing(v => v && ({ ...v, parent_id: e.target.value }))}
                        className="w-full h-9 rounded-input border border-line bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                      >
                        <option value="">{t('categories.noParent')}</option>
                        {categories
                          .filter(c => c.id !== editing.id)
                          .map(c => (
                            <option key={c.id} value={c.id}>{c.name_en}</option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-ink-muted mb-1">Sort</label>
                      <input
                        type="number"
                        value={editing.sort_order}
                        onChange={e => setEditing(v => v && ({ ...v, sort_order: parseInt(e.target.value) || 0 }))}
                        className="w-full h-9 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 tabular"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setEditing(null)}
                      className="h-8 px-4 text-sm text-ink-muted border border-line rounded-btn hover:border-brand hover:text-brand transition-colors"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={save}
                      disabled={upsert.isPending}
                      className="h-8 px-4 text-sm bg-brand text-white rounded-btn hover:bg-brand-dark disabled:opacity-60 transition-colors flex items-center gap-1.5"
                    >
                      <Check size={14} />
                      {t('common.save')}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Category list */}
          <table className="w-full text-sm">
            <tbody>
              {categories.map(cat => {
                const parent = cat.parent_id ? categories.find(c => c.id === cat.parent_id) : null
                return (
                  <tr key={cat.id} className="border-b border-line last:border-0 hover:bg-page/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-ink">{cat.name_en}</div>
                      <div className="text-ink-muted text-xs" dir="rtl">{cat.name_ur}</div>
                      {parent && (
                        <div className="text-ink-muted text-xs mt-0.5">↳ {parent.name_en}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex items-center gap-2 justify-end">
                        {confirmDel === cat.id ? (
                          <>
                            <button
                              onClick={() => remove(cat.id)}
                              disabled={del.isPending}
                              className="h-7 px-3 bg-due text-white rounded-btn text-xs font-medium hover:bg-due/80 disabled:opacity-60 transition-colors"
                            >
                              {t('common.confirm')}
                            </button>
                            <button
                              onClick={() => setConfirmDel(null)}
                              className="h-7 px-3 border border-line text-ink-muted rounded-btn text-xs hover:border-brand hover:text-brand transition-colors"
                            >
                              {t('common.cancel')}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(cat)}
                              className="p-1.5 text-ink-muted hover:text-brand hover:bg-brand-soft rounded transition-colors"
                              title={t('common.edit')}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setConfirmDel(cat.id)}
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
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-line shrink-0">
          <button
            onClick={startAdd}
            disabled={!!editing}
            className={cn(
              'flex items-center gap-2 h-9 px-4 rounded-btn text-sm font-medium transition-colors',
              editing
                ? 'text-ink-muted bg-page cursor-not-allowed'
                : 'bg-brand text-white hover:bg-brand-dark'
            )}
          >
            <Plus size={15} />
            {t('categories.add')}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

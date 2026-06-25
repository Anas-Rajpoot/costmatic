import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { UserCog, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Profile, Role } from '@/types'
import { cn } from '@/lib/utils'

async function fetchUsers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at')
  if (error) throw error
  return data as Profile[]
}

async function updateUser(params: {
  id: string
  role?: Role
  discount_limit?: number
  is_active?: boolean
}) {
  const { id, ...updates } = params
  const { error } = await supabase.from('users').update(updates).eq('id', id)
  if (error) throw error
}

export default function UsersPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [editId, setEditId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<{
    role: Role
    discount_limit: number
    is_active: boolean
  } | null>(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  })

  const mutation = useMutation({
    mutationFn: updateUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setEditId(null)
      setEditValues(null)
    },
  })

  function startEdit(user: Profile) {
    setEditId(user.id)
    setEditValues({
      role: user.role,
      discount_limit: user.discount_limit,
      is_active: user.is_active,
    })
  }

  function cancelEdit() {
    setEditId(null)
    setEditValues(null)
  }

  function saveEdit(id: string) {
    if (!editValues) return
    mutation.mutate({ id, ...editValues })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-btn bg-brand-soft flex items-center justify-center">
            <UserCog size={18} className="text-brand" />
          </div>
          <h1 className="text-xl font-semibold text-ink">{t('users.title')}</h1>
        </div>
      </div>

      <div className="flex items-start gap-2 bg-info-soft border border-info/20 text-info rounded-card px-4 py-3 text-sm mb-6">
        <Info size={15} className="shrink-0 mt-0.5" />
        <span>{t('users.createNote')}</span>
      </div>

      <div className="bg-surface rounded-card border border-line overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-page">
                <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('users.name')}</th>
                <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('users.email')}</th>
                <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('users.role')}</th>
                <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('users.discountLimit')}</th>
                <th className="text-start px-4 py-3 text-ink-muted font-medium">{t('users.status')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const isEditing = editId === user.id
                return (
                  <tr key={user.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 text-ink font-medium">{user.full_name || '—'}</td>
                    <td className="px-4 py-3 text-ink-muted">{user.email}</td>

                    <td className="px-4 py-3">
                      {isEditing && editValues ? (
                        <select
                          value={editValues.role}
                          onChange={e => setEditValues(v => v && ({ ...v, role: e.target.value as Role }))}
                          className="h-8 rounded-input border border-line text-sm px-2 bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                        >
                          <option value="admin">{t('users.admin')}</option>
                          <option value="employee">{t('users.employee')}</option>
                        </select>
                      ) : (
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                          user.role === 'admin'
                            ? 'bg-brand-soft text-brand'
                            : 'bg-line text-ink-muted'
                        )}>
                          {user.role === 'admin' ? t('users.admin') : t('users.employee')}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {isEditing && editValues ? (
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={editValues.discount_limit}
                          onChange={e => setEditValues(v => v && ({ ...v, discount_limit: parseFloat(e.target.value) }))}
                          className="w-20 h-8 rounded-input border border-line text-sm px-2 bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 tabular"
                        />
                      ) : (
                        <span className="tabular">{user.discount_limit}%</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {isEditing && editValues ? (
                        <button
                          onClick={() => setEditValues(v => v && ({ ...v, is_active: !v.is_active }))}
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer',
                            editValues.is_active
                              ? 'bg-cash-soft text-cash'
                              : 'bg-due-soft text-due'
                          )}
                        >
                          {editValues.is_active ? t('users.active') : t('users.inactive')}
                        </button>
                      ) : (
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                          user.is_active
                            ? 'bg-cash-soft text-cash'
                            : 'bg-due-soft text-due'
                        )}>
                          {user.is_active ? t('users.active') : t('users.inactive')}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(user.id)}
                              disabled={mutation.isPending}
                              className="h-7 px-3 bg-brand text-white rounded-btn text-xs font-medium hover:bg-brand-dark transition-colors disabled:opacity-60"
                            >
                              {t('common.save')}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="h-7 px-3 bg-line text-ink rounded-btn text-xs font-medium hover:bg-line/70 transition-colors"
                            >
                              {t('common.cancel')}
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => startEdit(user)}
                            className="h-7 px-3 border border-line text-ink-muted rounded-btn text-xs font-medium hover:border-brand hover:text-brand transition-colors"
                          >
                            {t('common.edit')}
                          </button>
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
    </div>
  )
}

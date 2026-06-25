import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { UserCog, Info, Plus, X } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
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

interface NewEmployee {
  email: string
  password: string
  full_name: string
  role: Role
  discount_limit: number
}

async function createEmployee(input: NewEmployee) {
  const url = import.meta.env.VITE_SUPABASE_URL as string
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  // A throwaway client with no session persistence, so signing the new user up
  // does NOT replace the admin's logged-in session in this browser.
  const tmp = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await tmp.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.full_name } },
  })
  if (error) throw error
  const newId = data.user?.id
  if (!newId) throw new Error('Sign-up did not return a user id')
  // The handle_new_user trigger already inserted the profile row (role = employee).
  // Apply the chosen role / discount / name as the admin (RLS allows admin updates).
  const { error: ue } = await supabase
    .from('users')
    .update({
      full_name: input.full_name,
      role: input.role,
      discount_limit: input.role === 'admin' ? 0 : input.discount_limit,
    })
    .eq('id', newId)
  if (ue) throw ue
}

const BLANK_EMPLOYEE: NewEmployee = {
  email: '',
  password: '',
  full_name: '',
  role: 'employee',
  discount_limit: 0,
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

  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState<NewEmployee>(BLANK_EMPLOYEE)
  const [addError, setAddError] = useState('')

  const createMut = useMutation({
    mutationFn: createEmployee,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setShowAdd(false)
      setAddForm(BLANK_EMPLOYEE)
      setAddError('')
    },
    onError: (e: unknown) => setAddError(e instanceof Error ? e.message : String(e)),
  })

  function submitAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError('')
    if (!addForm.full_name.trim() || !addForm.email.trim() || addForm.password.length < 6) {
      setAddError(t('users.passwordHint'))
      return
    }
    createMut.mutate({
      ...addForm,
      email: addForm.email.trim(),
      full_name: addForm.full_name.trim(),
    })
  }

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
        <button
          onClick={() => { setAddForm(BLANK_EMPLOYEE); setAddError(''); setShowAdd(true) }}
          className="flex items-center gap-2 h-9 px-4 rounded-btn bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors"
        >
          <Plus size={15} />
          {t('users.addEmployee')}
        </button>
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

      {/* Add Employee modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAdd(false)} />
          <div className="relative bg-surface rounded-card border border-line shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h3 className="font-semibold text-ink">{t('users.newEmployee')}</h3>
              <button onClick={() => setShowAdd(false)} className="text-ink-muted hover:text-ink transition-colors">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitAdd} className="p-5 space-y-3">
              <div>
                <label className="block text-sm text-ink-muted mb-1.5">{t('users.fullName')}</label>
                <input
                  autoFocus
                  value={addForm.full_name}
                  onChange={e => setAddForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-ink-muted mb-1.5">{t('users.email')}</label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-ink-muted mb-1.5">{t('users.password')}</label>
                <input
                  type="text"
                  value={addForm.password}
                  onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink font-mono focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
                />
                <p className="text-xs text-ink-muted mt-1">{t('users.passwordHint')}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-ink-muted mb-1.5">{t('users.role')}</label>
                  <select
                    value={addForm.role}
                    onChange={e => setAddForm(f => ({ ...f, role: e.target.value as Role }))}
                    className="w-full h-10 rounded-input border border-line bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                  >
                    <option value="employee">{t('users.employee')}</option>
                    <option value="admin">{t('users.admin')}</option>
                  </select>
                </div>
                {addForm.role === 'employee' && (
                  <div>
                    <label className="block text-sm text-ink-muted mb-1.5">{t('users.discountLimit')}</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={addForm.discount_limit}
                      onChange={e => setAddForm(f => ({ ...f, discount_limit: parseFloat(e.target.value) || 0 }))}
                      className="w-full h-10 rounded-input border border-line bg-surface px-3 text-sm text-ink tabular focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-ink-muted">{t('users.emailConfirmNote')}</p>
              {addError && (
                <div className="text-due text-sm px-3 py-2 bg-due-soft rounded-input border border-due/20">
                  {addError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="h-10 px-4 border border-line text-ink-muted rounded-btn text-sm font-medium hover:border-brand hover:text-brand transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createMut.isPending}
                  className="h-10 px-5 bg-brand text-white rounded-btn text-sm font-semibold hover:bg-brand-dark disabled:opacity-60 transition-colors"
                >
                  {createMut.isPending ? t('users.creating') : t('users.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

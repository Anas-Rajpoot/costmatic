import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ExpenseCategory {
  id: string
  name_en: string
  name_ur: string
  sort_order: number
}

export interface Expense {
  id: string
  date: string
  category_id: string | null
  amount: number
  is_cash: boolean
  note: string | null
  created_at: string
  category: { name_en: string; name_ur: string } | null
  user: { full_name: string } | null
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: ['expense_categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('id, name_en, name_ur, sort_order')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as ExpenseCategory[]
    },
    staleTime: 10 * 60_000,
  })
}

/** Expenses for a date range (inclusive), newest first. */
export function useExpenses(from: string, to: string) {
  return useQuery({
    queryKey: ['expenses', from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select(`id, date, category_id, amount, is_cash, note, created_at,
                 category:expense_categories(name_en, name_ur),
                 user:users(full_name)`)
        .gte('date', from).lte('date', to)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(r => ({ ...r, amount: Number(r.amount) })) as unknown as Expense[]
    },
    staleTime: 30_000,
  })
}

export interface NewExpense {
  date: string
  category_id: string | null
  amount: number
  is_cash: boolean
  note?: string | null
}

export function useAddExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (e: NewExpense) => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) throw new Error('Not authenticated')
      const { data, error } = await supabase.from('expenses')
        .insert({ ...e, note: e.note ?? null, created_by: uid })
        .select('id').single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['day_summary'] })
      qc.invalidateQueries({ queryKey: ['dashboard_stats'] })
      qc.invalidateQueries({ queryKey: ['period_expenses'] })
    },
  })
}

export function useDeleteExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['day_summary'] })
      qc.invalidateQueries({ queryKey: ['dashboard_stats'] })
      qc.invalidateQueries({ queryKey: ['period_expenses'] })
    },
  })
}

export interface PeriodExpenses {
  total: number
  by_category: { category: string; category_ur: string; total: number; count: number }[]
}

/** Admin-only period totals, used by Reports. */
export function usePeriodExpenses(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ['period_expenses', from, to],
    enabled,
    queryFn: async (): Promise<PeriodExpenses> => {
      const { data, error } = await supabase.rpc('get_period_expenses', { p_from: from, p_to: to })
      if (error) throw error
      const d = data as { total: number; by_category: PeriodExpenses['by_category'] }
      return {
        total: Number(d.total ?? 0),
        by_category: (d.by_category ?? []).map(c => ({ ...c, total: Number(c.total), count: Number(c.count) })),
      }
    },
    staleTime: 60_000,
  })
}

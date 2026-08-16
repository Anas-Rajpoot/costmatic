import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type AdjustMode = 'set' | 'add' | 'remove'
export type AdjustReason =
  | 'wastage' | 'expiry' | 'damage' | 'theft' | 'count' | 'correction' | 'other'

export interface AdjustInput {
  product_id: string
  mode: AdjustMode
  quantity: number
  reason: AdjustReason
  note?: string | null
  date?: string | null
}

export interface AdjustResult {
  product: string
  before: number
  delta: number
  after: number
}

export function useAdjustStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AdjustInput): Promise<AdjustResult> => {
      const { data, error } = await supabase.rpc('adjust_stock', {
        p_product_id: input.product_id,
        p_mode: input.mode,
        p_quantity: input.quantity,
        p_reason: input.reason,
        p_note: input.note ?? null,
        p_date: input.date ?? null,
      })
      if (error) throw error
      const d = data as AdjustResult
      return { ...d, before: Number(d.before), delta: Number(d.delta), after: Number(d.after) }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['stock_adjustments'] })
      qc.invalidateQueries({ queryKey: ['dashboard_stats'] })
    },
  })
}

export interface StockAdjustment {
  id: string
  date: string
  before_qty: number
  delta: number
  after_qty: number
  reason: AdjustReason
  note: string | null
  created_at: string
  product: { name_en: string; name_ur: string | null; base_unit: string } | null
  user: { full_name: string } | null
}

export function useStockAdjustments(limit = 30) {
  return useQuery({
    queryKey: ['stock_adjustments', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_adjustments')
        .select(`id, date, before_qty, delta, after_qty, reason, note, created_at,
                 product:products(name_en, name_ur, base_unit),
                 user:users(full_name)`)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []).map(r => ({
        ...r,
        before_qty: Number(r.before_qty),
        delta: Number(r.delta),
        after_qty: Number(r.after_qty),
      })) as unknown as StockAdjustment[]
    },
    staleTime: 30_000,
  })
}

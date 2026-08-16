import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface DaySummary {
  date: string
  opening_cash: number
  cash_sales: number
  khata_collected: number
  returns_cash: number
  supplier_paid: number
  purchases_cash: number
  expenses_cash: number
  expected_cash: number
  invoices: number
  returns_count: number
  sales_total: number
  udhaar_given: number
  closed: boolean
  counted_cash: number | null
  difference: number | null
  closed_at: string | null
  note: string | null
}

const num = (v: unknown) => Number(v ?? 0)

function normalise(raw: Record<string, unknown>): DaySummary {
  return {
    date: String(raw.date),
    opening_cash: num(raw.opening_cash),
    cash_sales: num(raw.cash_sales),
    khata_collected: num(raw.khata_collected),
    returns_cash: num(raw.returns_cash),
    supplier_paid: num(raw.supplier_paid),
    purchases_cash: num(raw.purchases_cash),
    expenses_cash: num(raw.expenses_cash),
    expected_cash: num(raw.expected_cash),
    invoices: num(raw.invoices),
    returns_count: num(raw.returns_count),
    sales_total: num(raw.sales_total),
    udhaar_given: num(raw.udhaar_given),
    closed: Boolean(raw.closed),
    counted_cash: raw.counted_cash == null ? null : num(raw.counted_cash),
    difference: raw.difference == null ? null : num(raw.difference),
    closed_at: (raw.closed_at as string) ?? null,
    note: (raw.note as string) ?? null,
  }
}

/** The day's cash movement, straight from the ledgers. */
export function useDaySummary(date: string) {
  return useQuery({
    queryKey: ['day_summary', date],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_day_summary', { p_date: date })
      if (error) throw error
      return normalise(data as Record<string, unknown>)
    },
    staleTime: 15_000,
  })
}

export function useCloseDay() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { date: string; counted: number; note?: string | null }) => {
      const { data, error } = await supabase.rpc('close_day', {
        p_date: input.date,
        p_counted: input.counted,
        p_note: input.note ?? null,
      })
      if (error) throw error
      return normalise(data as Record<string, unknown>)
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['day_summary', d.date] })
      qc.invalidateQueries({ queryKey: ['day_closes'] })
    },
  })
}

export interface DayCloseRow {
  date: string
  expected_cash: number
  counted_cash: number
  difference: number
  closed_at: string
}

/** Recent closes — the owner's at-a-glance history of over/short. */
export function useRecentCloses(limit = 14) {
  return useQuery({
    queryKey: ['day_closes', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('day_closes')
        .select('date, expected_cash, counted_cash, difference, closed_at')
        .order('date', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []).map(r => ({
        date: String(r.date),
        expected_cash: num(r.expected_cash),
        counted_cash: num(r.counted_cash),
        difference: num(r.difference),
        closed_at: String(r.closed_at),
      })) as DayCloseRow[]
    },
    staleTime: 60_000,
  })
}

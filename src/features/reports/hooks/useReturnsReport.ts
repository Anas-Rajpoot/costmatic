import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ReturnRow {
  id: string
  return_no: string
  date: string
  total: number
  refund_mode: 'cash' | 'khata'
  note: string | null
  sale: { invoice_no: string } | null
  customer: { name: string } | null
  item_count: number
}

/**
 * Margin lost to returns in a period — NOT the refunded value.
 * Returned goods go back on the shelf, so their cost is recovered and only the
 * profit on them is gone. This is the figure that comes off gross profit.
 */
export function usePeriodReturnsMargin(
  from: string, to: string, saleType: string | null, enabled = true,
) {
  return useQuery({
    queryKey: ['returns_margin', from, to, saleType],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_period_returns_margin', {
        p_from: from, p_to: to, p_sale_type: saleType,
      })
      if (error) throw error
      return Number(data ?? 0)
    },
    staleTime: 60_000,
  })
}

/** Returns raised in a period — what came back, and how it was refunded. */
export function useReturnsReport(from: string, to: string) {
  return useQuery({
    queryKey: ['returns_report', from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sale_returns')
        .select(`id, return_no, date, total, refund_mode, note,
                 sale:sales(invoice_no), customer:customers(name),
                 items:sale_return_items(id)`)
        .gte('date', from).lte('date', to)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(r => {
        const row = r as unknown as Omit<ReturnRow, 'item_count'> & { items: { id: string }[] }
        return { ...row, total: Number(row.total), item_count: row.items?.length ?? 0 }
      }) as ReturnRow[]
    },
    staleTime: 30_000,
  })
}

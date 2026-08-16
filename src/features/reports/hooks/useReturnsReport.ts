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

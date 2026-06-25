import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface DashboardStats {
  today_total: number
  today_cash: number
  today_udhaar: number
  today_invoices: number
  total_receivable: number
  total_payable: number
  low_stock_count: number
}

export function useDashboardStats() {
  const today = new Date().toISOString().split('T')[0]
  return useQuery({
    queryKey: ['dashboard_stats', today],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_stats', { p_date: today })
      if (error) throw error
      return data as DashboardStats
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
}

export function useTodayProfit() {
  const today = new Date().toISOString().split('T')[0]
  return useQuery({
    queryKey: ['profit', today, today],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_period_profit', {
        p_from: today,
        p_to: today,
      })
      if (error) throw error
      return Number(data ?? 0)
    },
    staleTime: 60_000,
  })
}

export interface RecentSaleRow {
  id: string
  invoice_no: string
  date: string
  total: number
  payment_type: string
  customer_name: string | null
  created_at: string
}

export function useRecentSales() {
  return useQuery({
    queryKey: ['recent_sales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales')
        .select('id, invoice_no, date, total, payment_type, created_at, customer:customers(name)')
        .eq('is_void', false)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return (data ?? []).map(r => ({
        id: r.id,
        invoice_no: r.invoice_no,
        date: r.date,
        total: Number(r.total),
        payment_type: r.payment_type,
        created_at: r.created_at,
        customer_name: (r.customer as unknown as { name: string } | null)?.name ?? null,
      })) as RecentSaleRow[]
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

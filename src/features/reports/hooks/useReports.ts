import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface SalesByDayRow {
  sale_date: string
  invoice_count: number
  cash_total: number
  udhaar_total: number
  day_total: number
}

export interface ItemSaleRow {
  product_name: string
  unit_name: string
  total_qty: number
  revenue: number
}

export function useSalesByDay(from: string, to: string) {
  return useQuery({
    queryKey: ['report_sales_day', from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_sales_by_day', {
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        sale_date: r.sale_date as string,
        invoice_count: Number(r.invoice_count),
        cash_total: Number(r.cash_total),
        udhaar_total: Number(r.udhaar_total),
        day_total: Number(r.day_total),
      })) as SalesByDayRow[]
    },
    enabled: !!from && !!to,
    staleTime: 5 * 60_000,
  })
}

export function useItemSales(from: string, to: string) {
  return useQuery({
    queryKey: ['report_items', from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_item_sales', {
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        product_name: r.product_name as string,
        unit_name: r.unit_name as string,
        total_qty: Number(r.total_qty),
        revenue: Number(r.revenue),
      })) as ItemSaleRow[]
    },
    enabled: !!from && !!to,
    staleTime: 5 * 60_000,
  })
}

export function usePeriodProfit(from: string, to: string) {
  return useQuery({
    queryKey: ['profit', from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_period_profit', {
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      return Number(data ?? 0)
    },
    enabled: !!from && !!to,
    staleTime: 5 * 60_000,
  })
}

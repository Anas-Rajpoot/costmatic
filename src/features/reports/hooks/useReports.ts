import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type SaleTypeFilter = 'retail' | 'wholesale' | null

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

export interface SalesSplit {
  retail_total: number
  retail_count: number
  wholesale_total: number
  wholesale_count: number
}

export function useSalesByDay(from: string, to: string, saleType: SaleTypeFilter = null) {
  return useQuery({
    queryKey: ['report_sales_day', from, to, saleType],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_sales_by_day', {
        p_from: from,
        p_to: to,
        p_sale_type: saleType,
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

export function useItemSales(from: string, to: string, saleType: SaleTypeFilter = null) {
  return useQuery({
    queryKey: ['report_items', from, to, saleType],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_item_sales', {
        p_from: from,
        p_to: to,
        p_sale_type: saleType,
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

export function usePeriodProfit(from: string, to: string, saleType: SaleTypeFilter = null) {
  return useQuery({
    queryKey: ['profit', from, to, saleType],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_period_profit', {
        p_from: from,
        p_to: to,
        p_sale_type: saleType,
      })
      if (error) throw error
      return Number(data ?? 0)
    },
    enabled: !!from && !!to,
    staleTime: 5 * 60_000,
  })
}

/** Retail vs wholesale totals for the period — always returns both (for the owner's split view). */
export function useSalesSplit(from: string, to: string) {
  return useQuery({
    queryKey: ['report_split', from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_sales_split', { p_from: from, p_to: to })
      if (error) throw error
      const d = (data ?? {}) as Record<string, unknown>
      return {
        retail_total: Number(d.retail_total ?? 0),
        retail_count: Number(d.retail_count ?? 0),
        wholesale_total: Number(d.wholesale_total ?? 0),
        wholesale_count: Number(d.wholesale_count ?? 0),
      } as SalesSplit
    },
    enabled: !!from && !!to,
    staleTime: 5 * 60_000,
  })
}

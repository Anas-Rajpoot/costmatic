import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Purchase } from '@/types'

export function usePurchases() {
  return useQuery({
    queryKey: ['purchases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchases')
        .select('*, supplier:suppliers(id, name)')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Purchase[]
    },
  })
}

export interface PurchaseItemInput {
  product_id: string
  unit_name: string
  quantity: number
  unit_cost: number
  line_total: number
}

export function useCreatePurchase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: {
      supplier_id: string
      invoice_no: string
      date: string
      subtotal: number
      discount: number
      total: number
      paid: number
      note: string
      created_by: string
      items: PurchaseItemInput[]
    }) => {
      const { data, error } = await supabase.rpc('create_purchase', {
        p_supplier_id: p.supplier_id,
        p_invoice_no: p.invoice_no || null,
        p_date: p.date,
        p_subtotal: p.subtotal,
        p_discount: p.discount,
        p_total: p.total,
        p_paid: p.paid,
        p_note: p.note || null,
        p_created_by: p.created_by,
        p_items: p.items,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['suppliers'] })
    },
  })
}

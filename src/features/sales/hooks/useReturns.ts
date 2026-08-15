import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** A sale line as it appears in the return screen, with what is still returnable. */
export interface ReturnableItem {
  sale_item_id: string
  product_id: string
  product_name_en: string
  product_name_ur: string | null
  product_kind: string | null
  unit_name: string
  sold_quantity: number
  returned_quantity: number
  remaining: number
  unit_price: number
}

export interface ReturnableSale {
  id: string
  invoice_no: string
  date: string
  total: number
  paid: number
  due: number
  is_void: boolean
  customer: { id: string; name: string; current_balance: number } | null
  items: ReturnableItem[]
}

interface SaleItemRow {
  id: string
  product_id: string
  unit_name: string
  quantity: number | string
  unit_price: number
  product: { name_en: string; name_ur: string | null; product_kind: string | null } | null
}

/**
 * Look an invoice up for a return. Accepts the printed invoice number in any
 * case, with or without the "INV-2026-" prefix (cashiers type just the digits).
 */
export function useSaleLookup(invoiceNo: string) {
  const term = invoiceNo.trim()
  return useQuery({
    queryKey: ['sale_lookup', term.toUpperCase()],
    enabled: term.length > 0,
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<ReturnableSale | null> => {
      const select = `
        id, invoice_no, date, total, paid, due, is_void,
        customer:customers(id, name, current_balance),
        items:sale_items(id, product_id, unit_name, quantity, unit_price,
          product:products(name_en, name_ur, product_kind))
      `
      // Exact match first, then a suffix match so "34" finds INV-2026-0034.
      let { data, error } = await supabase.from('sales').select(select)
        .ilike('invoice_no', term).limit(1).maybeSingle()
      if (error) throw error
      if (!data) {
        const res = await supabase.from('sales').select(select)
          .ilike('invoice_no', `%${term}`).order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (res.error) throw res.error
        data = res.data
      }
      if (!data) return null

      const sale = data as unknown as {
        id: string; invoice_no: string; date: string; total: number; paid: number; due: number
        is_void: boolean
        customer: { id: string; name: string; current_balance: number } | null
        items: SaleItemRow[]
      }

      // How much of each line already came back on an earlier return.
      const ids = sale.items.map(i => i.id)
      const { data: prior, error: pErr } = await supabase
        .from('sale_return_items').select('sale_item_id, quantity').in('sale_item_id', ids)
      if (pErr) throw pErr
      const returned = new Map<string, number>()
      for (const r of (prior ?? []) as { sale_item_id: string; quantity: number | string }[]) {
        returned.set(r.sale_item_id, (returned.get(r.sale_item_id) ?? 0) + Number(r.quantity))
      }

      return {
        ...sale,
        customer: sale.customer
          ? { ...sale.customer, current_balance: Number(sale.customer.current_balance) }
          : null,
        items: sale.items.map(i => {
          const sold = Number(i.quantity)
          const back = returned.get(i.id) ?? 0
          return {
            sale_item_id: i.id,
            product_id: i.product_id,
            product_name_en: i.product?.name_en ?? '',
            product_name_ur: i.product?.name_ur ?? null,
            product_kind: i.product?.product_kind ?? 'standard',
            unit_name: i.unit_name,
            sold_quantity: sold,
            returned_quantity: back,
            remaining: Math.max(0, sold - back),
            unit_price: Number(i.unit_price),
          }
        }),
      }
    },
  })
}

export interface CreateReturnInput {
  sale_id: string
  date: string
  refund_mode: 'cash' | 'khata'
  note?: string | null
  items: { sale_item_id: string; quantity: number }[]
}

export interface ReturnResult {
  return_id: string
  return_no: string
  total: number
  refund_mode: 'cash' | 'khata'
}

export function useCreateReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateReturnInput): Promise<ReturnResult> => {
      const { data, error } = await supabase.rpc('create_sale_return', {
        p_sale_id: input.sale_id,
        p_date: input.date,
        p_items: input.items,
        p_refund_mode: input.refund_mode,
        p_note: input.note ?? null,
        p_client_id: crypto.randomUUID(),
      })
      if (error) throw error
      return data as ReturnResult
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['sale_lookup'] })
      qc.invalidateQueries({ queryKey: ['pos_recent_sales'] })
      qc.invalidateQueries({ queryKey: ['dashboard_stats'] })
    },
  })
}

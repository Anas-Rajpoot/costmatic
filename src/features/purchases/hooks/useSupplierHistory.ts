import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** One product this supplier has delivered before, with the last terms used. */
export interface SupplierProduct {
  product_id: string
  product_name: string
  name_ur: string
  unit_name: string
  last_cost: number
  last_qty: number
  last_date: string
  times: number
}

/**
 * What this supplier has actually delivered before, most recent first.
 *
 * A wholesaler brings roughly the same list every time, so re-picking each item
 * out of a 40-product dropdown is the slow part of stock-in. This gives the
 * shopkeeper their own order sheet to tick off instead, pre-filled with the
 * unit and the price last paid.
 */
export function useSupplierProducts(supplierId: string) {
  return useQuery({
    queryKey: ['supplier_products', supplierId],
    enabled: !!supplierId,
    queryFn: async (): Promise<SupplierProduct[]> => {
      const { data, error } = await supabase
        .from('purchase_items')
        .select(`product_id, unit_name, quantity, unit_cost,
                 purchases!inner(supplier_id, date),
                 products!inner(name_en, name_ur)`)
        .eq('purchases.supplier_id', supplierId)
        .order('date', { referencedTable: 'purchases', ascending: false })
        .limit(400)
      if (error) throw error

      // Collapse to one row per product: the most recent delivery wins, but we
      // keep a count so a regular line is visibly different from a one-off.
      const byProduct = new Map<string, SupplierProduct>()
      for (const raw of (data ?? []) as unknown as Array<{
        product_id: string
        unit_name: string
        quantity: number
        unit_cost: number
        purchases: { date: string }
        products: { name_en: string; name_ur: string }
      }>) {
        const seen = byProduct.get(raw.product_id)
        if (seen) { seen.times += 1; continue }
        byProduct.set(raw.product_id, {
          product_id: raw.product_id,
          product_name: raw.products?.name_en ?? '',
          name_ur: raw.products?.name_ur ?? '',
          unit_name: raw.unit_name,
          last_cost: Number(raw.unit_cost) || 0,
          last_qty: Number(raw.quantity) || 1,
          last_date: raw.purchases?.date ?? '',
          times: 1,
        })
      }
      return [...byProduct.values()].sort((a, b) => b.last_date.localeCompare(a.last_date))
    },
    staleTime: 60_000,
  })
}

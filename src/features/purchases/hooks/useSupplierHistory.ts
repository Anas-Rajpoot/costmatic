import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** One delivery from a supplier, with the goods that came with it. */
export interface SupplierPurchase {
  id: string
  invoice_no: string | null
  date: string
  subtotal: number
  discount: number
  total: number
  paid: number
  due: number
  items: {
    product_name: string
    unit_name: string
    quantity: number
    unit_cost: number
    line_total: number
  }[]
}

/**
 * Every delivery from this supplier, newest first, with its line items.
 *
 * The khata only ever said "purchase — Rs 5,000". This is the other half of
 * the record: what actually arrived that day, in what unit, at what price.
 */
export function useSupplierPurchases(supplierId: string) {
  return useQuery({
    queryKey: ['supplier_purchases', supplierId],
    enabled: !!supplierId,
    queryFn: async (): Promise<SupplierPurchase[]> => {
      const { data, error } = await supabase
        .from('purchases')
        .select(`id, invoice_no, date, subtotal, discount, total, paid, due,
                 purchase_items(quantity, unit_name, unit_cost, line_total,
                                products(name_en))`)
        .eq('supplier_id', supplierId)
        .order('date', { ascending: false })
        .limit(100)
      if (error) throw error

      return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(r => ({
        id: String(r.id),
        invoice_no: (r.invoice_no as string) ?? null,
        date: String(r.date),
        subtotal: Number(r.subtotal) || 0,
        discount: Number(r.discount) || 0,
        total: Number(r.total) || 0,
        paid: Number(r.paid) || 0,
        due: Number(r.due) || 0,
        items: ((r.purchase_items ?? []) as Array<{
          quantity: number; unit_name: string; unit_cost: number; line_total: number
          products: { name_en: string } | null
        }>).map(i => ({
          product_name: i.products?.name_en ?? '',
          unit_name: i.unit_name,
          quantity: Number(i.quantity) || 0,
          unit_cost: Number(i.unit_cost) || 0,
          line_total: Number(i.line_total) || 0,
        })),
      }))
    },
    staleTime: 60_000,
  })
}

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

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Product, ProductUnit } from '@/types'

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          category:categories(id, name_en, name_ur),
          units:product_units(*),
          stock(quantity_in_base_unit, updated_at),
          product_costs(cost_price)
        `)
        .order('name_en')
      if (error) throw error
      // PostgREST returns one-to-one embeds (stock, product_costs — their
      // product_id is unique) as a single object, but the app reads them as
      // arrays (stock[0], product_costs[0]). Normalize to arrays so stock
      // quantities and cost prices read correctly everywhere.
      return (data as unknown as Record<string, unknown>[]).map(p => ({
        ...p,
        stock: p.stock == null ? [] : Array.isArray(p.stock) ? p.stock : [p.stock],
        product_costs:
          p.product_costs == null ? [] : Array.isArray(p.product_costs) ? p.product_costs : [p.product_costs],
      })) as unknown as Product[]
    },
    // Stock can change from sales/purchases (even from another device), so always
    // revalidate when a screen opens. Cached data still shows instantly + offline.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })
}

export type UnitInput = Omit<ProductUnit, 'id' | 'product_id' | 'created_at'>

export interface SaveProductInput {
  product: Omit<Product, 'id' | 'created_at' | 'category' | 'units' | 'stock' | 'product_costs'> & { id?: string }
  units: UnitInput[]
  opening_stock?: number
  // Admin-only; written to the separate product_costs table. Leave undefined
  // for employees so the cost is never touched.
  cost_price?: number
}

export function useSaveProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ product, units, opening_stock, cost_price }: SaveProductInput) => {
      const { id, ...fields } = product
      let pid = id

      if (id) {
        const { error: pe } = await supabase.from('products').update(fields).eq('id', id)
        if (pe) throw pe
        const { error: du } = await supabase.from('product_units').delete().eq('product_id', id)
        if (du) throw du
        if (units.length > 0) {
          const { error: iu } = await supabase
            .from('product_units')
            .insert(units.map(u => ({ ...u, product_id: id })))
          if (iu) throw iu
        }
      } else {
        const { data: pd, error: pe } = await supabase
          .from('products')
          .insert(fields)
          .select('id')
          .single()
        if (pe) throw pe
        pid = pd.id as string
        if (units.length > 0) {
          const { error: iu } = await supabase
            .from('product_units')
            .insert(units.map(u => ({ ...u, product_id: pid })))
          if (iu) {
            await supabase.from('products').delete().eq('id', pid)
            throw iu
          }
        }
        const { error: se } = await supabase.from('stock').insert({
          product_id: pid,
          quantity_in_base_unit: opening_stock ?? 0,
        })
        if (se) throw se
      }

      // Cost price lives in the admin-only product_costs table (RLS-guarded).
      if (cost_price !== undefined && pid) {
        const { error: ce } = await supabase
          .from('product_costs')
          .upsert({ product_id: pid, cost_price, updated_at: new Date().toISOString() })
        if (ce) throw ce
      }

      return pid as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export interface BulkDeleteResult {
  deleted: number
  /** Products the database refused to drop, with the reason in shop terms. */
  blocked: { id: string; name: string; reason: 'traded' | 'other'; message: string }[]
}

/**
 * Delete many products at once.
 *
 * sale_items and purchase_items reference products with no cascade, so a
 * product that has ever been billed or bought cannot be removed — the row is
 * what makes an old invoice still readable. A single bulk statement would fail
 * entirely on the first such product, taking the deletable ones down with it,
 * so this tries the batch and falls back to one-by-one to salvage the rest and
 * name exactly what was kept.
 */
export function useBulkDeleteProducts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (items: { id: string; name: string }[]): Promise<BulkDeleteResult> => {
      if (items.length === 0) return { deleted: 0, blocked: [] }

      const bulk = await supabase.from('products').delete().in('id', items.map(i => i.id))
      if (!bulk.error) return { deleted: items.length, blocked: [] }

      const blocked: BulkDeleteResult['blocked'] = []
      let deleted = 0
      for (const it of items) {
        const { error } = await supabase.from('products').delete().eq('id', it.id)
        if (!error) { deleted++; continue }
        // 23503 = foreign key violation → the product appears on a bill or purchase.
        blocked.push({
          id: it.id,
          name: it.name,
          reason: error.code === '23503' ? 'traded' : 'other',
          message: error.message,
        })
      }
      return { deleted, blocked }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

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
          stock(quantity_in_base_unit, updated_at)
        `)
        .order('name_en')
      if (error) throw error
      return data as Product[]
    },
  })
}

export type UnitInput = Omit<ProductUnit, 'id' | 'product_id' | 'created_at'>

export interface SaveProductInput {
  product: Omit<Product, 'id' | 'created_at' | 'category' | 'units' | 'stock'> & { id?: string }
  units: UnitInput[]
  opening_stock?: number
}

export function useSaveProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ product, units, opening_stock }: SaveProductInput) => {
      const { id, ...fields } = product

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
        const pid = pd.id as string
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

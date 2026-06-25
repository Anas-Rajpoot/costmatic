import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Category } from '@/types'

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order')
        .order('name_en')
      if (error) throw error
      return data as Category[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpsertCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cat: Partial<Category> & { name_en: string; name_ur: string }) => {
      const { id, created_at, ...rest } = cat
      if (id) {
        const { error } = await supabase.from('categories').update(rest).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('categories').insert(rest)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

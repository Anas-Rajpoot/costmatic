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

export interface CategoryOption { id: string; label: string; depth: number }

// Flatten categories into a parent→child ordered list for an indented <select>.
// Parents (sort_order) first, each immediately followed by its children (sort_order).
// `isUrdu` picks the display name; falls back to English.
export function categoryOptions(categories: Category[], isUrdu = false): CategoryOption[] {
  const name = (c: Category) => (isUrdu ? c.name_ur || c.name_en : c.name_en)
  const bySort = (a: Category, b: Category) => a.sort_order - b.sort_order || name(a).localeCompare(name(b))
  const parents = categories.filter(c => !c.parent_id).sort(bySort)
  const out: CategoryOption[] = []
  for (const p of parents) {
    out.push({ id: p.id, label: name(p), depth: 0 })
    for (const c of categories.filter(x => x.parent_id === p.id).sort(bySort)) {
      out.push({ id: c.id, label: name(c), depth: 1 })
    }
  }
  // Any orphans (parent missing) — append flat so they're never lost.
  const seen = new Set(out.map(o => o.id))
  for (const c of categories) if (!seen.has(c.id)) out.push({ id: c.id, label: name(c), depth: 0 })
  return out
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

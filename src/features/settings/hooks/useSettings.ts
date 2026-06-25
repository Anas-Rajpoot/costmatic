import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('key,value')
      if (error) throw error
      return Object.fromEntries((data ?? []).map(r => [r.key, r.value])) as Record<string, string>
    },
    staleTime: 1000 * 60 * 10,
  })
}

export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Record<string, string>) => {
      const rows = Object.entries(patch).map(([key, value]) => ({ key, value }))
      const { error } = await supabase.from('settings').upsert(rows, { onConflict: 'key' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}

export interface AuditEntry {
  id: string
  table_name: string
  record_id: string | null
  action: string
  user_id: string | null
  user_name: string | null
  summary: string | null
  created_at: string
}

export function useAuditLog(limit = 200) {
  return useQuery({
    queryKey: ['audit_log', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as AuditEntry[]
    },
  })
}

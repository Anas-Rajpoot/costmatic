import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Supplier, SupplierLedger } from '@/types'

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name')
      if (error) throw error
      return data as Supplier[]
    },
  })
}

export function useUpsertSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (s: Partial<Supplier> & { name: string }) => {
      const { id, created_at, ...rest } = s
      if (id) {
        const { error } = await supabase.from('suppliers').update(rest).eq('id', id)
        if (error) throw error
      } else {
        const opening = Number(rest.opening_balance ?? 0)
        const { data, error } = await supabase
          .from('suppliers')
          .insert({ ...rest, current_balance: opening })
          .select('id')
          .single()
        if (error) throw error
        if (opening > 0) {
          await supabase.from('supplier_ledger').insert({
            supplier_id: data.id,
            type: 'opening',
            amount: opening,
            date: new Date().toISOString().split('T')[0],
          })
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}

export function useDeleteSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('suppliers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}

export function usePaySupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: {
      supplier_id: string
      amount: number
      method: string
      date: string
      note: string
      created_by: string
    }) => {
      const { error } = await supabase.rpc('pay_supplier', {
        p_supplier_id: p.supplier_id,
        p_amount: p.amount,
        p_method: p.method,
        p_date: p.date,
        p_note: p.note,
        p_created_by: p.created_by,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      qc.invalidateQueries({ queryKey: ['supplier_ledger'] })
    },
  })
}

export function useSupplierLedger(supplierId: string | null) {
  return useQuery({
    queryKey: ['supplier_ledger', supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_ledger')
        .select('*')
        .eq('supplier_id', supplierId!)
        .order('date')
        .order('created_at')
      if (error) throw error
      return data as SupplierLedger[]
    },
    enabled: !!supplierId,
  })
}

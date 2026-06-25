import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Customer, CustomerLedger } from '@/types'

export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name')
      if (error) throw error
      return data as Customer[]
    },
  })
}

export function useUpsertCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: Partial<Customer> & { name: string }) => {
      const { id, created_at, ...rest } = c
      if (id) {
        const { error } = await supabase.from('customers').update(rest).eq('id', id)
        if (error) throw error
      } else {
        const opening = Number(rest.opening_balance ?? 0)
        const { data, error } = await supabase
          .from('customers')
          .insert({ ...rest, current_balance: opening })
          .select('id')
          .single()
        if (error) throw error
        if (opening > 0) {
          await supabase.from('customer_ledger').insert({
            customer_id: data.id,
            type: 'opening',
            amount: opening,
            date: new Date().toISOString().split('T')[0],
          })
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useDeleteCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function usePayCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: {
      customer_id: string
      amount: number
      date: string
      note: string
      created_by: string
    }) => {
      const { error } = await supabase.rpc('pay_customer', {
        p_customer_id: p.customer_id,
        p_amount:      p.amount,
        p_date:        p.date,
        p_note:        p.note,
        p_created_by:  p.created_by,
      })
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['customer_ledger', vars.customer_id] })
    },
  })
}

export function useCustomerLedger(customerId: string | null) {
  return useQuery({
    queryKey: ['customer_ledger', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_ledger')
        .select('*')
        .eq('customer_id', customerId!)
        .order('date')
        .order('created_at')
      if (error) throw error
      return data as CustomerLedger[]
    },
    enabled: !!customerId,
  })
}

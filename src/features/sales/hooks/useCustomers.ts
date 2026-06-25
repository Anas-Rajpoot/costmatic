import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Customer } from '@/types'

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
    staleTime: 2 * 60 * 1000,
  })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: Pick<Customer, 'name' | 'phone' | 'customer_type'>) => {
      const { data, error } = await supabase
        .from('customers')
        .insert(c)
        .select('*')
        .single()
      if (error) throw error
      return data as Customer
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

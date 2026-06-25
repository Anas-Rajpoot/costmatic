import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { enqueueOfflineSale } from '@/lib/offlineQueue'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useSyncContext } from '@/lib/SyncContext'

export interface SaleItemInput {
  product_id: string
  unit_name: string
  quantity: number
  unit_price: number
  discount_pct: number
  line_total: number
}

export interface CreateSaleInput {
  customer_id: string | null
  date: string
  subtotal: number
  discount: number
  tax: number
  total: number
  paid: number
  due: number
  payment_type: 'cash' | 'udhaar' | 'mixed'
  created_by: string
  items: SaleItemInput[]
}

export function useCreateSale() {
  const qc = useQueryClient()
  const isOnline = useOnlineStatus()
  const { refetchQueue } = useSyncContext()

  return useMutation({
    mutationFn: async (input: CreateSaleInput) => {
      const clientId = crypto.randomUUID()

      if (!isOnline) {
        await enqueueOfflineSale({
          client_id: clientId,
          payload: input,
          queued_at: new Date().toISOString(),
          status: 'pending',
        })
        await refetchQueue()
        const seq = Date.now().toString().slice(-4).padStart(4, '0')
        return {
          sale_id: clientId,
          invoice_no: `OFFLINE-${input.date}-${seq}`,
          offline: true,
        } as { sale_id: string; invoice_no: string; offline?: boolean }
      }

      const { data, error } = await supabase.rpc('create_sale', {
        p_customer_id:  input.customer_id,
        p_date:         input.date,
        p_subtotal:     input.subtotal,
        p_discount:     input.discount,
        p_tax:          input.tax,
        p_total:        input.total,
        p_paid:         input.paid,
        p_due:          input.due,
        p_payment_type: input.payment_type,
        p_created_by:   input.created_by,
        p_items:        input.items,
        p_client_id:    clientId,
      })
      if (error) throw error
      return data as { sale_id: string; invoice_no: string }
    },
    onSuccess: () => {
      if (isOnline) {
        qc.invalidateQueries({ queryKey: ['products'] })
        qc.invalidateQueries({ queryKey: ['customers'] })
        qc.invalidateQueries({ queryKey: ['recent_sales'] })
        qc.invalidateQueries({ queryKey: ['dashboard_stats'] })
      }
    },
  })
}

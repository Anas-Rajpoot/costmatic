import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { enqueueOfflineSale } from '@/lib/offlineQueue'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useSyncContext } from '@/lib/SyncContext'

export interface RecentSaleItem {
  unit_name: string
  quantity: number
  unit_price: number
  discount_pct: number
  line_total: number
  product: { name_en: string; name_ur: string } | null
}

export interface RecentSale {
  id: string
  invoice_no: string
  date: string
  subtotal: number
  total: number
  paid: number
  due: number
  created_at: string
  customer: { name: string } | null
  items: RecentSaleItem[]
}

/** Last N sales with their items — used for the POS "Recent Sales" reprint list. */
export function useRecentSales(limit = 10) {
  return useQuery({
    queryKey: ['pos_recent_sales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales')
        .select(`
          id, invoice_no, date, subtotal, total, paid, due, created_at,
          customer:customers(name),
          items:sale_items(unit_name, quantity, unit_price, discount_pct, line_total,
            product:products(name_en, name_ur))
        `)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data as unknown as RecentSale[]
    },
    staleTime: 30_000,
  })
}

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
  sale_type: 'retail' | 'wholesale'
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
        p_sale_type:    input.sale_type,
      })
      if (error) throw error
      return data as { sale_id: string; invoice_no: string }
    },
    onSuccess: () => {
      if (isOnline) {
        qc.invalidateQueries({ queryKey: ['products'] })
        qc.invalidateQueries({ queryKey: ['customers'] })
        qc.invalidateQueries({ queryKey: ['recent_sales'] })
        qc.invalidateQueries({ queryKey: ['pos_recent_sales'] })
        qc.invalidateQueries({ queryKey: ['dashboard_stats'] })
      }
    },
  })
}

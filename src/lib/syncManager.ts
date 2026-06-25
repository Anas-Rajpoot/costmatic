import { supabase } from './supabase'
import { getQueue, removeFromQueue, markConflict } from './offlineQueue'

export async function flushOfflineQueue(onDone?: () => void): Promise<{ synced: number; conflicts: number }> {
  const queue = await getQueue()
  const pending = queue.filter(s => s.status === 'pending')
  let synced = 0
  let conflicts = 0

  for (const item of pending) {
    try {
      const { error } = await supabase.rpc('create_sale', {
        p_customer_id:  item.payload.customer_id,
        p_date:         item.payload.date,
        p_subtotal:     item.payload.subtotal,
        p_discount:     item.payload.discount,
        p_tax:          item.payload.tax,
        p_total:        item.payload.total,
        p_paid:         item.payload.paid,
        p_due:          item.payload.due,
        p_payment_type: item.payload.payment_type,
        p_created_by:   item.payload.created_by,
        p_items:        item.payload.items,
        p_client_id:    item.client_id,
      })
      if (error) throw error
      await removeFromQueue(item.client_id)
      synced++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('insufficient stock') || msg.toLowerCase().includes('stock')) {
        await markConflict(item.client_id, msg)
        conflicts++
      }
      // other errors: leave as pending for next retry
    }
  }

  onDone?.()
  return { synced, conflicts }
}

import { get, set } from 'idb-keyval'
import type { CreateSaleInput } from '@/features/sales/hooks/useSales'

const KEY = 'costmatic_offline_queue'

export interface QueuedSale {
  client_id: string
  payload: CreateSaleInput
  queued_at: string
  status: 'pending' | 'conflict'
  conflict_message?: string
}

export async function getQueue(): Promise<QueuedSale[]> {
  return (await get<QueuedSale[]>(KEY)) ?? []
}

export async function enqueueOfflineSale(item: QueuedSale): Promise<void> {
  const q = await getQueue()
  await set(KEY, [...q, item])
}

export async function removeFromQueue(client_id: string): Promise<void> {
  const q = await getQueue()
  await set(KEY, q.filter(s => s.client_id !== client_id))
}

export async function markConflict(client_id: string, message: string): Promise<void> {
  const q = await getQueue()
  await set(KEY, q.map(s =>
    s.client_id === client_id
      ? { ...s, status: 'conflict' as const, conflict_message: message }
      : s
  ))
}

export async function clearConflict(client_id: string): Promise<void> {
  await removeFromQueue(client_id)
}

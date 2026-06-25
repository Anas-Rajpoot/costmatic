import {
  createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { getQueue, clearConflict, type QueuedSale } from './offlineQueue'
import { flushOfflineQueue } from './syncManager'

interface SyncContextValue {
  pending: QueuedSale[]
  isSyncing: boolean
  isOnline: boolean
  refetchQueue: () => Promise<void>
  triggerSync: () => void
  dismissConflict: (client_id: string) => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

export function useSyncContext() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSyncContext must be used inside SyncProvider')
  return ctx
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const isOnline = useOnlineStatus()
  const [pending, setPending] = useState<QueuedSale[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const syncingRef = useRef(false)

  const refetchQueue = useCallback(async () => {
    const q = await getQueue()
    setPending(q)
  }, [])

  // Load queue on mount
  useEffect(() => { refetchQueue() }, [refetchQueue])

  // Auto-sync when coming back online
  useEffect(() => {
    if (!isOnline || syncingRef.current) return
    const hasPending = pending.some(s => s.status === 'pending')
    if (!hasPending) return

    const doSync = async () => {
      syncingRef.current = true
      setIsSyncing(true)
      try {
        await flushOfflineQueue()
        await refetchQueue()
        qc.invalidateQueries({ queryKey: ['products'] })
        qc.invalidateQueries({ queryKey: ['customers'] })
        qc.invalidateQueries({ queryKey: ['recent_sales'] })
        qc.invalidateQueries({ queryKey: ['dashboard_stats'] })
      } finally {
        syncingRef.current = false
        setIsSyncing(false)
      }
    }
    doSync()
  }, [isOnline]) // only depend on isOnline to avoid re-triggering on pending changes

  const triggerSync = useCallback(() => {
    if (!isOnline || syncingRef.current) return
    const doSync = async () => {
      syncingRef.current = true
      setIsSyncing(true)
      try {
        await flushOfflineQueue()
        await refetchQueue()
        qc.invalidateQueries({ queryKey: ['products'] })
        qc.invalidateQueries({ queryKey: ['customers'] })
        qc.invalidateQueries({ queryKey: ['recent_sales'] })
        qc.invalidateQueries({ queryKey: ['dashboard_stats'] })
      } finally {
        syncingRef.current = false
        setIsSyncing(false)
      }
    }
    doSync()
  }, [isOnline, qc, refetchQueue])

  const dismissConflict = useCallback(async (client_id: string) => {
    await clearConflict(client_id)
    await refetchQueue()
  }, [refetchQueue])

  return (
    <SyncContext.Provider value={{ pending, isSyncing, isOnline, refetchQueue, triggerSync, dismissConflict }}>
      {children}
    </SyncContext.Provider>
  )
}

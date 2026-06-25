import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Cloud, CloudOff, RefreshCw, AlertTriangle, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSyncContext } from '@/lib/SyncContext'
import { cn } from '@/lib/utils'
import { formatPKR } from '@/lib/format'

export default function SyncIndicator() {
  const { t } = useTranslation()
  const { pending, isSyncing, isOnline, triggerSync, dismissConflict } = useSyncContext()
  const [open, setOpen] = useState(false)

  const pendingCount  = pending.filter(s => s.status === 'pending').length
  const conflicts     = pending.filter(s => s.status === 'conflict')
  const conflictCount = conflicts.length

  const icon = !isOnline           ? <CloudOff size={16} className="text-due" />
    : conflictCount > 0            ? <AlertTriangle size={16} className="text-low" />
    : isSyncing || pendingCount > 0 ? <RefreshCw size={15} className={cn('text-white/70', isSyncing && 'animate-spin')} />
    : <Cloud size={15} className="text-white/40" />

  const hasActivity = !isOnline || pendingCount > 0 || conflictCount > 0 || isSyncing

  return (
    <div className="relative">
      <button
        onClick={() => hasActivity && setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1 text-sm transition-colors',
          hasActivity ? 'cursor-pointer' : 'cursor-default',
        )}
        title={!isOnline ? t('sync.offline') : pendingCount > 0 ? t('sync.pending', { count: pendingCount }) : t('sync.allSynced')}
      >
        {icon}
        {pendingCount > 0 && (
          <span className="text-xs font-bold text-low">{pendingCount}</span>
        )}
        {conflictCount > 0 && (
          <span className="text-xs font-bold text-due">{conflictCount}</span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute end-0 top-full mt-2 z-50 w-72 bg-surface border border-line rounded-card shadow-2xl overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">
                  {!isOnline ? t('sync.offlineMode') : t('sync.title')}
                </h3>
                <button onClick={() => setOpen(false)} className="text-ink-muted hover:text-ink">
                  <X size={14} />
                </button>
              </div>

              <div className="p-3 space-y-2">
                {/* Connection status */}
                <div className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-input text-xs font-medium',
                  isOnline ? 'bg-cash/10 text-cash' : 'bg-due/10 text-due'
                )}>
                  {isOnline ? <Cloud size={13} /> : <CloudOff size={13} />}
                  {isOnline ? t('sync.online') : t('sync.offline')}
                </div>

                {/* Pending sales */}
                {pendingCount > 0 && (
                  <div className="flex items-center justify-between px-2 py-1.5 bg-low/10 rounded-input text-xs">
                    <span className="text-low font-medium">{t('sync.pending', { count: pendingCount })}</span>
                    {isOnline && !isSyncing && (
                      <button
                        onClick={triggerSync}
                        className="text-brand font-semibold hover:underline"
                      >
                        {t('sync.syncNow')}
                      </button>
                    )}
                    {isSyncing && <span className="text-ink-muted">{t('sync.syncing')}</span>}
                  </div>
                )}

                {/* Conflicts */}
                {conflicts.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-due px-2">{t('sync.conflicts')}</p>
                    {conflicts.map(c => (
                      <div key={c.client_id} className="bg-due/5 border border-due/20 rounded-input p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-medium text-ink">
                              {t('sync.offlineSale')} — {formatPKR(c.payload.total)}
                            </p>
                            <p className="text-xs text-due mt-0.5">{c.conflict_message}</p>
                            <p className="text-xs text-ink-muted">{c.queued_at.split('T')[0]}</p>
                          </div>
                          <button
                            onClick={() => dismissConflict(c.client_id)}
                            className="text-ink-muted hover:text-due transition-colors shrink-0"
                            title={t('sync.dismiss')}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!hasActivity && (
                  <p className="text-xs text-ink-muted text-center py-2">{t('sync.allSynced')}</p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

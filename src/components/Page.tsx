import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * Shared page chrome so every screen opens the same way and headers line up:
 * a quiet fade + 8px rise on load (skipped when the OS asks for reduced motion),
 * a 2xl title, an optional one-line explanation, and a right-hand slot for the
 * page's own controls.
 */
export function PageFade({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function PageHeader({ icon, title, count, subtitle, actions }: {
  /** Optional badge before the title — pass the bare lucide icon. */
  icon?: ReactNode
  title: string
  /** Row count shown quietly beside the title, e.g. Products (124). */
  count?: number
  /** Node rather than string so a page can colour part of it (e.g. amount owed in red). */
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      {icon && (
        <div className="w-9 h-9 rounded-btn bg-brand-soft flex items-center justify-center shrink-0">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          {count != null && <span className="text-sm text-ink-muted tabular">({count})</span>}
        </div>
        {subtitle && <div className="text-sm text-ink-muted mt-0.5">{subtitle}</div>}
      </div>
      {actions && <div className="ms-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Consistent empty state: quiet icon, one line of explanation. */
export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="py-12 flex flex-col items-center justify-center text-center gap-2">
      <div className="text-ink-muted/40">{icon}</div>
      <p className="text-sm text-ink-body">{title}</p>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}

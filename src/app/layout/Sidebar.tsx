import { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, Package, ShoppingCart, Users, Truck,
  ClipboardList, BarChart3, Settings, UserCog, CalendarCheck, Receipt, PackageMinus,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/features/auth/AuthContext'
import { useSettings } from '@/features/settings/hooks/useSettings'
import { APP_NAME } from '@/lib/brand'
import { cn } from '@/lib/utils'

interface NavItem {
  path: string
  icon: LucideIcon
  labelKey: string
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { path: '/dashboard',  icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { path: '/sales',      icon: ShoppingCart,    labelKey: 'nav.sales' },
  { path: '/expenses',   icon: Receipt,         labelKey: 'nav.expenses' },
  { path: '/day-close',  icon: CalendarCheck,   labelKey: 'nav.dayClose' },
  { path: '/products',   icon: Package,         labelKey: 'nav.products',  adminOnly: true },
  { path: '/stock',      icon: PackageMinus,    labelKey: 'nav.stockAdjust', adminOnly: true },
  { path: '/customers',  icon: Users,           labelKey: 'nav.customers', adminOnly: true },
  { path: '/suppliers',  icon: Truck,           labelKey: 'nav.suppliers', adminOnly: true },
  { path: '/purchases',  icon: ClipboardList,   labelKey: 'nav.purchases', adminOnly: true },
  { path: '/reports',    icon: BarChart3,       labelKey: 'nav.reports',   adminOnly: true },
  { path: '/settings',   icon: Settings,        labelKey: 'nav.settings',  adminOnly: true },
  { path: '/users',      icon: UserCog,         labelKey: 'nav.users',     adminOnly: true },
]

interface Props {
  isDesktop: boolean
  drawerOpen: boolean
  onClose: () => void
}

function SidebarInner({ onClose, showClose }: { onClose: () => void; showClose: boolean }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { data: settings = {} } = useSettings()
  const isAdmin = profile?.role === 'admin'
  const visible = navItems.filter(item => !item.adminOnly || isAdmin)

  // The shopkeeper's own board, not the software's. Falls back to the app name
  // until Settings → Shop Info has been filled in.
  const shopName = settings.shop_name?.trim() || APP_NAME

  // ── Keyboard navigation while the sidebar is open ──
  // Ctrl+↓ / Ctrl+↑ walk the menu, Enter opens, Esc closes. Deliberately a
  // chord rather than a bare arrow: the POS already uses plain arrows to move
  // through the cart, and this listener is on the window.
  const navigate = useNavigate()
  const location = useLocation()
  const [cursor, setCursor] = useState(() =>
    Math.max(0, visible.findIndex(i => i.path === location.pathname)))

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const chord = e.ctrlKey || e.metaKey
      if (!chord || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) {
        if (e.key === 'Escape') onClose()
        return
      }
      e.preventDefault()
      // Move and open in one go — no Enter to confirm. The step IS the choice,
      // so the screen follows the highlight and the sidebar stays open for the
      // next step.
      setCursor(c => {
        const step = e.key === 'ArrowDown' ? 1 : -1
        const next = (c + step + visible.length) % visible.length
        navigate(visible[next].path)
        return next
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, navigate, onClose])

  return (
    <aside className="w-64 bg-brand-dark flex flex-col h-full">
      {/* Logo — only shown on desktop (drawer starts below TopBar on mobile) */}
      {!showClose && (
        <div className="h-16 flex items-center px-5 border-b border-white/10 shrink-0">
          <span className="text-accent font-semibold text-lg tracking-wide truncate" title={shopName}>
            {shopName}
          </span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {visible.map(({ path, icon: Icon, labelKey }, i) => (
          <NavLink
            key={path}
            to={path}
            onClick={showClose ? onClose : undefined}
            onMouseEnter={() => setCursor(i)}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm font-medium transition-colors duration-150',
              isActive
                ? 'bg-brand text-white'
                : 'text-white/70 hover:text-white hover:bg-white/10',
              // Where Ctrl+↑/↓ has walked to — a ring, so it reads as "about to
              // open" rather than "currently open".
              i === cursor && 'ring-2 ring-accent/70 ring-inset',
            )}
          >
            <Icon size={18} className="shrink-0" />
            <span>{t(labelKey)}</span>
          </NavLink>
        ))}
      </nav>

      {profile && (
        <div className="px-4 py-3 border-t border-white/10 text-xs text-white/40">
          {profile.role === 'admin' ? t('users.admin') : t('users.employee')}
        </div>
      )}
    </aside>
  )
}

export default function Sidebar({ isDesktop, drawerOpen, onClose }: Props) {
  const isRtl = document.documentElement.dir === 'rtl'

  if (isDesktop) {
    // Desktop: sits in the layout rather than over it, but still collapses —
    // the width belongs to the bill. Animating the width (not a transform)
    // keeps the main column reflowing with it instead of leaving a gap.
    return (
      <AnimatePresence initial={false}>
        {drawerOpen && (
          <motion.div
            key="rail"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            style={{ flexShrink: 0, height: '100%', overflow: 'hidden' }}
          >
            <SidebarInner onClose={onClose} showClose={false} />
          </motion.div>
        )}
      </AnimatePresence>
    )
  }

  // Mobile / tablet: fixed overlay drawer
  return (
    <AnimatePresence>
      {drawerOpen && (
        <motion.div
          key="drawer"
          initial={{ x: isRtl ? 256 : -256 }}
          animate={{ x: 0 }}
          exit={{ x: isRtl ? 256 : -256 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          style={{
            position: 'fixed',
            top: 64, // below the TopBar (h-16 = 4rem = 64px)
            bottom: 0,
            [isRtl ? 'right' : 'left']: 0,
            zIndex: 50,
            width: 256,
          }}
        >
          <SidebarInner onClose={onClose} showClose={true} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

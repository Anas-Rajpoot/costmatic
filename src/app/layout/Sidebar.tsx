import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, Package, ShoppingCart, Users, Truck,
  ClipboardList, BarChart3, Settings, UserCog,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/features/auth/AuthContext'
import { cn } from '@/lib/utils'

interface NavItem {
  path: string
  icon: LucideIcon
  labelKey: string
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { path: '/dashboard',  icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { path: '/products',   icon: Package,         labelKey: 'nav.products',  adminOnly: true },
  { path: '/sales',      icon: ShoppingCart,    labelKey: 'nav.sales' },
  { path: '/customers',  icon: Users,           labelKey: 'nav.customers' },
  { path: '/suppliers',  icon: Truck,           labelKey: 'nav.suppliers', adminOnly: true },
  { path: '/purchases',  icon: ClipboardList,   labelKey: 'nav.purchases', adminOnly: true },
  { path: '/reports',    icon: BarChart3,       labelKey: 'nav.reports' },
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
  const isAdmin = profile?.role === 'admin'
  const visible = navItems.filter(item => !item.adminOnly || isAdmin)

  return (
    <aside className="w-64 bg-brand-dark flex flex-col h-full">
      {/* Logo — only shown on desktop (drawer starts below TopBar on mobile) */}
      {!showClose && (
        <div className="h-16 flex items-center px-5 border-b border-white/10 shrink-0">
          <span className="text-accent font-semibold text-lg tracking-wide">Costmatic</span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {visible.map(({ path, icon: Icon, labelKey }) => (
          <NavLink
            key={path}
            to={path}
            onClick={showClose ? onClose : undefined}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm font-medium transition-colors duration-150',
              isActive
                ? 'bg-brand text-white'
                : 'text-white/70 hover:text-white hover:bg-white/10',
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
    // Desktop: permanent sidebar in normal document flow
    return (
      <div style={{ width: 256, flexShrink: 0, height: '100%' }}>
        <SidebarInner onClose={onClose} showClose={false} />
      </div>
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

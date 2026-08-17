import { useState, useEffect, Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useWindowWidth } from '@/hooks/useWindowWidth'
import { useSettings } from '@/features/settings/hooks/useSettings'
import { APP_NAME } from '@/lib/brand'

const DESKTOP_BREAKPOINT = 1024

function ContentLoader() {
  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
    </div>
  )
}

const SIDEBAR_KEY = 'costmatic_sidebar'

export default function AppShell() {
  // Hidden by default, on every screen size. A shop counter wants the width
  // for the bill, not for a nav rail it uses a few times a day. The choice is
  // remembered, so a shopkeeper who prefers it pinned only says so once.
  const [drawerOpen, setDrawerOpen] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === 'open' } catch { return false }
  })
  const location = useLocation()
  const width = useWindowWidth()
  const isDesktop = width >= DESKTOP_BREAKPOINT

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, drawerOpen ? 'open' : 'closed') } catch { /* private mode */ }
  }, [drawerOpen])

  // The tab title lives here, not in the sidebar: the sidebar unmounts when it
  // is collapsed, and the tab should still carry the shop's name.
  const { data: settings = {} } = useSettings()
  const shopName = settings.shop_name?.trim() || APP_NAME
  useEffect(() => { document.title = shopName }, [shopName])

  // On a phone the drawer covers the screen, so navigating has to close it.
  // On desktop it sits in the layout, so a pinned sidebar stays pinned.
  useEffect(() => { if (!isDesktop) setDrawerOpen(false) }, [location.pathname, isDesktop])

  // Ctrl+L (Cmd+L) toggles it — same hand that is already on the keyboard
  // shortcuts for billing. preventDefault stops the browser stealing it for
  // the address bar.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        setDrawerOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-screen bg-page overflow-hidden">
      {/* Overlay for mobile drawer — starts below the TopBar */}
      {!isDesktop && drawerOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-x-0 bottom-0 z-40 bg-black/50"
          style={{ top: 64 }}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <Sidebar
        isDesktop={isDesktop}
        drawerOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <TopBar
          showMenu
          onMenuClick={() => setDrawerOpen(v => !v)}
        />
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="flex-1 overflow-y-auto p-4 lg:p-6"
        >
          <Suspense fallback={<ContentLoader />}>
            <Outlet />
          </Suspense>
        </motion.main>
      </div>
    </div>
  )
}

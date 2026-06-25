import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useWindowWidth } from '@/hooks/useWindowWidth'

const DESKTOP_BREAKPOINT = 1024

export default function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const width = useWindowWidth()
  const isDesktop = width >= DESKTOP_BREAKPOINT

  // Close drawer on navigation or when screen becomes desktop-size
  useEffect(() => { setDrawerOpen(false) }, [location.pathname, isDesktop])

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
          showMenu={!isDesktop}
          onMenuClick={() => setDrawerOpen(v => !v)}
        />
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="flex-1 overflow-y-auto p-4 lg:p-6"
        >
          <Outlet />
        </motion.main>
      </div>
    </div>
  )
}

import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'

/**
 * Admin-only routes.
 *
 * The session resolves before the profile does — they are two separate
 * requests — so checking `role` the moment RequireAuth lets us through reads
 * an admin as an employee and redirects them away. That is why a hard refresh
 * on /products, /settings or /reports used to land you back on the dashboard:
 * nothing was broken, the guard was just answering before it had the facts.
 *
 * Wait for the profile, then decide. A failed profile fetch still resolves
 * (profileLoading goes false with profile null), so this ends in a redirect
 * rather than a spinner that never stops.
 *
 * This is convenience only — Supabase RLS is the real boundary.
 */
export default function RequireAdmin() {
  const { profile, isLoading, profileLoading } = useAuth()

  if (isLoading || profileLoading) {
    return (
      <div className="h-screen bg-page flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    )
  }

  if (profile?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

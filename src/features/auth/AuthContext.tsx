import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * After this much inactivity the session is force-expired and the user must log
 * in again — both when the app is reopened "cold" after being closed, and while
 * it stays open but idle. Supabase's refresh token would otherwise keep a user
 * signed in indefinitely.
 */
const IDLE_LIMIT_MS = 60 * 60 * 1000 // 1 hour
const LAST_ACTIVE_KEY = 'costmatic.lastActive'

function markActive() {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString())
  } catch {
    /* private mode / storage disabled — degrade gracefully */
  }
}

function isIdleExpired(): boolean {
  try {
    const raw = localStorage.getItem(LAST_ACTIVE_KEY)
    if (!raw) return false // no record yet → don't expire (e.g. first ever load)
    return Date.now() - Number(raw) > IDLE_LIMIT_MS
  } catch {
    return false
  }
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) {
    console.error('[Auth] Failed to load profile:', error.message)
    return null
  }
  return data as Profile
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Bootstrap the session + subscribe to auth changes.
  // IMPORTANT: never `await` another supabase call inside onAuthStateChange — the
  // callback holds an internal lock and awaiting can deadlock/hang the client.
  // We only set session state here; the profile is loaded by a separate effect.
  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      // Reopened after being idle past the limit → drop the stale session.
      if (session && isIdleExpired()) {
        supabase.auth.signOut()
        setSession(null)
        setIsLoading(false)
        return
      }
      if (session) markActive()
      setSession(session)
      setIsLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setIsLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // Load the profile only when the signed-in user actually changes — not on every
  // token refresh. This removes the duplicate fetch the old code did on startup.
  const loadedUserId = useRef<string | null>(null)
  const userId = session?.user?.id ?? null
  useEffect(() => {
    if (userId === loadedUserId.current) return
    loadedUserId.current = userId

    if (!userId) {
      setProfile(null)
      return
    }
    let active = true
    loadProfile(userId).then(p => {
      if (active) setProfile(p)
    })
    return () => {
      active = false
    }
  }, [userId])

  // Idle-timeout enforcement while the app is open: refresh the activity stamp on
  // real interaction, and sign out once the idle limit is crossed.
  useEffect(() => {
    if (!session) return
    markActive()

    const bump = () => markActive()
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const
    activityEvents.forEach(e => window.addEventListener(e, bump, { passive: true }))

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      // Returned to the tab after being away too long → expire.
      if (isIdleExpired()) supabase.auth.signOut()
      else markActive()
    }
    document.addEventListener('visibilitychange', onVisible)

    const interval = window.setInterval(() => {
      if (isIdleExpired()) supabase.auth.signOut()
    }, 60 * 1000)

    return () => {
      activityEvents.forEach(e => window.removeEventListener(e, bump))
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(interval)
    }
  }, [userId, session])

  async function signIn(email: string, password: string): Promise<{ error: string | null }> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }

    const prof = data.user ? await loadProfile(data.user.id) : null
    if (prof && !prof.is_active) {
      await supabase.auth.signOut()
      return { error: 'account_inactive' }
    }
    markActive()
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ session, profile, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

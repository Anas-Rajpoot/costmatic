import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Costmatic] Supabase not configured. Copy .env.example → .env.local and fill in your project URL and anon key.',
  )
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // We never carry auth tokens in the URL (email/password flow only),
      // so skip the URL scan — it's pure startup overhead otherwise.
      detectSessionInUrl: false,
      storageKey: 'costmatic.auth',
    },
  },
)

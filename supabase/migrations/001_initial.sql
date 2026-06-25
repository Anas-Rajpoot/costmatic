-- =============================================================
-- Costmatic — Migration 001: Users / Profiles + Audit Log
-- Run this in the Supabase SQL Editor (once, top to bottom).
-- =============================================================

-- ── 1. Public users table (extends auth.users) ─────────────
CREATE TABLE IF NOT EXISTS public.users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL DEFAULT '',
  full_name       TEXT NOT NULL DEFAULT '',
  username        TEXT UNIQUE,
  role            TEXT NOT NULL DEFAULT 'employee'
                    CHECK (role IN ('admin', 'employee')),
  discount_limit  NUMERIC(5,2) NOT NULL DEFAULT 0
                    CHECK (discount_limit >= 0 AND discount_limit <= 100),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Enable RLS ──────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ── 3. Helper: get current user role (SECURITY DEFINER so
--      it bypasses RLS and avoids recursive policy calls) ───
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- ── 4. RLS Policies ────────────────────────────────────────
-- Every authenticated user can read their own row
CREATE POLICY "users_select_own"
  ON public.users FOR SELECT
  USING (id = auth.uid());

-- Admins can read all rows
CREATE POLICY "users_select_admin"
  ON public.users FOR SELECT
  USING (get_my_role() = 'admin');

-- Admins can update any row
CREATE POLICY "users_update_admin"
  ON public.users FOR UPDATE
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- Trigger (SECURITY DEFINER, below) inserts rows — no INSERT policy needed
-- for the anon/auth client; this policy protects direct inserts:
CREATE POLICY "users_insert_admin"
  ON public.users FOR INSERT
  WITH CHECK (get_my_role() = 'admin');

-- ── 5. Trigger: auto-create profile on sign-up ─────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'username'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 6. Audit log ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id),
  action      TEXT NOT NULL,
  entity      TEXT,
  entity_id   TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select_admin"
  ON public.audit_log FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "audit_log_insert_auth"
  ON public.audit_log FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- =============================================================
-- AFTER RUNNING THIS MIGRATION
-- =============================================================
-- 1. (Optional) In Supabase dashboard → Authentication → Settings:
--    disable "Confirm email" so logins work without email confirmation.
--
-- 2. Create your first admin user:
--    a) Go to Authentication → Users → Add user (or use the login page)
--    b) Then run this to promote them to admin:
--
--    UPDATE public.users SET role = 'admin'
--    WHERE email = 'your-admin@email.com';
--
-- 3. Create employee accounts the same way, then optionally
--    set their discount_limit:
--
--    UPDATE public.users SET discount_limit = 10
--    WHERE email = 'employee@email.com';
-- =============================================================

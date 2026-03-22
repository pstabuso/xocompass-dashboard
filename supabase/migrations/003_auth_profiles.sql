-- ╔═══════════════════════════════════════════════════════════════╗
-- ║  XoCompass — Auth Profiles (Role-Based Authentication)      ║
-- ║  Run AFTER 001 + 002 in Supabase SQL Editor                 ║
-- ╚═══════════════════════════════════════════════════════════════╝
--
-- STRATEGY: Supabase Auth (email/password) + profiles table for role mapping.
-- Each auth.users row gets a linked profiles row via trigger.
-- Client-side JS maps role → permissions (canCreate, canDelete, etc.).
--
-- SETUP:
--   1. In Supabase Dashboard → Auth → Settings:
--      - Enable Email provider
--      - Disable "Confirm email" (for small team, re-enable later if needed)
--   2. Run this migration in SQL Editor
--   3. Sign up the three team members (via the app or Supabase Dashboard → Auth → Users)
--   4. Update their roles with the seed queries at the bottom

-- ─── PROFILES TABLE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'guest'
             CHECK (role IN ('pm', 'backend', 'frontend', 'guest')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RLS POLICIES ─────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Everyone can read all profiles (needed for owner display, nudge targets)
CREATE POLICY "profiles_select_all"
  ON public.profiles FOR SELECT
  USING (true);

-- Users can only update their own profile
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Profile creation is handled by the trigger (SECURITY DEFINER)
-- but allow self-insert as fallback
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ─── AUTO-CREATE PROFILE ON SIGNUP ────────────────────────────
-- When a new user signs up via supabase.auth.signUp(), this trigger
-- automatically creates their profiles row using metadata passed
-- in the signUp options: { data: { name, role } }

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'guest')
  );
  RETURN NEW;
END;
$$;

-- Drop existing trigger if re-running
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─── AUTO-UPDATE updated_at ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ─── ENABLE REALTIME ──────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- ─── PERFORMANCE INDEX ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- ═══════════════════════════════════════════════════════════════
-- SEED: After the three team members sign up, run these to set
-- their correct roles. Replace emails with the actual ones used.
-- ═══════════════════════════════════════════════════════════════
--
-- UPDATE public.profiles SET role = 'pm',       name = 'Pao'    WHERE email = 'pao@example.com';
-- UPDATE public.profiles SET role = 'backend',  name = 'Lanz'   WHERE email = 'lanz@example.com';
-- UPDATE public.profiles SET role = 'frontend', name = 'Andrei' WHERE email = 'andrei@example.com';

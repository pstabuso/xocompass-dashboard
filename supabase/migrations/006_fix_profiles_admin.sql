-- ╔═══════════════════════════════════════════════════════════════╗
-- ║  XoCompass — Fix profiles for admin role management         ║
-- ║  Run in Supabase SQL Editor                                 ║
-- ╚═══════════════════════════════════════════════════════════════╝
--
-- FIXES:
--   1. CHECK constraint missing 'restricted' role
--   2. RLS blocks PM from changing other users' roles
--   3. Set pstabuso@fit.edu.ph as PM in the database

-- ─── FIX 1: Allow 'restricted' in the role CHECK constraint ──
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('pm', 'backend', 'frontend', 'guest', 'restricted'));

-- ─── FIX 2: Let PM update ANY user's profile (for role changes) ──
-- Drop the old self-only policy
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- Users can update their own profile OR the PM can update anyone
CREATE POLICY "profiles_update_self_or_admin"
  ON public.profiles FOR UPDATE
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'pm'
    )
  )
  WITH CHECK (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'pm'
    )
  );

-- ─── FIX 3: Set Pao as PM in the database ───────────────────
UPDATE public.profiles
  SET role = 'pm'
  WHERE email = 'pstabuso@fit.edu.ph';

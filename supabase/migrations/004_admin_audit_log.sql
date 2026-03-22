-- ╔═══════════════════════════════════════════════════════════════╗
-- ║  XoCompass — Admin Audit Log & User Management              ║
-- ║  Run AFTER 001 + 002 + 003 in Supabase SQL Editor           ║
-- ╚═══════════════════════════════════════════════════════════════╝
--
-- STRATEGY: Track every auth attempt (success + failure) in an audit log.
-- PM (admin) can view all attempts and restrict/admit users via profiles.
-- Restricted users have role = 'restricted' and cannot access the workspace.

-- ─── AUDIT LOG TABLE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auth_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  event_type  TEXT NOT NULL CHECK (event_type IN (
    'sign_in_success', 'sign_in_failed', 'sign_up_success', 'sign_up_failed',
    'sign_out', 'session_restored', 'restricted_blocked'
  )),
  ip_address  TEXT,
  user_agent  TEXT,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RLS: Only PM can read audit log; inserts via team secret ─────
ALTER TABLE public.auth_audit_log ENABLE ROW LEVEL SECURITY;

-- Anyone with the team secret can insert (client logs events)
CREATE POLICY "audit_insert_with_secret"
  ON public.auth_audit_log FOR INSERT
  WITH CHECK (team_secret_matches());

-- Only authenticated users with PM role can read
CREATE POLICY "audit_select_pm_only"
  ON public.auth_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'pm'
    )
  );

-- No updates or deletes — audit log is immutable
-- (no UPDATE or DELETE policies)

-- ─── ADD 'restricted' TO PROFILES ROLE CHECK ────────────────
-- Drop the old constraint and add 'restricted' as a valid role
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('pm', 'backend', 'frontend', 'guest', 'restricted'));

-- ─── ENABLE REALTIME ─────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.auth_audit_log;

-- ─── PERFORMANCE INDEXES ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_email ON public.auth_audit_log(email);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON public.auth_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.auth_audit_log(created_at DESC);

-- ─── PM UPDATE POLICY ON PROFILES (admin can change any role) ──
-- Drop existing update policy (only allows self-update)
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- Users can update their own profile (name, avatar)
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- PM can update any profile's role (admit/restrict)
CREATE POLICY "profiles_update_pm_admin"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'pm'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'pm'
    )
  );

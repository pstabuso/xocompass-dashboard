-- ╔═══════════════════════════════════════════════════════════════╗
-- ║  XoCompass — Phase 1: RLS Hardening (Team-Secret Strategy)  ║
-- ║  Run AFTER 001_create_tables.sql in Supabase SQL Editor     ║
-- ╚═══════════════════════════════════════════════════════════════╝
--
-- STRATEGY: "Shared Team Secret" via a custom request header.
-- The frontend sends x-team-secret via supabase client config.
-- RLS policies gate writes behind this secret while reads remain open.
-- This blocks random public API abuse without requiring full user auth.
--
-- SETUP:
--   1. In Supabase Dashboard → Settings → API → add nothing (uses anon key)
--   2. Set VITE_SUPABASE_TEAM_SECRET in .env.local (any strong random string)
--   3. The React client passes it as a custom header on every request
--   4. RLS checks: current_setting('request.headers', true)::json->>'x-team-secret'

-- ─── DROP OLD WIDE-OPEN POLICIES ─────────────────────────────
DROP POLICY IF EXISTS "Allow all for team" ON tasks;
DROP POLICY IF EXISTS "Allow all for team" ON events;
DROP POLICY IF EXISTS "Allow all for team" ON minutes;
DROP POLICY IF EXISTS "Allow all for team" ON datasets;
DROP POLICY IF EXISTS "Allow all for team" ON activity_log;
DROP POLICY IF EXISTS "Allow all for team" ON notifications;

-- ─── HELPER: Extract team secret from request headers ─────────
-- Supabase exposes request headers via current_setting('request.headers')
-- which returns a JSON string. We parse and compare.

CREATE OR REPLACE FUNCTION public.team_secret_matches()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT coalesce(
    current_setting('request.headers', true)::json->>'x-team-secret',
    ''
  ) = coalesce(
    current_setting('app.settings.team_secret', true),
    'xocompass-leap-2026'  -- fallback default; override in Supabase Dashboard
  );
$$;

-- ─── NEW POLICIES: Read = open, Write = team-secret-gated ─────

-- TASKS
CREATE POLICY "tasks_select" ON tasks FOR SELECT USING (true);
CREATE POLICY "tasks_insert" ON tasks FOR INSERT WITH CHECK (public.team_secret_matches());
CREATE POLICY "tasks_update" ON tasks FOR UPDATE USING (public.team_secret_matches());
CREATE POLICY "tasks_delete" ON tasks FOR DELETE USING (public.team_secret_matches());

-- EVENTS
CREATE POLICY "events_select" ON events FOR SELECT USING (true);
CREATE POLICY "events_insert" ON events FOR INSERT WITH CHECK (public.team_secret_matches());
CREATE POLICY "events_update" ON events FOR UPDATE USING (public.team_secret_matches());
CREATE POLICY "events_delete" ON events FOR DELETE USING (public.team_secret_matches());

-- MINUTES
CREATE POLICY "minutes_select" ON minutes FOR SELECT USING (true);
CREATE POLICY "minutes_insert" ON minutes FOR INSERT WITH CHECK (public.team_secret_matches());
CREATE POLICY "minutes_update" ON minutes FOR UPDATE USING (public.team_secret_matches());
CREATE POLICY "minutes_delete" ON minutes FOR DELETE USING (public.team_secret_matches());

-- DATASETS
CREATE POLICY "datasets_select" ON datasets FOR SELECT USING (true);
CREATE POLICY "datasets_insert" ON datasets FOR INSERT WITH CHECK (public.team_secret_matches());
CREATE POLICY "datasets_update" ON datasets FOR UPDATE USING (public.team_secret_matches());
CREATE POLICY "datasets_delete" ON datasets FOR DELETE USING (public.team_secret_matches());

-- ACTIVITY_LOG (append-only: no update/delete even for team)
CREATE POLICY "activity_log_select" ON activity_log FOR SELECT USING (true);
CREATE POLICY "activity_log_insert" ON activity_log FOR INSERT WITH CHECK (public.team_secret_matches());

-- NOTIFICATIONS
CREATE POLICY "notifications_select" ON notifications FOR SELECT USING (true);
CREATE POLICY "notifications_insert" ON notifications FOR INSERT WITH CHECK (public.team_secret_matches());
CREATE POLICY "notifications_update" ON notifications FOR UPDATE USING (public.team_secret_matches());
CREATE POLICY "notifications_delete" ON notifications FOR DELETE USING (public.team_secret_matches());

-- ─── SUPABASE APP SETTING (set via Dashboard → Settings → Database) ──
-- ALTER DATABASE postgres SET app.settings.team_secret = 'YOUR_STRONG_SECRET_HERE';
-- Or set it per-project in the Supabase Dashboard under Database Settings.

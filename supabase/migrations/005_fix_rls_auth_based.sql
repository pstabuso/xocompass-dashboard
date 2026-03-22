-- ╔═══════════════════════════════════════════════════════════════╗
-- ║  XoCompass — Replace team-secret RLS with auth-based RLS   ║
-- ║  Run AFTER 001–004 in Supabase SQL Editor                  ║
-- ╚═══════════════════════════════════════════════════════════════╝
--
-- PROBLEM: Migration 002 gated ALL writes behind team_secret_matches(),
-- which required an x-team-secret custom header. That header was removed
-- from the frontend (security fix — secrets should never be in client
-- bundles). Result: ALL writes silently fail, data only lives in
-- localStorage, and is lost on sign-out.
--
-- FIX: Replace team-secret policies with auth-based policies.
-- Authenticated users (auth.uid() IS NOT NULL) can read/write all data.
-- This matches the app's auth model: sign in → full access.

-- ─── DROP ALL OLD POLICIES ─────────────────────────────────────

-- Tasks
DROP POLICY IF EXISTS "Allow all for team" ON tasks;
DROP POLICY IF EXISTS "tasks_select" ON tasks;
DROP POLICY IF EXISTS "tasks_insert" ON tasks;
DROP POLICY IF EXISTS "tasks_update" ON tasks;
DROP POLICY IF EXISTS "tasks_delete" ON tasks;

-- Events
DROP POLICY IF EXISTS "Allow all for team" ON events;
DROP POLICY IF EXISTS "events_select" ON events;
DROP POLICY IF EXISTS "events_insert" ON events;
DROP POLICY IF EXISTS "events_update" ON events;
DROP POLICY IF EXISTS "events_delete" ON events;

-- Minutes
DROP POLICY IF EXISTS "Allow all for team" ON minutes;
DROP POLICY IF EXISTS "minutes_select" ON minutes;
DROP POLICY IF EXISTS "minutes_insert" ON minutes;
DROP POLICY IF EXISTS "minutes_update" ON minutes;
DROP POLICY IF EXISTS "minutes_delete" ON minutes;

-- Datasets
DROP POLICY IF EXISTS "Allow all for team" ON datasets;
DROP POLICY IF EXISTS "datasets_select" ON datasets;
DROP POLICY IF EXISTS "datasets_insert" ON datasets;
DROP POLICY IF EXISTS "datasets_update" ON datasets;
DROP POLICY IF EXISTS "datasets_delete" ON datasets;

-- Activity Log
DROP POLICY IF EXISTS "activity_log_select" ON activity_log;
DROP POLICY IF EXISTS "activity_log_insert" ON activity_log;

-- Notifications
DROP POLICY IF EXISTS "Allow all for team" ON notifications;
DROP POLICY IF EXISTS "notifications_select" ON notifications;
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
DROP POLICY IF EXISTS "notifications_update" ON notifications;
DROP POLICY IF EXISTS "notifications_delete" ON notifications;

-- ─── NEW AUTH-BASED POLICIES ───────────────────────────────────
-- Any authenticated user can perform all operations.
-- Anon (not logged in) can only read.

-- TASKS
CREATE POLICY "tasks_select_all" ON tasks FOR SELECT USING (true);
CREATE POLICY "tasks_insert_auth" ON tasks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "tasks_update_auth" ON tasks FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "tasks_delete_auth" ON tasks FOR DELETE USING (auth.uid() IS NOT NULL);

-- EVENTS
CREATE POLICY "events_select_all" ON events FOR SELECT USING (true);
CREATE POLICY "events_insert_auth" ON events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "events_update_auth" ON events FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "events_delete_auth" ON events FOR DELETE USING (auth.uid() IS NOT NULL);

-- MINUTES
CREATE POLICY "minutes_select_all" ON minutes FOR SELECT USING (true);
CREATE POLICY "minutes_insert_auth" ON minutes FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "minutes_update_auth" ON minutes FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "minutes_delete_auth" ON minutes FOR DELETE USING (auth.uid() IS NOT NULL);

-- DATASETS
CREATE POLICY "datasets_select_all" ON datasets FOR SELECT USING (true);
CREATE POLICY "datasets_insert_auth" ON datasets FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "datasets_update_auth" ON datasets FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "datasets_delete_auth" ON datasets FOR DELETE USING (auth.uid() IS NOT NULL);

-- ACTIVITY LOG (append-only for authenticated users, readable by all)
CREATE POLICY "activity_log_select_all" ON activity_log FOR SELECT USING (true);
CREATE POLICY "activity_log_insert_auth" ON activity_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- NOTIFICATIONS
CREATE POLICY "notifications_select_all" ON notifications FOR SELECT USING (true);
CREATE POLICY "notifications_insert_auth" ON notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "notifications_update_auth" ON notifications FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "notifications_delete_auth" ON notifications FOR DELETE USING (auth.uid() IS NOT NULL);

-- ─── CLEANUP: Drop the unused team_secret_matches function ─────
DROP FUNCTION IF EXISTS public.team_secret_matches();

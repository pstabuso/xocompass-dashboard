-- ╔═══════════════════════════════════════════════════════════════╗
-- ║  XoCompass — Master Database Schema                         ║
-- ║  Run this in Supabase SQL Editor (supabase.com/dashboard)   ║
-- ╚═══════════════════════════════════════════════════════════════╝

-- ─── TASKS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  task        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'Not Started',
  start       TEXT,
  deadline    TEXT,
  owner       TEXT,
  remarks     TEXT,
  priority    TEXT DEFAULT 'Medium',
  dependency  TEXT,
  dependencies JSONB DEFAULT '[]'::jsonb,
  comments    JSONB DEFAULT '[]'::jsonb,
  subtasks    JSONB DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── EVENTS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  date        TEXT,
  time        TEXT,
  status      TEXT DEFAULT 'Not Started',
  type        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── MINUTES OF MEETING ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS minutes (
  id          TEXT PRIMARY KEY,
  date        TEXT,
  topic       TEXT,
  link        TEXT,
  action_point TEXT,
  items       JSONB DEFAULT '[]'::jsonb,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── DATASETS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS datasets (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT DEFAULT 'Primary',
  status      TEXT DEFAULT 'Raw',
  rows        INTEGER DEFAULT 0,
  size        TEXT,
  "uploadedAt" TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ACTIVITY LOG ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id          TEXT PRIMARY KEY,
  user_name   TEXT,
  action      TEXT,
  details     TEXT,
  time        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── NOTIFICATIONS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  to_user     TEXT,
  message     TEXT,
  read        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ROW LEVEL SECURITY (open for team use) ─────────────────────
-- Enable RLS on all tables but allow all operations via anon key
-- (appropriate for a team tool without individual auth)

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated and anon users
CREATE POLICY "Allow all for team" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for team" ON events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for team" ON minutes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for team" ON datasets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for team" ON activity_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for team" ON notifications FOR ALL USING (true) WITH CHECK (true);

-- ─── ENABLE REALTIME ─────────────────────────────────────────────
-- This allows the Supabase client to subscribe to changes in real-time

ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE minutes;
ALTER PUBLICATION supabase_realtime ADD TABLE datasets;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ─── INDEXES FOR PERFORMANCE ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_to ON notifications(to_user);

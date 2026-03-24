import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { supabase, isCloudEnabled, fetchProfile } from '../lib/supabase';

const AppContext = createContext();

// The canonical PM account — always gets PM role regardless of DB state
const PM_EMAIL = 'pstabuso@fit.edu.ph';

// ─── ROLE → PERMISSIONS MAP (non-hardcoded users, roles from DB) ──
// Roles are stored in the `profiles` table; permissions derived here.
// Only PM can create/edit/delete/download. Everyone else is strictly view-only.
const ROLE_PERMISSIONS = {
  pm:         { canCreate: true, canDelete: true, canNudge: true, canDownload: true, viewAll: true, isAdmin: true },
  backend:    { canCreate: false, canDelete: false, canNudge: false, canDownload: false, viewAll: true, isAdmin: false },
  frontend:   { canCreate: false, canDelete: false, canNudge: false, canDownload: false, viewAll: true, isAdmin: false },
  guest:      { canCreate: false, canDelete: false, canNudge: false, canDownload: false, viewAll: true, isAdmin: false },
  restricted: { canCreate: false, canDelete: false, canNudge: false, canDownload: false, viewAll: false, isAdmin: false },
};

const ROLE_LABELS = {
  pm:         'Project Manager & Documentations Head',
  backend:    'Backend Developer',
  frontend:   'Frontend Developer',
  guest:      'Guest Viewer',
  restricted: 'Restricted',
};

/** Build a user object from a Supabase profile row.
 *  Always forces PM role for the canonical PM email, regardless of DB state. */
const buildUser = (profile) => {
  const effectiveRole = profile.email === PM_EMAIL ? 'pm' : profile.role;
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: ROLE_LABELS[effectiveRole] || effectiveRole,
    roleKey: effectiveRole,
    permissions: ROLE_PERMISSIONS[effectiveRole] || ROLE_PERMISSIONS.guest,
    avatar_url: profile.avatar_url,
  };
};

// Available roles for admin role-assignment (NOT for sign-up — new users always start as guest)
export const AVAILABLE_ROLES = [
  { id: 'pm', label: 'Project Manager & Docs Head' },
  { id: 'backend', label: 'Backend Developer' },
  { id: 'frontend', label: 'Frontend Developer' },
  { id: 'guest', label: 'Guest Viewer' },
];

// Route access by role. null = all routes. Guests get view-only basics.
// SARIMAX Lab, Calendar, Minutes are locked for guests until PM grants a role.
export const ROLE_ROUTES = {
  pm:         null,
  backend:    null,
  frontend:   null,
  guest:      ['/', '/tasks', '/data', '/defense', '/resources'],
  restricted: ['/'],
};

/** Check if a notification is addressed to a given user.
 *  Matches by email (preferred) or falls back to first-name in to_user. */
export const isNotificationForUser = (n, user) => {
  if (!n || !user) return false;
  const toUser = (n.to_user || '').toLowerCase();
  // Match by email (reliable — notifications now use PM_EMAIL as to_user)
  if (user.email && toUser === user.email.toLowerCase()) return true;
  // Legacy fallback: match by first name for old notifications stored with "Pao"
  const firstName = (user.name || '').split(' ')[0].toLowerCase();
  if (firstName && toUser.includes(firstName)) return true;
  return false;
};

/** Enrich a notification from DB with derived fields.
 *  DB rows only have (id, to_user, message, read, created_at).
 *  We reconstruct type/from_user/from_email from the message prefix. */
const enrichNotification = (n) => {
  if (n.type) return n; // already enriched (came from local state)
  const msg = n.message || '';
  if (msg.startsWith('[ACCESS_REQUEST] ')) {
    // Parse: "[ACCESS_REQUEST] Name (email) tried to ..." or "... is requesting access to ..."
    const body = msg.slice('[ACCESS_REQUEST] '.length);
    const nameEmailMatch = body.match(/^(.+?)\s*\(([^)]+)\)/);
    return {
      ...n,
      type: 'access_request',
      from_user: nameEmailMatch?.[1] || '',
      from_email: nameEmailMatch?.[2] || '',
      message: body, // strip prefix for display
    };
  }
  return { ...n, type: 'general' };
};

// ─── SUPABASE TABLE NAMES ─────────────────────────────────────────
const TABLES = {
  tasks: 'tasks',
  events: 'events',
  minutes: 'minutes',
  datasets: 'datasets',
  activity_log: 'activity_log',
  notifications: 'notifications',
};

// ─── INPUT VALIDATION (ISO 25010 — Security & Functional Suitability) ──

const VALID_STATUSES = ['Not Started', 'On-going', 'Done'];
const VALID_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const VALID_DATASET_TYPES = ['Primary', 'Exogenous'];
const VALID_DATASET_STATUSES = ['Raw', 'Cleaned', 'Verified'];
const MAX_TEXT_LENGTH = 500;
const MAX_COMMENT_LENGTH = 1000;

/** Strip HTML/script tags to prevent XSS in stored data */
const sanitize = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

/** Sanitize all string fields in an object (shallow) */
const sanitizeRow = (obj) => {
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      cleaned[key] = sanitize(value).slice(0, key === 'remarks' || key === 'description' || key === 'notes' ? MAX_COMMENT_LENGTH : MAX_TEXT_LENGTH);
    } else if (Array.isArray(value)) {
      cleaned[key] = value; // arrays (comments, subtasks) handled separately
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
};

// ─── HELPERS ──────────────────────────────────────────────────────

/** Read from localStorage with JSON parse safety */
const readLocal = (key, fallback = []) => {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
};

/** Write to localStorage with quota safety */
const writeLocal = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch {
    // localStorage quota exceeded — clear oldest cached data
    console.warn(`[XoCompass] localStorage quota exceeded for key "${key}"`);
  }
};

/** Fetch full table from Supabase, ordered newest-first */
const fetchTable = async (table) => {
  if (!supabase) return null;
  const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });
  if (error) { console.error(`[XoCompass] fetch ${table}:`, error.message); return null; }
  return data;
};

// ─── SESSION EXPIRY DETECTION ─────────────────────────────────────
// With autoRefreshToken:false the Supabase JWT silently becomes invalid
// after ~1 hour.  Any write after that returns HTTP 401 / "JWT expired".
// We detect this in every write path and surface a blocking banner.

/** True when a Supabase error indicates the JWT is expired or missing */
const isJwtExpiredError = (error) => {
  if (!error) return false;
  const msg = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return (
    error.status === 401 ||
    error.code === 'PGRST301' ||      // PostgREST JWT validation failure
    msg.includes('jwt expired') ||
    msg.includes('invalid jwt') ||
    msg.includes('jwtexpired') ||
    msg.includes('not authenticated') ||
    (msg.includes('jwt') && (msg.includes('expir') || msg.includes('invalid')))
  );
};

// Module-level singleton so module-scoped write helpers can reach the
// provider's state setter without being refactored into useCallbacks.
// Guaranteed single-instance: AppProvider is mounted exactly once.
let _notifySessionExpired = null;

// ── Retry queue for failed writes (ISO 25010 — Reliability) ──
const RETRY_QUEUE_KEY = 'xo_retry_queue';
const MAX_RETRIES = 3;

const enqueueRetry = (operation, table, payload) => {
  try {
    const queue = JSON.parse(localStorage.getItem(RETRY_QUEUE_KEY) || '[]');
    queue.push({ operation, table, payload, retries: 0, created_at: Date.now() });
    // Keep queue bounded (max 50 pending operations)
    if (queue.length > 50) queue.shift();
    localStorage.setItem(RETRY_QUEUE_KEY, JSON.stringify(queue));
  } catch { /* ignore */ }
};

const clearRetryQueue = () => {
  try { localStorage.removeItem(RETRY_QUEUE_KEY); } catch { /* ignore */ }
};

// Tables that have an `updated_at` column in the Supabase schema.
// All other tables (tasks, events, minutes, datasets, activity_log, notifications)
// do NOT have it — sending it causes PGRST204 and silently kills every write.
const TABLES_WITH_UPDATED_AT = new Set(['profiles']);

/** Strip fields that don't exist in the Supabase table schema.
 *  Prevents PGRST204 ("column not found in schema cache") errors. */
const stripForDB = (table, row) => {
  if (TABLES_WITH_UPDATED_AT.has(table)) return row;
  const { updated_at, ...clean } = row;
  return clean;
};

/** Upsert a row to Supabase with retry on failure.
 *  Returns { ok: boolean, error?: string } so callers can surface failures. */
const upsertRow = async (table, row) => {
  if (!supabase) return { ok: false, error: 'offline' };
  const cleaned = stripForDB(table, row);
  const { error } = await supabase.from(table).upsert(cleaned, { onConflict: 'id' });
  if (error) {
    console.error(`[XoCompass] upsert ${table}:`, error.message);
    if (isJwtExpiredError(error)) { _notifySessionExpired?.(); return { ok: false, error: 'session_expired' }; }
    enqueueRetry('upsert', table, cleaned);
    return { ok: false, error: error.message };
  }
  return { ok: true };
};

/** Insert a row to Supabase with retry on failure.
 *  Returns { ok: boolean, error?: string } so callers can surface failures. */
const insertRow = async (table, row) => {
  if (!supabase) return { ok: false, error: 'offline' };
  const cleaned = stripForDB(table, row);
  const { error } = await supabase.from(table).insert(cleaned);
  if (error) {
    console.error(`[XoCompass] insert ${table}:`, error.message);
    if (isJwtExpiredError(error)) { _notifySessionExpired?.(); return { ok: false, error: 'session_expired' }; }
    enqueueRetry('insert', table, cleaned);
    return { ok: false, error: error.message };
  }
  return { ok: true };
};

/** Delete a row from Supabase by id */
const deleteRow = async (table, id) => {
  if (!supabase) return;
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) {
    console.error(`[XoCompass] delete ${table}:`, error.message);
    if (isJwtExpiredError(error)) { _notifySessionExpired?.(); return; }
    enqueueRetry('delete', table, { id });
  }
};

/** Process retry queue — called on mount and periodically */
const processRetryQueue = async () => {
  if (!supabase) return;
  let queue;
  try { queue = JSON.parse(localStorage.getItem(RETRY_QUEUE_KEY) || '[]'); } catch { return; }
  if (queue.length === 0) return;

  const remaining = [];
  for (const item of queue) {
    let error = null;
    const cleaned = stripForDB(item.table, item.payload);
    try {
      if (item.operation === 'upsert') {
        ({ error } = await supabase.from(item.table).upsert(cleaned, { onConflict: 'id' }));
      } else if (item.operation === 'insert') {
        ({ error } = await supabase.from(item.table).insert(cleaned));
      } else if (item.operation === 'delete') {
        ({ error } = await supabase.from(item.table).delete().eq('id', cleaned.id));
      }
    } catch (e) { error = e; }

    if (error && item.retries < MAX_RETRIES) {
      remaining.push({ ...item, retries: item.retries + 1 });
    }
    // If retries exhausted or success, drop from queue
  }
  localStorage.setItem(RETRY_QUEUE_KEY, JSON.stringify(remaining));
};

// ─── PROVIDER ─────────────────────────────────────────────────────

export const AppProvider = ({ children }) => {
  const [cloudReady, setCloudReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState(isCloudEnabled ? 'connecting' : 'local'); // 'local' | 'connecting' | 'synced' | 'error'
  const [syncError, setSyncError] = useState(null); // user-visible error message, auto-clears after 5s
  const subscriptionsRef = useRef([]);
  const authSettledRef = useRef(false); // tracks whether initial auth has resolved
  const [authSettled, setAuthSettled] = useState(false); // triggers hydration after auth lock is released
  // Monotonically-increasing fetch generation counter.
  // INITIAL_SESSION (no JWT) triggers hydration with anon access.
  // SIGNED_IN triggers a second fetch with the real JWT (sees all RLS rows).
  // On slow networks the anon hydration can complete AFTER the authenticated
  // re-fetch and silently overwrite the correct data.  Each fetch stamps its
  // own generation; only the highest-numbered fetch is allowed to commit.
  const fetchGenRef = useRef(0);

  // ── Feature 1: Session expiry state ──────────────────────────────
  // sessionExpiredRef gates re-entry so the banner fires exactly once.
  const [sessionExpired, setSessionExpired] = useState(false);
  const sessionExpiredRef = useRef(false);

  // Register the module-level singleton so insertRow/upsertRow/deleteRow can
  // reach this setter.  Cleans up on unmount so stale closures never fire.
  useEffect(() => {
    _notifySessionExpired = () => {
      if (sessionExpiredRef.current) return;
      sessionExpiredRef.current = true;
      setSessionExpired(true);
    };
    return () => { _notifySessionExpired = null; };
  }, []);

  const dismissSessionExpiry = useCallback(() => {
    // Reload is the safest recovery: re-login re-issues a fresh JWT.
    window.location.reload();
  }, []);

  // ── Feature 2: Online status + offline queue overflow warning ─────
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueueFull, setOfflineQueueFull] = useState(false);
  // Threshold: warn at 40 so the user has 10 writes before the hard cap (50).
  const OFFLINE_QUEUE_WARN = 40;

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setOfflineQueueFull(false); // connection restored — warning no longer relevant
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Poll the retry queue size every 3 s — only reads localStorage so it's cheap.
    // We only show the warning when genuinely offline AND queue >= threshold.
    const checkQueue = () => {
      if (navigator.onLine) return;
      try {
        const q = JSON.parse(localStorage.getItem(RETRY_QUEUE_KEY) || '[]');
        setOfflineQueueFull(q.length >= OFFLINE_QUEUE_WARN);
      } catch { /* ignore parse errors */ }
    };
    const queuePoll = setInterval(checkQueue, 3000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(queuePoll);
    };
  }, []);

  // ── Feature 3: Multi-tab localStorage sync ───────────────────────
  // The `storage` event fires in every OTHER tab when localStorage changes.
  // This gives us cross-tab logout propagation and zero-refetch data sync.
  useEffect(() => {
    const handleStorageSync = (event) => {
      // Skip same-origin writes that didn't actually change the value.
      // This breaks the potential echo loop: Tab A writes → Tab B syncs →
      // Tab B mirror-writes same value → Tab A storage event → skip.
      if (event.newValue === event.oldValue) return;

      switch (event.key) {
        case 'xo_user':
          if (event.newValue === null) {
            // Another tab signed out — mirror a full local sign-out without
            // re-calling supabase.auth.signOut (already done by the other tab).
            setUser(null);
            setTasks([]);  setEvents([]);  setMinutes([]);
            setDatasets([]); setActivityLog([]); setNotifications([]);
            authSettledRef.current = false;
            setAuthSettled(false);
          }
          break;
        // For data keys: only sync actual writes (newValue !== null).
        // null means the key was removed as part of sign-out — xo_user case above
        // already handles the full state clear.
        case 'tasks':
          try { if (event.newValue) setTasks(JSON.parse(event.newValue)); } catch { /* corrupt */ }
          break;
        case 'events':
          try { if (event.newValue) setEvents(JSON.parse(event.newValue)); } catch { /* corrupt */ }
          break;
        case 'minutes':
          try { if (event.newValue) setMinutes(JSON.parse(event.newValue)); } catch { /* corrupt */ }
          break;
        case 'datasets':
          try { if (event.newValue) setDatasets(JSON.parse(event.newValue)); } catch { /* corrupt */ }
          break;
        case 'activityLog':
          try { if (event.newValue) setActivityLog(JSON.parse(event.newValue)); } catch { /* corrupt */ }
          break;
        case 'notifications':
          try { if (event.newValue) setNotifications(JSON.parse(event.newValue)); } catch { /* corrupt */ }
          break;
        default: break;
      }
    };

    window.addEventListener('storage', handleStorageSync);
    return () => window.removeEventListener('storage', handleStorageSync);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — setters are stable React dispatch functions

  // Auto-clear sync errors after 5 seconds
  useEffect(() => {
    if (!syncError) return;
    const timer = setTimeout(() => setSyncError(null), 5000);
    return () => clearTimeout(timer);
  }, [syncError]);

  // persistSession: false means no Supabase session survives a page reload.
  // There is never anything to restore, so always show the login screen immediately.
  const [authLoading, setAuthLoading] = useState(false);

  // ── State: user ──
  // Cloud mode (persistSession: false): sessions are in-memory only and don't
  // survive page reloads. Never pre-populate from localStorage — there is no
  // valid Supabase session backing it. Starting null prevents a stale-user flash
  // (app briefly renders as "logged in" then snaps back to login on INITIAL_SESSION).
  // The SIGNED_IN event is the sole source of truth for cloud sessions.
  //
  // Local mode: no Supabase session at all; restore from localStorage as before.
  const [user, setUser] = useState(() => {
    if (isCloudEnabled) return null;
    const parsed = readLocal('xo_user', null);
    if (!parsed) return null;
    // Re-derive permissions from roleKey; infer from old role string if missing
    let key = parsed.roleKey;
    if (!key && parsed.role) {
      const r = parsed.role.toLowerCase();
      if (r.includes('project manager') || r.includes('pm')) key = 'pm';
      else if (r.includes('backend')) key = 'backend';
      else if (r.includes('frontend')) key = 'frontend';
      else key = 'guest';
      parsed.roleKey = key;
    }
    parsed.permissions = ROLE_PERMISSIONS[key || 'guest'] || ROLE_PERMISSIONS.guest;
    return parsed;
  });

  const [tasks, setTasks] = useState(() => readLocal('tasks'));
  const [events, setEvents] = useState(() => readLocal('events'));
  const [activityLog, setActivityLog] = useState(() => readLocal('activityLog'));
  const [notifications, setNotifications] = useState(() => readLocal('notifications'));
  const [minutes, setMinutes] = useState(() => readLocal('minutes'));
  const [datasets, setDatasets] = useState(() => readLocal('datasets'));

  // ── localStorage mirror (always active as offline cache) ──
  useEffect(() => { if (user) writeLocal('xo_user', user); else localStorage.removeItem('xo_user'); }, [user]);
  useEffect(() => { writeLocal('tasks', tasks); }, [tasks]);
  useEffect(() => { writeLocal('events', events); }, [events]);
  useEffect(() => { writeLocal('activityLog', activityLog); }, [activityLog]);
  useEffect(() => { writeLocal('notifications', notifications); }, [notifications]);
  useEffect(() => { writeLocal('minutes', minutes); }, [minutes]);
  useEffect(() => { writeLocal('datasets', datasets); }, [datasets]);

  // ── Supabase: initial fetch (hydrate from cloud AFTER auth settles) ──
  // This prevents fetch failures caused by NavigatorLock contention.
  // Previously, hydration fired on mount while auth was still acquiring its lock,
  // causing ALL Supabase operations to fail with lock-steal errors.
  useEffect(() => {
    if (!isCloudEnabled || !authSettled) return;
    let cancelled = false;
    // Stamp this fetch with the current generation so a later SIGNED_IN
    // re-fetch (higher gen) can invalidate it before it commits.
    const myGen = ++fetchGenRef.current;

    const hydrate = async () => {
      try {
        const [cloudTasks, cloudEvents, cloudMinutes, cloudDatasets, cloudLog, cloudNotif] = await Promise.all([
          fetchTable(TABLES.tasks),
          fetchTable(TABLES.events),
          fetchTable(TABLES.minutes),
          fetchTable(TABLES.datasets),
          fetchTable(TABLES.activity_log),
          fetchTable(TABLES.notifications),
        ]);

        // Bail if unmounted OR if a later fetch (SIGNED_IN re-fetch with JWT)
        // already committed fresher data — prevents anon results overwriting
        // authenticated results on slow networks.
        if (cancelled || fetchGenRef.current !== myGen) return;

        // Cloud data wins over localStorage (source of truth)
        if (cloudTasks) setTasks(cloudTasks);
        if (cloudEvents) setEvents(cloudEvents);
        if (cloudMinutes) setMinutes(cloudMinutes);
        if (cloudDatasets) setDatasets(cloudDatasets);
        if (cloudLog) setActivityLog(cloudLog);
        if (cloudNotif) setNotifications(cloudNotif.map(enrichNotification));

        setCloudReady(true);
        setSyncStatus('synced');
      } catch (err) {
        console.error('[XoCompass] hydration failed:', err);
        setSyncStatus('error');
      }
    };

    hydrate();
    return () => { cancelled = true; };
  }, [authSettled]);

  // ── Supabase: real-time subscriptions with auto-reconnect ──
  // Chrome/Edge/Firefox throttle background tabs, killing WebSocket heartbeats.
  // iOS Safari is less aggressive, which is why iOS appears to stay "live".
  // Fix: monitor channel status + reconnect on visibility change.
  useEffect(() => {
    if (!isCloudEnabled || !authSettled) return;

    const subscribe = (table, setter, transform = null, insertCap = 0) => {
      const channel = supabase
        .channel(`realtime-${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;
          const row = transform && newRow ? transform(newRow) : newRow;

          setter(prev => {
            if (eventType === 'INSERT') {
              if (prev.some(item => item.id === row.id)) return prev;
              // Apply the same cap used in logAction so every device stays
              // consistent.  Without this, the writing device is capped at 200
              // (via .slice in logAction) while all OTHER devices grow
              // unbounded via realtime INSERTs, causing permanent divergence.
              const next = [row, ...prev];
              return insertCap > 0 ? next.slice(0, insertCap) : next;
            }
            if (eventType === 'UPDATE') {
              return prev.map(item => item.id === row.id ? row : item);
            }
            if (eventType === 'DELETE') {
              return prev.filter(item => item.id !== oldRow.id);
            }
            return prev;
          });
        })
        .subscribe((status) => {
          if (status === 'TIMED_OUT') {
            console.warn(`[XoCompass] Realtime ${table} timed out — reconnecting...`);
            channel.subscribe();
          }
        });

      return channel;
    };

    const setupSubscriptions = () => {
      // Tear down any existing channels first
      subscriptionsRef.current.forEach(ch => supabase.removeChannel(ch));
      subscriptionsRef.current = [
        subscribe(TABLES.tasks, setTasks),
        subscribe(TABLES.events, setEvents),
        subscribe(TABLES.minutes, setMinutes),
        subscribe(TABLES.datasets, setDatasets),
        subscribe(TABLES.activity_log, setActivityLog, null, 200), // cap matches logAction
        subscribe(TABLES.notifications, setNotifications, enrichNotification),
      ];
    };

    setupSubscriptions();

    // Re-subscribe when tab regains focus (handles browser throttling)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // GUARD: authSettledRef.current is set to false SYNCHRONOUSLY at the
        // very start of signOut(), before any async work or React state updates.
        // Without this, the event listener (still attached until React processes
        // setAuthSettled(false)) fires during the sign-out window and re-fetches
        // with the still-live in-memory JWT — repopulating state that was just
        // cleared.  The ref check is synchronous so it catches the race that
        // React's async batching cannot.
        if (!authSettledRef.current) return;

        // ALWAYS re-fetch from cloud on focus — do NOT gate behind channel state.
        // iOS Safari and Chrome background-suspend WebSocket connections into a
        // zombie state: ch.state stays 'joined' but no messages arrive, so the
        // old anyDead check always returned false and the re-fetch never ran.
        // A lightweight full-fetch ensures every device converges on the same
        // server state after being backgrounded (phone lock, tab switch, etc.).
        Promise.all([
          fetchTable(TABLES.tasks),    fetchTable(TABLES.events),
          fetchTable(TABLES.minutes),  fetchTable(TABLES.datasets),
          fetchTable(TABLES.activity_log), fetchTable(TABLES.notifications),
        ]).then(([t, e, m, d, a, n]) => {
          // Double-check auth is still settled after the async fetch completes.
          // Protects against sign-out that happens while the fetch is in-flight.
          if (!authSettledRef.current) return;
          if (t) setTasks(t);   if (e) setEvents(e);
          if (m) setMinutes(m); if (d) setDatasets(d);
          if (a) setActivityLog(a);
          if (n) setNotifications(n.map(enrichNotification));
        }).catch(() => {});

        // Additionally reconnect any channels that are genuinely dead
        const anyDead = subscriptionsRef.current.some(
          ch => ch.state !== 'joined' && ch.state !== 'joining'
        );
        if (anyDead) {
          console.log('[XoCompass] Tab refocused — reconnecting dead realtime channels');
          setupSubscriptions();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      subscriptionsRef.current.forEach(ch => supabase.removeChannel(ch));
      subscriptionsRef.current = [];
    };
  }, [authSettled]);

  // ── Retry queue processor (runs after auth settles + every 30s) ──
  useEffect(() => {
    if (!isCloudEnabled || !authSettled) return;
    // Process any failed writes from previous session
    processRetryQueue();
    const interval = setInterval(processRetryQueue, 30000);
    return () => clearInterval(interval);
  }, [authSettled]);

  // ── Helper: surface write errors to the user ──
  const showWriteError = useCallback((operation, result) => {
    if (result && !result.ok && result.error && result.error !== 'offline') {
      setSyncError(`Failed to save: ${operation}. Will retry automatically.`);
      console.warn(`[XoCompass] Write failed (${operation}):`, result.error);
    }
  }, []);

  // ── Activity Log (stable ref — never stale, no dependency chain issues) ──
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  const logAction = useCallback((action, details) => {
    const newLog = {
      id: crypto.randomUUID(),
      user_name: sanitize(userRef.current?.name || 'System'),
      action: sanitize(action),
      details: sanitize(details),
      time: new Date().toLocaleString(),
      created_at: new Date().toISOString(),
    };
    setActivityLog(prev => [newLog, ...prev].slice(0, 200));
    insertRow(TABLES.activity_log, newLog);
  }, []); // stable — reads user from ref

  // ── TASKS CRUD ──
  const addTask = useCallback((newTask) => {
    const sanitized = sanitizeRow(newTask);
    if (sanitized.status && !VALID_STATUSES.includes(sanitized.status)) sanitized.status = 'Not Started';
    if (sanitized.priority && !VALID_PRIORITIES.includes(sanitized.priority)) sanitized.priority = 'Medium';

    const task = {
      ...sanitized,
      id: crypto.randomUUID(),
      comments: [],
      subtasks: [],
      dependencies: sanitized.dependencies || [],
      status: 'Not Started',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setTasks(prev => [...prev, task]);
    insertRow(TABLES.tasks, task).then(r => showWriteError('create task', r));
    logAction('Created Task', `"${sanitized.task}" assigned to ${sanitized.owner || 'unassigned'}`);
  }, [logAction, showWriteError]);

  const updateTask = useCallback((id, updates) => {
    const sanitized = sanitizeRow(updates);
    if (sanitized.status && !VALID_STATUSES.includes(sanitized.status)) delete sanitized.status;
    if (sanitized.priority && !VALID_PRIORITIES.includes(sanitized.priority)) delete sanitized.priority;

    let rowToSync = null;
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      const merged = { ...t, ...sanitized, updated_at: new Date().toISOString() };
      rowToSync = merged;
      return merged;
    }));
    if (rowToSync) {
      upsertRow(TABLES.tasks, rowToSync).then(r => showWriteError('update task', r));
      // Build a human-readable summary of what changed
      const changes = Object.keys(sanitized).filter(k => k !== 'updated_at').join(', ');
      logAction('Edited Task', `"${rowToSync.task}" — updated ${changes}`);
    }
  }, [logAction, showWriteError]);

  const updateTaskStatus = useCallback((id, newStatus) => {
    if (!VALID_STATUSES.includes(newStatus)) return;

    let rowToSync = null;
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      const merged = { ...t, status: newStatus, updated_at: new Date().toISOString() };
      rowToSync = merged;
      return merged;
    }));
    if (rowToSync) {
      upsertRow(TABLES.tasks, rowToSync).then(r => showWriteError('move task', r));
      logAction('Moved Task', `"${rowToSync.task}" → ${newStatus}`);
    }
  }, [logAction, showWriteError]);

  const deleteTask = useCallback((id) => {
    let deletedName = null;
    setTasks(prev => {
      const target = prev.find(t => t.id === id);
      if (target) deletedName = target.task;
      return prev.filter(t => t.id !== id);
    });
    deleteRow(TABLES.tasks, id);
    logAction('Deleted Task', deletedName ? `"${deletedName}"` : `ID: ${id}`);
  }, [logAction, showWriteError]);

  const addTaskComment = useCallback((taskId, commentText) => {
    const safeText = sanitize(commentText).slice(0, MAX_COMMENT_LENGTH);
    if (!safeText) return;
    const commenter = sanitize(userRef.current?.name || 'Anonymous');
    const comment = { user: commenter, text: safeText, time: new Date().toLocaleTimeString() };

    let rowToSync = null;
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const merged = { ...t, comments: [...(t.comments || []), comment], updated_at: new Date().toISOString() };
      rowToSync = merged;
      return merged;
    }));
    if (rowToSync) {
      upsertRow(TABLES.tasks, rowToSync).then(r => showWriteError('add comment', r));
      logAction('Commented', `on "${rowToSync.task}": "${safeText.slice(0, 60)}${safeText.length > 60 ? '...' : ''}"`);
    }
  }, [logAction, showWriteError]);

  const subtasks = {
    add: (taskId, name) => {
      const safeName = sanitize(name).slice(0, MAX_TEXT_LENGTH);
      if (!safeName) return;
      const newSub = { id: crypto.randomUUID(), name: safeName, done: false };

      let rowToSync = null;
      setTasks(prev => prev.map(t => {
        if (t.id !== taskId) return t;
        const merged = { ...t, subtasks: [...(t.subtasks || []), newSub], updated_at: new Date().toISOString() };
        rowToSync = merged;
        return merged;
      }));
      if (rowToSync) {
        upsertRow(TABLES.tasks, rowToSync).then(r => showWriteError('add subtask', r));
        logAction('Added Subtask', `"${safeName}" to "${rowToSync.task}"`);
      }
    },
    toggle: (taskId, sId) => {
      let rowToSync = null;
      let toggledName = '';
      let toggledDone = false;
      setTasks(prev => prev.map(t => {
        if (t.id !== taskId) return t;
        const merged = {
          ...t,
          subtasks: (t.subtasks || []).map(s => {
            if (s.id !== sId) return s;
            toggledName = s.name;
            toggledDone = !s.done;
            return { ...s, done: !s.done };
          }),
          updated_at: new Date().toISOString(),
        };
        rowToSync = merged;
        return merged;
      }));
      if (rowToSync) {
        upsertRow(TABLES.tasks, rowToSync).then(r => showWriteError('toggle subtask', r));
        logAction(toggledDone ? 'Completed Subtask' : 'Unchecked Subtask', `"${toggledName}" in "${rowToSync.task}"`);
      }
    },
  };

  // ── EVENTS CRUD ──
  const addEvent = useCallback((evt) => {
    const sanitized = sanitizeRow(evt);
    if (sanitized.status && !VALID_STATUSES.includes(sanitized.status)) sanitized.status = 'Not Started';
    const event = { ...sanitized, id: crypto.randomUUID(), status: sanitized.status || 'Not Started', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    setEvents(prev => [...prev, event]);
    insertRow(TABLES.events, event).then(r => showWriteError('create event', r));
    logAction('Created Event', `"${sanitized.title}" on ${sanitized.date || event.date || 'TBD'}`);
  }, [logAction, showWriteError]);

  const updateEvent = useCallback((id, updatedEvt) => {
    const sanitized = sanitizeRow(updatedEvt);
    if (sanitized.status && !VALID_STATUSES.includes(sanitized.status)) delete sanitized.status;

    let rowToSync = null;
    setEvents(prev => prev.map(e => {
      if (e.id !== id) return e;
      const merged = { ...e, ...sanitized, updated_at: new Date().toISOString() };
      rowToSync = merged;
      return merged;
    }));
    if (rowToSync) {
      upsertRow(TABLES.events, rowToSync).then(r => showWriteError('update event', r));
      logAction('Edited Event', `"${rowToSync.title}"`);
    }
  }, [logAction, showWriteError]);

  const deleteEvent = useCallback((id) => {
    let deletedTitle = null;
    setEvents(prev => {
      const target = prev.find(e => e.id === id);
      if (target) deletedTitle = target.title;
      return prev.filter(e => e.id !== id);
    });
    deleteRow(TABLES.events, id);
    logAction('Deleted Event', deletedTitle ? `"${deletedTitle}"` : `ID: ${id}`);
  }, [logAction, showWriteError]);

  // ── MINUTES CRUD ──
  const addMinute = useCallback((minute) => {
    const sanitized = sanitizeRow(minute);
    const m = { ...sanitized, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    setMinutes(prev => [...prev, m]);
    insertRow(TABLES.minutes, m).then(r => showWriteError('add meeting', r));
    logAction('Added Meeting', `"${sanitized.topic || 'Untitled'}" on ${sanitized.date || 'TBD'}`);
  }, [logAction, showWriteError]);

  const updateMinute = useCallback((id, updates) => {
    const sanitized = sanitizeRow(updates);

    let rowToSync = null;
    setMinutes(prev => prev.map(m => {
      if (m.id !== id) return m;
      const merged = { ...m, ...sanitized, updated_at: new Date().toISOString() };
      rowToSync = merged;
      return merged;
    }));
    if (rowToSync) {
      upsertRow(TABLES.minutes, rowToSync).then(r => showWriteError('update meeting', r));
      logAction('Edited Meeting', `"${rowToSync.topic || 'Untitled'}"`);
    }
  }, [logAction, showWriteError]);

  const deleteMinute = useCallback((id) => {
    let deletedTopic = null;
    setMinutes(prev => {
      const target = prev.find(m => m.id === id);
      if (target) deletedTopic = target.topic;
      return prev.filter(m => m.id !== id);
    });
    deleteRow(TABLES.minutes, id);
    logAction('Deleted Meeting', deletedTopic ? `"${deletedTopic}"` : `ID: ${id}`);
  }, [logAction, showWriteError]);

  // ── DATASETS CRUD ──
  const addDataset = useCallback((dataset) => {
    const sanitized = sanitizeRow(dataset);
    if (sanitized.type && !VALID_DATASET_TYPES.includes(sanitized.type)) sanitized.type = 'Primary';
    if (sanitized.status && !VALID_DATASET_STATUSES.includes(sanitized.status)) sanitized.status = 'Raw';
    const d = { ...sanitized, id: crypto.randomUUID(), uploadedAt: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    setDatasets(prev => [...prev, d]);
    insertRow(TABLES.datasets, d).then(r => showWriteError('add dataset', r));
    logAction('Uploaded Dataset', `"${sanitized.name}" (${sanitized.type}, ${sanitized.rows || 0} rows)`);
  }, [logAction, showWriteError]);

  const updateDataset = useCallback((id, updates) => {
    const sanitized = sanitizeRow(updates);
    if (sanitized.type && !VALID_DATASET_TYPES.includes(sanitized.type)) delete sanitized.type;
    if (sanitized.status && !VALID_DATASET_STATUSES.includes(sanitized.status)) delete sanitized.status;

    let rowToSync = null;
    setDatasets(prev => prev.map(d => {
      if (d.id !== id) return d;
      const merged = { ...d, ...sanitized, updated_at: new Date().toISOString() };
      rowToSync = merged;
      return merged;
    }));
    if (rowToSync) {
      upsertRow(TABLES.datasets, rowToSync).then(r => showWriteError('update dataset', r));
      logAction('Updated Dataset', `"${rowToSync.name}" — ${Object.keys(sanitized).join(', ')}`);
    }
  }, [logAction, showWriteError]);

  const deleteDataset = useCallback((id) => {
    let deletedName = null;
    setDatasets(prev => {
      const target = prev.find(d => d.id === id);
      if (target) deletedName = target.name;
      return prev.filter(d => d.id !== id);
    });
    deleteRow(TABLES.datasets, id);
    logAction('Deleted Dataset', deletedName ? `"${deletedName}"` : `ID: ${id}`);
  }, [logAction, showWriteError]);

  // ── NOTIFICATIONS ──
  const nudgeUser = useCallback((targetUser, taskName) => {
    const dbRow = {
      id: crypto.randomUUID(),
      to_user: targetUser,
      message: `${userRef.current?.name || 'Someone'} nudged you about "${taskName}"`,
      read: false,
      created_at: new Date().toISOString(),
    };
    setNotifications(prev => [{ ...dbRow, type: 'nudge' }, ...prev]);
    insertRow(TABLES.notifications, dbRow).then(r => showWriteError('nudge', r));
    logAction('Nudged Member', `Alerted ${targetUser} about "${taskName}"`);
  }, [logAction, showWriteError]);

  // ── ACCESS REQUEST: non-PM users request access or notify PM of blocked actions ──
  const requestAccess = useCallback((context, type = 'page') => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    // Throttle: don't spam the same request within a session
    const key = `xo_req_${type}_${context}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');

    const message = type === 'action'
      ? `[ACCESS_REQUEST] ${currentUser.name} (${currentUser.email || 'local'}) tried to "${context}" but lacks permission. Consider upgrading their role.`
      : `[ACCESS_REQUEST] ${currentUser.name} (${currentUser.email || 'local'}) is requesting access to "${context}". Assign them a role in User Management.`;

    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();

    // DB row — only columns that exist in the notifications table
    const dbRow = { id, to_user: PM_EMAIL, message, read: false, created_at };

    // Local state gets enriched copy for UI (AdminPanel filtering, quick-assign)
    const localNotif = {
      ...dbRow,
      type: 'access_request',
      from_user: currentUser.name,
      from_email: currentUser.email || '',
      request_context: context,
      request_type: type,
    };

    setNotifications(prev => [localNotif, ...prev]);
    insertRow(TABLES.notifications, dbRow).catch(() => {});
    logAction('Requested Access', `${currentUser.name} → "${context}" (${type})`);
  }, [logAction]);

  const clearNotifications = useCallback(() => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    setNotifications(prev => {
      const isForMe = (n) => isNotificationForUser(n, currentUser);
      const toKeep = prev.filter(n => !isForMe(n));
      const toRemove = prev.filter(isForMe);
      toRemove.forEach(n => deleteRow(TABLES.notifications, n.id));
      return toKeep;
    });
    logAction('Cleared Notifications', `${userRef.current?.name} cleared their notifications`);
  }, [logAction]);

  // ── AUTH: handle profile → user, with restricted check ──
  // PM_EMAIL always gets PM role, even if DB says otherwise
  const handleProfile = useCallback((profile, eventSource) => {
    if (!profile) return null;
    // Force PM role for the canonical PM email
    if (profile.email === PM_EMAIL && profile.role !== 'pm') {
      profile = { ...profile, role: 'pm' };
    }
    if (profile.role === 'restricted') {
      return { restricted: true, email: profile.email };
    }
    const u = buildUser(profile);
    setUser(u);
    return u;
  }, []);

  // ── AUTH: Single onAuthStateChange listener (NO getSession — avoids NavigatorLock race) ──
  // Supabase JS v2 emits INITIAL_SESSION as the first event, giving us the
  // existing session without a separate getSession() call that would compete
  // for the same NavigatorLock, causing ALL subsequent Supabase operations to fail.
  useEffect(() => {
    if (!isCloudEnabled) {
      setAuthLoading(false);
      setAuthSettled(true);
      return;
    }

    // If no cached user, show login immediately (don't block on network)
    const hasCachedUser = !!readLocal('xo_user', null);
    if (!hasCachedUser) { setAuthLoading(false); }

    // Timeout guard: if auth takes too long, unblock UI
    const AUTH_TIMEOUT_MS = 3000;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      setAuthLoading(false);
      if (!authSettledRef.current) {
        authSettledRef.current = true;
        setAuthSettled(true); // allow hydration even if auth timed out
      }
    }, AUTH_TIMEOUT_MS);

    // Single listener — handles INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // INITIAL_SESSION replaces getSession() — no lock contention
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        if (session?.user) {
          try {
            const profile = await fetchProfile(session.user.id);
            if (profile) {
              handleProfile(profile, event);
            } else {
              // Fallback: build user from JWT metadata
              const meta = session.user.user_metadata || {};
              // Force PM role for the canonical PM email
              const roleKey = session.user.email === PM_EMAIL ? 'pm' : (meta.role || 'guest');
              setUser({
                id: session.user.id,
                email: session.user.email,
                name: meta.name || session.user.email?.split('@')[0] || 'User',
                role: ROLE_LABELS[roleKey] || roleKey,
                roleKey,
                permissions: ROLE_PERMISSIONS[roleKey] || ROLE_PERMISSIONS.guest,
                avatar_url: null,
              });
            }
          } catch (err) {
            console.error('[XoCompass] auth profile fetch:', err);
          }

          if (event === 'SIGNED_IN') {
            // With persistSession: false, INITIAL_SESSION fires before sign-in with
            // no JWT, so the initial hydration runs under anon-key access only.
            // Re-fetch all tables now that the in-memory JWT is live so RLS-protected
            // rows (e.g. activity_log) are visible and every device sees the same data.
            // Stamp a higher generation so the concurrent anon hydration (lower gen)
            // cannot overwrite this result even if it resolves later.
            const myGen = ++fetchGenRef.current;
            Promise.all([
              fetchTable(TABLES.tasks),        fetchTable(TABLES.events),
              fetchTable(TABLES.minutes),      fetchTable(TABLES.datasets),
              fetchTable(TABLES.activity_log), fetchTable(TABLES.notifications),
            ]).then(([t, e, m, d, a, n]) => {
              if (fetchGenRef.current !== myGen) return; // superseded by a newer fetch
              if (t) setTasks(t);        if (e) setEvents(e);
              if (m) setMinutes(m);      if (d) setDatasets(d);
              if (a) setActivityLog(a);
              if (n) setNotifications(n.map(enrichNotification));
              setCloudReady(true);
              setSyncStatus('synced');
            }).catch(() => {});
          }
        }
        // Mark auth as settled (whether we got a session or not)
        if (!authSettledRef.current) {
          authSettledRef.current = true;
          setAuthSettled(true);
        }
        clearTimeout(timeout);
        if (!timedOut) setAuthLoading(false);
      }

      if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem('xo_user');
      }

      if (event === 'TOKEN_REFRESHED' && session?.user) {
        // Silently refresh profile on token refresh (role may have changed)
        try {
          const profile = await fetchProfile(session.user.id);
          if (profile) handleProfile(profile, 'token_refresh');
        } catch { /* best effort */ }
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [handleProfile]);

  // ── Helper: race a promise against a timeout ──
  const withTimeout = (promise, ms, msg) =>
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
    ]);

  // ── AUTH: sign in with email/password + audit logging ──
  // Strategy: ONE network call (signInWithPassword) → set user from metadata instantly
  //           → enrich with full profile in the background (non-blocking).
  const signIn = useCallback(async (email, password) => {
    if (!isCloudEnabled) throw new Error('Cloud not configured. Use local mode instead.');
    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      8000,
      'Sign-in timed out. Check your internet connection or try again.'
    );
    if (error) {
      if (error.message?.includes('Invalid login credentials')) {
        throw new Error('Invalid email or password. Check your credentials or sign up first.');
      }
      if (error.message?.includes('Email not confirmed')) {
        throw new Error('Please confirm your email before signing in. Check your inbox.');
      }
      throw error;
    }
    if (data?.user) {
      // Instant: set user from auth metadata (no second network call)
      const meta = data.user.user_metadata || {};
      // Force PM role for canonical PM email, even if metadata says otherwise
      const roleKey = data.user.email === PM_EMAIL ? 'pm' : (meta.role || 'guest');
      const immediateUser = {
        id: data.user.id,
        email: data.user.email,
        name: meta.name || email.split('@')[0],
        role: ROLE_LABELS[roleKey] || roleKey,
        roleKey,
        permissions: ROLE_PERMISSIONS[roleKey] || ROLE_PERMISSIONS.guest,
        avatar_url: null,
      };
      setUser(immediateUser);
      logAction('Signed In', email);

      // Background: enrich with full profile (avatar, updated role, restricted check)
      fetchProfile(data.user.id).then(profile => {
        if (!profile) return;
        if (profile.role === 'restricted') {
          // Use scope:'local' to avoid NavigatorLock contention on desktop
          // Chrome/Firefox — the default signOut() holds the lock for the full
          // server round-trip and causes the next signInWithPassword to time out.
          supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          setUser(null);
          localStorage.removeItem('xo_user');
          return;
        }
        setUser(buildUser(profile));
      }).catch(() => { /* profile enrichment is best-effort */ });
    }
  }, [logAction]);

  // ── AUTH: sign up with email/password + profile metadata ──
  // New users ALWAYS start as guest. Only Pao (PM) can promote via Admin Panel.
  const signUp = useCallback(async (email, password, name) => {
    if (!isCloudEnabled) throw new Error('Cloud not configured. Use local mode instead.');
    const assignedRole = 'guest';
    const { data, error } = await withTimeout(
      supabase.auth.signUp({ email, password, options: { data: { name, role: assignedRole } } }),
      8000,
      'Sign-up timed out. Check your internet connection or try again.'
    );
    if (error) {
      if (error.message?.includes('already registered')) {
        throw new Error('This email is already registered. Try signing in instead.');
      }
      throw error;
    }

    // If email confirmation is required, session will be null
    if (!data?.session) {
      logAction('Signed Up', `${email} (awaiting email confirmation)`);
      throw new Error('CONFIRM_EMAIL');
    }

    // Fetch profile immediately for instant dashboard access
    if (data?.user) {
      // Small delay for DB trigger to create profile
      await new Promise(r => setTimeout(r, 500));
      const profile = await fetchProfile(data.user.id);
      if (profile) {
        setUser(buildUser(profile));
      } else {
        // Fallback: profile trigger hasn't fired yet — build from metadata
        const fallbackUser = {
          id: data.user.id,
          email: data.user.email,
          name,
          role: ROLE_LABELS[assignedRole],
          roleKey: assignedRole,
          permissions: ROLE_PERMISSIONS[assignedRole],
          avatar_url: null,
        };
        setUser(fallbackUser);
      }
      logAction('Signed Up', `${email} as ${ROLE_LABELS[assignedRole]} (pending role assignment)`);
    }
  }, [logAction]);

  // ── AUTH: sign out (instant — clears state first, then notifies Supabase) ──
  const signOut = useCallback(() => {
    const email = userRef.current?.email;
    const name = userRef.current?.name;
    // Log BEFORE clearing state (so user_name is captured)
    logAction('Signed Out', email || name || 'Unknown user');
    // Clear UI state IMMEDIATELY — never block on network
    setUser(null);
    setTasks([]);
    setEvents([]);
    setMinutes([]);
    setDatasets([]);
    setActivityLog([]);
    setNotifications([]);
    localStorage.removeItem('xo_user');
    localStorage.removeItem('tasks');
    localStorage.removeItem('events');
    localStorage.removeItem('minutes');
    localStorage.removeItem('datasets');
    localStorage.removeItem('activityLog');
    localStorage.removeItem('notifications');
    clearRetryQueue();
    setSyncStatus(isCloudEnabled ? 'connecting' : 'local');
    setCloudReady(false);
    // Reset auth gate so hydration + subscriptions re-run on next sign-in.
    // Without this, authSettled stays true and the useEffect([authSettled])
    // hooks never re-fire, leaving all data arrays empty after sign-out→sign-in.
    authSettledRef.current = false;
    setAuthSettled(false);
    // Fire-and-forget: clear the local session only (scope: 'local' skips the
    // server-side DELETE /auth/v1/logout network call).
    // Without this, the default signOut() holds the NavigatorLock for the entire
    // round-trip to Supabase — on desktop Chrome/Firefox (which enforce the Web
    // Locks API strictly) a subsequent signInWithPassword() queues behind that
    // lock and times out after 8 s.  iOS Safari gained navigator.locks in 15.4
    // and falls back to a non-locking path on older versions, which is why this
    // only surfaced on laptops.  The JWT remains valid server-side until it
    // expires (~1 h), but RLS still applies for that window.
    if (isCloudEnabled) {
      supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
  }, [logAction]);

  // ── AUTH: local-only mode (when Supabase is not configured) ──
  // Local mode also defaults to guest — no role picking allowed
  const localSignIn = useCallback((name) => {
    const u = {
      id: crypto.randomUUID(),
      email: null,
      name,
      role: ROLE_LABELS.guest,
      roleKey: 'guest',
      permissions: ROLE_PERMISSIONS.guest,
      avatar_url: null,
    };
    setUser(u);
  }, []);

  // ── EXPORT / IMPORT ──
  const exportAllData = useCallback(() => {
    const data = { tasks, events, minutes, datasets, activityLog, notifications, exportedAt: new Date().toISOString(), version: '2.0' };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `xocompass-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  }, [tasks, events, minutes, datasets, activityLog, notifications]);

  const importAllData = useCallback(async (jsonString) => {
    try {
      const data = JSON.parse(jsonString);
      // Validate structure (ISO 25010 — Security: never trust imported data blindly)
      if (typeof data !== 'object' || data === null) throw new Error('Invalid format');
      if (data.version && typeof data.version !== 'string') throw new Error('Invalid version');

      const sanitizeArray = (arr) => Array.isArray(arr) ? arr.filter(item => item && typeof item === 'object' && item.id).map(sanitizeRow) : [];

      if (data.tasks) { const rows = sanitizeArray(data.tasks); setTasks(rows); for (const r of rows) await upsertRow(TABLES.tasks, r); }
      if (data.events) { const rows = sanitizeArray(data.events); setEvents(rows); for (const r of rows) await upsertRow(TABLES.events, r); }
      if (data.minutes) { const rows = sanitizeArray(data.minutes); setMinutes(rows); for (const r of rows) await upsertRow(TABLES.minutes, r); }
      if (data.datasets) { const rows = sanitizeArray(data.datasets); setDatasets(rows); for (const r of rows) await upsertRow(TABLES.datasets, r); }
      if (data.activityLog) { setActivityLog(sanitizeArray(data.activityLog)); }
      if (data.notifications) { setNotifications(sanitizeArray(data.notifications)); }
      logAction('Imported Backup', `From ${sanitize(data.exportedAt || 'unknown')}`);
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message || 'Invalid backup file format.' };
    }
  }, [logAction]);

  // ── Activity log: explicit re-fetch (used by AdminPanel Refresh button) ──
  // Pulls the latest rows from the DB so the Actions count reflects the true
  // server state, not just what happened to arrive via realtime on this device.
  const refreshActivityLog = useCallback(async () => {
    const data = await fetchTable(TABLES.activity_log);
    if (data) setActivityLog(data);
  }, []);

  // ── STATS ──
  const getStats = useCallback(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'Done').length;
    const pending = tasks.filter(t => t.status === 'Not Started').length;
    const ongoing = tasks.filter(t => t.status === 'On-going').length;
    return { total, completed, pending, ongoing, progress: total === 0 ? 0 : Math.round((completed / total) * 100) };
  }, [tasks]);

  return (
    <AppContext.Provider value={{
      user, signIn, signUp, signOut, localSignIn, authLoading,
      tasks, addTask, updateTask, updateTaskStatus, deleteTask, addTaskComment, subtasks,
      events, addEvent, updateEvent, deleteEvent,
      activityLog, refreshActivityLog, getStats,
      minutes, addMinute, updateMinute, deleteMinute,
      datasets, addDataset, updateDataset, deleteDataset,
      notifications, nudgeUser, clearNotifications, requestAccess,
      exportAllData, importAllData,
      syncStatus, syncError, isCloudEnabled, cloudReady,
      sessionExpired, dismissSessionExpiry,
      isOnline, offlineQueueFull,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);

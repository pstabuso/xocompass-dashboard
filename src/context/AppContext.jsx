import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { supabase, isCloudEnabled, fetchProfile } from '../lib/supabase';

const AppContext = createContext();

// ─── ROLE → PERMISSIONS MAP (non-hardcoded users, roles from DB) ──
// Roles are stored in the `profiles` table; permissions derived here.
const ROLE_PERMISSIONS = {
  pm:         { canCreate: true, canDelete: true, canNudge: true, viewAll: true, isAdmin: true },
  backend:    { canCreate: true, canDelete: true, canNudge: true, viewAll: true, isAdmin: false },
  frontend:   { canCreate: true, canDelete: false, canNudge: false, viewAll: false, isAdmin: false },
  guest:      { canCreate: false, canDelete: false, canNudge: false, viewAll: true, isAdmin: false },
  restricted: { canCreate: false, canDelete: false, canNudge: false, viewAll: false, isAdmin: false },
};

const ROLE_LABELS = {
  pm:         'Project Manager & Documentations Head',
  backend:    'Backend Developer',
  frontend:   'Frontend Developer',
  guest:      'Guest Viewer',
  restricted: 'Restricted',
};

/** Build a user object from a Supabase profile row */
const buildUser = (profile) => ({
  id: profile.id,
  email: profile.email,
  name: profile.name,
  role: ROLE_LABELS[profile.role] || profile.role,
  roleKey: profile.role,
  permissions: ROLE_PERMISSIONS[profile.role] || ROLE_PERMISSIONS.guest,
  avatar_url: profile.avatar_url,
});

// Available roles for sign-up (exported for the login screen)
export const AVAILABLE_ROLES = [
  { id: 'pm', label: 'Project Manager & Docs Head' },
  { id: 'backend', label: 'Backend Developer' },
  { id: 'frontend', label: 'Frontend Developer' },
  { id: 'guest', label: 'Guest Viewer' },
];

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

/** Upsert a row to Supabase with retry on failure */
const upsertRow = async (table, row) => {
  if (!supabase) return;
  const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
  if (error) {
    console.error(`[XoCompass] upsert ${table}:`, error.message);
    enqueueRetry('upsert', table, row);
  }
};

/** Insert a row to Supabase with retry on failure */
const insertRow = async (table, row) => {
  if (!supabase) return;
  const { error } = await supabase.from(table).insert(row);
  if (error) {
    console.error(`[XoCompass] insert ${table}:`, error.message);
    enqueueRetry('insert', table, row);
  }
};

/** Delete a row from Supabase by id */
const deleteRow = async (table, id) => {
  if (!supabase) return;
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) {
    console.error(`[XoCompass] delete ${table}:`, error.message);
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
    try {
      if (item.operation === 'upsert') {
        ({ error } = await supabase.from(item.table).upsert(item.payload, { onConflict: 'id' }));
      } else if (item.operation === 'insert') {
        ({ error } = await supabase.from(item.table).insert(item.payload));
      } else if (item.operation === 'delete') {
        ({ error } = await supabase.from(item.table).delete().eq('id', item.payload.id));
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
  const subscriptionsRef = useRef([]);

  // Only show "Restoring session…" if there's a cached user to restore.
  // No cached user → show login screen immediately (zero delay).
  const [authLoading, setAuthLoading] = useState(() => {
    if (!isCloudEnabled) return false;
    return !!readLocal('xo_user', null);
  });

  // ── State: initialised from localStorage (instant), then overwritten by Supabase ──
  const [user, setUser] = useState(() => {
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

  // ── Supabase: initial fetch (hydrate from cloud on mount) ──
  useEffect(() => {
    if (!isCloudEnabled) return;
    let cancelled = false;

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

        if (cancelled) return;

        // Cloud data wins over localStorage (source of truth)
        if (cloudTasks) setTasks(cloudTasks);
        if (cloudEvents) setEvents(cloudEvents);
        if (cloudMinutes) setMinutes(cloudMinutes);
        if (cloudDatasets) setDatasets(cloudDatasets);
        if (cloudLog) setActivityLog(cloudLog);
        if (cloudNotif) setNotifications(cloudNotif);

        setCloudReady(true);
        setSyncStatus('synced');
      } catch (err) {
        console.error('[XoCompass] hydration failed:', err);
        setSyncStatus('error');
      }
    };

    hydrate();
    return () => { cancelled = true; };
  }, []);

  // ── Supabase: real-time subscriptions ──
  useEffect(() => {
    if (!isCloudEnabled) return;

    const subscribe = (table, setter) => {
      const channel = supabase
        .channel(`realtime-${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;

          setter(prev => {
            if (eventType === 'INSERT') {
              // Avoid duplicates (we may have optimistically added it)
              if (prev.some(item => item.id === newRow.id)) return prev;
              return [newRow, ...prev];
            }
            if (eventType === 'UPDATE') {
              return prev.map(item => item.id === newRow.id ? newRow : item);
            }
            if (eventType === 'DELETE') {
              return prev.filter(item => item.id !== oldRow.id);
            }
            return prev;
          });
        })
        .subscribe();

      return channel;
    };

    subscriptionsRef.current = [
      subscribe(TABLES.tasks, setTasks),
      subscribe(TABLES.events, setEvents),
      subscribe(TABLES.minutes, setMinutes),
      subscribe(TABLES.datasets, setDatasets),
      subscribe(TABLES.activity_log, setActivityLog),
      subscribe(TABLES.notifications, setNotifications),
    ];

    return () => {
      subscriptionsRef.current.forEach(ch => supabase.removeChannel(ch));
      subscriptionsRef.current = [];
    };
  }, []);

  // ── Retry queue processor (runs on mount + every 30s) ──
  useEffect(() => {
    if (!isCloudEnabled) return;
    // Process any failed writes from previous session
    processRetryQueue();
    const interval = setInterval(processRetryQueue, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Activity Log ──
  const logAction = useCallback((action, details) => {
    const newLog = {
      id: crypto.randomUUID(),
      user_name: sanitize(user?.name || 'System'),
      action: sanitize(action),
      details: sanitize(details),
      time: new Date().toLocaleString(),
      created_at: new Date().toISOString(),
    };
    setActivityLog(prev => [newLog, ...prev].slice(0, 50));
    insertRow(TABLES.activity_log, newLog);
  }, [user]);

  // ── TASKS CRUD (ISO 25010 — Reliability: sync captured row directly) ──
  const addTask = useCallback((newTask) => {
    const sanitized = sanitizeRow(newTask);
    // Validate status & priority
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
    insertRow(TABLES.tasks, task);
    logAction('Created Task', sanitized.task);
  }, [logAction]);

  // FIX: Capture merged row INSIDE setState, then sync it OUTSIDE setState.
  // The old queueMicrotask+setState pattern was broken — React 19 can skip
  // updaters that return unchanged references, silently dropping the upsertRow call.
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
    // rowToSync is populated synchronously by the updater
    if (rowToSync) upsertRow(TABLES.tasks, rowToSync);
  }, []);

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
      upsertRow(TABLES.tasks, rowToSync);
      logAction('Moved Task', `"${rowToSync.task}" is now ${newStatus}`);
    }
  }, [logAction]);

  const deleteTask = useCallback((id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    deleteRow(TABLES.tasks, id);
  }, []);

  const addTaskComment = useCallback((taskId, commentText) => {
    const safeText = sanitize(commentText).slice(0, MAX_COMMENT_LENGTH);
    if (!safeText) return;
    const comment = { user: sanitize(user?.name || 'Anonymous'), text: safeText, time: new Date().toLocaleTimeString() };

    let rowToSync = null;
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const merged = { ...t, comments: [...(t.comments || []), comment], updated_at: new Date().toISOString() };
      rowToSync = merged;
      return merged;
    }));
    if (rowToSync) upsertRow(TABLES.tasks, rowToSync);
  }, [user]);

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
      if (rowToSync) upsertRow(TABLES.tasks, rowToSync);
    },
    toggle: (taskId, sId) => {
      let rowToSync = null;
      setTasks(prev => prev.map(t => {
        if (t.id !== taskId) return t;
        const merged = {
          ...t,
          subtasks: (t.subtasks || []).map(s => s.id === sId ? { ...s, done: !s.done } : s),
          updated_at: new Date().toISOString(),
        };
        rowToSync = merged;
        return merged;
      }));
      if (rowToSync) upsertRow(TABLES.tasks, rowToSync);
    },
  };

  // ── EVENTS CRUD ──
  const addEvent = useCallback((evt) => {
    const sanitized = sanitizeRow(evt);
    if (sanitized.status && !VALID_STATUSES.includes(sanitized.status)) sanitized.status = 'Not Started';
    const event = { ...sanitized, id: crypto.randomUUID(), status: sanitized.status || 'Not Started', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    setEvents(prev => [...prev, event]);
    insertRow(TABLES.events, event);
  }, []);

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
    if (rowToSync) upsertRow(TABLES.events, rowToSync);
  }, []);

  const deleteEvent = useCallback((id) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    deleteRow(TABLES.events, id);
  }, []);

  // ── MINUTES CRUD ──
  const addMinute = useCallback((minute) => {
    const sanitized = sanitizeRow(minute);
    const m = { ...sanitized, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    setMinutes(prev => [...prev, m]);
    insertRow(TABLES.minutes, m);
    logAction('Added Meeting', sanitized.topic || 'New meeting');
  }, [logAction]);

  const updateMinute = useCallback((id, updates) => {
    const sanitized = sanitizeRow(updates);

    let rowToSync = null;
    setMinutes(prev => prev.map(m => {
      if (m.id !== id) return m;
      const merged = { ...m, ...sanitized, updated_at: new Date().toISOString() };
      rowToSync = merged;
      return merged;
    }));
    if (rowToSync) upsertRow(TABLES.minutes, rowToSync);
  }, []);

  const deleteMinute = useCallback((id) => {
    setMinutes(prev => prev.filter(m => m.id !== id));
    deleteRow(TABLES.minutes, id);
  }, []);

  // ── DATASETS CRUD ──
  const addDataset = useCallback((dataset) => {
    const sanitized = sanitizeRow(dataset);
    if (sanitized.type && !VALID_DATASET_TYPES.includes(sanitized.type)) sanitized.type = 'Primary';
    if (sanitized.status && !VALID_DATASET_STATUSES.includes(sanitized.status)) sanitized.status = 'Raw';
    const d = { ...sanitized, id: crypto.randomUUID(), uploadedAt: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    setDatasets(prev => [...prev, d]);
    insertRow(TABLES.datasets, d);
    logAction('Uploaded Dataset', sanitized.name);
  }, [logAction]);

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
    if (rowToSync) upsertRow(TABLES.datasets, rowToSync);
  }, []);

  const deleteDataset = useCallback((id) => {
    setDatasets(prev => prev.filter(d => d.id !== id));
    deleteRow(TABLES.datasets, id);
    logAction('Deleted Dataset', `ID: ${id}`);
  }, [logAction]);

  // ── NOTIFICATIONS ──
  const nudgeUser = useCallback((targetUser, taskName) => {
    const notif = {
      id: crypto.randomUUID(),
      to_user: targetUser,
      message: `${user?.name || 'Someone'} nudged you about "${taskName}"`,
      read: false,
      created_at: new Date().toISOString(),
    };
    setNotifications(prev => [notif, ...prev]);
    insertRow(TABLES.notifications, notif);
    logAction('Nudged Member', `Alerted ${targetUser} about ${taskName}`);
  }, [user, logAction]);

  const clearNotifications = useCallback(() => {
    if (!user) return;
    const firstName = user.name.split(' ')[0].toLowerCase();
    setNotifications(prev => {
      const toKeep = prev.filter(n => !(n.to_user || '').toLowerCase().includes(firstName));
      const toRemove = prev.filter(n => (n.to_user || '').toLowerCase().includes(firstName));
      toRemove.forEach(n => deleteRow(TABLES.notifications, n.id));
      return toKeep;
    });
  }, [user]);

  // ── AUTH: handle profile → user, with restricted check ──
  const sessionInitRef = useRef(false); // prevent double-fetch between initSession and onAuthStateChange

  const handleProfile = useCallback((profile, eventSource) => {
    if (!profile) return null;
    if (profile.role === 'restricted') {
      return { restricted: true, email: profile.email };
    }
    const u = buildUser(profile);
    setUser(u);
    return u;
  }, []);

  // ── AUTH: Supabase session listener (optimized — no double-fetch) ──
  useEffect(() => {
    if (!isCloudEnabled) { setAuthLoading(false); return; }

    // If no cached user, skip session restore (show login instantly).
    // The onAuthStateChange listener below still handles future sign-ins.
    const hasCachedUser = !!readLocal('xo_user', null);
    if (!hasCachedUser) { setAuthLoading(false); }

    // Session restore with 2s timeout guard (only blocks UI if hasCachedUser)
    const AUTH_TIMEOUT_MS = 2000;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      setAuthLoading(false); // stop spinner, fall through to cached user or login
    }, AUTH_TIMEOUT_MS);

    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (timedOut) return;
        if (session?.user) {
          sessionInitRef.current = true;
          const profile = await fetchProfile(session.user.id);
          if (timedOut) return;
          if (profile) {
            handleProfile(profile, 'session_restore');
          } else {
            const meta = session.user.user_metadata || {};
            const roleKey = meta.role || 'guest';
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
        }
      } catch (err) {
        console.error('[XoCompass] session init:', err);
      } finally {
        clearTimeout(timeout);
        if (!timedOut) setAuthLoading(false);
      }
    };
    initSession();

    // Listen for auth changes — skip if initSession already handled this session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // Skip if initSession already fetched this user (prevents double-fetch on page load)
        if (sessionInitRef.current) {
          sessionInitRef.current = false;
          return;
        }
        const profile = await fetchProfile(session.user.id);
        handleProfile(profile, 'sign_in');
      }
      if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem('xo_user');
      }
    });

    return () => subscription.unsubscribe();
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
      const roleKey = meta.role || 'guest';
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

      // Background: enrich with full profile (avatar, updated role, restricted check)
      fetchProfile(data.user.id).then(profile => {
        if (!profile) return;
        if (profile.role === 'restricted') {
          supabase.auth.signOut();
          setUser(null);
          localStorage.removeItem('xo_user');
          return;
        }
        setUser(buildUser(profile));
      }).catch(() => { /* profile enrichment is best-effort */ });
    }
  }, []);

  // ── AUTH: sign up with email/password + profile metadata ──
  const signUp = useCallback(async (email, password, name, roleKey) => {
    if (!isCloudEnabled) throw new Error('Cloud not configured. Use local mode instead.');
    const { data, error } = await withTimeout(
      supabase.auth.signUp({ email, password, options: { data: { name, role: roleKey } } }),
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
          role: ROLE_LABELS[roleKey] || roleKey,
          roleKey,
          permissions: ROLE_PERMISSIONS[roleKey] || ROLE_PERMISSIONS.guest,
          avatar_url: null,
        };
        setUser(fallbackUser);
      }
    }
  }, []);

  // ── AUTH: sign out (instant — clears state first, then notifies Supabase) ──
  const signOut = useCallback(() => {
    const email = user?.email;
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
    // Fire-and-forget: tell Supabase to end the session (non-blocking)
    if (isCloudEnabled) {
      supabase.auth.signOut().catch(() => {});
    }
  }, [user]);

  // ── AUTH: local-only mode (when Supabase is not configured) ──
  const localSignIn = useCallback((name, roleKey) => {
    const u = {
      id: crypto.randomUUID(),
      email: null,
      name,
      role: ROLE_LABELS[roleKey] || roleKey,
      roleKey,
      permissions: ROLE_PERMISSIONS[roleKey] || ROLE_PERMISSIONS.guest,
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
      activityLog, getStats,
      minutes, addMinute, updateMinute, deleteMinute,
      datasets, addDataset, updateDataset, deleteDataset,
      notifications, nudgeUser, clearNotifications,
      exportAllData, importAllData,
      syncStatus, isCloudEnabled, cloudReady,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);

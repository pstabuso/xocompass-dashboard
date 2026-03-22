import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { supabase, isCloudEnabled, fetchProfile, logAuthEvent } from '../lib/supabase';

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

// ─── HELPERS ──────────────────────────────────────────────────────

/** Read from localStorage with JSON parse safety */
const readLocal = (key, fallback = []) => {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
};

/** Write to localStorage */
const writeLocal = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
};

/** Fetch full table from Supabase, ordered newest-first */
const fetchTable = async (table) => {
  if (!supabase) return null;
  const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });
  if (error) { console.error(`[XoCompass] fetch ${table}:`, error.message); return null; }
  return data;
};

/** Upsert a row to Supabase (insert or update by id) */
const upsertRow = async (table, row) => {
  if (!supabase) return;
  const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
  if (error) console.error(`[XoCompass] upsert ${table}:`, error.message);
};

/** Insert a row to Supabase */
const insertRow = async (table, row) => {
  if (!supabase) return;
  const { error } = await supabase.from(table).insert(row);
  if (error) console.error(`[XoCompass] insert ${table}:`, error.message);
};

/** Delete a row from Supabase by id */
const deleteRow = async (table, id) => {
  if (!supabase) return;
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) console.error(`[XoCompass] delete ${table}:`, error.message);
};

// ─── PROVIDER ─────────────────────────────────────────────────────

export const AppProvider = ({ children }) => {
  const [cloudReady, setCloudReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState(isCloudEnabled ? 'connecting' : 'local'); // 'local' | 'connecting' | 'synced' | 'error'
  const subscriptionsRef = useRef([]);

  const [authLoading, setAuthLoading] = useState(isCloudEnabled); // true while checking session

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

  // ── Activity Log ──
  const logAction = useCallback((action, details) => {
    const newLog = {
      id: crypto.randomUUID(),
      user_name: user?.name || 'System',
      action,
      details,
      time: new Date().toLocaleString(),
      created_at: new Date().toISOString(),
    };
    setActivityLog(prev => [newLog, ...prev].slice(0, 50));
    insertRow(TABLES.activity_log, newLog);
  }, [user]);

  // ── TASKS CRUD ──
  const addTask = useCallback((newTask) => {
    const task = {
      ...newTask,
      id: crypto.randomUUID(),
      comments: [],
      subtasks: [],
      dependencies: newTask.dependencies || [],
      status: 'Not Started',
      created_at: new Date().toISOString(),
    };
    setTasks(prev => [...prev, task]);
    insertRow(TABLES.tasks, task);
    logAction('Created Task', newTask.task);
  }, [logAction]);

  const updateTask = useCallback((id, updates) => {
    setTasks(prev => {
      const next = prev.map(t => t.id === id ? { ...t, ...updates } : t);
      const updated = next.find(t => t.id === id);
      if (updated) upsertRow(TABLES.tasks, updated);
      return next;
    });
  }, []);

  const updateTaskStatus = useCallback((id, newStatus) => {
    let taskName = '';
    setTasks(prev => {
      const next = prev.map(t => t.id === id ? { ...t, status: newStatus } : t);
      const updated = next.find(t => t.id === id);
      if (updated) {
        taskName = updated.task;
        upsertRow(TABLES.tasks, updated);
      }
      return next;
    });
    // logAction outside setState to avoid side effects in updater
    setTimeout(() => { if (taskName) logAction('Moved Task', `"${taskName}" is now ${newStatus}`); }, 0);
  }, [logAction]);

  const deleteTask = useCallback((id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    deleteRow(TABLES.tasks, id);
  }, []);

  const addTaskComment = useCallback((taskId, commentText) => {
    setTasks(prev => {
      const next = prev.map(t => t.id === taskId
        ? { ...t, comments: [...(t.comments || []), { user: user?.name, text: commentText, time: new Date().toLocaleTimeString() }] }
        : t
      );
      const updated = next.find(t => t.id === taskId);
      if (updated) upsertRow(TABLES.tasks, updated);
      return next;
    });
  }, [user]);

  const subtasks = {
    add: (taskId, name) => {
      setTasks(prev => {
        const next = prev.map(t => t.id === taskId
          ? { ...t, subtasks: [...(t.subtasks || []), { id: crypto.randomUUID(), name, done: false }] }
          : t
        );
        const updated = next.find(t => t.id === taskId);
        if (updated) upsertRow(TABLES.tasks, updated);
        return next;
      });
    },
    toggle: (taskId, sId) => {
      setTasks(prev => {
        const next = prev.map(t => t.id === taskId
          ? { ...t, subtasks: t.subtasks.map(s => s.id === sId ? { ...s, done: !s.done } : s) }
          : t
        );
        const updated = next.find(t => t.id === taskId);
        if (updated) upsertRow(TABLES.tasks, updated);
        return next;
      });
    },
  };

  // ── EVENTS CRUD ──
  const addEvent = useCallback((evt) => {
    const event = { ...evt, id: crypto.randomUUID(), status: evt.status || 'Not Started', created_at: new Date().toISOString() };
    setEvents(prev => [...prev, event]);
    insertRow(TABLES.events, event);
  }, []);

  const updateEvent = useCallback((id, updatedEvt) => {
    setEvents(prev => {
      const next = prev.map(e => e.id === id ? { ...e, ...updatedEvt } : e);
      const updated = next.find(e => e.id === id);
      if (updated) upsertRow(TABLES.events, updated);
      return next;
    });
  }, []);

  const deleteEvent = useCallback((id) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    deleteRow(TABLES.events, id);
  }, []);

  // ── MINUTES CRUD ──
  const addMinute = useCallback((minute) => {
    const m = { ...minute, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    setMinutes(prev => [...prev, m]);
    insertRow(TABLES.minutes, m);
    logAction('Added Meeting', minute.topic || 'New meeting');
  }, [logAction]);

  const updateMinute = useCallback((id, updated) => {
    setMinutes(prev => {
      const next = prev.map(m => m.id === id ? { ...m, ...updated } : m);
      const row = next.find(m => m.id === id);
      if (row) upsertRow(TABLES.minutes, row);
      return next;
    });
  }, []);

  const deleteMinute = useCallback((id) => {
    setMinutes(prev => prev.filter(m => m.id !== id));
    deleteRow(TABLES.minutes, id);
  }, []);

  // ── DATASETS CRUD ──
  const addDataset = useCallback((dataset) => {
    const d = { ...dataset, id: crypto.randomUUID(), uploadedAt: new Date().toISOString(), created_at: new Date().toISOString() };
    setDatasets(prev => [...prev, d]);
    insertRow(TABLES.datasets, d);
    logAction('Uploaded Dataset', dataset.name);
  }, [logAction]);

  const updateDataset = useCallback((id, updated) => {
    setDatasets(prev => {
      const next = prev.map(d => d.id === id ? { ...d, ...updated } : d);
      const row = next.find(d => d.id === id);
      if (row) upsertRow(TABLES.datasets, row);
      return next;
    });
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
      logAuthEvent(profile.email, 'restricted_blocked', { source: eventSource });
      return { restricted: true, email: profile.email };
    }
    const u = buildUser(profile);
    setUser(u);
    if (eventSource === 'session_restore') {
      logAuthEvent(profile.email, 'session_restored');
    }
    return u;
  }, []);

  // ── AUTH: Supabase session listener (optimized — no double-fetch) ──
  useEffect(() => {
    if (!isCloudEnabled) { setAuthLoading(false); return; }

    // Check existing session on mount — fast path with timeout guard
    const AUTH_TIMEOUT_MS = 4000;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      console.warn('[XoCompass] Auth session check timed out — showing login screen.');
      setAuthLoading(false);
    }, AUTH_TIMEOUT_MS);

    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (timedOut) return; // timeout already cleared authLoading
        if (session?.user) {
          sessionInitRef.current = true;
          const profile = await fetchProfile(session.user.id);
          if (timedOut) return;
          if (profile) {
            handleProfile(profile, 'session_restore');
          } else {
            // Profile missing — build from user metadata (graceful fallback)
            const meta = session.user.user_metadata || {};
            const roleKey = meta.role || 'guest';
            const fallbackUser = {
              id: session.user.id,
              email: session.user.email,
              name: meta.name || session.user.email?.split('@')[0] || 'User',
              role: ROLE_LABELS[roleKey] || roleKey,
              roleKey,
              permissions: ROLE_PERMISSIONS[roleKey] || ROLE_PERMISSIONS.guest,
              avatar_url: null,
            };
            setUser(fallbackUser);
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

  // ── AUTH: sign in with email/password + audit logging ──
  const signIn = useCallback(async (email, password) => {
    if (!isCloudEnabled) throw new Error('Cloud not configured. Use local mode instead.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      logAuthEvent(email, 'sign_in_failed', { reason: error.message });
      // Translate common Supabase errors to user-friendly messages
      if (error.message?.includes('Invalid login credentials')) {
        throw new Error('Invalid email or password. Check your credentials or sign up first.');
      }
      if (error.message?.includes('Email not confirmed')) {
        throw new Error('Please confirm your email before signing in. Check your inbox.');
      }
      throw error;
    }
    // Fetch profile immediately (don't wait for onAuthStateChange) for speed
    if (data?.user) {
      const profile = await fetchProfile(data.user.id);
      if (profile?.role === 'restricted') {
        await supabase.auth.signOut();
        logAuthEvent(email, 'restricted_blocked', { source: 'sign_in' });
        throw new Error('Your account has been restricted. Contact the administrator.');
      }
      if (profile) {
        setUser(buildUser(profile));
        logAuthEvent(email, 'sign_in_success');
      } else {
        // Profile doesn't exist yet (DB trigger may have failed) — create a minimal one
        const fallbackUser = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.name || email.split('@')[0],
          role: ROLE_LABELS[data.user.user_metadata?.role] || 'Guest Viewer',
          roleKey: data.user.user_metadata?.role || 'guest',
          permissions: ROLE_PERMISSIONS[data.user.user_metadata?.role] || ROLE_PERMISSIONS.guest,
          avatar_url: null,
        };
        setUser(fallbackUser);
        logAuthEvent(email, 'sign_in_success', { note: 'profile_missing_used_fallback' });
      }
    }
  }, []);

  // ── AUTH: sign up with email/password + profile metadata ──
  const signUp = useCallback(async (email, password, name, roleKey) => {
    if (!isCloudEnabled) throw new Error('Cloud not configured. Use local mode instead.');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role: roleKey } },
    });
    if (error) {
      logAuthEvent(email, 'sign_up_failed', { reason: error.message });
      if (error.message?.includes('already registered')) {
        throw new Error('This email is already registered. Try signing in instead.');
      }
      throw error;
    }
    logAuthEvent(email, 'sign_up_success', { name, role: roleKey });

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

  // ── AUTH: sign out (clears all local state + Supabase session) ──
  const signOut = useCallback(async () => {
    const email = user?.email;
    if (isCloudEnabled) {
      await supabase.auth.signOut();
      if (email) logAuthEvent(email, 'sign_out');
    }
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
    setSyncStatus(isCloudEnabled ? 'connecting' : 'local');
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
      if (data.tasks) { setTasks(data.tasks); for (const r of data.tasks) await upsertRow(TABLES.tasks, r); }
      if (data.events) { setEvents(data.events); for (const r of data.events) await upsertRow(TABLES.events, r); }
      if (data.minutes) { setMinutes(data.minutes); for (const r of data.minutes) await upsertRow(TABLES.minutes, r); }
      if (data.datasets) { setDatasets(data.datasets); for (const r of data.datasets) await upsertRow(TABLES.datasets, r); }
      if (data.activityLog) { setActivityLog(data.activityLog); }
      if (data.notifications) { setNotifications(data.notifications); }
      logAction('Imported Backup', `From ${data.exportedAt || 'unknown'}`);
      return { success: true };
    } catch {
      return { success: false, message: 'Invalid backup file format.' };
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

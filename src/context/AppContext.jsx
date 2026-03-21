import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { supabase, isCloudEnabled } from '../lib/supabase';

const AppContext = createContext();

// ─── ROLE DEFINITIONS ─────────────────────────────────────────────
const TEAM_ROLES = [
  { id: 'pm', name: 'Project Manager', role: 'Project Manager & Backend', permissions: { canCreate: true, canDelete: true, canNudge: true, viewAll: true } },
  { id: 'fe', name: 'Frontend Developer', role: 'Frontend Developer', permissions: { canCreate: true, canDelete: false, canNudge: false, viewAll: false } },
  { id: 'doc', name: 'Documentation Lead', role: 'Documentation Lead', permissions: { canCreate: true, canDelete: false, canNudge: false, viewAll: false } },
  { id: 'guest', name: 'Guest Viewer', role: 'Guest', permissions: { canCreate: false, canDelete: false, canNudge: false, viewAll: true } },
];

export const TEAM_ROLES_LIST = TEAM_ROLES;

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

  // ── State: initialised from localStorage (instant), then overwritten by Supabase ──
  const [user, setUser] = useState(() => {
    const parsed = readLocal('xo_user', null);
    if (!parsed) return null;
    const roleDefaults = TEAM_ROLES.find(r => r.role === parsed.role);
    if (roleDefaults) parsed.permissions = { ...roleDefaults.permissions };
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

  // ── AUTH ──
  const selectRole = useCallback((roleId, displayName) => {
    const found = TEAM_ROLES.find(r => r.id === roleId);
    if (!found) return;
    setUser({ name: displayName || found.name, role: found.role, permissions: found.permissions });
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('xo_user');
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
      user, selectRole, logout,
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

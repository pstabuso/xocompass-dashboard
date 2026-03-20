import React, { createContext, useState, useEffect, useContext } from 'react';

const AppContext = createContext();

// Available team roles — no passwords, no hardcoded credentials.
// Users self-select their role on first visit; stored in localStorage.
const TEAM_ROLES = [
  { id: 'pm', name: 'Project Manager', role: 'Project Manager & Backend', permissions: { canCreate: true, canDelete: true, canNudge: true, viewAll: true } },
  { id: 'fe', name: 'Frontend Developer', role: 'Frontend Developer', permissions: { canCreate: true, canDelete: false, canNudge: false, viewAll: false } },
  { id: 'doc', name: 'Documentation Lead', role: 'Documentation Lead', permissions: { canCreate: true, canDelete: false, canNudge: false, viewAll: false } },
  { id: 'guest', name: 'Guest Viewer', role: 'Guest', permissions: { canCreate: false, canDelete: false, canNudge: false, viewAll: true } },
];

export const TEAM_ROLES_LIST = TEAM_ROLES;

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('xo_user')) || null; } catch { return null; }
  });

  const [tasks, setTasks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tasks')) || []; } catch { return []; }
  });
  const [events, setEvents] = useState(() => {
    try { return JSON.parse(localStorage.getItem('events')) || []; } catch { return []; }
  });
  const [activityLog, setActivityLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem('activityLog')) || []; } catch { return []; }
  });
  const [notifications, setNotifications] = useState(() => {
    try { return JSON.parse(localStorage.getItem('notifications')) || []; } catch { return []; }
  });
  const [minutes, setMinutes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('minutes')) || []; } catch { return []; }
  });

  useEffect(() => { if (user) localStorage.setItem('xo_user', JSON.stringify(user)); else localStorage.removeItem('xo_user'); }, [user]);
  useEffect(() => { localStorage.setItem('tasks', JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { localStorage.setItem('events', JSON.stringify(events)); }, [events]);
  useEffect(() => { localStorage.setItem('activityLog', JSON.stringify(activityLog)); }, [activityLog]);
  useEffect(() => { localStorage.setItem('notifications', JSON.stringify(notifications)); }, [notifications]);
  useEffect(() => { localStorage.setItem('minutes', JSON.stringify(minutes)); }, [minutes]);

  const logAction = (action, details) => {
    const newLog = { id: Date.now(), user: user?.name || 'System', action, details, time: new Date().toLocaleString() };
    setActivityLog(prev => [newLog, ...prev].slice(0, 50));
  };

  const addMinute = (minute) => {
    setMinutes(prev => [...prev, { ...minute, id: Date.now() }]);
    logAction('Added Meeting', minute.topic || 'New meeting');
  };

  const updateMinute = (id, updated) => {
    setMinutes(prev => prev.map(m => m.id === id ? { ...m, ...updated } : m));
  };

  const deleteMinute = (id) => {
    setMinutes(prev => prev.filter(m => m.id !== id));
  };

  const addTask = (newTask) => {
    setTasks([...tasks, { ...newTask, id: Date.now(), comments: [], subtasks: [], dependencies: newTask.dependencies || [], status: 'Not Started' }]);
    logAction('Created Task', newTask.task);
  };

  const updateTaskStatus = (id, newStatus) => {
    const task = tasks.find(t => t.id === id);
    setTasks(tasks.map(t => t.id === id ? { ...t, status: newStatus } : t));
    logAction('Moved Task', `"${task?.task}" is now ${newStatus}`);
  };

  const deleteTask = (id) => setTasks(tasks.filter(t => t.id !== id));

  const addEvent = (evt) => { setEvents([...events, { ...evt, id: Date.now(), status: evt.status || 'Not Started' }]); };
  const updateEvent = (id, updatedEvt) => { setEvents(events.map(e => e.id === id ? { ...e, ...updatedEvt } : e)); };
  const deleteEvent = (id) => { setEvents(events.filter(e => e.id !== id)); };

  const addTaskComment = (taskId, commentText) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, comments: [...(t.comments || []), { user: user.name, text: commentText, time: new Date().toLocaleTimeString() }] } : t));
  };

  const subtasks = {
    add: (taskId, name) => setTasks(tasks.map(t => t.id === taskId ? { ...t, subtasks: [...(t.subtasks||[]), {id: Date.now(), name, done: false}] } : t)),
    toggle: (taskId, sId) => setTasks(tasks.map(t => t.id === taskId ? { ...t, subtasks: t.subtasks.map(s => s.id === sId ? {...s, done: !s.done} : s) } : t))
  };

  const nudgeUser = (targetUser, taskName) => {
    const newNotif = { id: Date.now(), to: targetUser, message: `${user?.name || 'Someone'} nudged you about "${taskName}"`, read: false };
    setNotifications([newNotif, ...notifications]);
    logAction('Nudged Member', `Alerted ${targetUser} about ${taskName}`);
  };

  const clearNotifications = () => {
    if(!user) return;
    setNotifications(notifications.filter(n => !n.to.toLowerCase().includes(user.name.split(' ')[0].toLowerCase())));
  };

  // Select a role (no password needed)
  const selectRole = (roleId, displayName) => {
    const found = TEAM_ROLES.find(r => r.id === roleId);
    if (!found) return;
    setUser({
      name: displayName || found.name,
      role: found.role,
      permissions: found.permissions,
    });
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('xo_user');
  };

  const getStats = () => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'Done').length;
    const pending = tasks.filter(t => t.status === 'Not Started').length;
    const ongoing = tasks.filter(t => t.status === 'On-going').length;
    return { total, completed, pending, ongoing, progress: total===0?0:Math.round((completed/total)*100) };
  };

  return (
    <AppContext.Provider value={{
      user, selectRole, logout,
      tasks, addTask, updateTaskStatus, deleteTask, addTaskComment, subtasks,
      events, addEvent, updateEvent, deleteEvent,
      activityLog, getStats,
      minutes, addMinute, updateMinute, deleteMinute,
      notifications, nudgeUser, clearNotifications
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);

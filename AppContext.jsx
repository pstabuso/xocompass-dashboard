import React, { createContext, useState, useEffect, useContext } from 'react';

const AppContext = createContext();

// STRICT PERSONA DEFINITIONS
const VALID_USERS = [
  { 
    username: 'lanz', 
    password: 'password123', 
    name: 'Lanz Kristoffer', 
    role: 'Project Manager & Backend', 
    permissions: { canCreate: true, canDelete: true, canNudge: true, viewAll: true } 
  },
  { 
    username: 'andrei', 
    password: 'password123', 
    name: 'Ralph Andrei', 
    role: 'Frontend Developer', 
    permissions: { canCreate: false, canDelete: false, canNudge: false, viewAll: false } 
  },
  { 
    username: 'paolo', 
    password: 'password123', 
    name: 'Paolo Miguel', 
    role: 'Documentation Lead', 
    permissions: { canCreate: false, canDelete: false, canNudge: false, viewAll: false } 
  }
];

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  
  const [tasks, setTasks] = useState(JSON.parse(localStorage.getItem('tasks')) || []);
  const [events, setEvents] = useState(JSON.parse(localStorage.getItem('events')) || []);
  const [activityLog, setActivityLog] = useState(JSON.parse(localStorage.getItem('activityLog')) || []);
  
  // NEW: Notifications for the team (sent by Lanz)
  const [notifications, setNotifications] = useState(JSON.parse(localStorage.getItem('notifications')) || []);

  useEffect(() => { if (user) localStorage.setItem('user', JSON.stringify(user)); else localStorage.removeItem('user'); }, [user]);
  useEffect(() => { localStorage.setItem('tasks', JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { localStorage.setItem('events', JSON.stringify(events)); }, [events]);
  useEffect(() => { localStorage.setItem('activityLog', JSON.stringify(activityLog)); }, [activityLog]);
  useEffect(() => { localStorage.setItem('notifications', JSON.stringify(notifications)); }, [notifications]);

  const logAction = (action, details) => {
    const newLog = { id: Date.now(), user: user?.name || 'System', action, details, time: new Date().toLocaleString() };
    setActivityLog(prev => [newLog, ...prev].slice(0, 50));
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

  // NEW: Nudge Feature for Lanz
  const nudgeUser = (targetUser, taskName) => {
    const newNotif = { id: Date.now(), to: targetUser, message: `Lanz nudged you about "${taskName}"`, read: false };
    setNotifications([newNotif, ...notifications]);
    logAction('Nudged Member', `Alerted ${targetUser} about ${taskName}`);
  };

  const clearNotifications = () => {
    // Only clear notifications for the logged in user
    if(!user) return;
    setNotifications(notifications.filter(n => !n.to.toLowerCase().includes(user.name.split(' ')[0].toLowerCase())));
  }

  const login = (u, p) => {
    const found = VALID_USERS.find(x => x.username.toLowerCase() === u.toLowerCase() && x.password === p);
    if (found) { setUser(found); return { success: true }; }
    return { success: false, message: "Invalid credentials" };
  };

  const logout = () => { setUser(null); localStorage.removeItem('user'); };

  const getStats = () => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'Done').length;
    const pending = tasks.filter(t => t.status === 'Not Started').length;
    const ongoing = tasks.filter(t => t.status === 'On-going').length;
    return { total, completed, pending, ongoing, progress: total===0?0:Math.round((completed/total)*100) };
  };

  return (
    <AppContext.Provider value={{ 
      user, login, logout, 
      tasks, addTask, updateTaskStatus, deleteTask, addTaskComment, subtasks,
      events, addEvent, updateEvent, deleteEvent,
      activityLog, getStats, 
      notifications, nudgeUser, clearNotifications
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
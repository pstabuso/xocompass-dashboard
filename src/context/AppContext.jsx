import React, { createContext, useState, useEffect, useContext } from 'react';
import { auth } from '../firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';

const AppContext = createContext();

// Role mapping — configure roles by email. Any email not listed gets the default role.
// Admins can be added here or managed via Firebase custom claims in the future.
const ROLE_MAP = {
  'default': {
    name: null, // derived from displayName or email
    role: 'Contributor',
    permissions: { canCreate: true, canDelete: false, canNudge: false, viewAll: false },
  },
};

function resolveUserRole(email) {
  const entry = ROLE_MAP[email?.toLowerCase()] || ROLE_MAP['default'];
  return { role: entry.role, permissions: { ...entry.permissions } };
}

function buildUserObject(firebaseUser) {
  if (!firebaseUser) return null;
  const { role, permissions } = resolveUserRole(firebaseUser.email);
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
    role,
    permissions,
  };
}

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [tasks, setTasks] = useState(JSON.parse(localStorage.getItem('tasks')) || []);
  const [events, setEvents] = useState(JSON.parse(localStorage.getItem('events')) || []);
  const [activityLog, setActivityLog] = useState(JSON.parse(localStorage.getItem('activityLog')) || []);
  const [notifications, setNotifications] = useState(JSON.parse(localStorage.getItem('notifications')) || []);

  // Firebase auth state listener — replaces the old localStorage user hack
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(buildUserObject(firebaseUser));
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

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

  const nudgeUser = (targetUser, taskName) => {
    const newNotif = { id: Date.now(), to: targetUser, message: `${user?.name || 'Someone'} nudged you about "${taskName}"`, read: false };
    setNotifications([newNotif, ...notifications]);
    logAction('Nudged Member', `Alerted ${targetUser} about ${taskName}`);
  };

  const clearNotifications = () => {
    if(!user) return;
    setNotifications(notifications.filter(n => !n.to.toLowerCase().includes(user.name.split(' ')[0].toLowerCase())));
  };

  // --- Firebase Auth functions ---

  const login = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { success: true };
    } catch (err) {
      return { success: false, message: firebaseErrorMessage(err.code) };
    }
  };

  const register = async (email, password, displayName) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        await updateProfile(cred.user, { displayName });
      }
      // Re-build user object with displayName now set
      setUser(buildUserObject(cred.user));
      return { success: true };
    } catch (err) {
      return { success: false, message: firebaseErrorMessage(err.code) };
    }
  };

  const resetPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (err) {
      return { success: false, message: firebaseErrorMessage(err.code) };
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
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
      user, authLoading, login, logout, register, resetPassword,
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

// Map Firebase error codes to user-friendly messages
function firebaseErrorMessage(code) {
  const map = {
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return map[code] || 'Authentication failed. Please try again.';
}

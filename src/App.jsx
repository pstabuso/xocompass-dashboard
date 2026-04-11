import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, Calendar, Book, FolderOpen, LogOut, User, Database, Shield, BrainCircuit, Users, Cloud, CloudOff, Loader2, Mail, Lock, Eye, EyeOff, Menu, X, Bell, LockKeyhole, Send, ArrowRight, Sun, Moon, AlertTriangle, RefreshCw, WifiOff, ChevronLeft } from 'lucide-react';
import { AppProvider, useAppContext, ROLE_ROUTES, isNotificationForUser } from './context/AppContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { DatasetFileProvider } from './context/DatasetFileContext';
import { isCloudEnabled } from './lib/supabase';

// Pages
import Dashboard from './pages/Dashboard';
import TaskTracker from './pages/TaskTracker';
import Schedule from './pages/Schedule';
import Minutes from './pages/Minutes';
import Resources from './pages/Resources';
import DataHub from './pages/DataHub';
import Defense from './pages/Defense';
import ModelLab from './pages/ModelLab';
import AdminPanel from './pages/AdminPanel';

// Theme toggle pill — persists to localStorage
const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';
  return (
    <button
      onClick={toggleTheme}
      className="w-full flex items-center justify-center gap-2 px-4 py-2 mb-2 rounded-lg border border-slate-700 hover:border-sky-500/30 transition-all duration-200 group"
      title={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
      aria-label={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
    >
      {isLight ? <Moon size={15} className="text-sky-400" /> : <Sun size={15} className="text-amber-400" />}
      <span className="text-xs font-medium text-slate-400 group-hover:text-slate-200">{isLight ? 'Dark Mode' : 'Light Mode'}</span>
    </button>
  );
};

// Sidebar — collapsible on desktop, drawer on mobile
const Sidebar = ({ mobileOpen, setMobileOpen, collapsed, setCollapsed }) => {
  const location = useLocation();
  const { user, signOut, syncStatus, notifications, requestAccess, markNotificationsRead } = useAppContext();
  const { theme, toggleTheme } = useTheme();
  const [requestedPages, setRequestedPages] = useState({});

  const isLight = theme === 'light';
  const myUnread = user?.permissions?.isAdmin
    ? (notifications || []).filter(n => !n.read && isNotificationForUser(n, user)).length
    : 0;

  const allowedRoutes = user?.roleKey in ROLE_ROUTES ? ROLE_ROUTES[user.roleKey] : ROLE_ROUTES.guest;
  const isLocked = (path) => allowedRoutes !== null && !allowedRoutes.includes(path);

  const allMenuItems = [
    { path: '/', icon: LayoutDashboard, label: 'Overview' },
    { path: '/model', icon: BrainCircuit, label: 'SARIMAX Lab' },
    { path: '/tasks', icon: CheckSquare, label: 'Task Tracker' },
    { path: '/schedule', icon: Calendar, label: 'Calendar & Sched' },
    { path: '/minutes', icon: Book, label: 'Minutes of Meeting' },
    { path: '/data', icon: Database, label: 'Data Hub' },
    { path: '/defense', icon: Shield, label: 'Defense Prep' },
    { path: '/resources', icon: FolderOpen, label: 'Resources' },
    ...(user?.permissions?.isAdmin ? [{ path: '/admin', icon: Users, label: 'Admin Panel' }] : []),
  ];

  const handleLockedClick = (item) => {
    if (requestedPages[item.path]) return;
    requestAccess(item.label, 'page');
    setRequestedPages(prev => ({ ...prev, [item.path]: true }));
  };

  // Renders sidebar content — isCollapsed=true shows icon-only (desktop collapsed),
  // isCollapsed=false shows the full expanded layout (desktop expanded or mobile drawer).
  const renderContent = (isCollapsed) => (
    <>
      {/* Header */}
      <div className={`border-b border-slate-800 flex items-center ${isCollapsed ? 'justify-center p-3' : 'justify-between p-4 sm:p-6'}`}>
        {!isCollapsed && (
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-sky-400 tracking-tight">XoCompass</h1>
            <div className="flex items-center space-x-2 mt-1">
              <p className="text-xs text-slate-500">LEAP Thesis 2 Manager</p>
              {syncStatus === 'synced' && <span title="Cloud synced — real-time"><Cloud size={12} className="text-emerald-400" /></span>}
              {syncStatus === 'connecting' && <span title="Connecting to cloud..."><Loader2 size={12} className="text-amber-400 animate-spin" /></span>}
              {syncStatus === 'error' && <span title="Cloud error — using local storage"><CloudOff size={12} className="text-red-400" /></span>}
              {syncStatus === 'local' && <span title="Local storage only"><CloudOff size={12} className="text-slate-600" /></span>}
            </div>
          </div>
        )}
        {isCollapsed && <BrainCircuit size={22} className="text-sky-400" />}
        <button onClick={() => setMobileOpen(false)} className="lg:hidden p-2 text-slate-400 hover:text-white" aria-label="Close sidebar">
          <X size={22} />
        </button>
      </div>

      {/* Nav */}
      <nav className={`flex-1 overflow-y-auto ${isCollapsed ? 'p-2 space-y-1' : 'p-3 sm:p-4 space-y-1 sm:space-y-2'}`}>
        {allMenuItems.map((item) => {
          const locked = isLocked(item.path);
          const requested = requestedPages[item.path];
          const isActive = location.pathname === item.path;

          if (locked) {
            return (
              <button
                key={item.path}
                onClick={!isCollapsed ? () => handleLockedClick(item) : undefined}
                title={isCollapsed ? item.label : (requested ? 'Request sent — waiting for PM' : `Request access to ${item.label}`)}
                className={`w-full transition-all duration-200 rounded-xl ${
                  isCollapsed
                    ? 'flex items-center justify-center py-2.5 opacity-40 cursor-default'
                    : `flex items-center space-x-3 px-3 sm:px-4 py-2.5 sm:py-3 group ${requested ? 'opacity-50 cursor-default' : 'opacity-60 hover:opacity-80 hover:bg-slate-800/50 cursor-pointer'}`
                }`}
              >
                <item.icon size={20} className="text-slate-600 shrink-0" />
                {!isCollapsed && (
                  <>
                    <span className="font-medium text-sm text-slate-500 flex-1 text-left truncate">{item.label}</span>
                    {requested
                      ? <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 rounded font-bold shrink-0">Sent</span>
                      : <LockKeyhole size={14} className="text-slate-600 shrink-0" />
                    }
                  </>
                )}
              </button>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              title={isCollapsed ? item.label : undefined}
              className={`transition-all duration-200 ease-in-out group ${
                isCollapsed
                  ? 'flex items-center justify-center py-2.5 rounded-xl'
                  : 'flex items-center space-x-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl'
              } ${
                isActive
                  ? 'bg-sky-600/10 text-sky-400 border border-sky-500/20 shadow-[0_0_15px_rgba(56,189,248,0.1)]'
                  : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon size={20} className={`shrink-0 ${isActive ? 'text-sky-400' : 'group-hover:scale-110 transition-transform'}`} />
              {!isCollapsed && <span className="font-medium text-sm truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      {isCollapsed ? (
        <div className="p-2 border-t border-slate-800 flex flex-col items-center gap-1">
          {myUnread > 0 && user?.permissions?.isAdmin && (
            <Link to="/admin" title={`${myUnread} new notification${myUnread > 1 ? 's' : ''}`}
              onClick={markNotificationsRead}
              className="relative flex items-center justify-center w-10 h-10 rounded-lg hover:bg-amber-500/10 transition">
              <Bell size={18} className="text-amber-400" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            </Link>
          )}
          <div title={user?.name}
            className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center font-bold text-white uppercase text-xs my-1 shrink-0">
            {user?.name?.charAt(0) || '?'}
          </div>
          <button onClick={toggleTheme}
            title={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            className="flex items-center justify-center w-10 h-10 rounded-lg border border-slate-700 hover:border-sky-500/30 transition-all">
            {isLight ? <Moon size={15} className="text-sky-400" /> : <Sun size={15} className="text-amber-400" />}
          </button>
          <button onClick={signOut} title="Sign Out"
            className="flex items-center justify-center w-10 h-10 rounded-lg text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all">
            <LogOut size={18} />
          </button>
        </div>
      ) : (
        <div className="p-3 sm:p-4 border-t border-slate-800">
          {myUnread > 0 && user?.permissions?.isAdmin && (
            <Link to="/admin" onClick={() => { setMobileOpen(false); markNotificationsRead(); }}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 mb-2 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/15 transition">
              <Bell size={16} className="text-amber-400" />
              <span className="text-xs font-bold text-amber-300 flex-1">{myUnread} new notification{myUnread > 1 ? 's' : ''}</span>
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            </Link>
          )}
          <div className="flex items-center space-x-3 px-3 sm:px-4 mb-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center font-bold text-white uppercase shadow-lg text-sm shrink-0">
              {user?.name?.charAt(0) || '?'}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold truncate text-slate-200">{user?.name}</p>
              <p className="text-[11px] text-slate-500 truncate">{user?.role}</p>
              {user?.email && <p className="text-[10px] text-slate-600 truncate">{user.email}</p>}
            </div>
          </div>
          <ThemeToggle />
          <button onClick={signOut} className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded-lg cursor-pointer transition-all duration-200">
            <LogOut size={16} />
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop sidebar — collapsible; w-16 collapsed, w-52/w-64 expanded */}
      <div className={`hidden lg:flex h-screen bg-slate-900 border-r border-slate-800 text-slate-300 fixed left-0 top-0 flex-col z-50 transition-all duration-300 ${collapsed ? 'w-16' : 'lg:w-52 xl:w-64'}`}>
        {renderContent(collapsed)}
        {/* Collapse toggle — half outside the sidebar border */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all z-10 shadow-md"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft size={12} className={`transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Mobile overlay + drawer — z-[200] sits above all page content */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[200]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 w-72 h-full bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col animate-slide-in-left">
            {renderContent(false)}
          </div>
        </div>
      )}
    </>
  );
};

// ── Input validation constants ─────────────────────────────────
const MAX_NAME_LENGTH = 20;
const NAME_REGEX = /^[a-zA-Z\s'-]+$/;


const WelcomeScreen = () => {
  const { signIn, signUp, localSignIn, authLoading } = useAppContext();

  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'local'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // For local-only fallback mode
  const [nameError, setNameError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) { setError('Email and password are required'); return; }
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const [confirmMsg, setConfirmMsg] = useState('');

  const handleSignUp = async () => {
    if (!email || !password) { setError('Email and password are required'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (!displayName.trim()) { setError('Name is required'); return; }

    const trimmed = displayName.trim();
    if (trimmed.length > MAX_NAME_LENGTH) { setError(`Name cannot exceed ${MAX_NAME_LENGTH} characters`); return; }
    if (!NAME_REGEX.test(trimmed)) { setError('Name can only contain letters, spaces, hyphens, and apostrophes'); return; }

    setError('');
    setConfirmMsg('');
    setLoading(true);
    try {
      await signUp(email, password, trimmed);
    } catch (err) {
      if (err.message === 'CONFIRM_EMAIL') {
        setConfirmMsg('Account created! Check your email to confirm, then sign in. You\'ll start as a Guest — the PM will assign your role.');
        setMode('login');
      } else {
        setError(err.message || 'Sign up failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLocalEnter = () => {
    const trimmed = displayName.trim();
    if (!trimmed) { setNameError('Please enter your name'); return; }
    if (trimmed.length > MAX_NAME_LENGTH) { setNameError(`Name cannot exceed ${MAX_NAME_LENGTH} characters`); return; }
    if (!NAME_REGEX.test(trimmed)) { setNameError('Name can only contain letters, spaces, hyphens, and apostrophes'); return; }
    setNameError('');
    localSignIn(trimmed);
  };

  // Show loading spinner while checking existing session
  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <Loader2 size={40} className="text-sky-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Restoring session...</p>
        </div>
      </div>
    );
  }

  // If cloud is not configured, show local-only mode
  const isLocal = !isCloudEnabled;

  return (
    <div className="h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 pointer-events-none"></div>
      <div className="bg-slate-900/50 backdrop-blur-xl p-5 sm:p-8 rounded-2xl shadow-2xl w-[calc(100%-2rem)] max-w-[480px] border border-slate-800 relative z-10">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white">XoCompass</h1>
          <p className="text-slate-400 text-sm mt-1">
            {isLocal ? 'Local mode — enter your name to start' : mode === 'login' ? 'Sign in to your workspace' : 'Create your team account'}
          </p>
        </div>

        {/* Success message (e.g. email confirmation) */}
        {confirmMsg && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <p className="text-xs text-emerald-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
              {confirmMsg}
            </p>
          </div>
        )}

        {/* Error display */}
        {(error || nameError) && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
              {error || nameError}
            </p>
          </div>
        )}

        {isLocal ? (
          /* ── LOCAL-ONLY MODE ── */
          <>
            <div className="mb-4">
              <label className="text-sm font-bold text-slate-400 mb-1 block">Your Name</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 text-slate-500" size={18} />
                <input
                  type="text"
                  className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg outline-none transition focus:ring-2 focus:ring-sky-500"
                  placeholder="Enter your name"
                  value={displayName}
                  onChange={e => { if (e.target.value.length <= MAX_NAME_LENGTH + 5) setDisplayName(e.target.value); }}
                  onKeyDown={e => e.key === 'Enter' && handleLocalEnter()}
                  autoFocus
                />
              </div>
            </div>

            <div className="mb-4 p-3 bg-sky-500/10 border border-sky-500/20 rounded-lg">
              <p className="text-xs text-sky-400">You'll join as a <span className="font-bold">Guest</span>. The Project Manager can assign your role.</p>
            </div>

            <button
              onClick={handleLocalEnter}
              className="w-full bg-sky-600 text-white py-3 rounded-lg font-bold hover:bg-sky-500 transition shadow-lg shadow-sky-900/20 active:scale-95"
            >
              Enter Workspace
            </button>
          </>
        ) : mode === 'login' ? (
          /* ── LOGIN MODE ── */
          <>
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm font-bold text-slate-400 mb-1 block">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 text-slate-500" size={18} />
                  <input
                    type="email"
                    className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg outline-none transition focus:ring-2 focus:ring-sky-500"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-400 mb-1 block">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 text-slate-500" size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full pl-10 pr-10 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg outline-none transition focus:ring-2 focus:ring-sky-500"
                    placeholder="Your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  />
                  <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-sky-600 text-white py-3 rounded-lg font-bold hover:bg-sky-500 transition shadow-lg shadow-sky-900/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={18} className="animate-spin" />}
              Sign In
            </button>

            <p className="text-center text-sm text-slate-500 mt-4">
              Don't have an account?{' '}
              <button onClick={() => { setMode('signup'); setError(''); }} className="text-sky-400 hover:text-sky-300 font-bold transition">
                Sign Up
              </button>
            </p>
          </>
        ) : (
          /* ── SIGN UP MODE ── */
          <>
            <div className="space-y-4 mb-4">
              <div>
                <label className="text-sm font-bold text-slate-400 mb-1 block">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 text-slate-500" size={18} />
                  <input
                    type="email"
                    className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg outline-none transition focus:ring-2 focus:ring-sky-500"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-400 mb-1 block">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 text-slate-500" size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full pl-10 pr-10 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg outline-none transition focus:ring-2 focus:ring-sky-500"
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-sm font-bold text-slate-400">Your Name</label>
                  <span className={`text-[10px] font-mono ${displayName.trim().length > MAX_NAME_LENGTH ? 'text-red-400' : 'text-slate-600'}`}>
                    {displayName.trim().length}/{MAX_NAME_LENGTH}
                  </span>
                </div>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 text-slate-500" size={18} />
                  <input
                    type="text"
                    className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg outline-none transition focus:ring-2 focus:ring-sky-500"
                    placeholder="Your display name"
                    value={displayName}
                    onChange={e => { if (e.target.value.length <= MAX_NAME_LENGTH + 5) setDisplayName(e.target.value); }}
                  />
                </div>
              </div>
            </div>

            <div className="mb-4 p-3 bg-sky-500/10 border border-sky-500/20 rounded-lg">
              <p className="text-xs text-sky-400">You'll join as a <span className="font-bold">Guest</span>. The Project Manager will assign your role after you sign up.</p>
            </div>

            <button
              onClick={handleSignUp}
              disabled={loading}
              className="w-full bg-sky-600 text-white py-3 rounded-lg font-bold hover:bg-sky-500 transition shadow-lg shadow-sky-900/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={18} className="animate-spin" />}
              Create Account
            </button>

            <p className="text-center text-sm text-slate-500 mt-4">
              Already have an account?{' '}
              <button onClick={() => { setMode('login'); setError(''); }} className="text-sky-400 hover:text-sky-300 font-bold transition">
                Sign In
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

// ── Feature 1: Session Expiry Banner ───────────────────────────────
// Blocking overlay — shown when a write returns 401 / "JWT expired".
// autoRefreshToken:false means the JWT silently dies after ~1 hour; the
// only safe recovery is a full page reload to trigger a fresh sign-in.
const SessionExpiredBanner = () => {
  const { sessionExpired, dismissSessionExpiry } = useAppContext();
  if (!sessionExpired) return null;
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl shadow-amber-900/30 max-w-md w-full p-6 sm:p-8 text-center space-y-5">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-amber-500/15 border border-amber-500/30 mx-auto">
          <AlertTriangle size={28} className="text-amber-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white mb-1">Session Expired</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Your login session has expired after 1 hour of inactivity. Any unsaved changes have been preserved locally. Please reload to continue.
          </p>
        </div>
        <button
          onClick={dismissSessionExpiry}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-bold rounded-xl transition-all shadow-lg shadow-amber-900/30 text-sm"
        >
          <RefreshCw size={16} /> Reload &amp; Re-authenticate
        </button>
        <p className="text-[11px] text-slate-600">
          Your work is safe — it will sync automatically after you log back in.
        </p>
      </div>
    </div>
  );
};

// ── Feature 2: Offline Queue Overflow Warning ───────────────────────
// Shown when the device is offline AND the retry queue reaches 40 items
// (10 below the hard cap of 50), giving the user time to reconnect.
const OfflineQueueWarning = () => {
  const { isOnline, offlineQueueFull } = useAppContext();
  if (isOnline || !offlineQueueFull) return null;
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[400] w-[calc(100%-2rem)] max-w-sm animate-in slide-in-from-bottom-4">
      <div className="bg-orange-900/95 backdrop-blur-sm border border-orange-500/40 rounded-xl px-4 py-3 shadow-2xl shadow-orange-900/40">
        <div className="flex items-start gap-3">
          <WifiOff size={18} className="text-orange-300 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-bold text-orange-200">Offline Queue Almost Full</p>
            <p className="text-[11px] text-orange-300/80 mt-0.5 leading-relaxed">
              You are offline and have nearly 40 pending saves. Please reconnect soon — further changes beyond 50 will be lost permanently.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const SyncErrorToast = () => {
  const { syncError } = useAppContext();
  if (!syncError) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[9999] animate-in slide-in-from-bottom-4 max-w-sm">
      <div className="bg-red-900/90 backdrop-blur-sm border border-red-500/30 rounded-xl px-4 py-3 shadow-2xl shadow-red-900/40">
        <div className="flex items-start gap-2">
          <CloudOff size={16} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-bold text-red-300">Sync Error</p>
            <p className="text-[11px] text-red-400/80 mt-0.5">{syncError}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Route guard: locked pages show request-access UI ──
const PAGE_LABELS = {
  '/model': 'SARIMAX Lab', '/tasks': 'Task Tracker', '/schedule': 'Calendar & Schedule',
  '/minutes': 'Minutes of Meeting', '/data': 'Data Hub', '/admin': 'Admin Panel',
};

const GuardedRoute = ({ element, path }) => {
  const { user, requestAccess } = useAppContext();
  const [requested, setRequested] = useState(false);
  const allowed = user?.roleKey in ROLE_ROUTES ? ROLE_ROUTES[user.roleKey] : ROLE_ROUTES.guest;
  if (allowed !== null && !allowed.includes(path)) {
    const pageName = PAGE_LABELS[path] || path;
    return (
      <div className="flex items-center justify-center h-[calc(100vh-140px)]">
        <div className="text-center max-w-sm">
          <LockKeyhole size={48} className="text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-100 mb-2">{pageName}</h2>
          <p className="text-slate-500 text-sm mb-1">Your role (<span className="font-bold text-slate-300">{user?.role}</span>) doesn't have access yet.</p>
          <p className="text-slate-600 text-xs mb-6">Request access and the PM will be notified.</p>
          {requested ? (
            <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <Send size={16} className="text-emerald-400" />
              <span className="text-sm font-bold text-emerald-400">Request Sent</span>
            </div>
          ) : (
            <button
              onClick={() => { requestAccess(pageName, 'page'); setRequested(true); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-500 transition-all active:scale-95 shadow-lg shadow-sky-900/30"
            >
              <Send size={16} /> Request Access
            </button>
          )}
        </div>
      </div>
    );
  }
  return element;
};

// ── Post-login onboarding — shown once per session ──
const OnboardingScreen = ({ onContinue }) => {
  const { user } = useAppContext();
  const isPM = user?.permissions?.isAdmin;

  return (
    <div className="fixed inset-0 bg-slate-950 z-[200] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-800 shadow-2xl w-[calc(100%-2rem)] max-w-lg p-6 sm:p-8 animate-scale-in">
        <h1 className="text-2xl font-bold text-white mb-1">Welcome, {user?.name?.split(' ')[0]}</h1>
        <p className="text-slate-500 text-sm mb-6">Here's how XoCompass works.</p>

        <div className="space-y-4 mb-6">
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-lg bg-sky-600/15 text-sky-400 flex items-center justify-center shrink-0 mt-0.5"><Eye size={16} /></div>
            <div>
              <p className="text-sm font-bold text-slate-200">View-Only by Default</p>
              <p className="text-xs text-slate-500">All team members can browse every unlocked page. Only the PM can create, edit, or delete anything.</p>
            </div>
          </div>

          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0 mt-0.5"><LockKeyhole size={16} /></div>
            <div>
              <p className="text-sm font-bold text-slate-200">Locked Pages</p>
              <p className="text-xs text-slate-500">Some pages show a lock icon. Tap them to send an access request to the PM — no extra steps needed.</p>
            </div>
          </div>

          {isPM ? (
            <div className="flex gap-3 items-start">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5"><Shield size={16} /></div>
              <div>
                <p className="text-sm font-bold text-slate-200">You're the PM</p>
                <p className="text-xs text-slate-500">You have full control. Manage roles in Admin Panel. Access requests from team members appear in your notifications.</p>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 items-start">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5"><Send size={16} /></div>
              <div>
                <p className="text-sm font-bold text-slate-200">Need More Access?</p>
                <p className="text-xs text-slate-500">Tap any locked item or action button — the PM gets notified instantly and can upgrade your role.</p>
              </div>
            </div>
          )}
        </div>

        <div className="text-center text-[10px] text-slate-600 mb-4">
          Your role: <span className="font-bold text-slate-400">{user?.role}</span>
        </div>

        <button
          onClick={onContinue}
          className="w-full flex items-center justify-center gap-2 bg-sky-600 text-white py-3 rounded-xl font-bold hover:bg-sky-500 transition-all active:scale-95 shadow-lg shadow-sky-900/30"
        >
          Go to Dashboard <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

const AppContent = () => {
  const { user, syncStatus } = useAppContext();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('xo_sidebar_collapsed') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem('xo_sidebar_collapsed', String(sidebarCollapsed)); } catch {}
  }, [sidebarCollapsed]);

  // Show onboarding once per session after login
  const prevUser = useRef(null);
  useEffect(() => {
    if (user && !prevUser.current) {
      const key = `xo_onboarded_${user.id}`;
      if (!sessionStorage.getItem(key)) {
        setShowOnboarding(true);
        sessionStorage.setItem(key, '1');
      }
    }
    prevUser.current = user;
  }, [user]);

  if (!user) return <WelcomeScreen />;
  return (
    <Router>
      {showOnboarding && <OnboardingScreen onContinue={() => setShowOnboarding(false)} />}
      <div className="flex bg-slate-950 min-h-screen font-sans text-slate-200 selection:bg-sky-500/30">
        <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} />

        {/* Mobile top bar */}
        <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setMobileOpen(true)} className="p-2 text-slate-300 hover:text-white" aria-label="Open menu">
            <Menu size={24} />
          </button>
          <h1 className="text-lg font-bold text-sky-400">XoCompass</h1>
          <div className="flex items-center gap-2">
            {syncStatus === 'synced' && <Cloud size={14} className="text-emerald-400" />}
            {syncStatus === 'connecting' && <Loader2 size={14} className="text-amber-400 animate-spin" />}
            {syncStatus === 'error' && <CloudOff size={14} className="text-red-400" />}
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center font-bold text-white uppercase text-xs">
              {user?.name?.charAt(0) || '?'}
            </div>
          </div>
        </div>

        <main className={`flex-1 transition-[margin] duration-300 ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-52 xl:ml-64'} pt-14 p-4 pb-24 sm:px-6 sm:pb-8 lg:p-6 xl:p-8 overflow-y-auto min-h-screen`}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/model" element={<GuardedRoute path="/model" element={<ModelLab />} />} />
            <Route path="/lab" element={<GuardedRoute path="/model" element={<ModelLab />} />} />
            <Route path="/tasks" element={<TaskTracker />} />
            <Route path="/schedule" element={<GuardedRoute path="/schedule" element={<Schedule />} />} />
            <Route path="/minutes" element={<GuardedRoute path="/minutes" element={<Minutes />} />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/data" element={<DataHub />} />
            <Route path="/defense" element={<Defense />} />
            <Route path="/admin" element={<AdminPanel />} />
          </Routes>
        </main>
        <SyncErrorToast />
        <SessionExpiredBanner />
        <OfflineQueueWarning />
      </div>
    </Router>
  );
};

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[XoCompass ErrorBoundary]', error.message, error.stack); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#f87171', background: '#0f172a', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h1 style={{ fontSize: 24, marginBottom: 16 }}>Something went wrong</h1>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: '#fbbf24' }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#94a3b8', marginTop: 12 }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => (
  <ErrorBoundary>
    <ThemeProvider>
      <AppProvider>
        <DatasetFileProvider>
          <AppContent />
        </DatasetFileProvider>
      </AppProvider>
    </ThemeProvider>
  </ErrorBoundary>
);
export default App;

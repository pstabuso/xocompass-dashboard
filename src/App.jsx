import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, Calendar, Book, FolderOpen, LogOut, User, Database, Shield, BrainCircuit, Users, Cloud, CloudOff, Loader2, Mail, Lock, Eye, EyeOff, Menu, X, Bell } from 'lucide-react';
import { AppProvider, useAppContext } from './context/AppContext';
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

// Sidebar (Dark Mode — responsive: collapsible on mobile)
const Sidebar = ({ mobileOpen, setMobileOpen }) => {
  const location = useLocation();
  const { user, signOut, syncStatus, notifications } = useAppContext();

  // Count unread notifications for the PM
  const myUnread = user?.permissions?.isAdmin ? (notifications || []).filter(n => {
    if (n.read) return false;
    const firstName = (user?.name || '').split(' ')[0].toLowerCase();
    return (n.to_user || '').toLowerCase().includes(firstName);
  }).length : 0;

  const menuItems = [
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

  const sidebarContent = (
    <>
      <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between">
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
        {/* Close button — mobile only */}
        <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1 text-slate-400 hover:text-white">
          <X size={22} />
        </button>
      </div>

      <nav className="flex-1 p-3 sm:p-4 space-y-1 sm:space-y-2 overflow-y-auto">
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center space-x-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl transition-all duration-200 ease-in-out group ${
              location.pathname === item.path
                ? 'bg-sky-600/10 text-sky-400 border border-sky-500/20 shadow-[0_0_15px_rgba(56,189,248,0.1)]'
                : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <item.icon size={20} className={location.pathname === item.path ? 'text-sky-400' : 'group-hover:scale-110 transition-transform'} />
            <span className="font-medium text-sm sm:text-base">{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="p-3 sm:p-4 border-t border-slate-800">
        {/* Notification indicator for PM */}
        {myUnread > 0 && user?.permissions?.isAdmin && (
          <Link
            to="/admin"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 mb-2 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/15 transition"
          >
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
        <button onClick={signOut} className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded-lg cursor-pointer transition-all duration-200">
          <LogOut size={16} />
          <span className="text-sm font-medium">Sign Out</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar — always visible */}
      <div className="hidden lg:flex w-64 h-screen bg-slate-900 border-r border-slate-800 text-slate-300 fixed left-0 top-0 flex-col z-50">
        {sidebarContent}
      </div>

      {/* Mobile overlay + drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 w-72 h-full bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col animate-slide-in-left">
            {sidebarContent}
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

const AppContent = () => {
  const { user, syncStatus } = useAppContext();
  const [mobileOpen, setMobileOpen] = useState(false);
  if (!user) return <WelcomeScreen />;
  return (
    <Router>
      <div className="flex bg-slate-950 min-h-screen font-sans text-slate-200 selection:bg-sky-500/30">
        <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

        {/* Mobile top bar — visible only on small screens */}
        <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setMobileOpen(true)} className="p-1 text-slate-300 hover:text-white">
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

        <main className="flex-1 lg:ml-64 pt-14 lg:pt-0 p-4 sm:p-6 lg:p-8 overflow-y-auto min-h-screen">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/model" element={<ModelLab />} />
            <Route path="/tasks" element={<TaskTracker />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/minutes" element={<Minutes />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/data" element={<DataHub />} />
            <Route path="/defense" element={<Defense />} />
            <Route path="/admin" element={<AdminPanel />} />
          </Routes>
        </main>
        <SyncErrorToast />
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

const App = () => <ErrorBoundary><AppProvider><AppContent /></AppProvider></ErrorBoundary>;
export default App;

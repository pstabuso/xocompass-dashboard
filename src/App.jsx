import React, { useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  NavLink,
} from 'react-router-dom';
import {
  LayoutDashboard,
  CheckSquare,
  CalendarDays,
  Database,
  Shield,
  BookOpen,
  Settings,
  BrainCircuit,
  FileText,
  Loader2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Bell,
} from 'lucide-react';
import { isNotificationForUser } from './context/AppContext';

import { AppProvider, useAppContext } from './context/AppContext';
import { DatasetFileProvider } from './context/DatasetFileContext';
import { ThemeProvider } from './context/ThemeContext';
import { isCloudEnabled } from './lib/supabase';

import Dashboard from './pages/Dashboard';
import TaskTracker from './pages/TaskTracker';
import Schedule from './pages/Schedule';
import DataHub from './pages/DataHub';
import Defense from './pages/Defense';
import AdminPanel from './pages/AdminPanel';
import Resources from './pages/Resources';
import Minutes from './pages/Minutes';
import ModelLab from './pages/ModelLab';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message ?? 'Unknown error' };
  }

  componentDidCatch(error, info) {
    console.error('[XoCompass ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-red-400 p-8 text-center">
          <div className="max-w-md">
            <p className="text-xl font-bold mb-2">Something went wrong</p>
            <p className="text-sm text-slate-500 mb-4">{this.state.message}</p>
            <button
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300 transition"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const navItems = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/tasks', label: 'Task Tracker', icon: CheckSquare },
  { to: '/schedule', label: 'Calendar', icon: CalendarDays },
  { to: '/minutes', label: 'Minutes', icon: FileText },
  { to: '/data', label: 'Data Hub', icon: Database },
  { to: '/lab', label: 'Model Lab', icon: BrainCircuit },
  { to: '/defense', label: 'Defense Hub', icon: Shield },
  { to: '/resources', label: 'Resources', icon: BookOpen },
  { to: '/admin', label: 'Admin Panel', icon: Settings },
];

const AppShell = () => {
  const { user, signOut, notifications, markNotificationsRead } = useAppContext();
  const myUnread = user?.permissions?.isAdmin
    ? (notifications || []).filter(n => !n.read && isNotificationForUser(n, user)).length
    : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-black text-white">XoCompass Dashboard</h1>
            <p className="text-[11px] sm:text-xs text-slate-500 truncate">
              Overview · Tasks · Schedule · Data · Defense · Admin · Model Lab
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {myUnread > 0 && (
              <NavLink to="/admin" onClick={markNotificationsRead}
                className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition"
                title={`${myUnread} new notification${myUnread > 1 ? 's' : ''}`}>
                <Bell size={16} className="text-amber-400" />
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-500 text-[9px] font-black text-black flex items-center justify-center">
                  {myUnread > 9 ? '9+' : myUnread}
                </span>
              </NavLink>
            )}
            {user?.name && (
              <span className="hidden md:inline text-xs text-slate-400 max-w-[120px] truncate">
                {user.name}
              </span>
            )}
            {typeof signOut === 'function' && user && (
              <button
                onClick={signOut}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-bold transition"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-4 sm:gap-6">
        <aside className="lg:sticky lg:top-[76px] lg:self-start">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3">
            <nav className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2">
              {navItems.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition ${
                      isActive
                        ? 'bg-pink-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`
                  }
                >
                  <Icon size={16} />
                  <span className="truncate">{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

const MAX_NAME_LENGTH = 20;
const NAME_REGEX = /^[a-zA-Z\s'-]+$/;

const WelcomeScreen = () => {
  const { signIn, signUp, localSignIn, authLoading } = useAppContext();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [confirmMsg, setConfirmMsg] = useState('');
  const [loading, setLoading] = useState(false);

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950">
        <Loader2 size={36} className="text-pink-400 animate-spin" />
      </div>
    );
  }

  const isLocal = !isCloudEnabled;

  const handleLogin = async () => {
    if (!email || !password) { setError('Email and password are required'); return; }
    setError(''); setLoading(true);
    try { await signIn(email, password); }
    catch (err) { setError(err.message || 'Login failed'); }
    finally { setLoading(false); }
  };

  const handleSignUp = async () => {
    if (!email || !password) { setError('Email and password are required'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    const trimmed = displayName.trim();
    if (!trimmed) { setError('Name is required'); return; }
    if (trimmed.length > MAX_NAME_LENGTH) { setError(`Name cannot exceed ${MAX_NAME_LENGTH} characters`); return; }
    if (!NAME_REGEX.test(trimmed)) { setError('Name can only contain letters, spaces, hyphens, and apostrophes'); return; }
    setError(''); setConfirmMsg(''); setLoading(true);
    try { await signUp(email, password, trimmed); }
    catch (err) {
      if (err.message === 'CONFIRM_EMAIL') {
        setConfirmMsg("Account created! Check your email to confirm, then sign in. You'll start as a Guest.");
        setMode('login');
      } else { setError(err.message || 'Sign up failed'); }
    } finally { setLoading(false); }
  };

  const handleLocalEnter = () => {
    const trimmed = displayName.trim();
    if (!trimmed) { setError('Please enter your name'); return; }
    if (trimmed.length > MAX_NAME_LENGTH) { setError(`Name cannot exceed ${MAX_NAME_LENGTH} characters`); return; }
    if (!NAME_REGEX.test(trimmed)) { setError('Name can only contain letters, spaces, hyphens, and apostrophes'); return; }
    setError('');
    localSignIn(trimmed);
  };

  return (
    <div className="h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-pink-900/20 via-slate-950 to-slate-950 pointer-events-none" />
      <div className="bg-slate-900/60 backdrop-blur-xl p-6 sm:p-8 rounded-2xl shadow-2xl w-[calc(100%-2rem)] max-w-sm border border-slate-800 relative z-10">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-black text-white">XoCompass</h1>
          <p className="text-slate-400 text-sm mt-1">
            {isLocal ? 'Local mode — enter your name to start' : mode === 'login' ? 'Sign in to your workspace' : 'Create your team account'}
          </p>
        </div>

        {confirmMsg && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400">{confirmMsg}</div>
        )}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">{error}</div>
        )}

        {isLocal ? (
          <>
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-400 mb-1 block">Your Name</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 text-slate-500" size={16} />
                <input type="text" className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg outline-none focus:ring-2 focus:ring-pink-500 text-sm"
                  placeholder="Enter your name" value={displayName}
                  onChange={e => setDisplayName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLocalEnter()} autoFocus />
              </div>
            </div>
            <button onClick={handleLocalEnter} className="w-full bg-pink-600 text-white py-2.5 rounded-lg font-bold hover:bg-pink-500 transition text-sm">
              Enter Workspace
            </button>
          </>
        ) : mode === 'login' ? (
          <>
            <div className="space-y-3 mb-5">
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 text-slate-500" size={16} />
                <input type="email" className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg outline-none focus:ring-2 focus:ring-pink-500 text-sm"
                  placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} autoFocus />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 text-slate-500" size={16} />
                <input type={showPassword ? 'text' : 'password'} className="w-full pl-9 pr-9 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg outline-none focus:ring-2 focus:ring-pink-500 text-sm"
                  placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                <button onClick={() => setShowPassword(s => !s)} className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button onClick={handleLogin} disabled={loading}
              className="w-full bg-pink-600 text-white py-2.5 rounded-lg font-bold hover:bg-pink-500 transition disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
              {loading && <Loader2 size={16} className="animate-spin" />} Sign In
            </button>
            <p className="text-center text-xs text-slate-500 mt-4">
              No account?{' '}
              <button onClick={() => { setMode('signup'); setError(''); }} className="text-pink-400 hover:text-pink-300 font-bold">Sign Up</button>
            </p>
          </>
        ) : (
          <>
            <div className="space-y-3 mb-4">
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 text-slate-500" size={16} />
                <input type="email" className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg outline-none focus:ring-2 focus:ring-pink-500 text-sm"
                  placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 text-slate-500" size={16} />
                <input type={showPassword ? 'text' : 'password'} className="w-full pl-9 pr-9 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg outline-none focus:ring-2 focus:ring-pink-500 text-sm"
                  placeholder="Min. 6 characters" value={password} onChange={e => setPassword(e.target.value)} />
                <button onClick={() => setShowPassword(s => !s)} className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="relative">
                <User className="absolute left-3 top-2.5 text-slate-500" size={16} />
                <input type="text" className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg outline-none focus:ring-2 focus:ring-pink-500 text-sm"
                  placeholder="Display name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
              </div>
            </div>
            <div className="mb-4 p-2.5 bg-pink-500/10 border border-pink-500/20 rounded-lg text-xs text-pink-400">
              You'll join as a <span className="font-bold">Guest</span>. The PM will assign your role.
            </div>
            <button onClick={handleSignUp} disabled={loading}
              className="w-full bg-pink-600 text-white py-2.5 rounded-lg font-bold hover:bg-pink-500 transition disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
              {loading && <Loader2 size={16} className="animate-spin" />} Create Account
            </button>
            <p className="text-center text-xs text-slate-500 mt-4">
              Have an account?{' '}
              <button onClick={() => { setMode('login'); setError(''); }} className="text-pink-400 hover:text-pink-300 font-bold">Sign In</button>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

const AppContent = () => {
  const { user, authLoading, loading } = useAppContext();
  const isLoading = authLoading ?? loading ?? false;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <WelcomeScreen />;

  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="tasks" element={<TaskTracker />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="minutes" element={<Minutes />} />
        <Route path="data" element={<DataHub />} />
        <Route path="lab" element={<ModelLab />} />
        <Route path="defense" element={<Defense />} />
        <Route path="resources" element={<Resources />} />
        <Route path="admin" element={<AdminPanel />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

const App = () => (
  <ErrorBoundary>
    <BrowserRouter>
      <AppProvider>
        <DatasetFileProvider>
          <ThemeProvider>
            <AppContent />
          </ThemeProvider>
        </DatasetFileProvider>
      </AppProvider>
    </BrowserRouter>
  </ErrorBoundary>
);

export default App;

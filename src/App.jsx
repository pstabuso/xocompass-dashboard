import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, Calendar, Book, FolderOpen, LogOut, Lock, Mail, User, Database, Shield, BrainCircuit, UserPlus, ArrowLeft, KeyRound } from 'lucide-react';
import { AppProvider, useAppContext } from './context/AppContext';

// Pages
import Dashboard from './pages/Dashboard';
import TaskTracker from './pages/TaskTracker';
import Schedule from './pages/Schedule';
import Minutes from './pages/Minutes';
import Resources from './pages/Resources';
import DataHub from './pages/DataHub';
import Defense from './pages/Defense';
import ModelLab from './pages/ModelLab';

// Sidebar (Dark Mode)
const Sidebar = () => {
  const location = useLocation();
  const { user, logout } = useAppContext();

  const menuItems = [
    { path: '/', icon: LayoutDashboard, label: 'Overview' },
    { path: '/model', icon: BrainCircuit, label: 'SARIMAX Lab' },
    { path: '/tasks', icon: CheckSquare, label: 'Task Tracker' },
    { path: '/schedule', icon: Calendar, label: 'Calendar & Sched' },
    { path: '/minutes', icon: Book, label: 'Minutes of Meeting' },
    { path: '/data', icon: Database, label: 'Data Hub' },
    { path: '/defense', icon: Shield, label: 'Defense Prep' },
    { path: '/resources', icon: FolderOpen, label: 'Resources' },
  ];

  return (
    <div className="w-64 h-screen bg-slate-900 border-r border-slate-800 text-slate-300 fixed left-0 top-0 flex flex-col z-50">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-sky-400 tracking-tight">XoCompass</h1>
        <p className="text-xs text-slate-500 mt-1">LEAP Thesis 2 Manager</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ease-in-out group ${
              location.pathname === item.path
                ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <item.icon size={20} className={location.pathname === item.path ? 'text-blue-400' : 'group-hover:scale-110 transition-transform'} />
            <span className="font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center space-x-3 px-4 mb-4">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center font-bold text-white uppercase shadow-lg">
                {user?.name?.charAt(0) || '?'}
            </div>
            <div className="overflow-hidden">
                <p className="text-sm font-bold truncate text-slate-200">{user?.name}</p>
                <p className="text-xs text-slate-500 truncate">{user?.role}</p>
            </div>
        </div>
        <button onClick={logout} className="w-full flex items-center space-x-3 px-4 py-2 text-red-400 hover:bg-red-500/10 rounded-lg cursor-pointer transition-all duration-200 hover:pl-6">
          <LogOut size={18} />
          <span className="text-sm font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );
};

const LoginScreen = () => {
  const { login, register, resetPassword } = useAppContext();
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'reset'
  const [formData, setFormData] = useState({ email: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(formData.email, formData.password);
    if (!result.success) setError(result.message);
    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await register(formData.email, formData.password, formData.displayName);
    if (!result.success) setError(result.message);
    setLoading(false);
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    const result = await resetPassword(formData.email);
    if (result.success) {
      setInfo('Password reset email sent. Check your inbox.');
    } else {
      setError(result.message);
    }
    setLoading(false);
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setInfo('');
  };

  return (
    <div className="h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 pointer-events-none"></div>
      <div className="bg-slate-900/50 backdrop-blur-xl p-8 rounded-2xl shadow-2xl w-96 border border-slate-800 relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">XoCompass</h1>
          <p className="text-slate-400 text-sm mt-1">
            {mode === 'login' && 'Sign in to your workspace'}
            {mode === 'register' && 'Create your account'}
            {mode === 'reset' && 'Reset your password'}
          </p>
        </div>

        {/* ---------- LOGIN FORM ---------- */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            {error && <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm text-center border border-red-500/20">{error}</div>}
            <div>
              <label className="block text-sm font-bold text-slate-400 mb-1 ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 text-slate-500" size={18} />
                <input type="email" required autoComplete="email" className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg focus:ring-2 focus:ring-sky-500 outline-none transition" placeholder="you@example.com" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-400 mb-1 ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 text-slate-500" size={18} />
                <input type="password" required autoComplete="current-password" className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg focus:ring-2 focus:ring-sky-500 outline-none transition" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
              </div>
            </div>
            <button type="submit" disabled={loading} className="w-full bg-sky-600 text-white py-3 rounded-lg font-bold hover:bg-sky-500 transition shadow-lg shadow-sky-900/20 mt-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <div className="flex justify-between items-center pt-2 text-sm">
              <button type="button" onClick={() => switchMode('reset')} className="text-slate-400 hover:text-sky-400 transition flex items-center gap-1">
                <KeyRound size={14} /> Forgot Password?
              </button>
              <button type="button" onClick={() => switchMode('register')} className="text-sky-400 hover:text-sky-300 transition flex items-center gap-1">
                <UserPlus size={14} /> Create Account
              </button>
            </div>
          </form>
        )}

        {/* ---------- REGISTER FORM ---------- */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            {error && <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm text-center border border-red-500/20">{error}</div>}
            <div>
              <label className="block text-sm font-bold text-slate-400 mb-1 ml-1">Display Name</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 text-slate-500" size={18} />
                <input type="text" required className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg focus:ring-2 focus:ring-sky-500 outline-none transition" placeholder="Your name" value={formData.displayName} onChange={e => setFormData({...formData, displayName: e.target.value})} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-400 mb-1 ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 text-slate-500" size={18} />
                <input type="email" required autoComplete="email" className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg focus:ring-2 focus:ring-sky-500 outline-none transition" placeholder="you@example.com" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-400 mb-1 ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 text-slate-500" size={18} />
                <input type="password" required autoComplete="new-password" minLength={6} className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg focus:ring-2 focus:ring-sky-500 outline-none transition" placeholder="At least 6 characters" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
              </div>
            </div>
            <button type="submit" disabled={loading} className="w-full bg-sky-600 text-white py-3 rounded-lg font-bold hover:bg-sky-500 transition shadow-lg shadow-sky-900/20 mt-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
            <button type="button" onClick={() => switchMode('login')} className="w-full text-center text-sm text-slate-400 hover:text-sky-400 transition pt-2 flex items-center justify-center gap-1">
              <ArrowLeft size={14} /> Back to Sign In
            </button>
          </form>
        )}

        {/* ---------- RESET PASSWORD FORM ---------- */}
        {mode === 'reset' && (
          <form onSubmit={handleReset} className="space-y-4">
            {error && <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm text-center border border-red-500/20">{error}</div>}
            {info && <div className="bg-green-500/10 text-green-400 p-3 rounded-lg text-sm text-center border border-green-500/20">{info}</div>}
            <div>
              <label className="block text-sm font-bold text-slate-400 mb-1 ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 text-slate-500" size={18} />
                <input type="email" required autoComplete="email" className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg focus:ring-2 focus:ring-sky-500 outline-none transition" placeholder="you@example.com" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
            </div>
            <button type="submit" disabled={loading} className="w-full bg-sky-600 text-white py-3 rounded-lg font-bold hover:bg-sky-500 transition shadow-lg shadow-sky-900/20 mt-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            <button type="button" onClick={() => switchMode('login')} className="w-full text-center text-sm text-slate-400 hover:text-sky-400 transition pt-2 flex items-center justify-center gap-1">
              <ArrowLeft size={14} /> Back to Sign In
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

const LoadingScreen = () => (
  <div className="h-screen flex items-center justify-center bg-slate-950">
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p className="text-slate-400 text-sm">Loading...</p>
    </div>
  </div>
);

const AppContent = () => {
  const { user, authLoading } = useAppContext();
  if (authLoading) return <LoadingScreen />;
  if (!user) return <LoginScreen />;
  return (
    <Router>
      <div className="flex bg-slate-950 min-h-screen font-sans text-slate-200 selection:bg-sky-500/30">
        <Sidebar />
        <main className="flex-1 ml-64 p-8 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/model" element={<ModelLab />} />
            <Route path="/tasks" element={<TaskTracker />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/minutes" element={<Minutes />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/data" element={<DataHub />} />
            <Route path="/defense" element={<Defense />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

const App = () => <AppProvider><AppContent /></AppProvider>;
export default App;

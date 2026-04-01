import React from 'react';
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
} from 'lucide-react';

import { AppProvider, useAppContext } from './context/AppContext';
import { DatasetFileProvider } from './context/DatasetFileContext';

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
  const { user, signOut } = useAppContext();

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
            {user?.name && (
              <span className="hidden md:inline text-xs text-slate-400">
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

const AppContent = () => {
  const { authLoading, loading } = useAppContext();
  const isLoading = authLoading ?? loading ?? false;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
          <AppContent />
        </DatasetFileProvider>
      </AppProvider>
    </BrowserRouter>
  </ErrorBoundary>
);

export default App;

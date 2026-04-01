import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, NavLink } from 'react-router-dom';

import { AppProvider, useAppContext } from './context/AppContext';
import { DatasetFileProvider } from './context/DatasetFileContext';

import DataHub from './pages/DataHub';
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

const AppShell = () => {
  const { user, signOut } = useAppContext();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-black text-white">XoCompass Dashboard</h1>
            <p className="text-[11px] sm:text-xs text-slate-500 truncate">
              Data Hub · Model Lab
            </p>
          </div>

          <nav className="flex items-center gap-2">
            <NavLink
              to="/lab"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-bold transition ${
                  isActive
                    ? 'bg-pink-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`
              }
            >
              Model Lab
            </NavLink>

            <NavLink
              to="/data"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-bold transition ${
                  isActive
                    ? 'bg-pink-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`
              }
            >
              Data Hub
            </NavLink>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {user?.name && (
              <span className="hidden sm:inline text-xs text-slate-400">
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

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
        <Outlet />
      </main>
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
        <Route index element={<Navigate to="/lab" replace />} />
        <Route path="lab" element={<ModelLab />} />
        <Route path="data" element={<DataHub />} />
        <Route path="*" element={<Navigate to="/lab" replace />} />
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

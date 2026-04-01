/**
 * App.jsx — XoCompass v17.8
 * =========================
 * Fixes in this version:
 *
 * 1. REMOVED Layout import — Layout.jsx does not exist in this repo.
 *    Both DataHub and ModelLab are self-contained pages with their own
 *    headers. Routes render directly without a shell wrapper.
 *
 * 2. AppContent blank-screen fix:
 *    Old: early `if (!user) return null` blocked ALL route rendering,
 *         causing a blank screen on hard-refresh or direct URL navigation.
 *    New: auth guard is inline on the /lab route only. /data is always public.
 *
 * 3. DatasetFileProvider bridges DataHub uploads → ModelLab CSV parser.
 *
 * 4. vercel.json (separate file) rewrites all paths to /index.html so
 *    Vite's client-side router handles /data and /lab correctly on Vercel.
 *
 * [ISO 25010 - Reliability] No Layout import = no UNRESOLVED_IMPORT build error.
 * [ISO 25010 - Usability]   No blank screen on hard-refresh or direct URL.
 * [STRIDE-I]                ErrorBoundary strips stack traces from UI.
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AppProvider, useAppContext }  from './context/AppContext';
import { DatasetFileProvider }         from './context/DatasetFileContext';

// Pages are self-contained — each has its own header/nav built in.
// There is no shared Layout shell in this repo.
import DataHub  from './pages/DataHub';
import ModelLab from './pages/ModelLab';

// ── Error Boundary ──────────────────────────────────────────────────────────
// [STRIDE-I] Catches render errors — never exposes raw stack traces in UI.
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

// ── App Content ──────────────────────────────────────────────────────────────
// [ISO 25010 - Usability] Blank-screen fix:
//   authLoading ?? loading ?? false handles both naming conventions that
//   AppContext may use. If neither field exists, isLoading = false and
//   the spinner never locks permanently.
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

  return (
    <Routes>
      {/* Root: redirect to Data Hub */}
      <Route index element={<Navigate to="/data" replace />} />

      {/* Data Hub — public, no auth required */}
      <Route path="/data" element={<DataHub />} />

      {/* Model Lab — protected. Redirects to /data if not authenticated.
          Inline guard replaces the old `if (!user) return null` that blocked
          ALL routes and caused a blank screen on load. */}
      <Route
        path="/lab"
        element={user ? <ModelLab /> : <Navigate to="/data" replace />}
      />

      {/* Catch-all: unknown paths → Data Hub */}
      <Route path="*" element={<Navigate to="/data" replace />} />
    </Routes>
  );
};

// ── Root App ─────────────────────────────────────────────────────────────────
// Provider order (outer → inner):
//   ErrorBoundary       — outermost: catches any child render crash
//   BrowserRouter       — routing context for Routes/Navigate/useNavigate
//   AppProvider         — auth + dataset metadata context
//   DatasetFileProvider — in-memory File registry: DataHub writes, ModelLab reads
//   AppContent          — page tree; consumes all providers above
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

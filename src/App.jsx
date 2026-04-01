/**
 * App.jsx — XoCompass v17.8
 * =========================
 * Fixes applied in this version:
 *
 * 1. vercel.json rewrite  (separate file — live alongside this one)
 *    Old: "destination": "/"   → Vercel 404s on /data, /lab hard refreshes
 *    New: "destination": "/index.html" → Vite SPA handles all client routes
 *
 * 2. AppContent blank-screen fix
 *    Old: early `if (!user) return null` blocked ALL route rendering,
 *         showing a blank screen whenever auth state was undefined/null on
 *         first load or after a hard refresh.
 *    New: auth guard moved INSIDE <Routes> — /lab redirects to /data when
 *         user is null, everything else renders unconditionally.
 *
 * 3. DatasetFileProvider (carried forward from v17.8)
 *    Wraps AppContent so DataHub and ModelLab share the same file registry.
 *    Without this, useDatasetFiles() throws on ModelLab mount.
 *
 * [ISO 25010 - Reliability]  Context provider prevents null-ref crash.
 * [ISO 25010 - Usability]    No blank screen on hard-refresh or direct URL.
 * [STRIDE-I]                 ErrorBoundary strips stack traces from UI.
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AppProvider, useAppContext }  from './context/AppContext';
import { DatasetFileProvider }         from './context/DatasetFileContext';

import Layout   from './components/Layout';
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
//   The previous version had `if (!user) return null` which blocked ALL route
//   rendering when auth state was loading or user was guest. This caused a
//   blank white screen on hard-refresh or direct URL navigation.
//
//   Fix: remove the early return. Auth guard lives INSIDE <Routes> on /lab
//   only. All other routes (/data, /) render regardless of auth state.
//
//   authLoading ?? loading ?? false:
//     - AppContext may expose either `authLoading` (Supabase async auth) or
//       `loading` (legacy name). The double nullish-coalesce handles both
//       without crashing if one field is undefined.
const AppContent = () => {
  const { user, authLoading, loading } = useAppContext();
  const isLoading = authLoading ?? loading ?? false;

  // Show spinner while auth state is resolving (first paint only)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        {/* Default: always redirect root to /data */}
        <Route index element={<Navigate to="/data" replace />} />

        {/* Data Hub: public — no auth required */}
        <Route path="data" element={<DataHub />} />

        {/* Model Lab: protected — redirect to /data if not authenticated.
            This replaces the old blanket `if (!user) return null` pattern
            which blocked the entire app rather than just this one route. */}
        <Route
          path="lab"
          element={user ? <ModelLab /> : <Navigate to="/data" replace />}
        />

        {/* Catch-all: unknown paths → /data */}
        <Route path="*" element={<Navigate to="/data" replace />} />
      </Route>
    </Routes>
  );
};

// ── Root App ─────────────────────────────────────────────────────────────────
// Provider order matters — outer to inner:
//   ErrorBoundary       — must be outermost to catch any child crash
//   BrowserRouter       — must wrap everything that uses useNavigate/Routes
//   AppProvider         — auth context; AppContent reads from this
//   DatasetFileProvider — file registry; DataHub writes, ModelLab reads
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

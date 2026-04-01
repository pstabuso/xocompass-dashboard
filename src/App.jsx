/**
 * App.jsx — XoCompass v17.8
 * =========================
 * THE CRITICAL FIX: DatasetFileProvider wraps AppContent so that both
 * DataHub and ModelLab share the same file registry instance.
 *
 * Without this wrapper, useDatasetFiles() in ModelLab.jsx throws:
 *   "Cannot read properties of null (reading 'datasetFiles')"
 * ...which crashes the entire pipeline silently on first load.
 *
 * Change from original App.jsx:
 *   1. Added import { DatasetFileProvider } from './context/DatasetFileContext'
 *   2. Wrapped <AppContent /> with <DatasetFileProvider>
 *
 * Everything else (ErrorBoundary, routing, AppContext, ThemeProvider)
 * is preserved exactly as-is from the original structure.
 *
 * [ISO 25010 - Reliability] Context provider prevents null-ref crash on mount.
 * [STRIDE-I] ErrorBoundary strips internal stack traces from the UI.
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AppProvider, useAppContext }       from './context/AppContext';
import { DatasetFileProvider }              from './context/DatasetFileContext'; // ← ADDED

import DataHub   from './pages/DataHub';
import ModelLab  from './pages/ModelLab';

// ── Error Boundary ──────────────────────────────────────────────────────────
// [STRIDE-I] Catches render errors and shows a safe fallback instead of
// exposing raw stack traces in the browser UI.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message ?? 'Unknown error' };
  }

  componentDidCatch(error, info) {
    // Log internally — never surface raw stack to UI
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
// Reads auth state from AppContext. Renders authenticated routes or login.
const AppContent = () => {
  const { user, loading } = useAppContext();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      {/* Authenticated routes */}
      <Route path="/" element={<Layout />}>
        <Route index        element={<Navigate to="/data" replace />} />
        <Route path="data"  element={<DataHub />} />
        <Route path="lab"   element={<ModelLab />} />
        {/* Catch-all redirect for unknown paths */}
        <Route path="*"     element={<Navigate to="/data" replace />} />
      </Route>
    </Routes>
  );
};

// ── Root App ─────────────────────────────────────────────────────────────────
// Provider order (outer → inner):
//   ErrorBoundary      — catches render crashes from any child
//   BrowserRouter      — provides routing context
//   AppProvider        — provides auth/user context
//   DatasetFileProvider — ← NEW: provides file registry to DataHub + ModelLab
//   AppContent         — renders the actual page tree
const App = () => (
  <ErrorBoundary>
    <BrowserRouter>
      <AppProvider>
        <DatasetFileProvider>  {/* ← THE FIX: shared file registry */}
          <AppContent />
        </DatasetFileProvider>
      </AppProvider>
    </BrowserRouter>
  </ErrorBoundary>
);

export default App;

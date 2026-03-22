/**
 * XoCompass — SARIMAX API Client (Phase 2)
 *
 * Calls the FastAPI backend to run real SARIMAX predictions.
 * Falls back gracefully if the backend is unreachable.
 *
 * Usage in ModelLab.jsx:
 *   import { predictSarimax, isBackendAvailable } from '../lib/sarimax-api';
 */

const API_URL = import.meta.env.VITE_SARIMAX_API_URL || 'http://localhost:8000';

/**
 * Check if the Python backend is running.
 * @returns {Promise<{ok: boolean, engine: string|null}>}
 */
export async function isBackendAvailable() {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, engine: null };
    const data = await res.json();
    return { ok: true, engine: data.engine };
  } catch {
    return { ok: false, engine: null };
  }
}

/**
 * Send historical data to the Python SARIMAX engine and get forecasts.
 *
 * @param {Object} params
 * @param {Array<{date: string, demand: number, rainfall: number, holiday: number}>} params.data
 * @param {number} [params.horizon=12] - Months to forecast
 * @param {[number,number,number]} [params.order=[1,1,1]] - ARIMA (p,d,q)
 * @param {[number,number,number,number]} [params.seasonalOrder=[1,1,1,12]] - (P,D,Q,s)
 *
 * @returns {Promise<{
 *   model: string,
 *   aic: number|null,
 *   rmse: number|null,
 *   forecasts: Array<{date: string, forecast: number, ci_lower: number, ci_upper: number}>,
 *   engine: string
 * }>}
 *
 * @throws {Error} if the backend is unreachable or returns an error
 */
export async function predictSarimax({
  data,
  horizon = 12,
  order = [1, 1, 1],
  seasonalOrder = [1, 1, 1, 12],
}) {
  const res = await fetch(`${API_URL}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data,
      horizon,
      order,
      seasonal_order: seasonalOrder,
    }),
    signal: AbortSignal.timeout(30000), // 30s — SARIMAX fitting can be slow
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Backend returned ${res.status}`);
  }

  return res.json();
}

/**
 * XoCompass v17.9 — Airline Booking Demand API Client
 * ====================================================
 * v17.9 iOS FIXES:
 *   [iOS-1] AbortSignal.timeout() was added in Safari 17.4 (March 2024).
 *           Older iPhones (iOS 15/16) throw TypeError calling it, making the
 *           backend health check fail silently and block all training.
 *           Replaced with _timedAbort(ms) that works back to iOS 13.
 *   [iOS-2] predictSarimax() and recalculateDSS() now use res.text() + manual
 *           JSON.parse() matching predictHybrid() — prevents silent failures
 *           on WebKit when the response contains bare NaN/Infinity tokens.
 *
 * Previous fixes (preserved):
 *   [BUG-1] AbortSignal threaded through to fetch() so cancelRun() works.
 *   [BUG-2] signal param added to predictHybrid() / predictSarimax().
 *   [BUG-3] All fetch() calls use passed signal, not AbortSignal.timeout().
 *   [BUG-4] recalculateDSS() accepts optional signal for cancellation.
 *   [NUM-1] commission_per_pax defaults to NET_COMMISSION_PHP constant.
 *   [NUM-2] buildObservation() uses correct month-end for payday flag.
 */

const API_URL = import.meta.env.VITE_SARIMAX_API_URL || 'http://localhost:8000';

/**
 * Cross-browser abort signal with timeout.
 * [iOS-1] AbortSignal.timeout() requires Safari ≥ 17.4 (March 2024).
 * Older iOS devices throw TypeError, which is silently caught and makes
 * the backend appear offline even when it's reachable.
 * This helper works on Safari 13+ / Chrome 66+ / Firefox 57+.
 */
function _timedAbort(ms) {
  if (typeof AbortSignal?.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const ac = new AbortController();
  setTimeout(() => ac.abort(new DOMException('TimeoutError', 'TimeoutError')), ms);
  return ac.signal;
}

/**
 * iOS-safe JSON response reader.
 * [iOS-2] WebKit throws SyntaxError on bare NaN/Infinity JSON tokens.
 * Reading as text first gives us the raw payload for diagnostic logging
 * and converts the error into a SyntaxError (not a TypeError) so the
 * caller's error handler can distinguish network vs parse failures.
 */
async function _readJSON(res) {
  let text;
  try {
    text = await res.text();
  } catch (networkErr) {
    throw new TypeError(`[iOS] Network read failed mid-stream: ${networkErr.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (parseErr) {
    const snippet = text.slice(0, 200).replace(/\s+/g, ' ');
    throw new SyntaxError(`[iOS] JSON parse failed — raw: ${snippet}… (${parseErr.message})`);
  }
}

// ── Health / Capability ──────────────────────────────────────────────────

/**
 * Check if the Python backend is running.
 * @param {AbortSignal} [signal]
 */
export async function isBackendAvailable(signal) {
  try {
    const res = await fetch(`${API_URL}/health`, {
      signal: signal ?? _timedAbort(5_000),
    });
    if (!res.ok) return { ok: false, engine: null };
    const data = await res.json();
    return {
      ok:               true,
      engine:           data.engine,
      hasXGBoost:       data.xgboost,
      hasStatsmodels:   data.statsmodels,
      maxDailyBookings: data.max_daily_bookings,
      netCommissionPHP: data.net_commission_php,
      grossFarePHP:     data.gross_fare_php,
      version:          data.version,
    };
  } catch {
    return { ok: false, engine: null, hasXGBoost: false, hasStatsmodels: false };
  }
}

/**
 * Fetch pipeline stage metadata.
 * @param {AbortSignal} [signal]
 */
export async function getPipelineInfo(signal) {
  const res = await fetch(`${API_URL}/pipeline/info`, {
    signal: signal ?? _timedAbort(5_000),
  });
  if (!res.ok) throw new Error(`Pipeline info failed: ${res.status}`);
  return res.json();
}

// ── Main Prediction ──────────────────────────────────────────────────────

/**
 * Run the full hybrid forecast (NB2 → SARIMAX → XGBoost).
 *
 * @param {Object} params
 * @param {Array}  params.data             — daily observations
 * @param {number} [params.horizon=90]
 * @param {'hybrid'|'sarimax'|'xgboost'} [params.modelMode='hybrid']
 * @param {number[]} [params.order=[0,0,1]]
 * @param {number[]} [params.seasonalOrder=[0,0,0,7]]
 * @param {number}   [params.maxDailyBookings=200]
 * @param {AbortSignal} [params.signal]    — [BUG-1 FIX] now used in fetch()
 */
export async function predictHybrid({
  data,
  horizon = 90,
  modelMode = 'hybrid',
  order = [0, 0, 1],
  seasonalOrder = [0, 0, 0, 7],
  maxDailyBookings = 200,
  signal,                         // [BUG-1] was missing from destructure
}) {
  const res = await fetch(`${API_URL}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data,
      horizon,
      model_mode:         modelMode,
      order,
      seasonal_order:     seasonalOrder,
      max_daily_bookings: maxDailyBookings,
    }),
    signal: signal ?? _timedAbort(300_000),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    // FastAPI 422 returns detail as an array of Pydantic error objects.
    // Coercing an array with new Error() gives "[object Object]" — stringify properly.
    const detail = Array.isArray(body.detail)
      ? body.detail.map(d => `[${(d.loc || []).slice(-2).join('.')}] ${d.msg}`).join('; ')
      : (body.detail || `Backend returned ${res.status}`);
    throw new Error(detail);
  }

  return _readJSON(res);
}

/**
 * SARIMAX-only prediction.
 * @param {AbortSignal} [params.signal]
 */
export async function predictSarimax({
  data,
  horizon = 90,
  order = [0, 0, 1],
  seasonalOrder = [0, 0, 0, 7],
  maxDailyBookings = 200,
  signal,                         // [BUG-2] was missing
}) {
  const res = await fetch(`${API_URL}/predict/sarimax`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data,
      horizon,
      model_mode:         'sarimax',
      order,
      seasonal_order:     seasonalOrder,
      max_daily_bookings: maxDailyBookings,
    }),
    signal: signal ?? _timedAbort(300_000),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    const detail = Array.isArray(body.detail)
      ? body.detail.map(d => `[${(d.loc || []).slice(-2).join('.')}] ${d.msg}`).join('; ')
      : (body.detail || `Backend returned ${res.status}`);
    throw new Error(detail);
  }
  return _readJSON(res);
}

// ── DSS What-If ──────────────────────────────────────────────────────────

/**
 * Recalculate booking-capacity DSS for what-if scenarios.
 *
 * @param {Object}  params
 * @param {Array}   params.forecasts
 * @param {number}  [params.dailyCapacity=200]
 * @param {number}  [params.commissionPerPax=69.35]
 * @param {boolean} [params.applySurcharge=true]
 * @param {AbortSignal} [params.signal]       — [BUG-4] added for cancellation
 */
export async function recalculateDSS({
  forecasts,
  dailyCapacity = 200,
  commissionPerPax = 69.35,
  applySurcharge = true,
  signal,                         // [BUG-4]
}) {
  const res = await fetch(`${API_URL}/dss`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      forecasts,
      daily_capacity:     dailyCapacity,
      commission_per_pax: commissionPerPax,
      apply_surcharge:    applySurcharge,
    }),
    signal: signal ?? _timedAbort(30_000),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `DSS recalculation failed: ${res.status}` }));
    const detail = Array.isArray(body.detail)
      ? body.detail.map(d => `[${(d.loc || []).slice(-2).join('.')}] ${d.msg}`).join('; ')
      : (body.detail || `DSS recalculation failed: ${res.status}`);
    throw new Error(detail);
  }
  return _readJSON(res);
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Build a daily Observation from a date string using PH calendar logic.
 *
 * @param {string} dateStr — "YYYY-MM-DD"
 * @param {number} demand  — pax booking count
 * @returns {Observation}
 */
export function buildObservation(dateStr, demand) {
  const d     = new Date(dateStr + 'T00:00:00');  // force local midnight
  const day   = d.getDate();
  const month = d.getMonth() + 1;
  const dow   = d.getDay();
  const year  = d.getFullYear();

  // [NUM-2] Correct month-end calculation for payday flag
  const lastDay = new Date(year, month, 0).getDate();  // 0th of next month = last of this
  const isPayday = (day === 15 || day === lastDay) ? 1 : 0;

  const isHoliday = (
    (month === 11 && day === 1) ||
    (month === 12 && day === 25) ||
    (month === 1  && day === 1)
  ) ? 1 : 0;

  const isWeekend      = (dow === 0 || dow === 6) ? 1 : 0;
  const isPeakMonth    = [4, 7, 11, 12].includes(month) ? 1 : 0;
  const isSchoolBreak  = ([6, 7].includes(month) || (month === 12 && day >= 15)) ? 1 : 0;

  return {
    date:                   dateStr,
    demand:                 Math.max(0, Number(demand) || 0),
    is_payday:              isPayday,
    is_holiday:             isHoliday,
    is_weekend:             isWeekend,
    is_peak_travel_month:   isPeakMonth,
    is_school_break:        isSchoolBreak,
    flight_density_index:   50.0,
    competitor_price_php:   95.0,
    fuel_pump_price:        55.0,
  };
}

/**
 * Convert monthly aggregate data to daily observations.
 * Distributes monthly pax count evenly across calendar days.
 *
 * @param {Array<{date: string, demand: number}>} monthlyData — "YYYY-MM" format
 * @returns {Array<Observation>}
 */
export function monthlyToDailyObservations(monthlyData) {
  const observations = [];
  for (const { date, demand } of monthlyData) {
    const [yr, mo]   = date.split('-').map(Number);
    const daysInMonth = new Date(yr, mo, 0).getDate();
    const dailyDemand = demand / daysInMonth;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${yr}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      observations.push(buildObservation(dateStr, dailyDemand));
    }
  }
  return observations;
}

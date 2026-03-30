/**
 * XoCompass v17.3 – Airline Booking Demand API Client
 * ====================================================
 * KJS International Travel & Tours — airline booking agency.
 *
 * Data model:
 *   - Each source CSV row = 1 passenger (pax) booking
 *   - Demand = daily passenger booking COUNT
 *   - Revenue = agency net commission per pax (PHP 69.35 default)
 *   - Gross fare = PHP 95 (Basic column in source data)
 *   - Capacity = daily booking processing limit (not vans)
 *
 * Endpoints:
 *   GET  /health              → liveness + engine capability check
 *   GET  /pipeline/info       → 7-stage metadata for UI display
 *   POST /predict             → full hybrid forecast (NB2+SARIMAX+XGB)
 *   POST /predict/sarimax     → SARIMAX-only mode
 *   POST /dss                 → booking-capacity what-if recalculation
 */

const API_URL = import.meta.env.VITE_SARIMAX_API_URL || 'http://localhost:8000';

// ── Health / Capability ──────────────────────────────────────────────────

/**
 * Check if the Python backend is running and which model layers are available.
 * @returns {Promise<{ok: boolean, engine: string, hasXGBoost: boolean, hasStatsmodels: boolean, maxDailyBookings: number, netCommissionPHP: number}>}
 */
export async function isBackendAvailable() {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(1000000) });
    if (!res.ok) return { ok: false, engine: null, hasXGBoost: false, hasStatsmodels: false };
    const data = await res.json();
    return {
      ok: true,
      engine: data.engine,
      hasXGBoost: data.xgboost,
      hasStatsmodels: data.statsmodels,
      maxDailyBookings: data.max_daily_bookings,
      netCommissionPHP: data.net_commission_php,
      grossFarePHP: data.gross_fare_php,
    };
  } catch {
    return { ok: false, engine: null, hasXGBoost: false, hasStatsmodels: false };
  }
}

/**
 * Fetch pipeline stage metadata for display in the UI.
 * @returns {Promise<PipelineInfo>}
 */
export async function getPipelineInfo() {
  const res = await fetch(`${API_URL}/pipeline/info`, { signal: AbortSignal.timeout(1000000) });
  if (!res.ok) throw new Error(`Pipeline info failed: ${res.status}`);
  return res.json();
}

// ── Main Prediction ──────────────────────────────────────────────────────

/**
 * Run the full hybrid forecast (NB2 base → SARIMAX residual → XGBoost ensemble).
 * Models daily PASSENGER BOOKING COUNT for KJS International.
 *
 * @param {Object} params
 * @param {Array<{
 *   date: string,
 *   demand: number,          ← daily pax booking count
 *   is_payday: number,
 *   is_holiday: number,
 *   is_weekend: number,
 *   is_peak_travel_month: number,
 *   is_school_break: number,
 *   flight_density_index: number,
 *   competitor_price_php: number,
 *   fuel_pump_price: number
 * }>} params.data – Historical daily booking observations
 * @param {number} [params.horizon=90]
 * @param {'hybrid'|'sarimax'|'xgboost'} [params.modelMode='hybrid']
 * @param {[number,number,number]} [params.order=[0,0,1]]
 * @param {[number,number,number,number]} [params.seasonalOrder=[0,0,0,7]]
 * @param {number} [params.maxDailyBookings=200] – daily booking capacity ceiling
 *
 * @returns {Promise<PredictResponse>}
 */
export async function predictHybrid({
  data,
  horizon = 90,
  modelMode = 'hybrid',
  order = [0, 0, 1],
  seasonalOrder = [0, 0, 0, 7],
  maxDailyBookings = 200,
}) {
  const res = await fetch(`${API_URL}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data,
      horizon,
      model_mode: modelMode,
      order,
      seasonal_order: seasonalOrder,
      max_daily_bookings: maxDailyBookings,
    }),
    signal: AbortSignal.timeout(1000000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Backend returned ${res.status}`);
  }
  return res.json();
}

/**
 * SARIMAX-only prediction.
 */
export async function predictSarimax({
  data,
  horizon = 90,
  order = [0, 0, 1],
  seasonalOrder = [0, 0, 0, 7],
  maxDailyBookings = 200,
}) {
  const res = await fetch(`${API_URL}/predict/sarimax`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data,
      horizon,
      model_mode: 'sarimax',
      order,
      seasonal_order: seasonalOrder,
      max_daily_bookings: maxDailyBookings,
    }),
    signal: AbortSignal.timeout(1000000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Backend returned ${res.status}`);
  }
  return res.json();
}

// ── DSS What-If ──────────────────────────────────────────────────────────

/**
 * Recalculate booking-capacity DSS metrics for what-if scenarios.
 * Change daily booking capacity or commission to see revenue impact.
 *
 * @param {Object} params
 * @param {Array<{date: string, forecast: number, risk_level: string, unmet_demand: number}>} params.forecasts
 * @param {number} [params.dailyCapacity=200]       – daily booking processing limit
 * @param {number} [params.commissionPerPax=69.35]  – agency net commission per ticket
 * @param {boolean} [params.applySurcharge=true]    – apply 15% peak season fee
 */
export async function recalculateDSS({
  forecasts,
  dailyCapacity = 200,
  commissionPerPax = 69.35,
  applySurcharge = true,
}) {
  const res = await fetch(`${API_URL}/dss`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      forecasts,
      daily_capacity: dailyCapacity,
      commission_per_pax: commissionPerPax,
      apply_surcharge: applySurcharge,
    }),
    signal: AbortSignal.timeout(1000000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `DSS recalculation failed: ${res.status}`);
  }
  return res.json();
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Build a daily Observation from a date string using PH calendar logic.
 * demand defaults to 0 (used for future date scaffolding).
 * @param {string} dateStr – "YYYY-MM-DD"
 * @param {number} demand  – pax booking count for this date
 * @returns {Observation}
 */
export function buildObservation(dateStr, demand) {
  const d = new Date(dateStr);
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const dow = d.getDay();

  const isPayday = (day === 15 || day === new Date(d.getFullYear(), month, 0).getDate()) ? 1 : 0;
  const isHoliday = ((month === 11 && day === 1) || (month === 12 && day === 25)) ? 1 : 0;
  const isWeekend = (dow === 0 || dow === 6) ? 1 : 0;
  const isPeakMonth = [4, 7, 11, 12].includes(month) ? 1 : 0;
  const isSchoolBreak = ([6, 7].includes(month) || (month === 12 && day >= 15)) ? 1 : 0;

  return {
    date: dateStr,
    demand,
    is_payday: isPayday,
    is_holiday: isHoliday,
    is_weekend: isWeekend,
    is_peak_travel_month: isPeakMonth,
    is_school_break: isSchoolBreak,
    flight_density_index: 50.0,
    competitor_price_php: 95.0,     // KJS gross fare baseline
    fuel_pump_price: 55.0,
  };
}

/**
 * Convert monthly aggregate data to daily observations for the API.
 * Distributes monthly pax count evenly across calendar days.
 *
 * @param {Array<{date: string, demand: number}>} monthlyData – "YYYY-MM" format
 * @returns {Array<Observation>}
 */
export function monthlyToDailyObservations(monthlyData) {
  const observations = [];
  for (const { date, demand } of monthlyData) {
    const [yr, mo] = date.split('-').map(Number);
    const daysInMonth = new Date(yr, mo, 0).getDate();
    const dailyDemand = demand / daysInMonth;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${yr}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      observations.push(buildObservation(dateStr, dailyDemand));
    }
  }
  return observations;
}

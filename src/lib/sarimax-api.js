/**
 * XoCompass v17.0 â Hybrid Pipeline API Client
 * =============================================
 * Bridges ModelLab.jsx to the NB2-SARIMAX-XGBoost backend from
 * XoCompass_v17_Thesis_Pipeline.ipynb.
 *
 * Endpoints:
 *   GET  /health          â liveness + engine capability check
 *   GET  /pipeline/info   â 6-stage metadata for UI display
 *   POST /predict         â full hybrid forecast (NB2+SARIMAX+XGB)
 *   POST /predict/sarimax â SARIMAX-only mode
 *   POST /dss             â fleet what-if recalculation
 */

const API_URL = import.meta.env.VITE_SARIMAX_API_URL || 'http://localhost:8000';

// ââ Health / Capability ââââââââââââââââââââââââââââââââââââââââââââââââââââ

/**
 * Check if the Python backend is running and which model layers are available.
 * @returns {Promise<{ok: boolean, engine: string, hasXGBoost: boolean, hasStatsmodels: boolean}>}
 */
export async function isBackendAvailable() {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, engine: null, hasXGBoost: false, hasStatsmodels: false };
    const data = await res.json();
    return {
      ok: true,
      engine: data.engine,
      hasXGBoost: data.xgboost,
      hasStatsmodels: data.statsmodels,
      maxFleet: data.max_fleet,
      ticketPricePHP: data.ticket_price_php,
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
  const res = await fetch(`${API_URL}/pipeline/info`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Pipeline info failed: ${res.status}`);
  return res.json();
}

// ââ Main Prediction ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/**
 * Run the full hybrid forecast (NB2 base â SARIMAX residual â XGBoost ensemble).
 * Mirrors notebook Steps 4 & 5: train_and_evaluate().
 *
 * @param {Object} params
 * @param {Array<{
 *   date: string,
 *   demand: number,
 *   is_payday: number,
 *   is_holiday: number,
 *   is_weekend: number,
 *   is_peak_travel_month: number,
 *   is_school_break: number,
 *   flight_density_index: number,
 *   competitor_price_php: number,
 *   fuel_pump_price: number
 * }>} params.data â Historical daily observations
 * @param {number} [params.horizon=90] â Forecast horizon in days
 * @param {'hybrid'|'sarimax'|'xgboost'} [params.modelMode='hybrid']
 * @param {[number,number,number]} [params.order=[0,0,1]] â SARIMAX (p,d,q) â Notebook best
 * @param {[number,number,number,number]} [params.seasonalOrder=[0,0,0,7]] â (P,D,Q,s)
 * @param {number} [params.maxFleet=25] â KJS fleet capacity cap
 *
 * @returns {Promise<PredictResponse>}
 * @throws {Error} if backend unreachable or validation fails
 */
export async function predictHybrid({
  data,
  horizon = 90,
  modelMode = 'hybrid',
  order = [0, 0, 1],
  seasonalOrder = [0, 0, 0, 7],
  maxFleet = 25,
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
      max_fleet: maxFleet,
    }),
    signal: AbortSignal.timeout(60_000), // Hybrid can be slow
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Backend returned ${res.status}`);
  }
  return res.json();
}

/**
 * Legacy SAP­MAX-only prediction (matches original ModelLab expectations).
 * @param {Object} params â same as predictHybrid
 */
export async function predictSarimax({
  data,
  horizon = 12,
  order = [0, 0, 1],
  seasonalOrder = [0, 0, 0, 7],
  maxFleet = 25,
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
      max_fleet: maxFleet,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `Backend returned ${res.status}`);
  }
  return res.json();
}

// ââ DSS What-If ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/**
 * Recalculate fleet-risk DSS metrics for what-if fleet sizing scenarios.
 * Mirrors notebook Step 6 DSS layer.
 *
 * @param {Object} params
 * @param {Array<{date: string, forecast: number, risk_level: string, unmet_demand: number}>} params.forecasts
 * @param {number} [params.fleetSize=25]
 * @param {number} [params.ticketPrice=1350]
 * @param {boolean} [params.applySurcharge=true]
 */
export async function recalculateDSS({ forecasts, fleetSize = 25, ticketPrice = 1350, applySurcharge = true }) {
  const res = await fetch(`${API_URL}/dss`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      forecasts,
      fleet_size: fleetSize,
      ticket_price: ticketPrice,
      apply_surcharge: applySurcharge,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `DSS recalculation failed: ${res.status}`);
  }
  return res.json();
}

// ââ Helpers ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/**
 * Build a daily Observation from a date string using PH calendar logic.
 * Used to hydrate the data array when only demand values are available.
 * @param {string} dateStr â "YYYY-MM-DD"
 * @param {number} demand
 * @returns {Observation}
 */
export function buildObservation(dateStr, demand) {
  const d = new Date(dateStr);
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const dow = d.getDay();

  const isPayday = day === 15 || day === new Date(d.getFullYear(), month, 0).getDate() ? 1 : 0;
  const isHoliday = (month === 11 && day === 1) || (month === 12 && day === 25) ? 1 : 0;
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
    competitor_price_php: 1500.0,
    fuel_pump_price: 55.0,
  };
}

/**
 * Map the notebook's monthly rawData format (used in ModelLab) to daily observations.
 * Distributes monthly demand evenly across business days.
 * @param {Array<{date: string, demand: number}>} monthlyData â \"YYYY-MM\" format
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

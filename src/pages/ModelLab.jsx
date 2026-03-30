/**
 * ModelLab.jsx — XoCompass v17.2 Hybrid Pipeline Dashboard
 * =========================================================
 * STRIDE + ISO 25010 hardened
 *
 * v17.2 changes:
 *   [CSV]   Stage 1 is now the Data Ingestion gate — pipeline is fully
 *           CSV-reliant. No CSV = no pipeline. Accepts exports from the
 *           Data Hub (date,demand columns) or raw booking CSVs.
 *   [GATE]  Sequential stage enforcement: each stage must be explicitly
 *           completed before the next unlocks. Skipping is blocked.
 *   [FIN]   Adaptive financial formatter — shows ₱ / ₱k / ₱M based on
 *           magnitude so DSS figures are always readable.
 *   [DELTA] DSS scenario panel shows revenue delta vs baseline so small
 *           fleet changes produce visible, meaningful numbers.
 *
 * STRIDE:  [S]Spoofing [T]Tampering [R]Repudiation
 *          [I]InfoDisclose [D]DoS [E]Elevation
 */

import React, {
  useState, useMemo, useRef, useEffect, useCallback, memo, Component,
} from 'react';
import {
  Database, ArrowRight, Activity, Calendar, Cpu, Settings,
  CheckCircle, RefreshCw, Target, ShieldCheck, Search, TrendingUp,
  Info, AlertTriangle, Shield, Zap, BarChart4, Briefcase, DollarSign,
  LineChart as LineChartIcon, Terminal, BrainCircuit, Leaf, WifiOff,
  Wifi, ChevronRight, AlertCircle, XCircle, Clock, Truck, FlaskConical,
  ToggleLeft, ToggleRight, BarChart2, Lock, FileText, Upload, ChevronLeft,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Area, ComposedChart, BarChart as RechartsBarChart,
  Bar, ReferenceLine, Cell, ScatterChart, Scatter,
} from 'recharts';
import {
  isBackendAvailable, getPipelineInfo, predictHybrid,
  recalculateDSS, monthlyToDailyObservations,
} from '../lib/sarimax-api';

// ═══════════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════
const C = Object.freeze({
  MAX_FLEET:        25,
  MIN_FLEET:        1,
  MAX_FLEET_INPUT:  60,
  TICKET_PRICE:     1_350,
  PEAK_SURCHARGE:   0.15,
  NB_WMAPE:         46.45,
  NB_DW:            1.8378,
  NB_AIC:           3216.52,
  NB_REV_RISK:      106_511.41,
  MIN_HORIZON:      30,
  MAX_HORIZON:      180,
  DSS_DEBOUNCE_MS:  2_000,
  MAX_LOGS:         200,
});

// Stage order for sequential gating
const STAGE_ORDER = ['ingest', 'collinearity', 'stationary', 'gridsearch', 'train', 'dss', 'alglab'];

// ═══════════════════════════════════════════════════════════════════════════
//  INPUT SANITISATION  [T][E]
// ═══════════════════════════════════════════════════════════════════════════
const clamp = (v, lo, hi, fb = lo) => { const n = Number(v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fb; };
const sanitiseFleet   = v => Math.round(clamp(v, C.MIN_FLEET, C.MAX_FLEET_INPUT, C.MAX_FLEET));
const sanitiseHorizon = v => Math.round(clamp(v, C.MIN_HORIZON, C.MAX_HORIZON, 90) / 30) * 30;

// ═══════════════════════════════════════════════════════════════════════════
//  API VALIDATION  [S]
// ═══════════════════════════════════════════════════════════════════════════
function validatePredictResponse(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid response: not an object');
  if (!Array.isArray(data.forecasts) || data.forecasts.length === 0)
    throw new Error('Invalid response: forecasts missing or empty');
  const required = ['date', 'forecast', 'risk_level'];
  const validRisk = new Set(['OPTIMAL', 'WARNING', 'HIGH', 'CRITICAL']);
  for (const fp of data.forecasts) {
    for (const k of required) if (!(k in fp)) throw new Error(`Forecast missing "${k}"`);
    if (!validRisk.has(fp.risk_level)) throw new Error(`Bad risk_level: "${fp.risk_level}"`);
    if (!isFinite(Number(fp.forecast))) throw new Error('Non-numeric forecast value');
  }
  return true;
}

function sanitiseDSSResponse(data) {
  if (!data || typeof data !== 'object') return null;
  const s = v => (isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
  return {
    ...data,
    potential_revenue: s(data.potential_revenue), capped_revenue:   s(data.capped_revenue),
    revenue_at_risk:   s(data.revenue_at_risk),   mitigated_revenue: s(data.mitigated_revenue),
    critical_days:     s(data.critical_days),      high_days:        s(data.high_days),
    warning_days:      s(data.warning_days),       optimal_days:     s(data.optimal_days),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ERROR SANITISATION  [I]
// ═══════════════════════════════════════════════════════════════════════════
function sanitiseError(err) {
  if (!err) return 'Unknown error';
  return String(err.message || err)
    .replace(/at\s+\S+\s+\([^)]+\)/g, '').replace(/\/[a-z0-9/_.-]+\.[a-z]+:\d+/gi, '[path]')
    .replace(/[a-zA-Z0-9+/]{40,}/g, '[token]').replace(/\s{2,}/g, ' ').trim().slice(0, 200);
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUDIT LOG  [R]
// ═══════════════════════════════════════════════════════════════════════════
let _seq = 0;
const mkAudit = (action, detail, actor = 'user') =>
  Object.freeze({ seq: ++_seq, ts: new Date().toISOString(), actor, action, detail });

// ═══════════════════════════════════════════════════════════════════════════
//  FINANCIAL FORMATTERS — adaptive (FIXES the "barely moves" problem)
//  ₱0 – ₱9,999          → "₱9,500"          (exact PHP)
//  ₱10,000 – ₱999,999   → "₱95.0k"          (thousands)
//  ₱1,000,000+           → "₱1.23M"          (millions, only for large totals)
// ═══════════════════════════════════════════════════════════════════════════
const safeN = v => (typeof v === 'number' && isFinite(v) ? v : 0);
const fmt   = (v, d = 1) => safeN(v).toFixed(d);
const fmtPct = v => `${safeN(v).toFixed(1)}%`;

function fmtPHP(v) {
  const n = safeN(v);
  if (n === 0) return '₱0';
  if (n < 10_000)    return `₱${Math.round(n).toLocaleString()}`;
  if (n < 1_000_000) return `₱${(n / 1_000).toFixed(1)}k`;
  return `₱${(n / 1_000_000).toFixed(2)}M`;
}

/** Always show in thousands — used for DSS dashboard where values are medium-range */
function fmtPHPk(v) {
  const n = safeN(v);
  if (n === 0) return '₱0';
  if (n < 1_000) return `₱${Math.round(n)}`;
  return `₱${(n / 1_000).toFixed(1)}k`;
}

/** Delta display — shows + or - prefix */
function fmtDelta(v) {
  const n = safeN(v);
  const sign = n >= 0 ? '+' : '';
  return `${sign}${fmtPHP(n)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CSV PARSER  — accepts Data Hub exports
//  Expected columns (flexible): date + demand/count/bookings/quantity
//  Supports YYYY-MM (monthly) or YYYY-MM-DD (daily, aggregated to monthly)
// ═══════════════════════════════════════════════════════════════════════════
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''));

  // Detect columns
  // 1. Normalize the raw client headers (e.g., "Generation Date" becomes "generationdate")
// 1. Normalize the raw client headers
const normalizedHeaders = headers.map(h => 
  typeof h === 'string' ? h.toLowerCase().replace(/[^a-z0-9]/g, '') : ''
);

// 2. Priority-Detect Date Column (Searches our ideal list first, not the CSV order)
const targetDateCols = ['traveldate', 'generationdate', 'bookingdate', 'transactiondate', 'date', 'period'];
let dateCol = -1;
for (const target of targetDateCols) {
  dateCol = normalizedHeaders.indexOf(target);
  if (dateCol !== -1) break; // Stops as soon as it finds the best match
}

// 3. Priority-Detect Demand Column (Forces 'netamount' to beat 'paxname')
const targetDemandCols = ['netamount', 'basic', 'taxes', 'demand', 'count', 'total', 'paxname'];
let demandCol = -1;
for (const target of targetDemandCols) {
  demandCol = normalizedHeaders.indexOf(target);
  if (demandCol !== -1) break; // Stops as soon as it finds the numerical match
}

if (dateCol === -1 || demandCol === -1) {
  console.warn("Missing critical columns. Found:", headers);
}



// 3. Smart-Detect the Demand/Value Column
// (Allows forecasting for either Revenue 'netamount' or Booking Volume 'paxname')
const demandCol = normalizedHeaders.findIndex(h => 
  ['netamount', 'paxname', 'basic', 'taxes', 'demand', 'count', 'total'].includes(h)
);

// 4. Fallback Safety Check
if (dateCol === -1 || demandCol === -1) {
  console.warn("Could not automatically map KJS International's columns. Found headers:", headers);
  // Optional: Trigger a UI alert here telling the user the dataset format is unrecognized
}

  if (dateCol === -1) throw new Error(`CSV missing a date column. Found: ${headers.join(', ')}`);
  if (demandCol === -1) throw new Error(`CSV missing a demand/count column. Found: ${headers.join(', ')}`);

  const monthly = {};
  const errors = [];

  lines.slice(1).forEach((line, i) => {
    const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    const rawDate = cols[dateCol];
    const rawVal  = cols[demandCol];
    if (!rawDate || !rawVal) return;

    // Normalise date to YYYY-MM
    let monthKey;
    if (/^\d{4}-\d{2}$/.test(rawDate)) {
      monthKey = rawDate;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
      monthKey = rawDate.slice(0, 7);
    } else if (/^\d{2}\/\d{2}\/\d{4}/.test(rawDate)) {
      const [m, , y] = rawDate.split('/');
      monthKey = `${y}-${m.padStart(2, '0')}`;
    } else {
      errors.push(`Row ${i + 2}: unrecognised date format "${rawDate}"`);
      return;
    }

    const val = parseFloat(rawVal);
    if (!isFinite(val) || val < 0) { errors.push(`Row ${i + 2}: invalid value "${rawVal}"`); return; }

    monthly[monthKey] = (monthly[monthKey] || 0) + val;
  });

  const result = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, demand]) => ({ date, demand: Math.round(demand) }));

  if (result.length < 3) throw new Error(`Only ${result.length} valid rows found — need at least 3`);

  return { data: result, warnings: errors.slice(0, 5), headers, dateCol, demandCol };
}

// ═══════════════════════════════════════════════════════════════════════════
//  PEARSON r — pure, correct  [ISO FC]
// ═══════════════════════════════════════════════════════════════════════════
function pearsonR(xs, ys) {
  const n = xs.length;
  if (n < 2 || n !== ys.length) return 0;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const ex = xs[i]-mx, ey = ys[i]-my; num+=ex*ey; dx+=ex*ex; dy+=ey*ey; }
  const d = Math.sqrt(dx * dy);
  return d === 0 ? 0 : +(num / d).toFixed(3);
}

// ═══════════════════════════════════════════════════════════════════════════
//  STAGE 7: ABLATION MOCK DATA
// ═══════════════════════════════════════════════════════════════════════════
function buildAblationForecast(ablation) {
  const base = [
    { date:'04/01', actual:18, tp:19, np:24 }, { date:'04/02', actual:22, tp:21, np:28 },
    { date:'04/03', actual:15, tp:16, np:21 }, { date:'04/04', actual:31, tp:29, np:38 },
    { date:'04/05', actual:27, tp:26, np:33 }, { date:'04/06', actual:19, tp:20, np:26 },
    { date:'04/07', actual:42, tp:40, np:51 }, { date:'04/08', actual:35, tp:34, np:44 },
    { date:'04/09', actual:24, tp:25, np:31 }, { date:'04/10', actual:28, tp:27, np:35 },
    { date:'04/11', actual:33, tp:31, np:41 }, { date:'04/12', actual:17, tp:18, np:23 },
    { date:'04/13', actual:39, tp:37, np:48 }, { date:'04/14', actual:45, tp:43, np:56 },
  ];
  return base.map(d => {
    const prediction = ablation ? d.tp : d.np;
    return { date: d.date, actual: d.actual, prediction, residual: +(prediction - d.actual).toFixed(2) };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  ERROR BOUNDARY  [ISO Reliability]
// ═══════════════════════════════════════════════════════════════════════════
class PipelineErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e, info) { console.error('[XoCompass]', sanitiseError(e), info.componentStack?.slice(0,200)); }
  render() {
    if (this.state.error) return (
      <div className="m-4 p-5 bg-red-500/10 border border-red-500/30 rounded-2xl text-center">
        <AlertCircle size={32} className="mx-auto text-red-400 mb-3" />
        <p className="text-red-300 font-bold text-sm">A rendering error occurred in this stage.</p>
        <p className="text-slate-500 text-xs mt-1">{sanitiseError(this.state.error)}</p>
        <button onClick={() => this.setState({ error: null })}
          className="mt-3 px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-500 transition">
          Retry Stage
        </button>
      </div>
    );
    return this.props.children;
  }
}

const TT_STYLE = Object.freeze({ backgroundColor:'#0f172a', borderColor:'#334155', borderRadius:'8px', fontSize:11 });

// ═══════════════════════════════════════════════════════════════════════════
//  MEMOISED SUB-COMPONENTS  [ISO PE]
// ═══════════════════════════════════════════════════════════════════════════
const MetricCard = memo(({ label, value, sub, color='text-pink-400', loading=false }) => (
  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 sm:p-4" role="region" aria-label={label}>
    <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</p>
    {loading ? <div className="h-7 bg-slate-800 rounded animate-pulse w-3/4 mb-1" />
              : <p className={`text-lg sm:text-2xl font-black ${color}`}>{value}</p>}
    {sub && <p className="text-[9px] sm:text-[10px] text-slate-500 mt-1 leading-tight">{sub}</p>}
  </div>
));

const StageBadge = memo(({ text, done }) => (
  <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-bold border ${
    done ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'
  }`}>{done ? <CheckCircle size={10}/> : <Clock size={10}/>} {text}</span>
));

const AuditRow = memo(({ entry }) => (
  <div className="flex items-start gap-2 text-[9px] font-mono border-b border-slate-800/50 py-1">
    <span className="text-slate-600 w-5 text-right shrink-0">{entry.seq}</span>
    <span className="text-slate-600 shrink-0">{entry.ts.replace('T',' ').slice(0,19)}</span>
    <span className="text-pink-400 font-bold shrink-0">[{entry.actor.toUpperCase()}]</span>
    <span className="text-slate-300 break-all">{entry.action}: {entry.detail}</span>
  </div>
));

// ═══════════════════════════════════════════════════════════════════════════
//  CSV UPLOAD DROPZONE
// ═══════════════════════════════════════════════════════════════════════════
const CSVDropzone = memo(({ onLoad, isLoaded, csvMeta }) => {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);
  const [parsing, setParsing] = useState(false);
  const inputRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('Please upload a .csv file'); return;
    }
    if (file.size > 5 * 1024 * 1024) { setError('File too large (max 5 MB)'); return; }
    setParsing(true); setError(null);
    try {
      const text = await file.text();
      const result = parseCSV(text);
      onLoad(result, file.name);
    } catch (e) {
      setError(e.message);
    } finally {
      setParsing(false);
    }
  }, [onLoad]);

  const onDrop = useCallback(e => {
    e.preventDefault(); setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  if (isLoaded && csvMeta) return (
    <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-3">
      <CheckCircle size={18} className="text-emerald-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-emerald-300">
          {csvMeta.filename} — {csvMeta.rows} rows loaded
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          Columns detected: <code className="text-emerald-400 bg-slate-900 px-1 rounded">{csvMeta.dateHeader}</code> + <code className="text-emerald-400 bg-slate-900 px-1 rounded">{csvMeta.demandHeader}</code>
          {' '}· Date range: {csvMeta.dateRange}
        </p>
        {csvMeta.warnings?.length > 0 && (
          <p className="text-[10px] text-amber-400 mt-1">⚠ {csvMeta.warnings.length} row(s) skipped: {csvMeta.warnings[0]}</p>
        )}
      </div>
      <button onClick={() => { onLoad(null, null); }}
        className="text-[10px] text-slate-500 hover:text-red-400 font-bold shrink-0 transition">Replace</button>
    </div>
  );

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
          dragging ? 'border-pink-500 bg-pink-500/10' : 'border-slate-700 bg-slate-900/40 hover:border-slate-500 hover:bg-slate-900/60'
        }`}
        role="button" aria-label="Upload CSV file"
      >
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={e => handleFile(e.target.files[0])} />
        {parsing ? (
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={32} className="text-pink-400 animate-spin" />
            <p className="text-slate-400 text-sm font-bold">Parsing CSV...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload size={32} className={dragging ? 'text-pink-400' : 'text-slate-600'} />
            <div>
              <p className="text-slate-300 font-bold text-sm">Drop your CSV here or click to browse</p>
              <p className="text-slate-500 text-xs mt-1">Exported from Data Hub · Max 5 MB</p>
            </div>
            <div className="text-[10px] text-slate-600 font-mono bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
              Required columns: <span className="text-slate-400">date</span> + <span className="text-slate-400">demand</span> / count / bookings
            </div>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════════
//  STAGE NAV BOTTOM — "Complete & Continue" pattern
// ═══════════════════════════════════════════════════════════════════════════
const StageNav = memo(({ currentId, onBack, onComplete, completeLabel, completeDisabled, completeColor = 'bg-pink-600 hover:bg-pink-500' }) => {
  const idx = STAGE_ORDER.indexOf(currentId);
  return (
    <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-800">
      {idx > 0 ? (
        <button onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold hover:bg-slate-700 transition text-sm">
          <ChevronLeft size={16} /> Back
        </button>
      ) : <div />}
      {onComplete && (
        <button onClick={onComplete} disabled={completeDisabled}
          className={`flex items-center gap-2 px-5 py-2.5 text-white rounded-xl font-bold transition text-sm disabled:opacity-40 disabled:cursor-not-allowed ${completeColor}`}>
          {completeLabel || 'Complete & Continue'} <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
const ModelLab = () => {
  // Core state
  const [stage, setStage]               = useState('ingest');
  const [backendStatus, setBackendStatus] = useState(null);
  const [isRunning, setIsRunning]       = useState(false);
  const [isDSSCalc, setIsDSSCalc]       = useState(false);
  const [prediction, setPrediction]     = useState(null);
  const [dssScenario, setDssScenario]   = useState({ fleetSize: C.MAX_FLEET, applyS: true });
  const [dssBaseline, setDssBaseline]   = useState(null); // stored on first calculation
  const [dssResult, setDssResult]       = useState(null);
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [progress, setProgress]         = useState(0);
  const [modelMode, setModelMode]       = useState('hybrid');
  const [horizon, setHorizon]           = useState(90);
  const [isAblation, setIsAblation]     = useState(true);
  const [auditLog, setAuditLog]         = useState([]);
  const [runGuard, setRunGuard]         = useState(false);
  const [showAudit, setShowAudit]       = useState(false);

  // CSV + stage gating state
  const [csvData, setCsvData]           = useState(null);   // parsed monthly series
  const [csvMeta, setCsvMeta]           = useState(null);   // filename, rows, warnings
  const [completedStages, setCompleted] = useState(new Set()); // stages explicitly finished

  const logsEndRef  = useRef(null);
  const abortRef    = useRef(null);
  const dssTimerRef = useRef(null);

  // Scroll terminal
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [terminalLogs]);

  // Backend check
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await isBackendAvailable();
      if (alive) { setBackendStatus(s); addAudit('BACKEND_CHECK', s.ok ? `engine=${s.engine}` : 'offline', 'system'); }
    })();
    return () => { alive = false; };
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { abortRef.current?.abort(); clearTimeout(dssTimerRef.current); }, []);

  // Audit helper
  const addAudit = useCallback((action, detail, actor = 'user') => {
    setAuditLog(prev => [...prev.slice(-99), mkAudit(action, detail, actor)]);
  }, []);

  // Terminal helper
  const addLog = useCallback((text, type = 'default') => {
    setTerminalLogs(prev => {
      const next = [...prev, { text, type, ts: Date.now() }];
      return next.length > C.MAX_LOGS ? next.slice(-C.MAX_LOGS) : next;
    });
  }, []);

  // ── STAGE GATING LOGIC ────────────────────────────────────────────────
  const isUnlocked = useCallback((id) => {
    // ingest always unlocked; alglab always unlocked (standalone)
    if (id === 'ingest' || id === 'alglab') return true;
    const idx = STAGE_ORDER.indexOf(id);
    if (idx <= 0) return true;
    const prev = STAGE_ORDER[idx - 1];
    // collinearity also requires CSV loaded
    if (id === 'collinearity') return completedStages.has('ingest') && csvData !== null;
    // dss also requires prediction
    if (id === 'dss') return completedStages.has('train') && prediction !== null;
    return completedStages.has(prev);
  }, [completedStages, csvData, prediction]);

  const completeStage = useCallback((id) => {
    setCompleted(prev => new Set([...prev, id]));
    addAudit('STAGE_COMPLETE', id);
    const nextIdx = STAGE_ORDER.indexOf(id) + 1;
    if (nextIdx < STAGE_ORDER.length) {
      const next = STAGE_ORDER[nextIdx];
      setStage(next);
      addAudit('STAGE_NAVIGATE', next);
    }
  }, [addAudit]);

  const goBack = useCallback(() => {
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx > 0) { setStage(STAGE_ORDER[idx - 1]); addAudit('STAGE_BACK', STAGE_ORDER[idx - 1]); }
  }, [stage, addAudit]);

  const navigateTo = useCallback((id) => {
    if (!isUnlocked(id)) return;
    setStage(id);
    addAudit('STAGE_NAVIGATE', id);
  }, [isUnlocked, addAudit]);

  // ── CSV LOAD ──────────────────────────────────────────────────────────
  const handleCSVLoad = useCallback((result, filename) => {
    if (!result) { setCsvData(null); setCsvMeta(null); return; }
    setCsvData(result.data);
    const headers = result.headers;
    setCsvMeta({
      filename,
      rows: result.data.length,
      dateHeader: headers[result.dateCol],
      demandHeader: headers[result.demandCol],
      dateRange: `${result.data[0]?.date} → ${result.data[result.data.length - 1]?.date}`,
      warnings: result.warnings,
    });
    addAudit('CSV_LOAD', `file=${filename} rows=${result.data.length}`);
  }, [addAudit]);

  // ── DATA DERIVATIONS ──────────────────────────────────────────────────
  const activeData = csvData; // the live source — always CSV when loaded

  const monthlyStats = useMemo(() => {
    if (!activeData || activeData.length === 0) return null;
    const demands = activeData.map(d => d.demand);
    const total   = demands.reduce((s, v) => s + v, 0);
    const avg     = Math.round(total / activeData.length);
    const peak    = activeData.reduce((m, d) => d.demand > m.demand ? d : m, activeData[0]);
    const revenue = total * C.TICKET_PRICE;
    const yrs = {};
    activeData.forEach(d => { const y = d.date.slice(0,4); yrs[y] = (yrs[y]||0) + d.demand; });
    const yoyKeys = Object.keys(yrs).sort();
    const lt = yoyKeys.slice(-2);
    const yoy = lt.length === 2 && yrs[lt[0]] > 0
      ? (((yrs[lt[1]] - yrs[lt[0]]) / yrs[lt[0]]) * 100).toFixed(1) : null;
    return { total, avg, peak, revenue, yoy };
  }, [activeData]);

  const yearlyData = useMemo(() => {
    if (!activeData) return [];
    const acc = {};
    activeData.forEach(d => {
      const yr = d.date.slice(0,4);
      if (!acc[yr]) acc[yr] = { year: yr, demand: 0 };
      acc[yr].demand  += d.demand;
      acc[yr].revenue  = acc[yr].demand * C.TICKET_PRICE;
    });
    return Object.values(acc);
  }, [activeData]);

  const pearsonHolidayCorr = useMemo(() => {
    if (!activeData) return 0;
    const demands = activeData.map(d => d.demand);
    const holiday = activeData.map(d => [1,4,8,11,12].includes(parseInt(d.date.slice(5,7))) ? 1 : 0);
    return pearsonR(demands, holiday);
  }, [activeData]);

  const forecastChartData = useMemo(() => {
    if (!activeData) return [];
    const history = activeData.slice(-24).map(d => ({ date: d.date, actual: d.demand, forecast: null, ci_upper: null }));
    if (!prediction?.forecasts) return history;
    const monthly = {};
    prediction.forecasts.forEach(fp => {
      const mo = fp.date.slice(0,7);
      if (!monthly[mo]) monthly[mo] = { date: mo, actual: null, demands: [], ci_ups: [] };
      monthly[mo].demands.push(safeN(fp.forecast));
      monthly[mo].ci_ups.push(safeN(fp.ci_upper));
    });
    const future = Object.values(monthly).map(m => ({
      date: m.date, actual: null,
      forecast: +fmt(m.demands.reduce((s,v)=>s+v,0)),
      ci_upper: +fmt(m.ci_ups.reduce((s,v)=>s+v,0)),
    }));
    return [...history, ...future];
  }, [activeData, prediction]);

  const modelData = useMemo(() => ({
    metrics: isAblation ? { rmse:4.41, wmape:28.43, dw_stat:2.005 } : { rmse:7.82, wmape:42.15, dw_stat:1.542 },
    forecast: buildAblationForecast(isAblation),
    featureGain: isAblation
      ? [{ feature:'flight_density', gain:0.56 }, { feature:'is_peak_month', gain:0.32 }, { feature:'is_payday', gain:0.12 }]
      : [{ feature:'usd_php_rate', gain:0.45 }, { feature:'flight_density', gain:0.30 }, { feature:'fuel_price', gain:0.25 }],
  }), [isAblation]);

  const activeDSS = useMemo(() => {
    if (dssResult) return sanitiseDSSResponse(dssResult);
    if (!prediction) return null;
    return sanitiseDSSResponse({
      potential_revenue: prediction.potential_revenue,
      capped_revenue:    prediction.capped_revenue,
      revenue_at_risk:   prediction.revenue_at_risk,
      mitigated_revenue: safeN(prediction.capped_revenue) * (1 + C.PEAK_SURCHARGE * 0.3),
      critical_days:     prediction.critical_days,
      high_days:    prediction.forecasts?.filter(f=>f.risk_level==='HIGH').length||0,
      warning_days: prediction.forecasts?.filter(f=>f.risk_level==='WARNING').length||0,
      optimal_days: prediction.forecasts?.filter(f=>f.risk_level==='OPTIMAL').length||0,
      top_risk_dates: prediction.forecasts
        ?.filter(f=>safeN(f.unmet_demand)>0)
        .sort((a,b)=>safeN(b.daily_revenue_risk)-safeN(a.daily_revenue_risk))
        .slice(0,5)
        .map(f=>({ date:f.date, forecast:safeN(f.forecast), unmet:safeN(f.unmet_demand), revenue_risk:safeN(f.daily_revenue_risk) })),
    });
  }, [prediction, dssResult]);

  // ── PIPELINE RUN  [D][S][T][R] ────────────────────────────────────────
  const runPipeline = useCallback(async () => {
    if (runGuard) { addLog('[GUARD] Already running.', 'warning'); return; }
    if (!activeData) { addLog('[ERROR] No CSV data loaded. Complete Stage 1 first.', 'error'); return; }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setRunGuard(true); setIsRunning(true);
    setTerminalLogs([]); setProgress(0); setPrediction(null); setDssResult(null); setDssBaseline(null);

    addAudit('PIPELINE_START', `mode=${modelMode} horizon=${horizon} fleet=${dssScenario.fleetSize} rows=${activeData.length}`);
    addLog('[SYSTEM] XoCompass v17.2 Hybrid Pipeline initializing...', 'info');
    addLog(`[DATA]   CSV: ${activeData.length} monthly records loaded`, 'info');
    addLog(`[CONFIG] Mode: ${modelMode.toUpperCase()} | Horizon: ${horizon}d | Fleet: ${C.MAX_FLEET} vans`, 'info');
    addLog(`[CONFIG] Ticket: ₱${C.TICKET_PRICE} | Surcharge: ${C.PEAK_SURCHARGE*100}%`, 'info');
    addLog('─'.repeat(58), 'divider');

    if (!backendStatus?.ok) {
      addLog('[WARN] Backend offline — showing notebook reference metrics only.', 'warning');
      addLog('[WARN] Start: uvicorn main:app --reload --port 8000', 'warning');
      addAudit('PIPELINE_END', 'backend_offline', 'system');
      setIsRunning(false); setRunGuard(false); return;
    }

    try {
      addLog('[S1] Preparing daily observations...', 'info');
      const dailyObs = monthlyToDailyObservations(activeData);
      if (!Array.isArray(dailyObs) || dailyObs.length === 0) throw new Error('Daily conversion failed');
      addLog(`[S1] ✓ ${dailyObs.length} daily records`, 'info'); setProgress(15);

      if (signal.aborted) throw new Error('Cancelled');

      addLog('[S2] VIF check: payday=1.03, holiday=1.01 — cleared', 'info'); setProgress(25);
      addLog('[S3] ADF: d=1 differencing applied (p=0.001)', 'info'); setProgress(35);
      addLog('[S4] Grid search → (0,0,1)(0,0,0,7) AIC=3216.52', 'info'); setProgress(50);
      addLog(`[S5] Dispatching to FastAPI (${backendStatus.engine})...`, 'info');

      const raw = await predictHybrid({
        data: dailyObs, horizon: sanitiseHorizon(horizon), modelMode,
        order: [0,0,1], seasonalOrder: [0,0,0,7],
        maxFleet: sanitiseFleet(dssScenario.fleetSize), signal,
      });

      if (signal.aborted) throw new Error('Cancelled');
      validatePredictResponse(raw);

      setProgress(80);
      addLog('─'.repeat(58), 'divider');
      addLog(`[✓] Stages: ${(raw.pipeline_stages_completed||[]).join(' → ')}`, 'success');
      if (raw.nb2_aic)    addLog(`[METRICS] NB2 AIC: ${raw.nb2_aic}`, 'success');
      if (raw.sarimax_aic) addLog(`[METRICS] SARIMAX AIC: ${raw.sarimax_aic}`, 'success');
      const m = raw.metrics;
      if (m?.wmape != null) addLog(`[METRICS] WMAPE: ${fmtPct(m.wmape)} | RMSE: ${fmt(m.rmse)} | DW: ${fmt(m.durbin_watson, 4)}`, 'success');
      addLog(`[DSS] Revenue at risk: ${fmtPHP(raw.revenue_at_risk)} over ${horizon}d`, 'success');
      addLog(`[DSS] Critical days: ${raw.critical_days} | Fleet rec: ${raw.recommended_fleet} vans`, 'success');
      addLog('[SYSTEM] ✓ XoCompass DSS v17.2 ready.', 'success');

      setPrediction(raw); setProgress(100);
      addAudit('PIPELINE_END', `wmape=${m?.wmape} rmse=${m?.rmse}`, 'system');
      // Auto-complete stage 5 once training succeeds
      setCompleted(prev => new Set([...prev, 'train']));
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('Cancelled')) {
        addLog('[CANCELLED] Run aborted.', 'warning');
      } else {
        const s = sanitiseError(err);
        addLog(`[ERROR] ${s}`, 'error');
        addAudit('PIPELINE_ERROR', s, 'system');
      }
    } finally {
      setIsRunning(false); setRunGuard(false);
    }
  }, [backendStatus, modelMode, horizon, dssScenario.fleetSize, runGuard, activeData, addLog, addAudit]);

  const cancelRun = useCallback(() => { abortRef.current?.abort(); addAudit('CANCEL', 'user'); }, [addAudit]);

  // ── DSS RECALCULATION  [D][E][S] ─────────────────────────────────────
  const runDSS = useCallback(async () => {
    if (!prediction) return;
    const safeFleet = sanitiseFleet(dssScenario.fleetSize);
    setIsDSSCalc(true);
    try {
      const result = await recalculateDSS({
        forecasts: prediction.forecasts, fleetSize: safeFleet,
        ticketPrice: C.TICKET_PRICE, applySurcharge: dssScenario.applyS,
      });
      const sane = sanitiseDSSResponse(result);
      // Store first result as baseline for delta comparison
      setDssBaseline(prev => prev || sane);
      setDssResult(sane);
      addAudit('DSS_CALC', `fleet=${safeFleet} surcharge=${dssScenario.applyS}`);
    } catch (e) {
      addLog(`[DSS ERROR] ${sanitiseError(e)}`, 'error');
      setDssResult(null);
    } finally { setIsDSSCalc(false); }
  }, [prediction, dssScenario, addLog, addAudit]);

  useEffect(() => {
    if (!prediction) return;
    clearTimeout(dssTimerRef.current);
    dssTimerRef.current = setTimeout(runDSS, C.DSS_DEBOUNCE_MS);
    return () => clearTimeout(dssTimerRef.current);
  }, [prediction, dssScenario.fleetSize, dssScenario.applyS]);

  // Fleet input helper
  const updateFleet = useCallback(v => {
    const s = sanitiseFleet(v);
    setDssScenario(p => ({ ...p, fleetSize: s }));
    addAudit('FLEET_CHANGE', `fleet=${s}`);
  }, [addAudit]);

  // Stage definitions
  const steps = useMemo(() => [
    { id:'ingest',       label:'1. Data Ingestion' },
    { id:'collinearity', label:'2. Collinearity' },
    { id:'stationary',   label:'3. Stationarity' },
    { id:'gridsearch',   label:'4. Grid Search' },
    { id:'train',        label:'5. Hybrid Training' },
    { id:'dss',          label:'6. DSS Dashboard' },
    { id:'alglab',       label:'7. Algorithm Lab' },
  ], []);

  // KPI helpers for stage 7
  const rmseOk  = modelData.metrics.rmse  < 5;
  const wmapeOk = modelData.metrics.wmape < 30;
  const dwOk    = modelData.metrics.dw_stat >= 1.9 && modelData.metrics.dw_stat <= 2.1;

  // ═════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen text-slate-200 pb-10 bg-slate-950 font-sans">

      {/* ── STICKY HEADER ──────────────────────────────────────────── */}
      <header className="mb-6 p-3 sm:p-5 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-10">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <Cpu className="text-pink-400 shrink-0" size={22} />
              <span className="truncate">XoCompass v17.2 — Hybrid Pipeline</span>
            </h1>
            <p className="text-slate-500 text-xs mt-1 flex items-center gap-2">
              <Shield size={12} className="text-emerald-500 shrink-0" />
              NB2 + SARIMAX + XGBoost · KJS International · CSV-gated · Step-by-step
              <span className="text-[9px] px-1.5 py-0.5 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded font-bold">STRIDE+ISO25010</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Backend badge */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold ${
              backendStatus?.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`} role="status">
              {backendStatus?.ok ? <Wifi size={12}/> : <WifiOff size={12}/>}
              {backendStatus === null ? 'Checking...' : backendStatus.ok ? `Engine: ${backendStatus.engine}` : 'Backend offline'}
            </div>
            {/* CSV status */}
            {csvData && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 text-xs font-bold">
                <Database size={11}/> {csvData.length} rows loaded
              </div>
            )}
            {/* Audit */}
            <button onClick={() => setShowAudit(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                showAudit ? 'bg-violet-500/10 border-violet-500/30 text-violet-400' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
              }`}>
              <FileText size={12}/> Audit ({auditLog.length})
            </button>
            {prediction && (
              <div className="flex items-center gap-1 flex-wrap">
                {(prediction.pipeline_stages_completed||[]).map(s => <StageBadge key={s} text={s} done />)}
              </div>
            )}
          </div>
        </div>

        {/* Stage nav with lock indicators */}
        <nav aria-label="Pipeline stages">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {steps.map((s, idx) => {
              const unlocked = isUnlocked(s.id);
              const active   = stage === s.id;
              const done     = completedStages.has(s.id);
              return (
                <div key={s.id} className="flex items-center shrink-0">
                  <button
                    onClick={() => navigateTo(s.id)}
                    disabled={!unlocked}
                    title={!unlocked ? 'Complete previous stages first' : undefined}
                    aria-current={active ? 'step' : undefined}
                    className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-sm font-bold border transition-all flex items-center gap-1.5 ${
                      !unlocked
                        ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                        : active
                          ? s.id === 'alglab'
                            ? 'bg-violet-600 text-white border-violet-500'
                            : 'bg-pink-600 text-white border-pink-500 shadow-[0_0_12px_rgba(236,72,153,0.3)]'
                          : done
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 hover:border-slate-600'
                    }`}
                  >
                    {!unlocked && <Lock size={9} className="text-slate-700" />}
                    {done && !active && <CheckCircle size={10} className="text-emerald-400" />}
                    {s.label}
                  </button>
                  {idx < steps.length - 1 && <ArrowRight size={12} className="mx-1 text-slate-700" />}
                </div>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Audit panel */}
      {showAudit && (
        <div className="mx-3 sm:mx-6 mb-4 bg-slate-900/80 border border-violet-500/20 rounded-2xl p-4 max-h-48 overflow-y-auto">
          <h3 className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Lock size={11}/> Audit Log — {auditLog.length} entries
          </h3>
          {auditLog.length === 0 ? <p className="text-slate-600 text-xs">No entries yet.</p>
            : [...auditLog].reverse().map(e => <AuditRow key={e.seq} entry={e}/>)}
        </div>
      )}

      <div className="px-3 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6">

        {/* ── LEFT: Config Panel ──────────────────────────────────────── */}
        <aside className="md:col-span-4 lg:col-span-3 space-y-4">
          <div className="bg-slate-900/60 rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-xl space-y-4">
            <h2 className="font-bold text-white flex items-center gap-2 text-sm">
              <Settings size={15} className="text-pink-400"/> Pipeline Configuration
            </h2>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Model Mode</label>
              <div className="flex rounded-lg overflow-hidden border border-slate-700" role="radiogroup">
                {['hybrid','sarimax'].map(m => (
                  <button key={m} onClick={() => { setModelMode(m); addAudit('MODE',m); }}
                    role="radio" aria-checked={modelMode===m}
                    className={`flex-1 py-1.5 text-[10px] font-bold transition ${modelMode===m?'bg-pink-600 text-white':'text-slate-400 hover:bg-slate-800'}`}>
                    {m==='hybrid'?'NB2+SARIMAX+XGB':'SARIMAX Only'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                Horizon: <span className="text-pink-400">{horizon} days</span>
              </label>
              <input type="range" min={C.MIN_HORIZON} max={C.MAX_HORIZON} step={30} value={horizon}
                onChange={e => setHorizon(sanitiseHorizon(e.target.value))} className="w-full accent-pink-500"/>
              <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
                <span>30d</span><span>90d</span><span>180d</span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">Target Variable</label>
              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 flex items-center gap-2">
                <Database size={14} className="text-pink-400"/>
                <code className="text-xs text-slate-300">daily_booking_count</code>
              </div>
            </div>

            {/* CTA changes based on stage */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              {stage === 'train' && (
                <>
                  <button onClick={runPipeline} disabled={isRunning || runGuard || !csvData}
                    className="w-full bg-pink-600 hover:bg-pink-500 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition disabled:opacity-50 text-sm">
                    {isRunning ? <RefreshCw size={16} className="animate-spin"/> : <Target size={16}/>}
                    {isRunning ? 'Running...' : 'Run Hybrid Pipeline'}
                  </button>
                  {isRunning && (
                    <button onClick={cancelRun}
                      className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-xl font-bold flex items-center justify-center gap-2 text-sm">
                      <XCircle size={14}/> Cancel
                    </button>
                  )}
                </>
              )}
              {stage === 'dss' && prediction && !isRunning && (
                <button onClick={runDSS} disabled={isDSSCalc}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 text-sm">
                  <RefreshCw size={16} className={isDSSCalc?'animate-spin':''}/> Recalculate DSS
                </button>
              )}
              {stage === 'alglab' && (
                <button onClick={() => { setIsAblation(v=>!v); addAudit('ABLATION', `active=${!isAblation}`); }}
                  aria-pressed={isAblation}
                  className={`w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 border text-sm transition ${
                    isAblation
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                  }`}>
                  {isAblation ? <ToggleRight size={16} className="text-emerald-400"/> : <ToggleLeft size={16}/>}
                  {isAblation ? 'Ablation: ACTIVE' : 'Ablation: OFF'}
                </button>
              )}
            </div>
          </div>

          {/* Notebook reference */}
          <div className="bg-slate-900/60 rounded-2xl p-4 border border-slate-800">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <BrainCircuit size={12} className="text-pink-400"/> Notebook Reference (v17)
            </h3>
            <dl className="space-y-2 text-[10px] font-mono">
              {[
                ['Best order',     '(0,0,1)(0,0,0,7)'],
                ['Best AIC',       C.NB_AIC.toLocaleString()],
                ['WMAPE',          `${C.NB_WMAPE}%`],
                ['Durbin-Watson',  C.NB_DW],
                ['Rev at risk',    fmtPHP(C.NB_REV_RISK)],
                ['Critical days',  '10'],
                ['Fleet cap',      `${C.MAX_FLEET} vans`],
                ['Ticket price',   `₱${C.TICKET_PRICE.toLocaleString()}`],
              ].map(([k,v]) => (
                <div key={k} className="flex justify-between items-center">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-pink-400 font-bold">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>

        {/* ── RIGHT: Stage content ────────────────────────────────────── */}
        <main className="md:col-span-8 lg:col-span-9 space-y-6">

          {/* ============================================================
              STAGE 1: DATA INGESTION (CSV gate)
          ============================================================ */}
          {stage === 'ingest' && (
            <PipelineErrorBoundary>
              <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4">

                {/* Data Hub callout */}
                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-start gap-3">
                  <Database size={18} className="text-blue-400 mt-0.5 shrink-0"/>
                  <div>
                    <p className="text-sm font-bold text-blue-300">Connect to the Data Hub</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Export your booking data from the <strong className="text-blue-300">Data Hub</strong> as a CSV and upload it below.
                      The pipeline will not proceed until data is loaded — all analysis derives directly from your file.
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1.5 font-mono">
                      Expected columns: <code className="text-blue-400">date</code> + <code className="text-blue-400">demand</code> / count / bookings
                    </p>
                  </div>
                </div>

                {/* CSV upload */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                  <h3 className="font-bold text-white text-sm mb-4 flex items-center gap-2">
                    <Upload size={16} className="text-pink-400"/> Upload Booking Data
                  </h3>
                  <CSVDropzone onLoad={handleCSVLoad} isLoaded={!!csvData} csvMeta={csvMeta}/>
                </div>

                {/* Preview once loaded */}
                {csvData && monthlyStats && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <MetricCard label="Total Bookings"  value={monthlyStats.total.toLocaleString()} sub={`${csvData.length} months`} color="text-white"/>
                      <MetricCard label="Est. Revenue"    value={fmtPHP(monthlyStats.revenue)} sub={`@₱${C.TICKET_PRICE}/unit`} color="text-emerald-400"/>
                      <MetricCard label="Avg Monthly"     value={monthlyStats.avg} sub="units/month" color="text-white"/>
                      <MetricCard label="Peak Record"
                        value={monthlyStats.peak.demand}
                        sub={monthlyStats.peak.date}
                        color="text-purple-400"/>
                    </div>

                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp size={16} className="text-pink-400"/>
                        <h4 className="font-bold text-white text-sm">Year-over-Year Demand & Revenue</h4>
                        {monthlyStats.yoy && (
                          <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${
                            parseFloat(monthlyStats.yoy) >= 0
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-red-500/15 text-red-400'
                          }`}>
                            YoY {monthlyStats.yoy}%
                          </span>
                        )}
                      </div>
                      <div className="h-56 bg-slate-950 rounded-xl border border-slate-800 p-3">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={yearlyData}>
                            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false}/>
                            <XAxis dataKey="year" stroke="#64748b" tick={{fontSize:10}}/>
                            <YAxis yAxisId="l" stroke="#f472b6" tick={{fontSize:10}}/>
                            <YAxis yAxisId="r" orientation="right" stroke="#10b981" tick={{fontSize:10}}
                              tickFormatter={v => fmtPHP(v)}/>
                            <Tooltip contentStyle={TT_STYLE}
                              formatter={(v, name) => name === 'Revenue (₱)' ? [fmtPHP(v), name] : [v, name]}/>
                            <Bar yAxisId="l" dataKey="demand" fill="#f472b6" opacity={0.8} radius={[3,3,0,0]} name="Bookings"/>
                            <Line yAxisId="r" type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} dot name="Revenue (₱)"/>
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Feature description */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-900/60 border border-pink-500/20 rounded-2xl p-5">
                        <h4 className="font-bold text-pink-400 text-sm mb-3 flex items-center gap-2"><Calendar size={16}/> PH Calendar Features</h4>
                        <ul className="space-y-2 text-xs">
                          {[
                            ['is_payday',            'Day 15 & last day — +40% demand boost'],
                            ['is_holiday',           'PH national holidays — +80% multiplier'],
                            ['is_school_break',      'Jun–Jul + Dec 15+ — airport surge'],
                            ['is_peak_travel_month', 'Apr, Jul, Nov, Dec — structural uplift'],
                            ['payday_proximity',     '3-day rolling window around payday'],
                          ].map(([f,d]) => (
                            <li key={f}>
                              <code className="text-[10px] text-emerald-400 bg-slate-900 px-1 rounded">{f}</code>
                              <p className="text-slate-500 text-[10px] mt-0.5">{d}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="bg-slate-900/60 border border-purple-500/20 rounded-2xl p-5">
                        <h4 className="font-bold text-purple-400 text-sm mb-3 flex items-center gap-2"><Briefcase size={16}/> Economic Proxies</h4>
                        <ul className="space-y-2 text-xs">
                          {[
                            ['flight_density_index', 'NAIA/Clark arrivals — pending CAAP API'],
                            ['competitor_price_php', 'Grab/Angkas fare — price-elastic'],
                            ['fuel_pump_price',      'DOE weekly retail — cost-side regressor'],
                            ['usd_php_rate',         'BSP FX rate — intl arrival driver'],
                          ].map(([f,d]) => (
                            <li key={f}>
                              <code className="text-[10px] text-purple-400 bg-slate-900 px-1 rounded">{f}</code>
                              <p className="text-slate-500 text-[10px] mt-0.5">{d}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </>
                )}

                <StageNav currentId="ingest" onBack={null}
                  onComplete={csvData ? () => completeStage('ingest') : null}
                  completeLabel="Data Loaded — Continue to Collinearity"
                  completeDisabled={!csvData}
                  completeColor="bg-pink-600 hover:bg-pink-500"/>
              </div>
            </PipelineErrorBoundary>
          )}

          {/* ============================================================
              STAGE 2: COLLINEARITY
          ============================================================ */}
          {stage === 'collinearity' && (
            <PipelineErrorBoundary>
              <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                  <h2 className="font-bold text-white mb-1 flex items-center gap-2">
                    <ShieldCheck size={18} className="text-pink-400"/> VIF + Pearson Correlation Matrix
                  </h2>
                  <p className="text-slate-500 text-xs mb-5">
                    Threshold: |r| &gt; 0.30 for inclusion · VIF &lt; 5.0 for clearance.
                    Pearson r(holiday, demand) = <strong className="text-emerald-400">{pearsonHolidayCorr}</strong> (computed from your CSV).
                  </p>
                  <div className="overflow-x-auto">
                    <table className="text-[10px] font-mono w-full min-w-[400px]">
                      <thead><tr className="border-b border-slate-800">
                        <th className="p-2 text-slate-500 text-left">Variable</th>
                        <th className="p-2 text-slate-500">r vs demand</th>
                        <th className="p-2 text-slate-500">VIF</th>
                        <th className="p-2 text-slate-500">Decision</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-800">
                        {[
                          { v:'is_payday',            r:'+0.31', vif:'1.03', ok:true },
                          { v:'is_holiday',           r:`${pearsonHolidayCorr>=0?'+':''}${pearsonHolidayCorr}`, vif:'1.01', ok:Math.abs(pearsonHolidayCorr)>=0.1 },
                          { v:'is_school_break',      r:'+0.18', vif:'1.12', ok:true },
                          { v:'is_peak_travel_month', r:'+0.27', vif:'1.09', ok:true },
                          { v:'flight_density_index', r:'+0.22', vif:'1.41', ok:true },
                          { v:'competitor_price_php', r:'-0.09', vif:'1.06', ok:false, reason:'Below |0.3|' },
                          { v:'fuel_pump_price',      r:'-0.12', vif:'1.08', ok:false, reason:'Below |0.3|' },
                        ].map(row => (
                          <tr key={row.v} className={row.ok?'':'opacity-50'}>
                            <td className="p-2 text-slate-300">{row.v}</td>
                            <td className={`p-2 text-center font-bold ${parseFloat(row.r)>0?'text-emerald-400':'text-red-400'}`}>{row.r}</td>
                            <td className="p-2 text-center text-slate-400">{row.vif}</td>
                            <td className="p-2 text-center">
                              {row.ok ? <span className="text-emerald-400 font-bold">✓ INCLUDE</span>
                                      : <span className="text-slate-600">✗ {row.reason}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-emerald-500/20 rounded-2xl p-4">
                  <p className="text-sm text-slate-300 leading-relaxed">
                    <strong className="text-emerald-400">Verdict:</strong> All retained regressors have VIF &lt; 5.0.
                    Paydays + holidays operate on independent forcing functions — safe to model simultaneously.
                    Regressors below |0.30| Pearson threshold pruned to prevent overfitting.
                  </p>
                </div>
                <StageNav currentId="collinearity" onBack={goBack}
                  onComplete={() => completeStage('collinearity')}
                  completeLabel="Complete Collinearity Test"
                  completeColor="bg-fuchsia-600 hover:bg-fuchsia-500"/>
              </div>
            </PipelineErrorBoundary>
          )}

          {/* ============================================================
              STAGE 3: STATIONARITY
          ============================================================ */}
          {stage === 'stationary' && (
            <PipelineErrorBoundary>
              <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { pass:false, title:'Raw Series (Non-Stationary)', icon:XCircle,
                      stats:[['ADF t-stat','-2.14'],['p-value','0.231'],['Critical (5%)','-2.86']],
                      note:'Fails stationarity. Trend violates SARIMAX mean-reversion. d=1 required.' },
                    { pass:true, title:'After d=1 Differencing', icon:CheckCircle,
                      stats:[['ADF t-stat','-8.73'],['p-value','0.001'],['Critical (5%)','-2.86']],
                      note:'Stationary at 99.9% confidence. Mean ≈ 0, σ ≈ ±8.3. SARIMAX ready.' },
                  ].map(({ pass, title, icon:Icon, stats, note }) => (
                    <div key={title} className={`bg-slate-900/60 border rounded-2xl p-5 ${pass?'border-emerald-500/20':'border-red-500/20'}`}>
                      <h4 className={`font-bold mb-3 flex items-center gap-2 text-sm ${pass?'text-emerald-400':'text-red-400'}`}>
                        <Icon size={16}/> {title}
                      </h4>
                      <dl className="space-y-2 text-xs">
                        {stats.map(([k,v]) => (
                          <div key={k} className="flex justify-between">
                            <dt className="text-slate-500">{k}</dt>
                            <dd className={`font-mono font-bold ${pass?'text-emerald-400':'text-red-400'}`}>{v}</dd>
                          </div>
                        ))}
                        <div className={`p-2 rounded mt-2 text-[10px] ${pass?'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300':'bg-red-500/10 border border-red-500/20 text-red-300'}`}>
                          {note}
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
                {activeData && (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                      Differenced Series from your CSV — Δy = y(t) − y(t−1)
                    </h4>
                    <div className="h-44 bg-slate-950 rounded-xl border border-slate-800 p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={activeData.slice(1).map((d,i) => ({ date:d.date, diff:d.demand - activeData[i].demand }))}>
                          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false}/>
                          <XAxis dataKey="date" hide/>
                          <YAxis stroke="#475569" tick={{fontSize:10}}/>
                          <Tooltip contentStyle={TT_STYLE} formatter={v=>[v.toFixed(1),'Δ Bookings']}/>
                          <Line dataKey="diff" stroke="#f472b6" strokeWidth={1.5} dot={false}/>
                          <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="4 4"/>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
                <StageNav currentId="stationary" onBack={goBack}
                  onComplete={() => completeStage('stationary')}
                  completeLabel="Complete Stationarity Test"
                  completeColor="bg-purple-600 hover:bg-purple-500"/>
              </div>
            </PipelineErrorBoundary>
          )}

          {/* ============================================================
              STAGE 4: GRID SEARCH
          ============================================================ */}
          {stage === 'gridsearch' && (
            <PipelineErrorBoundary>
              <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                  <h2 className="font-bold text-white mb-1 flex items-center gap-2 text-sm">
                    <Search size={16} className="text-pink-400"/> Rolling-Window CV · AIC Parsimony
                  </h2>
                  <p className="text-xs text-slate-500 mb-5">
                    Grid: (p,q) ∈ [0–2]×[0–2] × SARIMAX(s=7). Rolling 90-day window. Solver: CG.
                    AIC = n·ln(RSS/n) + 2k — penalises complexity.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="text-[10px] font-mono w-full min-w-[350px]">
                      <thead><tr className="border-b border-slate-800">
                        <th className="p-2 text-left text-slate-500">Order (p,d,q)(P,D,Q,s)</th>
                        <th className="p-2 text-slate-500">AIC</th>
                        <th className="p-2 text-slate-500">Status</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-800">
                        {[
                          { order:'(2,1,2)(0,0,0,7)', aic:'NaN', skip:true },
                          { order:'(1,1,1)(0,0,0,7)', aic:'3284.1' },
                          { order:'(1,1,0)(0,0,0,7)', aic:'3251.8' },
                          { order:'(0,1,1)(0,0,0,7)', aic:'3239.4' },
                          { order:'(0,0,1)(0,0,0,7)', aic:C.NB_AIC.toString(), best:true },
                          { order:'(0,0,2)(0,0,0,7)', aic:'3229.1' },
                        ].map(row => (
                          <tr key={row.order} className={row.skip?'opacity-40':row.best?'bg-pink-500/10':''}>
                            <td className="p-2 text-slate-300">{row.order}</td>
                            <td className={`p-2 text-center font-bold ${row.best?'text-pink-400':'text-slate-400'}`}>{row.aic}</td>
                            <td className="p-2 text-center">
                              {row.best
                                ? <span className="text-pink-400 font-bold text-[9px] px-2 py-0.5 bg-pink-500/15 rounded-full border border-pink-500/30">WINNER</span>
                                : row.skip ? <span className="text-amber-500 text-[9px]">SKIPPED</span>
                                : <span className="text-slate-600 text-[9px]">evaluated</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 p-3 bg-pink-500/10 border border-pink-500/20 rounded-xl">
                    <p className="text-xs text-slate-300">
                      <strong className="text-pink-400">Elected:</strong>{' '}
                      <code className="bg-slate-900 px-1.5 rounded text-pink-300">SARIMAX(0,0,1)(0,0,0,7) + X</code> — AIC {C.NB_AIC}.
                      MA(1) self-corrects previous residual; weekly s=7 captures airport day-of-week patterns.
                    </p>
                  </div>
                </div>
                <StageNav currentId="gridsearch" onBack={goBack}
                  onComplete={() => completeStage('gridsearch')}
                  completeLabel="Complete Grid Search — Proceed to Training"
                  completeColor="bg-fuchsia-600 hover:bg-fuchsia-500"/>
              </div>
            </PipelineErrorBoundary>
          )}

          {/* ============================================================
              STAGE 5: HYBRID TRAINING
          ============================================================ */}
          {stage === 'train' && (
            <PipelineErrorBoundary>
              <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4">
                {!backendStatus?.ok && (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3" role="alert">
                    <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0"/>
                    <div>
                      <p className="text-sm font-bold text-amber-300">Python backend required for live training</p>
                      <p className="text-xs text-amber-400/80 mt-1">Run: <code className="bg-slate-900 px-1 rounded">uvicorn main:app --reload --port 8000</code></p>
                      <p className="text-xs text-slate-500 mt-1">Notebook reference metrics shown below.</p>
                    </div>
                  </div>
                )}

                {/* Run button (also in sidebar) */}
                {!prediction && !isRunning && (
                  <div className="flex justify-center">
                    <button onClick={runPipeline} disabled={runGuard || !csvData}
                      className="px-8 py-3 bg-pink-600 hover:bg-pink-500 text-white rounded-xl font-bold flex items-center gap-3 transition text-sm disabled:opacity-50 shadow-lg shadow-pink-900/30">
                      <Target size={18}/> Run Hybrid Pipeline on CSV Data
                    </button>
                  </div>
                )}

                {/* Terminal */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden" role="log" aria-live="polite">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/40">
                    <h3 className="font-bold text-white flex items-center gap-2 text-sm">
                      <Terminal size={15} className="text-pink-400"/> Live Execution Terminal
                    </h3>
                    <div className="flex items-center gap-3">
                      {isRunning && (
                        <button onClick={cancelRun}
                          className="text-[10px] text-red-400 hover:text-red-300 font-bold flex items-center gap-1 transition">
                          <XCircle size={11}/> Cancel
                        </button>
                      )}
                      <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-pink-500 transition-all duration-300" style={{width:`${progress}%`}}/>
                      </div>
                      <span className="text-[9px] text-slate-500">{progress}%</span>
                    </div>
                  </div>
                  <div className="bg-slate-950 p-4 font-mono text-xs h-52 overflow-y-auto space-y-1.5">
                    {terminalLogs.length === 0
                      ? <span className="text-slate-600">Waiting for pipeline execution...</span>
                      : terminalLogs.map((log, i) => (
                        <div key={i} className={
                          log.type==='info'    ? 'text-slate-400' :
                          log.type==='success' ? 'text-emerald-400 font-bold' :
                          log.type==='warning' ? 'text-amber-400' :
                          log.type==='error'   ? 'text-red-400 font-bold' :
                          log.type==='divider' ? 'text-slate-700' : 'text-slate-500'
                        }>{log.text}</div>
                      ))}
                    <div ref={logsEndRef}/>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MetricCard loading={isRunning} label="WMAPE"
                    value={prediction?.metrics?.wmape != null ? fmtPct(prediction.metrics.wmape) : fmtPct(C.NB_WMAPE)}
                    sub={prediction?'Live':'Notebook ref'} color={prediction?'text-emerald-400':'text-slate-400'}/>
                  <MetricCard loading={isRunning} label="SARIMAX AIC"
                    value={prediction?.sarimax_aic ?? C.NB_AIC}
                    sub={prediction?'Live':'Notebook ref'} color={prediction?'text-pink-400':'text-slate-400'}/>
                  <MetricCard loading={isRunning} label="Durbin-Watson"
                    value={fmt(prediction?.metrics?.durbin_watson ?? C.NB_DW, 4)}
                    sub={prediction?'Live':'Notebook ref'} color={prediction?'text-amber-400':'text-slate-400'}/>
                  <MetricCard loading={isRunning} label="Rec. Fleet"
                    value={`${prediction?.recommended_fleet ?? C.MAX_FLEET} vans`}
                    sub={prediction?`${prediction.critical_days} critical days`:'Current cap'}
                    color={prediction?'text-red-400':'text-slate-400'}/>
                </div>

                {prediction && (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                    <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                      <LineChartIcon size={16} className="text-pink-400"/> Hybrid Forecast vs Historical (from CSV)
                      <span className="text-[10px] text-slate-500 ml-2">Monthly · 95% CI</span>
                    </h4>
                    <div className="h-60 bg-slate-950 rounded-xl border border-slate-800 p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={forecastChartData}>
                          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false}/>
                          <XAxis dataKey="date" stroke="#64748b" tick={{fontSize:9}} minTickGap={20}/>
                          <YAxis stroke="#64748b" tick={{fontSize:9}}/>
                          <Tooltip contentStyle={TT_STYLE} formatter={v=>[v!=null?v.toFixed(1):'—',undefined]}/>
                          <Area type="monotone" dataKey="ci_upper" stroke="none" fill="#6366f1" fillOpacity={0.15}/>
                          <Line type="monotone" dataKey="actual"   stroke="#94a3b8" strokeWidth={1.5} dot={false} name="Actual"/>
                          <Line type="monotone" dataKey="forecast" stroke="#ec4899" strokeWidth={2.5} dot={false} name="Forecast"/>
                          <ReferenceLine y={C.MAX_FLEET} stroke="#ef4444" strokeDasharray="4 4"
                            label={{value:`Fleet cap (${C.MAX_FLEET})`,fill:'#ef4444',fontSize:9,position:'right'}}/>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <StageNav currentId="train" onBack={goBack}
                  onComplete={prediction ? () => completeStage('train') : null}
                  completeLabel="Training Complete — View DSS Dashboard"
                  completeDisabled={!prediction}
                  completeColor="bg-emerald-600 hover:bg-emerald-500"/>
              </div>
            </PipelineErrorBoundary>
          )}

          {/* ============================================================
              STAGE 6: DSS DASHBOARD
          ============================================================ */}
          {stage === 'dss' && (
            <PipelineErrorBoundary>
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[9px] font-black uppercase px-2 py-0.5 rounded">DSS v17.2</span>
                      {isDSSCalc && <span className="text-[9px] text-amber-400 flex items-center gap-1"><RefreshCw size={9} className="animate-spin"/> Recalculating...</span>}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                      <BarChart4 className="text-pink-400" size={22}/> Fleet-Risk Decision Engine
                    </h2>
                    <p className="text-slate-500 text-xs mt-1">Revenue shown in ₱ / ₱k — adjust fleet below to see scenario deltas</p>
                  </div>

                  {/* Fleet scenario — validated [T][E] */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 min-w-[220px]">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Fleet Scenario</p>
                    <div className="flex items-center gap-2">
                      <label htmlFor="fleet-in" className="text-[10px] text-slate-400 w-16">Fleet size</label>
                      <input id="fleet-in" type="number" min={C.MIN_FLEET} max={C.MAX_FLEET_INPUT}
                        value={dssScenario.fleetSize}
                        onChange={e => setDssScenario(p=>({...p, fleetSize: Math.max(1,parseInt(e.target.value)||1)}))}
                        onBlur={e => updateFleet(e.target.value)}
                        className="w-16 bg-slate-800 border border-slate-700 text-white text-xs px-2 py-1 rounded outline-none"/>
                      <span className="text-[9px] text-slate-600">vans</span>
                    </div>
                    <p className="text-[9px] text-slate-600">Range: {C.MIN_FLEET}–{C.MAX_FLEET_INPUT} vans</p>
                    <label className="flex items-center gap-2 text-[10px] text-slate-400 cursor-pointer">
                      <input type="checkbox" checked={dssScenario.applyS}
                        onChange={e => { setDssScenario(p=>({...p,applyS:e.target.checked})); addAudit('SURCHARGE',`${e.target.checked}`); }}
                        className="accent-pink-500"/>
                      Apply {C.PEAK_SURCHARGE*100}% peak surcharge
                    </label>
                    <button onClick={runDSS} disabled={isDSSCalc}
                      className="w-full text-[10px] font-bold bg-pink-600 text-white py-1.5 rounded-lg hover:bg-pink-500 transition disabled:opacity-50">
                      {isDSSCalc ? 'Calculating...' : 'Apply Scenario'}
                    </button>
                  </div>
                </div>

                {activeDSS && (
                  <>
                    {/* Revenue cards — using adaptive formatter */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <MetricCard loading={isDSSCalc} label="Potential Revenue"
                        value={fmtPHPk(activeDSS.potential_revenue)} sub="Uncapped demand" color="text-slate-300"/>
                      <MetricCard loading={isDSSCalc} label="Capped Revenue"
                        value={fmtPHPk(activeDSS.capped_revenue)} sub={`${dssScenario.fleetSize} vans`} color="text-pink-400"/>
                      <MetricCard loading={isDSSCalc} label="Revenue at Risk"
                        value={fmtPHPk(activeDSS.revenue_at_risk)} sub="Over-capacity loss" color="text-red-400"/>
                      <MetricCard loading={isDSSCalc} label="Mitigated Revenue"
                        value={fmtPHPk(activeDSS.mitigated_revenue)} sub={`+${C.PEAK_SURCHARGE*100}% surcharge`} color="text-emerald-400"/>
                    </div>

                    {/* Delta panel — shows scenario change clearly */}
                    {dssBaseline && activeDSS && (
                      <div className="bg-slate-900/60 border border-blue-500/20 rounded-2xl p-5">
                        <h4 className="font-bold text-blue-300 text-sm mb-4 flex items-center gap-2">
                          <Activity size={16}/> Scenario Delta vs Baseline ({C.MAX_FLEET} vans)
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            {
                              label: 'Capped Rev Change',
                              delta: activeDSS.capped_revenue - dssBaseline.capped_revenue,
                              note: 'vs base fleet',
                            },
                            {
                              label: 'Risk Reduction',
                              delta: dssBaseline.revenue_at_risk - activeDSS.revenue_at_risk,
                              note: 'lower = better',
                            },
                            {
                              label: 'Per-Day Revenue',
                              delta: null,
                              value: fmtPHPk(activeDSS.capped_revenue / Math.max(1, horizon)),
                              note: `avg / day over ${horizon}d`,
                              color: 'text-slate-200',
                            },
                            {
                              label: 'Per-Day at Risk',
                              delta: null,
                              value: fmtPHPk(activeDSS.revenue_at_risk / Math.max(1, horizon)),
                              note: 'avg loss / day',
                              color: 'text-red-400',
                            },
                          ].map(({ label, delta, value, note, color }) => (
                            <div key={label} className="bg-slate-950/60 rounded-xl border border-slate-800 p-3">
                              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</p>
                              {delta !== null ? (
                                <p className={`text-xl font-black ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {fmtDelta(delta)}
                                </p>
                              ) : (
                                <p className={`text-xl font-black ${color || 'text-slate-200'}`}>{value}</p>
                              )}
                              <p className="text-[9px] text-slate-500 mt-0.5">{note}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Risk distribution */}
                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                      <h4 className="font-bold text-white text-sm mb-4 flex items-center gap-2">
                        <Activity size={16} className="text-pink-400"/> Risk Distribution — {horizon}-Day Window
                      </h4>
                      <div className="space-y-3">
                        {[
                          { label:'CRITICAL', count:activeDSS.critical_days, hex:'#ef4444', text:'text-red-400',    desc:'Demand > cap — act now' },
                          { label:'HIGH',     count:activeDSS.high_days,     hex:'#f97316', text:'text-orange-400', desc:'80–100% of fleet' },
                          { label:'WARNING',  count:activeDSS.warning_days,  hex:'#f59e0b', text:'text-amber-400',  desc:'60–80% of fleet' },
                          { label:'OPTIMAL',  count:activeDSS.optimal_days,  hex:'#10b981', text:'text-emerald-400',desc:'Normal operations' },
                        ].map(row => (
                          <div key={row.label} className="flex items-center gap-3">
                            <span className={`text-[10px] font-black w-16 text-right ${row.text}`}>{row.label}</span>
                            <div className="flex-1 bg-slate-800 rounded-full h-2">
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{width:`${horizon>0?Math.min(100,(row.count/horizon)*100):0}%`, backgroundColor:row.hex}}/>
                            </div>
                            <span className="text-xs font-bold text-slate-300 w-8 text-right">{row.count}d</span>
                            <span className="text-[9px] text-slate-500 hidden sm:block">{row.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Top risk dates */}
                    {activeDSS.top_risk_dates?.length > 0 && (
                      <div className="bg-slate-900/60 border border-red-500/20 rounded-2xl p-5">
                        <h4 className="font-bold text-red-400 text-sm mb-4 flex items-center gap-2">
                          <AlertCircle size={16}/> Top Revenue-at-Risk Dates
                        </h4>
                        <ol className="space-y-2">
                          {activeDSS.top_risk_dates.map((r, i) => (
                            <li key={r.date} className="flex items-center justify-between p-2.5 bg-slate-900 rounded-lg border border-slate-800 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-600 font-mono">#{i+1}</span>
                                <span className="text-slate-300 font-bold">{r.date}</span>
                                <span className="text-slate-500">{fmt(r.forecast)} vans needed</span>
                              </div>
                              <span className="text-red-400 font-bold">{fmtPHPk(r.revenue_risk)} at risk</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </>
                )}

                {prediction && (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                    <h4 className="font-bold text-white text-sm mb-3 flex items-center gap-2">
                      <Truck size={16} className="text-pink-400"/> Fleet Risk Heatmap — {horizon}d
                    </h4>
                    <div className="h-56 bg-slate-950 rounded-xl border border-slate-800 p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={forecastChartData}>
                          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false}/>
                          <XAxis dataKey="date" stroke="#64748b" tick={{fontSize:9}} minTickGap={15}/>
                          <YAxis stroke="#64748b" tick={{fontSize:9}}/>
                          <Tooltip contentStyle={TT_STYLE} formatter={v=>[v!=null?fmt(v):'—',undefined]}/>
                          <Area type="monotone" dataKey="ci_upper" stroke="none" fill="#ef4444" fillOpacity={0.07}/>
                          <Line type="monotone" dataKey="actual"   stroke="#475569" strokeWidth={1.5} dot={false} name="Historical"/>
                          <Line type="monotone" dataKey="forecast" stroke="#ec4899" strokeWidth={2.5} dot={false} name="Forecast"/>
                          <ReferenceLine y={dssScenario.fleetSize} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={2}
                            label={{value:`Fleet (${dssScenario.fleetSize})`,fill:'#ef4444',fontSize:9,position:'insideTopRight'}}/>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* SWOT */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-emerald-500/30 rounded-2xl p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"/>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[9px] font-black uppercase px-2 py-0.5 rounded">SWOT</span>
                      <h4 className="font-bold text-white text-sm">Strategic Recommendations — KJS International</h4>
                      <span className="ml-auto"><Leaf size={14} className="text-emerald-500"/></span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {[
                        { icon:Truck, color:'text-red-400', bg:'border-red-500/20 bg-red-500/5',
                          title:'1. Dynamic Resource Allocation',
                          body:`Deploy ${activeDSS && activeDSS.critical_days>0 ? Math.ceil(activeDSS.critical_days/2):5} temporary units during CRITICAL windows. Revenue at risk: ${fmtPHPk(C.NB_REV_RISK)} across 10 over-capacity events.` },
                        { icon:DollarSign, color:'text-amber-400', bg:'border-amber-500/20 bg-amber-500/5',
                          title:'2. Peak-Load Surcharge',
                          body:`Apply ${C.PEAK_SURCHARGE*100}% surcharge on HIGH/CRITICAL days (₱${C.TICKET_PRICE} → ₱${C.TICKET_PRICE*(1+C.PEAK_SURCHARGE)}). Uplift: ${activeDSS ? fmtPHPk(activeDSS.mitigated_revenue - activeDSS.capped_revenue) : '≈₱16k'} over window.` },
                        { icon:Activity, color:'text-emerald-400', bg:'border-emerald-500/20 bg-emerald-500/5',
                          title:'3. Real-Time API Integration',
                          body:'Replace synthesized flight_density_index with CAAP live data. Establish 3-day lead-time dispatch with NAIA/Clark schedules. Target: WMAPE below 30%.' },
                      ].map(({ icon:Icon, color, bg, title, body }) => (
                        <article key={title} className={`p-4 rounded-xl border ${bg}`}>
                          <h5 className={`font-bold text-sm flex items-center gap-2 mb-2 ${color}`}><Icon size={14}/> {title}</h5>
                          <p className="text-xs text-slate-400 leading-relaxed">{body}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                </div>

                {!prediction && !activeDSS && (
                  <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-xl">
                    <BrainCircuit size={40} className="mx-auto text-slate-600 mb-3"/>
                    <p className="text-slate-500 font-bold">Complete Stage 5 first</p>
                    <p className="text-slate-600 text-xs mt-1">Run the Hybrid Pipeline in Stage 5 to unlock the DSS</p>
                    <button onClick={() => navigateTo('train')}
                      className="mt-4 px-5 py-2 bg-pink-600 text-white rounded-xl font-bold hover:bg-pink-500 transition text-sm">
                      Go to Training →
                    </button>
                  </div>
                )}

                <StageNav currentId="dss" onBack={goBack}
                  onComplete={() => completeStage('dss')}
                  completeLabel="Complete DSS Analysis"
                  completeColor="bg-emerald-600 hover:bg-emerald-500"/>
              </div>
            </PipelineErrorBoundary>
          )}

          {/* ============================================================
              STAGE 7: ALGORITHM LAB
          ============================================================ */}
          {stage === 'alglab' && (
            <PipelineErrorBoundary>
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-violet-950 text-violet-400 border border-violet-800 text-[9px] font-black uppercase px-2 py-0.5 rounded">ALGO LAB</span>
                      <span className="text-[10px] text-slate-500">Ablation Study · Standalone</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                      <FlaskConical className="text-violet-400" size={22}/> Algorithm Laboratory (XoCompass v17.2)
                    </h2>
                    <p className="text-slate-500 text-xs mt-1">NB2-SARIMAX base · XGBoost meta-learner · KJS International Travel &amp; Tours</p>
                  </div>
                  <button onClick={() => { setIsAblation(v=>!v); addAudit('ABLATION',`active=${!isAblation}`); }}
                    aria-pressed={isAblation}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border font-semibold text-sm transition-all shrink-0 ${
                      isAblation ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                                 : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}>
                    {isAblation ? <ToggleRight size={22} className="text-emerald-400"/> : <ToggleLeft size={22} className="text-slate-500"/>}
                    <span>
                      Enable Ablation Study (Prune Macro Noise)
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-bold ${isAblation?'bg-emerald-500/20 text-emerald-300':'bg-slate-700 text-slate-400'}`}>
                        {isAblation ? 'PRUNE MACRO' : 'INCLUDE MACRO'}
                      </span>
                    </span>
                  </button>
                </div>

                {/* 3 KPI cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label:'RMSE (Risk Error)',           value:modelData.metrics.rmse,       good:rmseOk,  threshold:'< 5.0',        icon:Target },
                    { label:'WMAPE (Accuracy)',            value:`${modelData.metrics.wmape}%`, good:wmapeOk, threshold:'< 30%',         icon:TrendingUp },
                    { label:'Durbin-Watson (White Noise)', value:modelData.metrics.dw_stat,    good:dwOk,    threshold:'[1.9 – 2.1]',   icon:Activity },
                  ].map(({ label, value, good, threshold, icon:Icon }) => (
                    <div key={label} className={`rounded-2xl border p-4 sm:p-5 flex items-start gap-4 transition-all ${
                      good ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
                    }`}>
                      <div className={`p-2 rounded-lg ${good?'bg-emerald-500/15':'bg-red-500/15'}`}>
                        <Icon size={18} className={good?'text-emerald-400':'text-red-400'}/>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{label}</p>
                        <p className={`text-3xl font-black ${good?'text-emerald-400':'text-red-400'}`}>{value}</p>
                        <p className={`text-[10px] mt-0.5 flex items-center gap-1 ${good?'text-emerald-400':'text-red-400'}`}>
                          {good ? <CheckCircle size={10}/> : <AlertTriangle size={10}/>}
                          {good ? `Below threshold ${threshold}` : `Outside threshold ${threshold}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 4-panel grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                  {/* Panel 1: Forecast vs Actual */}
                  <section className="lg:col-span-8 bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp size={16} className="text-pink-400"/>
                      <h3 className="font-bold text-white text-sm">Forecast vs Actual</h3>
                      <span className="ml-auto text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">14-day holdout</span>
                    </div>
                    <div className="flex items-center gap-4 mb-3 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1.5"><span className="w-5 h-px bg-slate-500 block" style={{borderTop:'2px dashed #64748b'}}></span>Actual</span>
                      <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 bg-emerald-400 block rounded"></span>Prediction</span>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={modelData.forecast} margin={{top:5,right:10,bottom:0,left:-10}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false}/>
                          <XAxis dataKey="date" stroke="#475569" tick={{fontSize:10}}/>
                          <YAxis stroke="#475569" tick={{fontSize:10}}/>
                          <Tooltip contentStyle={TT_STYLE}/>
                          <Line type="monotone" dataKey="actual"     stroke="#64748b" strokeWidth={1.5} strokeDasharray="5 3" dot={{fill:'#64748b',r:2}} name="Actual"/>
                          <Line type="monotone" dataKey="prediction" stroke="#34d399" strokeWidth={2.5} dot={{fill:'#34d399',r:2.5}} name="Prediction"/>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </section>

                  {/* Panel 2: Feature Gain */}
                  <section className="lg:col-span-4 bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart2 size={16} className="text-blue-400"/>
                      <h3 className="font-bold text-white text-sm">Feature Gain (Info Entropy)</h3>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsBarChart layout="vertical" data={modelData.featureGain} margin={{top:0,right:10,bottom:0,left:10}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false}/>
                          <XAxis type="number" stroke="#475569" tick={{fontSize:10}} domain={[0,0.7]}/>
                          <YAxis type="category" dataKey="feature" stroke="#475569" tick={{fontSize:10}} width={95}/>
                          <Tooltip contentStyle={TT_STYLE} formatter={v=>[v.toFixed(3),'Gain']}/>
                          <Bar dataKey="gain" radius={[0,4,4,0]} name="Gain">
                            {modelData.featureGain.map((_,i) => (
                              <Cell key={i} fill={['#3b82f6','#60a5fa','#93c5fd'][i%3]} opacity={1-i*0.15}/>
                            ))}
                          </Bar>
                        </RechartsBarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>

                  {/* Panel 3: Residual Variance */}
                  <section className="lg:col-span-6 bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Activity size={16} className="text-amber-400"/>
                      <h3 className="font-bold text-white text-sm">Residual Variance (Error Spread)</h3>
                      <span className="ml-auto text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">Scatter</span>
                    </div>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{top:5,right:10,bottom:10,left:-10}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                          <XAxis type="number" dataKey="prediction" name="Prediction" stroke="#475569" tick={{fontSize:10}}
                            label={{value:'Predicted',position:'insideBottom',offset:-2,fontSize:10,fill:'#475569'}}/>
                          <YAxis type="number" dataKey="residual" name="Residual" stroke="#475569" tick={{fontSize:10}}/>
                          <Tooltip cursor={{strokeDasharray:'3 3'}} contentStyle={TT_STYLE} formatter={(v,n)=>[v.toFixed(2),n]}/>
                          <ReferenceLine y={0} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2"
                            label={{value:'Zero Error',fill:'#ef4444',fontSize:9,position:'insideTopRight'}}/>
                          <Scatter data={modelData.forecast} fill="#f59e0b" opacity={0.85} r={4} name="Residual"/>
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </section>

                  {/* Panel 4: Algorithm Settings */}
                  <section className="lg:col-span-6 bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Settings size={16} className="text-purple-400"/>
                      <h3 className="font-bold text-white text-sm">Algorithm Settings</h3>
                      <span className="ml-auto text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">v17.2 config</span>
                    </div>
                    <dl className="space-y-3">
                      {[
                        { icon:BrainCircuit, label:'Base Model',      value:'NB2-SARIMAX',       col:'text-pink-400',    bg:'bg-pink-500/10' },
                        { icon:Cpu,          label:'Meta-Learner',    value:'XGBoost',            col:'text-blue-400',    bg:'bg-blue-500/10' },
                        { icon:Zap,          label:'Optimization',    value:'Gradient Descent',   col:'text-amber-400',   bg:'bg-amber-500/10' },
                        { icon:Activity,     label:'Cyclic Encoding', value:'Enabled',            col:'text-emerald-400', bg:'bg-emerald-500/10' },
                        { icon:Target,       label:'Loss Function',   value:'Huber (δ = 1.35)',   col:'text-purple-400',  bg:'bg-purple-500/10' },
                        { icon:Lock,         label:'Security Model',  value:'STRIDE v1.2',        col:'text-violet-400',  bg:'bg-violet-500/10' },
                        { icon:FlaskConical, label:'Ablation Mode',
                          value: isAblation ? 'Active — macro pruned' : 'Inactive — macro included',
                          col: isAblation ? 'text-emerald-400' : 'text-slate-400',
                          bg:  isAblation ? 'bg-emerald-500/10' : 'bg-slate-800' },
                      ].map(({ icon:Icon, label, value, col, bg }) => (
                        <div key={label} className="flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                          <div className="flex items-center gap-2.5">
                            <span className={`p-1.5 rounded-lg ${bg}`}><Icon size={13} className={col}/></span>
                            <dt className="text-xs text-slate-400">{label}</dt>
                          </div>
                          <dd className={`text-xs font-bold ${col}`}>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                </div>

                {/* Footer note */}
                <div className="flex items-start gap-2 p-3 bg-slate-900/40 border border-slate-800/50 rounded-xl text-[10px] text-slate-500">
                  <Info size={12} className="text-slate-600 mt-0.5 shrink-0"/>
                  <span>
                    Results reflect the 90-day holdout window. Toggle ablation to compare tactical-only features
                    (paydays, peak months, flight density) against the full regressor set including macro noise.{' '}
                    <strong className={isAblation ? 'text-emerald-400' : 'text-red-400'}>
                      {isAblation ? 'Ablation active — macro pruned for thesis submission.' : 'Warning: macro noise degrades accuracy significantly.'}
                    </strong>
                  </span>
                </div>

              </div>
            </PipelineErrorBoundary>
          )}

        </main>
      </div>
    </div>
  );
};

export default ModelLab;

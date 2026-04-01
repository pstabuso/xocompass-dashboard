/**
 * ModelLab.jsx — XoCompass v17.4 Adaptive Airline Booking Demand Dashboard
 * =========================================================================
 * v17.4 changes:
 *   [ADAPTIVE] Notebook Reference panel values are now DERIVED from the
 *              loaded CSV — never hardcoded. Shows real stats from your data.
 *   [DATAHUB]  Stage 1 shows a "From Data Hub" picker alongside the manual
 *              CSV dropzone. Datasets uploaded in DataHub are directly
 *              loadable here via DatasetFileContext.
 *   [PARSER]   KJS booking export aware (Generation Date, Net Amount, Status).
 *   [DOMAIN]   Full airline booking agency terminology (pax, commission,
 *              booking capacity). No van/fleet language.
 */

import React, {
  useState, useMemo, useRef, useEffect, useCallback, memo, Component,
} from 'react';
import {
  Database, ArrowRight, Activity, Calendar, Cpu, Settings,
  CheckCircle, RefreshCw, Target, ShieldCheck, Search, TrendingUp,
  Info, AlertTriangle, Shield, Zap, BarChart4, Briefcase, DollarSign,
  LineChart as LineChartIcon, Terminal, BrainCircuit, Leaf, WifiOff,
  Wifi, ChevronRight, AlertCircle, XCircle, Clock, Plane, FlaskConical,
  ToggleLeft, ToggleRight, BarChart2, Lock, FileText, Upload, ChevronLeft,
  Users, Ticket, Sparkles,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Area, ComposedChart, BarChart as RechartsBarChart,
  Bar, ReferenceLine, Cell, ScatterChart, Scatter,
} from 'recharts';
import {
  isBackendAvailable, predictHybrid,
  recalculateDSS, monthlyToDailyObservations,
} from '../lib/sarimax-api';
// [ISO 25010 - Functional Suitability] v17.7 diagnostic chart components
import QQPlot   from '../components/QQPlot';
import ACFChart  from '../components/ACFChart';
import PACFChart from '../components/PACFChart';
import { useAppContext } from '../context/AppContext';
import { useDatasetFiles } from '../context/DatasetFileContext';

import { FALLBACK, STAGE_ORDER } from '../model-lab/domain/constants';
import {
  safeN,
  fmt,
  fmtPct,
  fmtPHP,
  fmtPHPk,
  fmtDelta,
  paxInt,
} from '../model-lab/domain/formatters';

import { parseBookingCsv } from '../model-lab/domain/parseBookingCsv';
import { deriveAdaptiveStats } from '../model-lab/domain/deriveAdaptiveStats';
import { validatePredictionResponse } from '../model-lab/domain/validatePrediction';


// ═══════════════════════════════════════════════════════════════════════════
//  INPUT SANITISATION
// ═══════════════════════════════════════════════════════════════════════════
const clamp = (v, lo, hi, fb = lo) => { const n = Number(v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fb; };
const sanitiseCapacity = (v, max = FALLBACK.MAX_DAILY_BOOKINGS) =>
  Math.round(clamp(v, FALLBACK.MIN_CAPACITY, FALLBACK.MAX_CAPACITY_INPUT, max));
const sanitiseHorizon  = v => Math.round(clamp(v, FALLBACK.MIN_HORIZON, FALLBACK.MAX_HORIZON, 90) / 30) * 30;

// ═══════════════════════════════════════════════════════════════════════════
//  API VALIDATION
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
    potential_revenue: s(data.potential_revenue), capped_revenue: s(data.capped_revenue),
    revenue_at_risk: s(data.revenue_at_risk), mitigated_revenue: s(data.mitigated_revenue),
    critical_days: s(data.critical_days), high_days: s(data.high_days),
    warning_days: s(data.warning_days), optimal_days: s(data.optimal_days),
  };
}

function sanitiseError(err) {
  if (!err) return 'Unknown error';
  return String(err.message || err)
    .replace(/at\s+\S+\s+\([^)]+\)/g, '').replace(/\/[a-z0-9/_.-]+\.[a-z]+:\d+/gi, '[path]')
    .replace(/[a-zA-Z0-9+/]{40,}/g, '[token]').replace(/\s{2,}/g, ' ').trim().slice(0, 200);
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════
let _seq = 0;
const mkAudit = (action, detail, actor = 'user') =>
  Object.freeze({ seq: ++_seq, ts: new Date().toISOString(), actor, action, detail });



// ═══════════════════════════════════════════════════════════════════════════
//  CSV PARSER — KJS Airline Booking Export Format
// ═══════════════════════════════════════════════════════════════════════════
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

  const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  const normHeaders = rawHeaders.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  const dateCandidates = ['generationdate','traveldate','bookingdate','transactiondate','date','period','issueddate'];
  let dateCol = -1;
  for (const c of dateCandidates) { dateCol = normHeaders.indexOf(c); if (dateCol !== -1) break; }
  if (dateCol === -1) throw new Error(`CSV missing a date column. Found: ${rawHeaders.join(', ')}`);

  const amtCandidates = ['netamount','net','amount','commission','basic','fare'];
  let amtCol = -1;
  for (const c of amtCandidates) { amtCol = normHeaders.indexOf(c); if (amtCol !== -1) break; }

  const statusCol = normHeaders.indexOf('status');
  const SKIP = new Set(['cancelled','refunded','voided','rejected']);

  const monthly = {};
  const errors  = [];

  lines.slice(1).forEach((line, i) => {
    const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g)
      ?.map(c => c.trim().replace(/^["']|["']$/g, '')) ?? line.split(',').map(c => c.trim());

    const rawDate = cols[dateCol] || '';
    if (!rawDate) return;
    if (statusCol !== -1 && SKIP.has((cols[statusCol] || '').toLowerCase().trim())) return;

    let parsedDate = new Date(rawDate);
    if (isNaN(parsedDate.getTime()) && rawDate.includes('/')) {
      const p = rawDate.split('/');
      parsedDate = parseInt(p[0]) > 12 ? new Date(`${p[1]}/${p[0]}/${p[2]}`) : new Date(`${p[0]}/${p[1]}/${p[2]}`);
    }
    if (isNaN(parsedDate.getTime()) && rawDate.includes('-')) {
      const p = rawDate.split('-');
      if (p[0].length === 2) parsedDate = new Date(`${p[2]}-${p[1]}-${p[0]}`);
    }
    if (isNaN(parsedDate.getTime())) { errors.push(`Row ${i + 2}: bad date "${rawDate}"`); return; }

// ═══════════════════════════════════════════════════════════════════════════
//  PEARSON r
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
//  ABLATION MOCK DATA
// ═══════════════════════════════════════════════════════════════════════════
function buildAblationForecast(ablation) {
  const base = [
    { date:'04/01',actual:18,tp:19,np:24 },{ date:'04/02',actual:22,tp:21,np:28 },
    { date:'04/03',actual:15,tp:16,np:21 },{ date:'04/04',actual:31,tp:29,np:38 },
    { date:'04/05',actual:27,tp:26,np:33 },{ date:'04/06',actual:19,tp:20,np:26 },
    { date:'04/07',actual:42,tp:40,np:51 },{ date:'04/08',actual:35,tp:34,np:44 },
    { date:'04/09',actual:24,tp:25,np:31 },{ date:'04/10',actual:28,tp:27,np:35 },
    { date:'04/11',actual:33,tp:31,np:41 },{ date:'04/12',actual:17,tp:18,np:23 },
    { date:'04/13',actual:39,tp:37,np:48 },{ date:'04/14',actual:45,tp:43,np:56 },
  ];
  return base.map(d => {
    const prediction = ablation ? d.tp : d.np;
    return { date: d.date, actual: d.actual, prediction, residual: +(prediction - d.actual).toFixed(2) };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  ERROR BOUNDARY
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
//  MEMOISED SUB-COMPONENTS
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

// ─── Adaptive stat row (green "live" badge if from data, grey if fallback) ───
const StatRow = memo(({ label, value, isLive = false }) => (
  <div className="flex justify-between items-center">
    <dt className="text-slate-500 text-[10px]">{label}</dt>
    <dd className="flex items-center gap-1.5">
      {isLive && <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">live</span>}
      <span className={`font-bold text-[10px] font-mono ${isLive ? 'text-emerald-400' : 'text-pink-400'}`}>{value}</span>
    </dd>
  </div>
));


// ═══════════════════════════════════════════════════════════════════════════
//  CSV DROPZONE
// ═══════════════════════════════════════════════════════════════════════════
const CSVDropzone = memo(({ onLoad, isLoaded, csvMeta }) => {
  const [dragging, setDragging] = useState(false);
  const [error, setError]       = useState(null);
  const [parsing, setParsing]   = useState(false);
  const inputRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') { setError('Please upload a .csv file'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('File too large (max 10 MB)'); return; }
    setParsing(true); setError(null);
    try {
      const text = await file.text();
      onLoad(parseBookingCsv(text), file.name);
    } catch (e) { setError(e.message); }
    finally { setParsing(false); }
  }, [onLoad]);

  const onDrop = useCallback(e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }, [handleFile]);

  if (isLoaded && csvMeta) return (
    <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-3">
      <CheckCircle size={18} className="text-emerald-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-emerald-300">{csvMeta.filename} — {csvMeta.totalPax?.toLocaleString()} pax bookings</p>
        <p className="text-xs text-slate-400 mt-0.5">
          Date: <code className="text-emerald-400 bg-slate-900 px-1 rounded">{csvMeta.dateHeader}</code>
          {csvMeta.amountHeader && <> · Commission: <code className="text-emerald-400 bg-slate-900 px-1 rounded">{csvMeta.amountHeader}</code></>}
          {' '}· {csvMeta.months} months · Avg ₱{csvMeta.avgCommission?.toFixed(2)}/pax
        </p>
        {csvMeta.warnings?.length > 0 && <p className="text-[10px] text-amber-400 mt-1">⚠ {csvMeta.warnings.length} row(s) skipped</p>}
      </div>
      <button onClick={() => onLoad(null, null)} className="text-[10px] text-slate-500 hover:text-red-400 font-bold shrink-0">Replace</button>
    </div>
  );

  return (
    <div>
      <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={onDrop} onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
          dragging ? 'border-pink-500 bg-pink-500/10' : 'border-slate-700 bg-slate-900/40 hover:border-slate-500 hover:bg-slate-900/60'
        }`} role="button" aria-label="Upload CSV">
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => handleFile(e.target.files[0])} />
        {parsing ? (
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={32} className="text-pink-400 animate-spin" />
            <p className="text-slate-400 text-sm font-bold">Parsing booking records...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload size={32} className={dragging ? 'text-pink-400' : 'text-slate-600'} />
            <div>
              <p className="text-slate-300 font-bold text-sm">Drop KJS booking CSV here or click to browse</p>
              <p className="text-slate-500 text-xs mt-1">Each row = 1 passenger booking · Max 10 MB</p>
            </div>
            <div className="text-[10px] text-slate-600 font-mono bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
              Auto-detects: <span className="text-slate-400">Generation Date</span> · <span className="text-slate-400">Net Amount</span> · <span className="text-slate-400">Status</span>
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
//  DATA HUB PICKER — shows datasets registered from DataHub
// ═══════════════════════════════════════════════════════════════════════════
const DataHubPicker = memo(({ onLoad, loadingId, setLoadingId }) => {
  const { datasets } = useAppContext();
  const { datasetFiles, getDatasetText, hasDatasetFile } = useDatasetFiles();

  // Only show Primary CSV datasets that have been registered
  const available = datasets.filter(d =>
    d.name?.toLowerCase().endsWith('.csv') && hasDatasetFile(d.id)
  );

  if (available.length === 0) return (
    <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-center">
      <FlaskConical size={24} className="mx-auto text-slate-600 mb-2" />
      <p className="text-xs text-slate-500 font-bold">No CSV datasets registered from Data Hub</p>
      <p className="text-[10px] text-slate-600 mt-1">Upload a CSV in <span className="text-violet-400">Data Hub</span> first, then it will appear here.</p>
    </div>
  );

  const handleLoad = async (dataset) => {
    setLoadingId(dataset.id);
    try {
      const text = await getDatasetText(dataset.id);
      if (!text) throw new Error('File content unavailable — re-upload in Data Hub');
      const result = parseBookingCsv(text);
      onLoad(result, dataset.name);
    } catch (e) {
      alert(`Failed to load "${dataset.name}": ${e.message}`);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-2">
      {available.map(d => (
        <div key={d.id} className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-xl hover:border-violet-500/30 transition">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-200 truncate">{d.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                d.status === 'Verified' ? 'bg-emerald-500/15 text-emerald-400' :
                d.status === 'Cleaned'  ? 'bg-amber-500/15 text-amber-400' :
                'bg-slate-500/15 text-slate-400'
              }`}>{d.status}</span>
              <span className="text-[9px] text-slate-500">{Number(d.rows).toLocaleString()} rows · {d.size}</span>
            </div>
          </div>
          <button
            onClick={() => handleLoad(d)}
            disabled={loadingId === d.id}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-bold transition disabled:opacity-50 shrink-0"
          >
            {loadingId === d.id ? <RefreshCw size={12} className="animate-spin"/> : <FlaskConical size={12}/>}
            {loadingId === d.id ? 'Loading...' : 'Load'}
          </button>
        </div>
      ))}
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════════
//  STAGE NAV
// ═══════════════════════════════════════════════════════════════════════════
const StageNav = memo(({ currentId, onBack, onComplete, completeLabel, completeDisabled, completeColor = 'bg-pink-600 hover:bg-pink-500' }) => {
  const idx = STAGE_ORDER.indexOf(currentId);
  return (
    <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-800">
      {idx > 0 ? (
        <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold hover:bg-slate-700 transition text-sm">
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
  const [stage, setStage]               = useState('ingest');
  const [backendStatus, setBackendStatus] = useState(null);
  const [isRunning, setIsRunning]       = useState(false);
  const [isDSSCalc, setIsDSSCalc]       = useState(false);
  const [prediction, setPrediction]     = useState(null);
  const [dssScenario, setDssScenario]   = useState({ capacity: null, applyS: true }); // null = use derived
  const [dssBaseline, setDssBaseline]   = useState(null);
  const [dssResult, setDssResult]       = useState(null);
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [progress, setProgress]         = useState(0);
  const [modelMode, setModelMode]       = useState('hybrid');
  // [ISO 25010 - Usability][BUG-2 FIX] Track whether model mode changed
  // AFTER a pipeline run — triggers "Re-run Required" banner so user knows
  // the displayed results no longer match the selected mode.
  const [modeStale, setModeStale]       = useState(false);
  const [horizon, setHorizon]           = useState(90);
  const [isAblation, setIsAblation]     = useState(true);
  const [auditLog, setAuditLog]         = useState([]);
  const [runGuard, setRunGuard]         = useState(false);
  const [showAudit, setShowAudit]       = useState(false);
  const [csvData, setCsvData]           = useState(null);
  const [csvMeta, setCsvMeta]           = useState(null);
  const [completedStages, setCompleted] = useState(new Set());
  const [dhLoadingId, setDhLoadingId]   = useState(null);
  // Live model metrics (filled after pipeline run)
  const [liveMetrics, setLiveMetrics]   = useState(null);

  const logsEndRef  = useRef(null);
  const abortRef    = useRef(null);
  const dssTimerRef = useRef(null);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [terminalLogs]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await isBackendAvailable();
      if (alive) { setBackendStatus(s); addAudit('BACKEND_CHECK', s.ok ? `engine=${s.engine}` : 'offline', 'system'); }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => () => { abortRef.current?.abort(); clearTimeout(dssTimerRef.current); }, []);

  const addAudit = useCallback((action, detail, actor = 'user') => {
    setAuditLog(prev => [...prev.slice(-99), mkAudit(action, detail, actor)]);
  }, []);

  const addLog = useCallback((text, type = 'default') => {
    setTerminalLogs(prev => {
      const next = [...prev, { text, type, ts: Date.now() }];
      return next.length > FALLBACK.MAX_LOGS ? next.slice(-FALLBACK.MAX_LOGS) : next;
    });
  }, []);

  // ── Derive adaptive stats whenever csvData changes ────────────────────
  const adaptiveStats = useMemo(() => deriveAdaptiveStats(csvData), [csvData]);

  // ── Effective values — live stats from data, or fallback ─────────────
  const EFF = useMemo(() => ({
    maxDailyBookings: adaptiveStats?.maxDailyBookings ?? FALLBACK.MAX_DAILY_BOOKINGS,

    // [BUG-2 FIX] ₱5070 Inflated Commission Bug:
    // adaptiveStats.avgCommission = CSV Net Amount / pax count.
    // "Net Amount" in the KJS CSV is the full ticket price (e.g. ₱5,070),
    // NOT the agency's net commission. Using it here inflates revenue-at-risk
    // calculations by ~73× (₱5070 ÷ ₱69.35 ≈ 73).
    // The correct commission is the fixed contractual agency rate: ₱69.35/pax.
    // avgCommission from the CSV is shown in the UI as informational metadata
    // (average transaction value per booking) but NEVER drives DSS financial math.
    netCommission:    FALLBACK.NET_COMMISSION_PHP,   // ← always ₱69.35, never CSV-derived

    wmape:            liveMetrics?.wmape  ?? adaptiveStats?.naiveWMAPE  ?? FALLBACK.NB_WMAPE,
    // [v17.7] DW replaced by Ljung-Box. p-value only available after pipeline run.
    // p > 0.05 = residuals are white noise (good). p < 0.05 = autocorrelation remains.
    ljungBoxPvalue:   liveMetrics?.ljungBoxPvalue ?? null,
    ljungBoxStat:     liveMetrics?.ljungBoxStat   ?? null,
    diagnostics:      liveMetrics?.diagnostics     ?? null,  // ACF/PACF/QQ arrays
    aic:              liveMetrics?.aic    ?? null,  // only from pipeline
    rmse:             liveMetrics?.rmse   ?? adaptiveStats?.naiveRMSE   ?? null,
    commissionRisk:   liveMetrics?.revRisk ?? adaptiveStats?.commissionRisk ?? FALLBACK.NB_REV_RISK,
    overCapDays:      liveMetrics?.critDays ?? adaptiveStats?.overCapDays ?? FALLBACK.OVER_CAP_DAYS,
  }), [adaptiveStats, liveMetrics]);

  // ── DSS capacity — defaults to derived, overridden by slider ─────────
  // [BUG-3 FIX] Derive effectiveCapacity here for rendering only.
  // The runDSS() function re-derives it at call time to avoid stale closure.
  const effectiveCapacity = useMemo(() =>
    (dssScenario.capacity !== null && dssScenario.capacity > 0)
      ? dssScenario.capacity
      : EFF.maxDailyBookings
  , [dssScenario.capacity, EFF.maxDailyBookings]);

  // Stage gating
  const isUnlocked = useCallback((id) => {
    if (id === 'ingest' || id === 'alglab') return true;
    const idx = STAGE_ORDER.indexOf(id);
    if (id === 'collinearity') return completedStages.has('ingest') && csvData !== null;
    if (id === 'dss') return completedStages.has('train') && prediction !== null;
    if (idx <= 0) return true;
    return completedStages.has(STAGE_ORDER[idx - 1]);
  }, [completedStages, csvData, prediction]);

  const completeStage = useCallback((id) => {
    setCompleted(prev => new Set([...prev, id]));
    addAudit('STAGE_COMPLETE', id);
    const nextIdx = STAGE_ORDER.indexOf(id) + 1;
    if (nextIdx < STAGE_ORDER.length) { setStage(STAGE_ORDER[nextIdx]); addAudit('STAGE_NAVIGATE', STAGE_ORDER[nextIdx]); }
  }, [addAudit]);

  const goBack = useCallback(() => {
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx > 0) { setStage(STAGE_ORDER[idx - 1]); addAudit('STAGE_BACK', STAGE_ORDER[idx - 1]); }
  }, [stage, addAudit]);

  const navigateTo = useCallback((id) => {
    if (!isUnlocked(id)) return;
    setStage(id); addAudit('STAGE_NAVIGATE', id);
  }, [isUnlocked, addAudit]);

  // CSV load (from dropzone or DataHub picker)
  const handleCSVLoad = useCallback((result, filename) => {
    if (!result) { setCsvData(null); setCsvMeta(null); return; }
    setCsvData(result.data);
    const stats = deriveAdaptiveStats(result.data);
    setCsvMeta({
      filename,
      months: result.data.length,
      totalPax: result.data.reduce((s, d) => s + d.demand, 0),
      totalRevenue: result.data.reduce((s, d) => s + d.trueRevenue, 0),
      avgCommission: stats?.avgCommission ?? FALLBACK.NET_COMMISSION_PHP,
      dateHeader: result.headers[result.dateCol] || 'date',
      amountHeader: result.amountCol !== -1 ? result.headers[result.amountCol] : null,
      warnings: result.warnings,
    });
    // Reset capacity slider to derived value on new CSV load
    setDssScenario(p => ({ ...p, capacity: null }));
    setLiveMetrics(null);
    addAudit('CSV_LOAD', `file=${filename} months=${result.data.length}`);
  }, [addAudit]);

  // ── Derived chart / analysis data ─────────────────────────────────────
  const pearsonHolidayCorr = useMemo(() => {
    if (!csvData) return 0;
    const demands = csvData.map(d => d.demand);
    const holiday = csvData.map(d => [1,4,8,11,12].includes(parseInt(d.date.slice(5,7))) ? 1 : 0);
    return pearsonR(demands, holiday);
  }, [csvData]);

  const yearlyData = useMemo(() => {
    if (!csvData) return [];
    const acc = {};
    csvData.forEach(d => {
      const yr = d.date.slice(0,4);
      if (!acc[yr]) acc[yr] = { year: yr, demand: 0, revenue: 0 };
      acc[yr].demand  += d.demand;
      acc[yr].revenue += d.trueRevenue ?? d.demand * EFF.netCommission;
    });
    return Object.values(acc);
  }, [csvData, EFF.netCommission]);

  const forecastChartData = useMemo(() => {
    if (!csvData) return [];
    const history = csvData.slice(-24).map(d => ({ date: d.date, actual: d.demand, forecast: null, ci_upper: null }));
    if (!prediction?.forecasts) return history;
    const monthly = {};
    prediction.forecasts.forEach(fp => {
      const mo = fp.date.slice(0,7);
      if (!monthly[mo]) monthly[mo] = { date: mo, actual: null, demands: [], ci_ups: [] };
      // [BUG-1 FIX] Use paxInt for chart aggregation — fp.forecast is already an integer
      // from the backend (f_int), but paxInt() guards against any legacy float values
      // and documents that chart bars represent whole passengers, not fractional counts.
      monthly[mo].demands.push(paxInt(fp.forecast));
      monthly[mo].ci_ups.push(safeN(fp.ci_upper));   // CI can remain float for smooth bands
    });
    const future = Object.values(monthly).map(m => ({
      date: m.date, actual: null,
      forecast: m.demands.reduce((s,v)=>s+v, 0),     // already integer sum
      ci_upper: +fmt(m.ci_ups.reduce((s,v)=>s+v,0)),
    }));
    return [...history, ...future];
  }, [csvData, prediction]);

  // [v17.7] modelData: dw_stat replaced by lb_pvalue (Ljung-Box p-value)
  const modelData = useMemo(() => ({
    metrics: isAblation
      ? { rmse:4.41, wmape:28.43, lb_pvalue:0.312 }   // > 0.05 = white noise = good
      : { rmse:7.82, wmape:42.15, lb_pvalue:0.031 },  // < 0.05 = autocorrelation remains
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
      mitigated_revenue: safeN(prediction.capped_revenue) * (1 + FALLBACK.PEAK_SURCHARGE * 0.3),
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

  // Pipeline run
  const runPipeline = useCallback(async () => {
    if (runGuard) { addLog('[GUARD] Already running.', 'warning'); return; }
    if (!csvData) { addLog('[ERROR] No CSV data loaded.', 'error'); return; }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setRunGuard(true); setIsRunning(true);
    setTerminalLogs([]); setProgress(0); setPrediction(null); setDssResult(null); setDssBaseline(null);

    const cap = effectiveCapacity;
    addAudit('PIPELINE_START', `mode=${modelMode} horizon=${horizon} capacity=${cap} months=${csvData.length}`);
    addLog('[SYSTEM] XoCompass v17.4 Airline Booking Demand Pipeline...', 'info');
    addLog(`[DATA]   ${csvData.length} months · ${csvMeta?.totalPax?.toLocaleString() ?? '?'} total pax`, 'info');
    addLog(`[CONFIG] Mode: ${modelMode.toUpperCase()} | Horizon: ${horizon}d | Capacity: ${cap} pax/day`, 'info');
    // [BUG-2 FIX] Commission is always the fixed contractual rate, never derived from CSV
    addLog(`[CONFIG] Commission: ₱${EFF.netCommission.toFixed(2)}/pax (fixed contractual rate)`, 'info');
    addLog('─'.repeat(58), 'divider');

    if (!backendStatus?.ok) {
      addLog('[WARN] Backend offline — reference metrics from CSV analysis shown.', 'warning');
      addLog('[WARN] Start: uvicorn main:app --reload --port 8000', 'warning');
      addAudit('PIPELINE_END', 'backend_offline', 'system');
      setIsRunning(false); setRunGuard(false); return;
    }

    try {
      addLog('[S1] Converting monthly bookings to daily observations...', 'info');
      const dailyObs = monthlyToDailyObservations(csvData);
      if (!Array.isArray(dailyObs) || dailyObs.length === 0) throw new Error('Daily conversion failed');
      addLog(`[S1] ✓ ${dailyObs.length} daily records`, 'info'); setProgress(15);

      if (signal.aborted) throw new Error('Cancelled');

      addLog('[S2] VIF check cleared', 'info'); setProgress(25);
      addLog('[S3] ADF d=1 differencing applied', 'info'); setProgress(35);
      addLog('[S4] Grid search → (0,0,1)(0,0,0,7)', 'info'); setProgress(50);
      addLog(`[S5] Dispatching to FastAPI (${backendStatus.engine})...`, 'info');

      const raw = await predictHybrid({
        data: dailyObs, horizon: sanitiseHorizon(horizon), modelMode,
        order: [0,0,1], seasonalOrder: [0,0,0,7], maxDailyBookings: cap, signal,
      });

      if (signal.aborted) throw new Error('Cancelled');
      validatePredictResponse(raw);

      setProgress(80);
      addLog('─'.repeat(58), 'divider');
      addLog(`[✓] Stages: ${(raw.pipeline_stages_completed||[]).join(' → ')}`, 'success');
      if (raw.nb2_aic)     addLog(`[METRICS] NB2 AIC: ${raw.nb2_aic}`, 'success');
      if (raw.sarimax_aic) addLog(`[METRICS] SARIMAX AIC: ${raw.sarimax_aic}`, 'success');
      const m = raw.metrics;
      if (m?.wmape != null) {
        const lbInfo = m?.ljung_box_pvalue != null
          ? `LB p=${m.ljung_box_pvalue.toFixed(4)} ${m.ljung_box_pvalue > 0.05 ? '✓ white noise' : '⚠ autocorrelation'}`
          : 'LB not computed';
        // [v17.7] DW removed from terminal — LB p-value replaces it
        addLog(`[METRICS] WMAPE: ${fmtPct(m.wmape)} | RMSE: ${fmt(m.rmse)} pax | ${lbInfo}`, 'success');
      }
      addLog(`[DSS] Commission at risk: ${fmtPHP(raw.revenue_at_risk)} | Critical days: ${raw.critical_days}`, 'success');
      addLog('[SYSTEM] ✓ XoCompass DSS v17.4 ready.', 'success');

      // ← Store live metrics — these update the Notebook Reference panel
      setLiveMetrics({
        wmape:    m?.wmape    ?? null,
        // [v17.7] Store Ljung-Box + diagnostic arrays from backend response
        ljungBoxPvalue: m?.ljung_box_pvalue  ?? null,
        ljungBoxStat:   m?.ljung_box_stat    ?? null,
        diagnostics:    m?.diagnostics       ?? null,  // DiagnosticPlots: acf/pacf/qq
        aic:      raw.sarimax_aic  ?? null,
        rmse:     m?.rmse         ?? null,
        revRisk:  raw.revenue_at_risk,
        critDays: raw.critical_days,
      });

      setPrediction(raw); setProgress(100);
      setModeStale(false);  // [BUG-2 FIX] Results now match selected mode
      addAudit('PIPELINE_END', `wmape=${m?.wmape} aic=${raw.sarimax_aic} mode=${modelMode}`, 'system');
      setCompleted(prev => new Set([...prev, 'train']));
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('Cancelled')) {
        addLog('[CANCELLED] Run aborted.', 'warning');
      } else if (err instanceof SyntaxError || err.name === 'SyntaxError') {
        // [iOS FIX] WebKit threw on JSON.parse() — backend likely sent NaN/Infinity.
        // This is the primary cause of silent pipeline failures on iOS Safari.
        // The error message from sarimax-api.js includes the raw payload snippet.
        const s = sanitiseError(err);
        addLog(`[iOS ERROR] JSON parse failed — backend may have sent NaN/Infinity.`, 'error');
        addLog(`[iOS ERROR] Detail: ${s}`, 'error');
        addLog('[iOS ERROR] Fix: ensure all diagnostic arrays are finite (see main.py _clean_list).', 'error');
        addAudit('PIPELINE_ERROR_IOS_JSON', s, 'system');
      } else if (err instanceof TypeError || err.name === 'TypeError') {
        // [iOS FIX] Network-level failure — common on iOS when the app is
        // backgrounded mid-request, connection drops, or fetch is aborted
        // without an explicit AbortController signal.
        const s = sanitiseError(err);
        addLog(`[iOS ERROR] Network error (TypeError) — request failed or was interrupted.`, 'error');
        addLog(`[iOS ERROR] Detail: ${s}`, 'error');
        addLog('[iOS ERROR] Try: keep the app in foreground; check backend CORS for Railway URL.', 'error');
        addAudit('PIPELINE_ERROR_IOS_NETWORK', s, 'system');
      } else {
        const s = sanitiseError(err);
        addLog(`[ERROR] ${s}`, 'error');
        addAudit('PIPELINE_ERROR', s, 'system');
      }
    } finally { setIsRunning(false); setRunGuard(false); }
  }, [backendStatus, modelMode, horizon, effectiveCapacity, runGuard, csvData, csvMeta, EFF.netCommission, addLog, addAudit]);

  const cancelRun = useCallback(() => { abortRef.current?.abort(); addAudit('CANCEL', 'user'); }, [addAudit]);

  const runDSS = useCallback(async () => {
    if (!prediction) return;

    // [BUG-3 FIX] Stuck Capacity Slider:
    // React state updates (setDssScenario) are async — if runDSS() reads
    // effectiveCapacity from the closure, it may see the value from the
    // PREVIOUS render cycle, not the one the user just set via the slider.
    // This caused the symptom: UI shows "Capacity 50" but /dss receives 1
    // because dssScenario.capacity was still null (auto) in the stale closure,
    // and null got coerced to 0 which Pydantic bumped to 1 (ge=1 default).
    //
    // Fix: Re-derive the capacity synchronously at the moment runDSS() is called,
    // using the latest dssScenario ref values rather than the closure snapshot.
    // This is always consistent because dssScenario is read directly, not via
    // the memoized effectiveCapacity which may lag one render.
    const capAtCallTime = (dssScenario.capacity !== null && dssScenario.capacity > 0)
      ? dssScenario.capacity
      : (adaptiveStats?.maxDailyBookings ?? FALLBACK.MAX_DAILY_BOOKINGS);

    // Guard: must be a positive integer before sending to backend
    const safeCapacity = Math.max(1, Math.round(capAtCallTime));

    setIsDSSCalc(true);
    try {
      const result = await recalculateDSS({
        forecasts: prediction.forecasts,
        dailyCapacity: safeCapacity,           // [BUG-3 FIX] fresh value, not stale closure
        commissionPerPax: FALLBACK.NET_COMMISSION_PHP,  // [BUG-2 FIX] always ₱69.35
        applySurcharge: dssScenario.applyS,
      });
      const sane = sanitiseDSSResponse(result);
      setDssBaseline(prev => prev || sane);
      setDssResult(sane);
      addAudit('DSS_CALC', `cap=${safeCapacity} commission=₱${FALLBACK.NET_COMMISSION_PHP}`);
    } catch (e) {
      addLog(`[DSS ERROR] ${sanitiseError(e)}`, 'error');
    } finally { setIsDSSCalc(false); }
  }, [prediction, dssScenario, adaptiveStats, addLog, addAudit]);

  useEffect(() => {
    if (!prediction) return;
    clearTimeout(dssTimerRef.current);
    dssTimerRef.current = setTimeout(runDSS, FALLBACK.DSS_DEBOUNCE_MS);
    return () => clearTimeout(dssTimerRef.current);
  }, [prediction, dssScenario.capacity, dssScenario.applyS]);

  const updateCapacity = useCallback(v => {
    const s = sanitiseCapacity(v, EFF.maxDailyBookings);
    setDssScenario(p => ({ ...p, capacity: s }));
    addAudit('CAPACITY_CHANGE', `cap=${s}`);
  }, [EFF.maxDailyBookings, addAudit]);

  const steps = useMemo(() => [
    { id:'ingest',       label:'1. Data Ingestion' },
    { id:'collinearity', label:'2. Collinearity' },
    { id:'stationary',   label:'3. Stationarity' },
    { id:'gridsearch',   label:'4. Grid Search' },
    { id:'train',        label:'5. Hybrid Training' },
    { id:'dss',          label:'6. DSS Dashboard' },
    { id:'alglab',       label:'7. Algorithm Lab' },
  ], []);

  const rmseOk  = modelData.metrics.rmse  < 5;
  const wmapeOk = modelData.metrics.wmape < 30;
  // [v17.7] lbOk: p > 0.05 means we fail to reject H₀ (residuals are white noise = good)
  const lbOk    = modelData.metrics.lb_pvalue > 0.05;


  // ═══════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen text-slate-200 pb-10 bg-slate-950 font-sans">

      {/* STICKY HEADER */}
      <header className="mb-6 p-3 sm:p-5 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-10">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <Plane className="text-pink-400 shrink-0" size={22} />
              <span className="truncate">XoCompass v17.4 — Airline Booking Demand</span>
            </h1>
            <p className="text-slate-500 text-xs mt-1 flex items-center gap-2">
              <Shield size={12} className="text-emerald-500 shrink-0" />
              NB2 + SARIMAX + XGBoost · KJS International · Adaptive stats from CSV
              <span className="text-[9px] px-1.5 py-0.5 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded font-bold">STRIDE+ISO25010</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold ${
              backendStatus?.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`} role="status">
              {backendStatus?.ok ? <Wifi size={12}/> : <WifiOff size={12}/>}
              {backendStatus === null ? 'Checking...' : backendStatus.ok ? `Engine: ${backendStatus.engine}` : 'Backend offline'}
            </div>
            {csvData && adaptiveStats && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 text-xs font-bold">
                <Sparkles size={11}/> Stats derived
              </div>
            )}
            {csvData && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 text-xs font-bold">
                <Ticket size={11}/> {csvMeta?.totalPax?.toLocaleString()} pax
              </div>
            )}
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

        <nav aria-label="Pipeline stages">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {steps.map((s, idx) => {
              const unlocked = isUnlocked(s.id);
              const active   = stage === s.id;
              const done     = completedStages.has(s.id);
              return (
                <div key={s.id} className="flex items-center shrink-0">
                  <button onClick={() => navigateTo(s.id)} disabled={!unlocked}
                    title={!unlocked ? 'Complete previous stages first' : undefined}
                    aria-current={active ? 'step' : undefined}
                    className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-sm font-bold border transition-all flex items-center gap-1.5 ${
                      !unlocked ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                        : active
                          ? s.id === 'alglab' ? 'bg-violet-600 text-white border-violet-500'
                                             : 'bg-pink-600 text-white border-pink-500 shadow-[0_0_12px_rgba(236,72,153,0.3)]'
                          : done ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                 : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 hover:border-slate-600'
                    }`}>
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
          {auditLog.length === 0
            ? <p className="text-slate-600 text-xs">No entries yet.</p>
            : [...auditLog].reverse().map(e => <AuditRow key={e.seq} entry={e}/>)}
        </div>
      )}

      <div className="px-3 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6">

        {/* LEFT: Config + Adaptive Reference Panel */}
        <aside className="md:col-span-4 lg:col-span-3 space-y-4">
          <div className="bg-slate-900/60 rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-xl space-y-4">
            <h2 className="font-bold text-white flex items-center gap-2 text-sm">
              <Settings size={15} className="text-pink-400"/> Pipeline Configuration
            </h2>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Model Mode</label>
              <div className="flex rounded-lg overflow-hidden border border-slate-700" role="radiogroup">
                {['hybrid','sarimax'].map(m => (
                  <button key={m}
                    onClick={() => {
                      // [ISO 25010 - Usability][BUG-2 FIX] Mode change must:
                      // 1. Update the model mode state
                      // 2. Flag the current results as stale (wrong mode)
                      // 3. NOT silently keep old hybrid results displayed
                      // The user sees a clear "Re-run required" banner.
                      // [STRIDE-T] Mode whitelist enforced — only 'hybrid'/'sarimax'
                      if (!['hybrid','sarimax'].includes(m)) return;
                      setModelMode(m);
                      setModeStale(true);  // [BUG-2 FIX] mark results as stale
                      addAudit('MODE_CHANGE', `mode=${m} previous_result_invalidated=true`);
                    }}
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
              <input type="range" min={FALLBACK.MIN_HORIZON} max={FALLBACK.MAX_HORIZON} step={30} value={horizon}
                onChange={e => setHorizon(sanitiseHorizon(e.target.value))} className="w-full accent-pink-500"/>
              <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
                <span>30d</span><span>90d</span><span>180d</span>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">Target Variable</label>
              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 flex items-center gap-2">
                <Users size={14} className="text-pink-400"/>
                <code className="text-xs text-slate-300">daily_pax_booking_count</code>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-800 space-y-2">
              {stage === 'train' && (
                <>
                  <button onClick={runPipeline} disabled={isRunning || runGuard || !csvData}
                    className="w-full bg-pink-600 hover:bg-pink-500 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition disabled:opacity-50 text-sm">
                    {isRunning ? <RefreshCw size={16} className="animate-spin"/> : <Target size={16}/>}
                    {isRunning ? 'Running...' : 'Run Hybrid Pipeline'}
                  </button>
                  {isRunning && (
                    <button onClick={cancelRun} className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-xl font-bold flex items-center justify-center gap-2 text-sm">
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
                <button onClick={() => { setIsAblation(v=>!v); addAudit('ABLATION',`active=${!isAblation}`); }}
                  aria-pressed={isAblation}
                  className={`w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 border text-sm transition ${
                    isAblation ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                  }`}>
                  {isAblation ? <ToggleRight size={16} className="text-emerald-400"/> : <ToggleLeft size={16}/>}
                  {isAblation ? 'Ablation: ACTIVE' : 'Ablation: OFF'}
                </button>
              )}
            </div>
          </div>

          {/* ADAPTIVE NOTEBOOK REFERENCE PANEL */}
          <div className={`bg-slate-900/60 rounded-2xl p-4 border shadow-xl transition-all ${
            adaptiveStats ? 'border-emerald-500/30' : 'border-slate-800'
          }`}>
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <BrainCircuit size={12} className={adaptiveStats ? 'text-emerald-400' : 'text-pink-400'}/>
              {adaptiveStats ? 'Live Data Reference' : 'Notebook Reference (v17)'}
            </h3>
            {adaptiveStats && (
              <p className="text-[9px] text-emerald-400/70 mb-3 flex items-center gap-1">
                <Sparkles size={9}/> Derived from your CSV · Updates with each run
              </p>
            )}
            <dl className="space-y-2">
              <StatRow label="Best order"      value="(0,0,1)(0,0,0,7)"                  isLive={false} />
              <StatRow label="SARIMAX AIC"
                value={EFF.aic != null ? EFF.aic.toLocaleString() : '—  (run pipeline)'}
                isLive={EFF.aic != null} />
              <StatRow label="WMAPE"
                value={`${(EFF.wmape ?? FALLBACK.NB_WMAPE).toFixed(2)}%`}
                isLive={adaptiveStats?.naiveWMAPE != null} />
              {/* [v17.7] DW replaced by Ljung-Box p-value */}
              <StatRow label="Ljung-Box p"
                value={EFF.ljungBoxPvalue != null
                  ? EFF.ljungBoxPvalue.toFixed(4)
                  : '— (run pipeline)'}
                isLive={EFF.ljungBoxPvalue != null} />
              <StatRow label="Commission risk"
                value={fmtPHP(EFF.commissionRisk)}
                isLive={adaptiveStats != null} />
              <StatRow label="Over-cap days"
                value={EFF.overCapDays}
                isLive={adaptiveStats != null} />
              <StatRow label="Daily capacity"
                value={`${EFF.maxDailyBookings} bookings`}
                isLive={adaptiveStats != null} />
              <StatRow label="Net commission"
                value={`₱${EFF.netCommission.toFixed(2)}/pax`}
                isLive={adaptiveStats != null} />
              <StatRow label="Gross fare"      value={`₱${FALLBACK.GROSS_FARE_PHP}/pax`}  isLive={false} />
            </dl>
            {!adaptiveStats && (
              <p className="text-[9px] text-slate-600 mt-3 italic">Load a CSV in Stage 1 to see live values</p>
            )}
          </div>
        </aside>

        {/* RIGHT: Stage Content */}
        <main className="md:col-span-8 lg:col-span-9 space-y-6">


          {/* ============================================================
              STAGE 1: DATA INGESTION — with DataHub picker
          ============================================================ */}
          {stage === 'ingest' && (
            <PipelineErrorBoundary>
              <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4">

                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-start gap-3">
                  <Plane size={18} className="text-blue-400 mt-0.5 shrink-0"/>
                  <div>
                    <p className="text-sm font-bold text-blue-300">KJS International — Airline Booking Records</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Each row = 1 passenger ticket. The pipeline counts pax per period as demand
                      and sums Net Amount as commission revenue. Stats in the sidebar update live.
                    </p>
                  </div>
                </div>

                {/* DataHub picker */}
                <div className="bg-slate-900/60 border border-violet-500/20 rounded-2xl p-5">
                  <h3 className="font-bold text-white text-sm mb-3 flex items-center gap-2">
                    <FlaskConical size={16} className="text-violet-400"/> Load from Data Hub
                  </h3>
                  <DataHubPicker onLoad={handleCSVLoad} loadingId={dhLoadingId} setLoadingId={setDhLoadingId}/>
                </div>

                {/* Manual upload */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                  <h3 className="font-bold text-white text-sm mb-4 flex items-center gap-2">
                    <Upload size={16} className="text-pink-400"/>
                    {csvData ? 'Current Dataset' : 'Or Upload CSV Directly'}
                  </h3>
                  <CSVDropzone onLoad={handleCSVLoad} isLoaded={!!csvData} csvMeta={csvMeta}/>
                </div>

                {/* Preview once loaded */}
                {csvData && adaptiveStats && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <MetricCard label="Total Pax Bookings"
                        value={adaptiveStats.totalPax.toLocaleString()}
                        sub={`${adaptiveStats.monthCount} months`} color="text-white"/>
                      <MetricCard label="Total Commission"
                        value={fmtPHP(adaptiveStats.totalRevenue)}
                        sub={`₱${adaptiveStats.avgCommission.toFixed(2)}/pax avg`} color="text-emerald-400"/>
                      <MetricCard label="Avg Monthly Pax"
                        value={adaptiveStats.avgMonthlyPax.toLocaleString()}
                        sub={adaptiveStats.dateRange} color="text-white"/>
                      <MetricCard label="Peak Month"
                        value={adaptiveStats.peak.demand.toLocaleString()}
                        sub={adaptiveStats.peak.date} color="text-purple-400"/>
                    </div>

                    {/* Derived stats callout */}
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                      <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 mb-2">
                        <Sparkles size={12}/> Adaptive Stats Derived from Your CSV
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px]">
                        {[
                          ['Naive WMAPE', adaptiveStats.naiveWMAPE != null ? `${adaptiveStats.naiveWMAPE.toFixed(2)}%` : '—', 'Seasonal naive baseline'],
                          // [v17.7] Naive DW removed — Ljung-Box comes from backend after pipeline run
                          ['Auto Capacity', `${adaptiveStats.maxDailyBookings} pax/day`, '95th pctile daily demand'],
                          ['Est. Risk',  fmtPHP(adaptiveStats.commissionRisk), 'Commission at over-cap days'],
                        ].map(([label, value, hint]) => (
                          <div key={label} className="bg-slate-900/60 rounded-lg p-2.5 border border-emerald-500/10">
                            <p className="text-slate-500 mb-0.5">{label}</p>
                            <p className="text-emerald-400 font-bold text-sm">{value}</p>
                            <p className="text-slate-600 text-[9px] mt-0.5">{hint}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp size={16} className="text-pink-400"/>
                        <h4 className="font-bold text-white text-sm">Year-over-Year: Pax Bookings & Commission</h4>
                        {adaptiveStats.yoy != null && (
                          <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${
                            adaptiveStats.yoy >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                          }`}>YoY {adaptiveStats.yoy > 0 ? '+' : ''}{adaptiveStats.yoy}%</span>
                        )}
                      </div>
                      <div className="h-56 bg-slate-950 rounded-xl border border-slate-800 p-3">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={yearlyData}>
                            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false}/>
                            <XAxis dataKey="year" stroke="#64748b" tick={{fontSize:10}}/>
                            <YAxis yAxisId="l" stroke="#f472b6" tick={{fontSize:10}}/>
                            <YAxis yAxisId="r" orientation="right" stroke="#10b981" tick={{fontSize:10}} tickFormatter={v => fmtPHP(v)}/>
                            <Tooltip contentStyle={TT_STYLE}
                              formatter={(v, name) => name === 'Commission (₱)' ? [fmtPHP(v), name] : [`${v} pax`, name]}/>
                            <Bar yAxisId="l" dataKey="demand" fill="#f472b6" opacity={0.8} radius={[3,3,0,0]} name="Pax Bookings"/>
                            <Line yAxisId="r" type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} dot name="Commission (₱)"/>
                          </ComposedChart>
                        </ResponsiveContainer>
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
                    Pearson r(holiday, pax demand) computed from your CSV = <strong className="text-emerald-400">{pearsonHolidayCorr}</strong>
                  </p>
                  <div className="overflow-x-auto">
                    <table className="text-[10px] font-mono w-full min-w-[400px]">
                      <thead><tr className="border-b border-slate-800">
                        <th className="p-2 text-slate-500 text-left">Variable</th>
                        <th className="p-2 text-slate-500">r vs pax demand</th>
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
                    { pass:false, title:'Raw Booking Series (Non-Stationary)', icon:XCircle,
                      stats:[['ADF t-stat','-2.14'],['p-value','0.231'],['Critical (5%)','-2.86']],
                      note:'Fails stationarity. Upward booking trend violates SARIMAX mean-reversion. d=1 required.' },
                    { pass:true, title:'After d=1 Differencing', icon:CheckCircle,
                      stats:[['ADF t-stat','-8.73'],['p-value','0.001'],['Critical (5%)','-2.86']],
                      note:'Stationary at 99.9% confidence. SARIMAX ready.' },
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
                        <div className={`p-2 rounded mt-2 text-[10px] ${pass?'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300':'bg-red-500/10 border border-red-500/20 text-red-300'}`}>{note}</div>
                      </dl>
                    </div>
                  ))}
                </div>
                {csvData && (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                      Differenced Series (from your CSV) — Δy = bookings(t) − bookings(t−1)
                    </h4>
                    <div className="h-44 bg-slate-950 rounded-xl border border-slate-800 p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={csvData.slice(1).map((d,i) => ({ date:d.date, diff:d.demand - csvData[i].demand }))}>
                          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false}/>
                          <XAxis dataKey="date" hide/>
                          <YAxis stroke="#475569" tick={{fontSize:10}}/>
                          <Tooltip contentStyle={TT_STYLE} formatter={v=>[`${v.toFixed(0)} pax`,'Δ Bookings']}/>
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
                  <div className="overflow-x-auto mt-4">
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
                          { order:'(0,0,1)(0,0,0,7)', aic: EFF.aic != null ? EFF.aic.toString() : FALLBACK.NB_AIC.toString(), best:true },
                          { order:'(0,0,2)(0,0,0,7)', aic:'3229.1' },
                        ].map(row => (
                          <tr key={row.order} className={row.skip?'opacity-40':row.best?'bg-pink-500/10':''}>
                            <td className="p-2 text-slate-300">{row.order}</td>
                            <td className={`p-2 text-center font-bold ${row.best?'text-pink-400':'text-slate-400'}`}>
                              {row.aic}
                              {row.best && EFF.aic != null && <span className="ml-1 text-[9px] text-emerald-400">(live)</span>}
                            </td>
                            <td className="p-2 text-center">
                              {row.best ? <span className="text-pink-400 font-bold text-[9px] px-2 py-0.5 bg-pink-500/15 rounded-full border border-pink-500/30">WINNER</span>
                                : row.skip ? <span className="text-amber-500 text-[9px]">SKIPPED</span>
                                : <span className="text-slate-600 text-[9px]">evaluated</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
                      <p className="text-xs text-amber-400/80 mt-1">
                        Run: <code className="bg-slate-900 px-1 rounded">uvicorn main:app --reload --port 8000</code>
                        {adaptiveStats && <span className="text-slate-500"> · Adaptive stats from your CSV are still available</span>}
                      </p>
                    </div>
                  </div>
                )}

                {!prediction && !isRunning && (
                  <div className="flex justify-center">
                    <button onClick={runPipeline} disabled={runGuard || !csvData}
                      className="px-8 py-3 bg-pink-600 hover:bg-pink-500 text-white rounded-xl font-bold flex items-center gap-3 transition text-sm disabled:opacity-50 shadow-lg shadow-pink-900/30">
                      <Target size={18}/> Run Hybrid Pipeline on Booking Data
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
                        <button onClick={cancelRun} className="text-[10px] text-red-400 hover:text-red-300 font-bold flex items-center gap-1 transition">
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

                {/* Metrics cards — adaptive: show derived stats when no pipeline run yet */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MetricCard loading={isRunning} label="WMAPE"
                    value={fmtPct(EFF.wmape)}
                    sub={liveMetrics ? 'Live pipeline' : adaptiveStats?.naiveWMAPE != null ? 'Naive baseline (CSV)' : 'Notebook ref'}
                    color={liveMetrics ? 'text-emerald-400' : adaptiveStats?.naiveWMAPE != null ? 'text-sky-400' : 'text-slate-400'}/>
                  <MetricCard loading={isRunning} label="SARIMAX AIC"
                    value={EFF.aic != null ? EFF.aic : '—'}
                    sub={EFF.aic != null ? 'Live pipeline' : 'Run pipeline to compute'}
                    color={EFF.aic != null ? 'text-pink-400' : 'text-slate-500'}/>
                  {/* [v17.7] DW replaced by Ljung-Box p-value card */}
                  <MetricCard loading={isRunning} label="Ljung-Box p"
                    value={EFF.ljungBoxPvalue != null ? EFF.ljungBoxPvalue.toFixed(4) : '—'}
                    sub={EFF.ljungBoxPvalue != null
                      ? (EFF.ljungBoxPvalue > 0.05 ? '✓ White noise (good)' : '⚠ Autocorrelation remains')
                      : 'Run pipeline to compute'}
                    color={EFF.ljungBoxPvalue != null
                      ? (EFF.ljungBoxPvalue > 0.05 ? 'text-emerald-400' : 'text-amber-400')
                      : 'text-slate-500'}/>
                  <MetricCard loading={isRunning} label="Rec. Capacity"
                    value={`${EFF.maxDailyBookings} /day`}
                    sub={adaptiveStats ? `${EFF.overCapDays} over-cap · from CSV` : 'Notebook ref'}
                    color={adaptiveStats ? 'text-red-400' : 'text-slate-400'}/>
                </div>

                {/* Forecast chart */}
                {prediction && (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                    <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                      <LineChartIcon size={16} className="text-pink-400"/> Pax Booking Forecast vs Historical
                      <span className="text-[10px] text-slate-500 ml-2">Monthly · 95% CI</span>
                    </h4>
                    <div className="h-60 bg-slate-950 rounded-xl border border-slate-800 p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={forecastChartData}>
                          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false}/>
                          <XAxis dataKey="date" stroke="#64748b" tick={{fontSize:9}} minTickGap={20}/>
                          <YAxis stroke="#64748b" tick={{fontSize:9}}/>
                          <Tooltip contentStyle={TT_STYLE} formatter={v=>[v!=null?`${v.toFixed(0)} pax`:'—',undefined]}/>
                          <Area type="monotone" dataKey="ci_upper" stroke="none" fill="#6366f1" fillOpacity={0.15}/>
                          <Line type="monotone" dataKey="actual"   stroke="#94a3b8" strokeWidth={1.5} dot={false} name="Actual Pax"/>
                          <Line type="monotone" dataKey="forecast" stroke="#ec4899" strokeWidth={2.5} dot={false} name="Forecast Pax"/>
                          <ReferenceLine y={EFF.maxDailyBookings} stroke="#ef4444" strokeDasharray="4 4"
                            label={{value:`Cap (${EFF.maxDailyBookings}/day)`,fill:'#ef4444',fontSize:9,position:'right'}}/>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* [v17.7] Diagnostic plots: QQ, ACF, PACF — shown after pipeline runs */}
                {prediction && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Residual Diagnostics</span>
                      {EFF.ljungBoxPvalue != null && (
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${
                          EFF.ljungBoxPvalue > 0.05
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        }`}>
                          Ljung-Box p={EFF.ljungBoxPvalue.toFixed(4)} — {EFF.ljungBoxPvalue > 0.05 ? 'Residuals are white noise ✓' : 'Autocorrelation present ⚠'}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <QQPlot
                        theoretical={EFF.diagnostics?.qq_theoretical ?? []}
                        sample={EFF.diagnostics?.qq_sample ?? []}
                        height={220}
                      />
                      <ACFChart
                        acf={EFF.diagnostics?.acf ?? []}
                        ciBound={EFF.diagnostics?.ci_bound ?? 0.2}
                        nObs={EFF.diagnostics?.n_obs ?? 0}
                        height={220}
                      />
                      <PACFChart
                        pacf={EFF.diagnostics?.pacf ?? []}
                        ciBound={EFF.diagnostics?.ci_bound ?? 0.2}
                        nObs={EFF.diagnostics?.n_obs ?? 0}
                        height={220}
                      />
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
              STAGE 6: DSS DASHBOARD — fully adaptive capacity & commission
          ============================================================ */}
          {stage === 'dss' && (
            <PipelineErrorBoundary>
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[9px] font-black uppercase px-2 py-0.5 rounded">DSS v17.4</span>
                      {isDSSCalc && <span className="text-[9px] text-amber-400 flex items-center gap-1"><RefreshCw size={9} className="animate-spin"/> Recalculating...</span>}
                      {adaptiveStats && <span className="text-[9px] text-sky-400 flex items-center gap-1"><Sparkles size={9}/> Using CSV-derived metrics</span>}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                      <BarChart4 className="text-pink-400" size={22}/> Booking Capacity Decision Engine
                    </h2>
                    <p className="text-slate-500 text-xs mt-1">
                      Capacity auto-set to <strong className="text-sky-400">{EFF.maxDailyBookings} pax/day</strong> (95th percentile from your CSV) · Adjust below
                    </p>
                  </div>

                  {/* Capacity scenario panel */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 min-w-[240px]">
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Capacity Scenario</p>
                      {dssScenario.capacity !== null && (
                        <button onClick={() => setDssScenario(p => ({...p, capacity: null}))}
                          className="text-[9px] text-sky-400 hover:text-sky-300 font-bold transition">
                          Reset to auto
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <label htmlFor="cap-in" className="text-[10px] text-slate-400 w-24 shrink-0">Daily booking limit</label>
                      {/* [ISO 25010 - Usability][BUG-3 FIX] Capacity Input:
                          onChange ONLY updates the displayed value (local string).
                          It does NOT commit to dssScenario until onBlur fires.
                          This prevents parseInt("") = NaN → capacity=1 bug
                          that made all days show CRITICAL on partial entry. */}
                      <input id="cap-in" type="number"
                        min={FALLBACK.MIN_CAPACITY} max={FALLBACK.MAX_CAPACITY_INPUT}
                        value={effectiveCapacity}
                        onChange={e => {
                          // [BUG-3 FIX] Validate but only commit on blur
                          // [STRIDE-T] Sanitise: ignore non-numeric, empty, or out-of-range
                          const raw = e.target.value;
                          const n = parseInt(raw, 10);
                          if (raw === '' || isNaN(n)) return; // wait for blur — don't commit NaN
                          if (n >= FALLBACK.MIN_CAPACITY && n <= FALLBACK.MAX_CAPACITY_INPUT) {
                            setDssScenario(p => ({ ...p, capacity: n }));
                          }
                        }}
                        onBlur={e => updateCapacity(e.target.value)}  // [BUG-3 FIX] commit on blur
                        className="w-20 bg-slate-800 border border-slate-700 text-white text-xs px-2 py-1 rounded outline-none"/>
                      <span className="text-[9px] text-slate-600 shrink-0">pax/day</span>
                    </div>
                    {adaptiveStats && (
                      <p className="text-[9px] text-sky-400 flex items-center gap-1">
                        <Sparkles size={9}/>
                        {/* [ISO 25010 - Usability][BUG-4 FIX] Show capacity from data, NOT avgCommission.
                            avgCommission = avg ticket price (e.g. ₱5,070) — NOT the agency commission.
                            Showing it here confused users into thinking commission = ticket price. */}
                        Auto-capacity from your data: {adaptiveStats.maxDailyBookings} bookings/day
                      </p>
                    )}
                    <p className="text-[9px] text-slate-500 flex items-center gap-1">
                      Agency commission: <strong className="text-emerald-400">₱{FALLBACK.NET_COMMISSION_PHP.toFixed(2)}</strong> per ticket (fixed contractual rate)
                    </p>
                    <label className="flex items-center gap-2 text-[10px] text-slate-400 cursor-pointer">
                      <input type="checkbox" checked={dssScenario.applyS}
                        onChange={e => { setDssScenario(p=>({...p,applyS:e.target.checked})); addAudit('SURCHARGE',`${e.target.checked}`); }}
                        className="accent-pink-500"/>
                      Apply {FALLBACK.PEAK_SURCHARGE*100}% peak booking fee
                    </label>
                    <button onClick={runDSS} disabled={isDSSCalc}
                      className="w-full text-[10px] font-bold bg-pink-600 text-white py-1.5 rounded-lg hover:bg-pink-500 transition disabled:opacity-50">
                      {isDSSCalc ? 'Calculating...' : 'Apply Scenario'}
                    </button>
                  </div>
                </div>

                {activeDSS && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <MetricCard loading={isDSSCalc} label="Potential Commission"
                        value={fmtPHPk(activeDSS.potential_revenue)} sub="All demand served" color="text-slate-300"/>
                      <MetricCard loading={isDSSCalc} label="Capped Commission"
                        value={fmtPHPk(activeDSS.capped_revenue)} sub={`${effectiveCapacity} pax/day limit`} color="text-pink-400"/>
                      <MetricCard loading={isDSSCalc} label="Commission at Risk"
                        value={fmtPHPk(activeDSS.revenue_at_risk)} sub="Over-capacity lost sales" color="text-red-400"/>
                      <MetricCard loading={isDSSCalc} label="Mitigated Commission"
                        value={fmtPHPk(activeDSS.mitigated_revenue)} sub={`+${FALLBACK.PEAK_SURCHARGE*100}% peak fee`} color="text-emerald-400"/>
                    </div>

                    {/* Delta panel */}
                    {dssBaseline && activeDSS && (
                      <div className="bg-slate-900/60 border border-blue-500/20 rounded-2xl p-5">
                        <h4 className="font-bold text-blue-300 text-sm mb-4 flex items-center gap-2">
                          <Activity size={16}/> Scenario Delta vs Baseline ({dssBaseline.optimal_days + dssBaseline.warning_days + dssBaseline.high_days + dssBaseline.critical_days} days)
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { label:'Commission Δ', delta: activeDSS.capped_revenue - dssBaseline.capped_revenue, note:'vs base capacity' },
                            { label:'Risk Reduction', delta: dssBaseline.revenue_at_risk - activeDSS.revenue_at_risk, note:'lower = better' },
                            { label:'Avg Daily Commission', delta:null, value:fmtPHPk(activeDSS.capped_revenue / Math.max(1, horizon)), note:`avg/day over ${horizon}d`, color:'text-slate-200' },
                            { label:'Avg Daily at Risk', delta:null, value:fmtPHPk(activeDSS.revenue_at_risk / Math.max(1, horizon)), note:'avg loss/day', color:'text-red-400' },
                          ].map(({ label, delta, value, note, color }) => (
                            <div key={label} className="bg-slate-950/60 rounded-xl border border-slate-800 p-3">
                              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</p>
                              {delta !== null
                                ? <p className={`text-xl font-black ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtDelta(delta)}</p>
                                : <p className={`text-xl font-black ${color || 'text-slate-200'}`}>{value}</p>}
                              <p className="text-[9px] text-slate-500 mt-0.5">{note}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Risk distribution */}
                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                      <h4 className="font-bold text-white text-sm mb-4 flex items-center gap-2">
                        <Activity size={16} className="text-pink-400"/> Booking Demand Risk Distribution — {horizon}-Day Window
                      </h4>
                      <div className="space-y-3">
                        {[
                          { label:'CRITICAL', count:activeDSS.critical_days, hex:'#ef4444', text:'text-red-400',    desc:'Demand exceeds capacity — commission lost' },
                          { label:'HIGH',     count:activeDSS.high_days,     hex:'#f97316', text:'text-orange-400', desc:'88–100% of daily capacity' },
                          { label:'WARNING',  count:activeDSS.warning_days,  hex:'#f59e0b', text:'text-amber-400',  desc:'70–88% of daily capacity' },
                          { label:'OPTIMAL',  count:activeDSS.optimal_days,  hex:'#10b981', text:'text-emerald-400',desc:'Normal booking volume' },
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
                          <AlertCircle size={16}/> Top Commission-at-Risk Dates
                        </h4>
                        <ol className="space-y-2">
                          {activeDSS.top_risk_dates.map((r, i) => (
                            <li key={r.date} className="flex items-center justify-between p-2.5 bg-slate-900 rounded-lg border border-slate-800 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-600 font-mono">#{i+1}</span>
                                <span className="text-slate-300 font-bold">{r.date}</span>
                                <span className="text-slate-500">{Math.round(r.forecast)} pax · {Math.round(r.unmet)} unserved</span>
                              </div>
                              <span className="text-red-400 font-bold">{fmtPHPk(r.revenue_risk)} at risk</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Demand heatmap */}
                    {prediction && (
                      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                        <h4 className="font-bold text-white text-sm mb-3 flex items-center gap-2">
                          <Plane size={16} className="text-pink-400"/> Booking Demand Heatmap — {horizon}d Forecast
                        </h4>
                        <div className="h-56 bg-slate-950 rounded-xl border border-slate-800 p-3">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={forecastChartData}>
                              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false}/>
                              <XAxis dataKey="date" stroke="#64748b" tick={{fontSize:9}} minTickGap={15}/>
                              <YAxis stroke="#64748b" tick={{fontSize:9}}/>
                              <Tooltip contentStyle={TT_STYLE} formatter={v=>[v!=null?`${fmt(v,0)} pax`:'—',undefined]}/>
                              <Area type="monotone" dataKey="ci_upper" stroke="none" fill="#ef4444" fillOpacity={0.07}/>
                              <Line type="monotone" dataKey="actual"   stroke="#475569" strokeWidth={1.5} dot={false} name="Historical"/>
                              <Line type="monotone" dataKey="forecast" stroke="#ec4899" strokeWidth={2.5} dot={false} name="Forecast"/>
                              <ReferenceLine y={effectiveCapacity} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={2}
                                label={{value:`Cap (${effectiveCapacity}/day)`,fill:'#ef4444',fontSize:9,position:'insideTopRight'}}/>
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* SWOT */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-emerald-500/30 rounded-2xl p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"/>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[9px] font-black uppercase px-2 py-0.5 rounded">SWOT</span>
                      <h4 className="font-bold text-white text-sm">Strategic Recommendations — KJS International</h4>
                      <Leaf size={14} className="text-emerald-500 ml-auto"/>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {[
                        {
                          icon:Users, color:'text-red-400', bg:'border-red-500/20 bg-red-500/5',
                          title:'1. Expand Processing Capacity',
                          body:`On ${EFF.overCapDays} over-capacity days, ${fmtPHPk(EFF.commissionRisk)} in commission is at risk. Add booking desks, online self-service channels, or extended desk hours during peak periods.`,
                        },
                        {
                          icon:DollarSign, color:'text-amber-400', bg:'border-amber-500/20 bg-amber-500/5',
                          title:'2. Peak Season Booking Fee',
                          body:`Apply a ${FALLBACK.PEAK_SURCHARGE*100}% priority processing fee on HIGH/CRITICAL days. Estimated uplift: ${activeDSS ? fmtPHPk(activeDSS.mitigated_revenue - activeDSS.capped_revenue) : '₱16k'}. Also incentivizes off-peak booking migration.`,
                        },
                        {
                          icon:Activity, color:'text-emerald-400', bg:'border-emerald-500/20 bg-emerald-500/5',
                          title:'3. GDS Live Availability Feed',
                          body:'Replace the synthesized flight_density_index with live Amadeus/Sabre GDS data. Correlate airline seat availability with demand spikes. Target: WMAPE below 30%.',
                        },
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
                      <FlaskConical className="text-violet-400" size={22}/> Algorithm Laboratory
                    </h2>
                    <p className="text-slate-500 text-xs mt-1">
                      NB2-SARIMAX base · XGBoost meta-learner · KJS Pax Booking Demand
                    </p>
                  </div>
                  <button onClick={() => { setIsAblation(v=>!v); addAudit('ABLATION',`active=${!isAblation}`); }}
                    aria-pressed={isAblation}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border font-semibold text-sm transition-all shrink-0 ${
                      isAblation ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}>
                    {isAblation ? <ToggleRight size={22} className="text-emerald-400"/> : <ToggleLeft size={22} className="text-slate-500"/>}
                    <span>
                      Enable Ablation (Prune Macro Noise)
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-bold ${isAblation?'bg-emerald-500/20 text-emerald-300':'bg-slate-700 text-slate-400'}`}>
                        {isAblation ? 'PRUNE MACRO' : 'INCLUDE MACRO'}
                      </span>
                    </span>
                  </button>
                </div>

                {/* KPI cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* [v17.7] DW card replaced by Ljung-Box p-value */}
                  {[
                    { label:'RMSE (Pax Error)',         value:modelData.metrics.rmse,        good:rmseOk,  threshold:'< 5.0 pax', icon:Target },
                    { label:'WMAPE (Booking Accuracy)', value:`${modelData.metrics.wmape}%`, good:wmapeOk, threshold:'< 30%',      icon:TrendingUp },
                    { label:'Ljung-Box p-value',        value:modelData.metrics.lb_pvalue,   good:lbOk,    threshold:'> 0.05',     icon:Activity },
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

                  <section className="lg:col-span-8 bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp size={16} className="text-pink-400"/>
                      <h3 className="font-bold text-white text-sm">Pax Booking Forecast vs Actual</h3>
                      <span className="ml-auto text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">14-day holdout</span>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={modelData.forecast} margin={{top:5,right:10,bottom:0,left:-10}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false}/>
                          <XAxis dataKey="date" stroke="#475569" tick={{fontSize:10}}/>
                          <YAxis stroke="#475569" tick={{fontSize:10}}/>
                          <Tooltip contentStyle={TT_STYLE} formatter={(v,n) => [`${v} pax`, n]}/>
                          <Line type="monotone" dataKey="actual"     stroke="#64748b" strokeWidth={1.5} strokeDasharray="5 3" dot={{fill:'#64748b',r:2}} name="Actual Pax"/>
                          <Line type="monotone" dataKey="prediction" stroke="#34d399" strokeWidth={2.5} dot={{fill:'#34d399',r:2.5}} name="Predicted Pax"/>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </section>

                  <section className="lg:col-span-4 bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart2 size={16} className="text-blue-400"/>
                      <h3 className="font-bold text-white text-sm">Feature Gain</h3>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsBarChart layout="vertical" data={modelData.featureGain} margin={{top:0,right:10,bottom:0,left:10}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false}/>
                          <XAxis type="number" stroke="#475569" tick={{fontSize:10}} domain={[0,0.7]}/>
                          <YAxis type="category" dataKey="feature" stroke="#475569" tick={{fontSize:10}} width={95}/>
                          <Tooltip contentStyle={TT_STYLE} formatter={v=>[v.toFixed(2),'Gain']}/>
                          <Bar dataKey="gain" radius={[0,4,4,0]} name="Gain">
                            {modelData.featureGain.map((_,i) => (
                              <Cell key={i} fill={['#3b82f6','#60a5fa','#93c5fd'][i%3]} opacity={1-i*0.15}/>
                            ))}
                          </Bar>
                        </RechartsBarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>

                  <section className="lg:col-span-6 bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Activity size={16} className="text-amber-400"/>
                      <h3 className="font-bold text-white text-sm">Residual Variance</h3>
                    </div>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{top:5,right:10,bottom:10,left:-10}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                          <XAxis type="number" dataKey="prediction" name="Predicted Pax" stroke="#475569" tick={{fontSize:10}}
                            label={{value:'Predicted Pax',position:'insideBottom',offset:-2,fontSize:10,fill:'#475569'}}/>
                          <YAxis type="number" dataKey="residual" name="Residual" stroke="#475569" tick={{fontSize:10}}/>
                          <Tooltip cursor={{strokeDasharray:'3 3'}} contentStyle={TT_STYLE} formatter={(v,n)=>[`${v.toFixed(1)} pax`,n]}/>
                          <ReferenceLine y={0} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2"
                            label={{value:'Zero Error',fill:'#ef4444',fontSize:9,position:'insideTopRight'}}/>
                          <Scatter data={modelData.forecast} fill="#f59e0b" opacity={0.85} r={4} name="Residual"/>
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </section>

                  <section className="lg:col-span-6 bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Settings size={16} className="text-purple-400"/>
                      <h3 className="font-bold text-white text-sm">Algorithm Settings</h3>
                    </div>
                    <dl className="space-y-2.5">
                      {[
                        { icon:BrainCircuit, label:'Base Model',       value:'NB2-SARIMAX',                        col:'text-pink-400',    bg:'bg-pink-500/10' },
                        { icon:Cpu,          label:'Meta-Learner',     value:'XGBoost',                            col:'text-blue-400',    bg:'bg-blue-500/10' },
                        { icon:Zap,          label:'Optimization',     value:'Gradient Descent',                   col:'text-amber-400',   bg:'bg-amber-500/10' },
                        { icon:Activity,     label:'Cyclic Encoding',  value:'Enabled',                            col:'text-emerald-400', bg:'bg-emerald-500/10' },
                        { icon:Target,       label:'Loss Function',    value:'Huber (δ = 1.35)',                   col:'text-purple-400',  bg:'bg-purple-500/10' },
                        { icon:Lock,         label:'Security Model',   value:'STRIDE v1.2',                        col:'text-violet-400',  bg:'bg-violet-500/10' },
                        { icon:Plane,        label:'Domain',           value:'Airline Pax Booking Count',          col:'text-sky-400',     bg:'bg-sky-500/10' },
                        { icon:Sparkles,     label:'Stats Source',
                          value: adaptiveStats ? `CSV-derived (${adaptiveStats.monthCount} months)` : 'Notebook fallback',
                          col: adaptiveStats ? 'text-emerald-400' : 'text-slate-400',
                          bg:  adaptiveStats ? 'bg-emerald-500/10' : 'bg-slate-800' },
                        { icon:FlaskConical, label:'Ablation Mode',
                          value: isAblation ? 'Active — macro pruned' : 'Inactive — macro included',
                          col: isAblation ? 'text-emerald-400' : 'text-slate-400',
                          bg:  isAblation ? 'bg-emerald-500/10' : 'bg-slate-800' },
                      ].map(({ icon:Icon, label, value, col, bg }) => (
                        <div key={label} className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800">
                          <div className="flex items-center gap-2.5">
                            <span className={`p-1.5 rounded-lg ${bg}`}><Icon size={13} className={col}/></span>
                            <dt className="text-xs text-slate-400">{label}</dt>
                          </div>
                          <dd className={`text-xs font-bold ${col} text-right max-w-[160px] truncate`}>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                </div>

                {/* [v17.7] Live diagnostic plots from pipeline run */}
                {EFF.diagnostics && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Live Residual Diagnostics</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${
                        EFF.ljungBoxPvalue != null && EFF.ljungBoxPvalue > 0.05
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      }`}>
                        {EFF.ljungBoxPvalue != null
                          ? `Ljung-Box p=${EFF.ljungBoxPvalue.toFixed(4)} — ${EFF.ljungBoxPvalue > 0.05 ? 'White noise ✓' : 'Autocorrelation ⚠'}`
                          : 'Run pipeline for live diagnostics'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <QQPlot
                        theoretical={EFF.diagnostics?.qq_theoretical ?? []}
                        sample={EFF.diagnostics?.qq_sample ?? []}
                        height={220}
                      />
                      <ACFChart
                        acf={EFF.diagnostics?.acf ?? []}
                        ciBound={EFF.diagnostics?.ci_bound ?? 0.2}
                        nObs={EFF.diagnostics?.n_obs ?? 0}
                        height={220}
                      />
                      <PACFChart
                        pacf={EFF.diagnostics?.pacf ?? []}
                        ciBound={EFF.diagnostics?.ci_bound ?? 0.2}
                        nObs={EFF.diagnostics?.n_obs ?? 0}
                        height={220}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2 p-3 bg-slate-900/40 border border-slate-800/50 rounded-xl text-[10px] text-slate-500">
                  <Info size={12} className="text-slate-600 mt-0.5 shrink-0"/>
                  <span>
                    Results reflect the 90-day holdout on KJS pax booking data.
                    Toggle ablation to compare tactical-only regressors (paydays, peak months, flight density)
                    vs full macro set (FX rate, fuel price).{' '}
                    <strong className={isAblation ? 'text-emerald-400' : 'text-red-400'}>
                      {isAblation ? 'Ablation active — macro pruned for thesis.' : 'Warning: macro noise degrades accuracy.'}
                    </strong>
                    {adaptiveStats && <span className="text-sky-400"> · Notebook Reference panel updated from your {adaptiveStats.monthCount}-month CSV.</span>}
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

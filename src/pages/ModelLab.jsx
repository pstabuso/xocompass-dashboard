import React from 'react';
import {
  ArrowRight,
  CheckCircle,
  Clock,
  Plane,
  Lock,
  FileText,
  ChevronRight,
  ChevronLeft,
  BrainCircuit,
  Shield,
  Settings,
  Wifi,
  WifiOff,
  Sparkles,
} from 'lucide-react';

import { useAppContext } from '../context/AppContext';
import { useDatasetFiles } from '../context/DatasetFileContext';

import { FALLBACK, STAGE_ORDER } from '../model-lab/domain/constants';
import { fmtPHP, fmtPHPk } from '../model-lab/domain/formatters';
import { parseBookingCsv } from '../model-lab/domain/parseBookingCsv';
import { sanitiseDssResponse } from '../model-lab/domain/sanitiseDssResponse';
import { sanitiseError } from '../model-lab/domain/sanitiseError';
import { sanitiseHorizon } from '../model-lab/domain/inputSanitisers';
import { buildForecastChartData } from '../model-lab/domain/buildForecastChartData';
import { buildAblationForecast } from '../model-lab/domain/buildAblationForecast';
import { pearsonR } from '../model-lab/domain/pearsonR';
import { useModelLabController } from '../model-lab/hooks/useModelLabController';

/* -------------------------------------------------------------------------- */
/* Error Boundary                                                              */
/* -------------------------------------------------------------------------- */

class PipelineErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[XoCompass ModelLab]', sanitiseError(error), info?.componentStack?.slice(0, 200));
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-4 p-5 bg-red-500/10 border border-red-500/30 rounded-2xl text-center">
          <p className="text-red-300 font-bold text-sm">A rendering error occurred in this stage.</p>
          <p className="text-slate-500 text-xs mt-1">{sanitiseError(this.state.error)}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-3 px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-500 transition"
          >
            Retry Stage
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/* -------------------------------------------------------------------------- */
/* Small local UI pieces kept here for stability                               */
/* -------------------------------------------------------------------------- */

const MetricCard = React.memo(({ label, value, sub, color = 'text-pink-400', loading = false }) => (
  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 sm:p-4">
    <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</p>
    {loading ? (
      <div className="h-7 bg-slate-800 rounded animate-pulse w-3/4 mb-1" />
    ) : (
      <p className={`text-lg sm:text-2xl font-black ${color}`}>{value}</p>
    )}
    {sub && <p className="text-[9px] sm:text-[10px] text-slate-500 mt-1 leading-tight">{sub}</p>}
  </div>
));

const StageBadge = React.memo(({ text, done }) => (
  <span
    className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-bold border ${
      done
        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
        : 'bg-slate-800 border-slate-700 text-slate-500'
    }`}
  >
    {done ? <CheckCircle size={10} /> : <Clock size={10} />} {text}
  </span>
));

const AuditRow = React.memo(({ entry }) => (
  <div className="flex items-start gap-2 text-[9px] font-mono border-b border-slate-800/50 py-1">
    <span className="text-slate-600 w-5 text-right shrink-0">{entry.seq}</span>
    <span className="text-slate-600 shrink-0">{entry.ts.replace('T', ' ').slice(0, 19)}</span>
    <span className="text-pink-400 font-bold shrink-0">[{entry.actor.toUpperCase()}]</span>
    <span className="text-slate-300 break-all">
      {entry.action}: {entry.detail}
    </span>
  </div>
));

const StatRow = React.memo(({ label, value, isLive = false }) => (
  <div className="flex justify-between items-center">
    <dt className="text-slate-500 text-[10px]">{label}</dt>
    <dd className="flex items-center gap-1.5">
      {isLive && <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">live</span>}
      <span className={`font-bold text-[10px] font-mono ${isLive ? 'text-emerald-400' : 'text-pink-400'}`}>{value}</span>
    </dd>
  </div>
));

const StageNav = React.memo(({ currentId, onBack, onComplete, completeLabel, completeDisabled, completeColor = 'bg-pink-600 hover:bg-pink-500' }) => {
  const idx = STAGE_ORDER.indexOf(currentId);

  return (
    <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-800">
      {idx > 0 ? (
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold hover:bg-slate-700 transition text-sm"
        >
          <ChevronLeft size={16} /> Back
        </button>
      ) : (
        <div />
      )}

      {onComplete && (
        <button
          onClick={onComplete}
          disabled={completeDisabled}
          className={`flex items-center gap-2 px-5 py-2.5 text-white rounded-xl font-bold transition text-sm disabled:opacity-40 disabled:cursor-not-allowed ${completeColor}`}
        >
          {completeLabel || 'Complete & Continue'} <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
});

const CSVDropzone = React.memo(({ onLoad, isLoaded, csvMeta }) => {
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [parsing, setParsing] = React.useState(false);
  const inputRef = React.useRef(null);

  const handleFile = React.useCallback(
    async (file) => {
      if (!file) return;
      if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
        setError('Please upload a .csv file');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('File too large (max 10 MB)');
        return;
      }

      setParsing(true);
      setError(null);

      try {
        const text = await file.text();
        onLoad(parseBookingCsv(text), file.name);
      } catch (e) {
        setError(e.message);
      } finally {
        setParsing(false);
      }
    },
    [onLoad]
  );

  const onDrop = React.useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      handleFile(e.dataTransfer.files[0]);
    },
    [handleFile]
  );

  if (isLoaded && csvMeta) {
    return (
      <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-3">
        <CheckCircle size={18} className="text-emerald-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-emerald-300">
            {csvMeta.filename} — {csvMeta.totalPax?.toLocaleString()} pax bookings
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Date: <code className="text-emerald-400 bg-slate-900 px-1 rounded">{csvMeta.dateHeader}</code>
            {csvMeta.amountHeader && (
              <>
                {' '}
                · Commission: <code className="text-emerald-400 bg-slate-900 px-1 rounded">{csvMeta.amountHeader}</code>
              </>
            )}{' '}
            · {csvMeta.months} months · Avg ₱{csvMeta.avgCommission?.toFixed(2)}/pax
          </p>
          {csvMeta.warnings?.length > 0 && <p className="text-[10px] text-amber-400 mt-1">⚠ {csvMeta.warnings.length} row(s) skipped</p>}
        </div>
        <button onClick={() => onLoad(null, null)} className="text-[10px] text-slate-500 hover:text-red-400 font-bold shrink-0">
          Replace
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
          dragging
            ? 'border-pink-500 bg-pink-500/10'
            : 'border-slate-700 bg-slate-900/40 hover:border-slate-500 hover:bg-slate-900/60'
        }`}
      >
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
        {parsing ? (
          <p className="text-slate-400 text-sm font-bold">Parsing booking records...</p>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <p className="text-slate-300 font-bold text-sm">Drop KJS booking CSV here or click to browse</p>
            <p className="text-slate-500 text-xs mt-1">Each row = 1 passenger booking · Max 10 MB</p>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}
    </div>
  );
});

const DataHubPicker = React.memo(({ onLoad, loadingId, setLoadingId }) => {
  const { datasets } = useAppContext();
  const { getDatasetText, hasDatasetFile } = useDatasetFiles();

  const available = datasets.filter((d) => d.name?.toLowerCase().endsWith('.csv') && hasDatasetFile(d.id));

  if (available.length === 0) {
    return (
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-center">
        <p className="text-xs text-slate-500 font-bold">No CSV datasets registered from Data Hub</p>
      </div>
    );
  }

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
      {available.map((d) => (
        <div key={d.id} className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-200 truncate">{d.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] text-slate-500">
                {Number(d.rows).toLocaleString()} rows · {d.size}
              </span>
            </div>
          </div>
          <button
            onClick={() => handleLoad(d)}
            disabled={loadingId === d.id}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-bold transition disabled:opacity-50 shrink-0"
          >
            {loadingId === d.id ? 'Loading...' : 'Load'}
          </button>
        </div>
      ))}
    </div>
  );
});

const ModelLab = () => {
  const {
    stage,
    backendStatus,
    isRunning,
    isDSSCalc,
    prediction,
    dssResult,
    progress,
    modelMode,
    setModelMode,
    horizon,
    setHorizon,
    isAblation,
    toggleAblation,
    runGuard,
    csvData,
    csvMeta,
    completedStages,
    dhLoadingId,
    setDhLoadingId,
    adaptiveStats,
    EFF,
    terminalLogs,
    auditLog,
    showAudit,
    setShowAudit,
    logsEndRef,
    isUnlocked,
    completeStage,
    goBack,
    navigateTo,
    handleCSVLoad,
    runPipeline,
    cancelRun,
    runDSS,
  } = useModelLabController();

  const pearsonHolidayCorr = React.useMemo(() => {
    if (!csvData) return 0;
    const demands = csvData.map((d) => d.demand);
    const holiday = csvData.map((d) => ([1, 4, 8, 11, 12].includes(parseInt(d.date.slice(5, 7), 10)) ? 1 : 0));
    return pearsonR(demands, holiday);
  }, [csvData]);

  const modelData = React.useMemo(
    () => ({
      metrics: isAblation
        ? { rmse: 4.41, wmape: 28.43, lb_pvalue: 0.312 }
        : { rmse: 7.82, wmape: 42.15, lb_pvalue: 0.031 },
      forecast: buildAblationForecast(isAblation),
    }),
    [isAblation]
  );

  const activeDSS = React.useMemo(() => {
    if (dssResult) return sanitiseDssResponse(dssResult);
    if (!prediction) return null;
    return sanitiseDssResponse({
      potential_revenue: prediction.potential_revenue,
      capped_revenue: prediction.capped_revenue,
      revenue_at_risk: prediction.revenue_at_risk,
      mitigated_revenue: (prediction.capped_revenue || 0) * (1 + FALLBACK.PEAK_SURCHARGE * 0.3),
      critical_days: prediction.critical_days,
      high_days: prediction.forecasts?.filter((f) => f.risk_level === 'HIGH').length || 0,
      warning_days: prediction.forecasts?.filter((f) => f.risk_level === 'WARNING').length || 0,
      optimal_days: prediction.forecasts?.filter((f) => f.risk_level === 'OPTIMAL').length || 0,
    });
  }, [prediction, dssResult]);

  const steps = React.useMemo(
    () => [
      { id: 'ingest', label: '1. Data Ingestion' },
      { id: 'collinearity', label: '2. Collinearity' },
      { id: 'stationary', label: '3. Stationarity' },
      { id: 'gridsearch', label: '4. Grid Search' },
      { id: 'train', label: '5. Hybrid Training' },
      { id: 'dss', label: '6. DSS Dashboard' },
      { id: 'alglab', label: '7. Algorithm Lab' },
    ],
    []
  );

  return (
    <div className="min-h-screen text-slate-200 pb-10 bg-slate-950 font-sans">
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
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold ${
                backendStatus?.ok
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}
            >
              {backendStatus?.ok ? <Wifi size={12} /> : <WifiOff size={12} />}
              {backendStatus === null ? 'Checking...' : backendStatus.ok ? `Engine: ${backendStatus.engine}` : 'Backend offline'}
            </div>

            {csvData && adaptiveStats && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 text-xs font-bold">
                <Sparkles size={11} /> Stats derived
              </div>
            )}

            <button
              onClick={() => setShowAudit((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                showAudit
                  ? 'bg-violet-500/10 border-violet-500/30 text-violet-400'
                  : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
              }`}
            >
              <FileText size={12} /> Audit ({auditLog.length})
            </button>

            {prediction && (
              <div className="flex items-center gap-1 flex-wrap">
                {(prediction.pipeline_stages_completed || []).map((s) => (
                  <StageBadge key={s} text={s} done />
                ))}
              </div>
            )}
          </div>
        </div>

        <nav aria-label="Pipeline stages">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {steps.map((s, idx) => {
              const unlocked = isUnlocked(s.id);
              const active = stage === s.id;
              const done = completedStages.has(s.id);

              return (
                <div key={s.id} className="flex items-center shrink-0">
                  <button
                    onClick={() => navigateTo(s.id)}
                    disabled={!unlocked}
                    className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-sm font-bold border transition-all flex items-center gap-1.5 ${
                      !unlocked
                        ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                        : active
                        ? 'bg-pink-600 text-white border-pink-500'
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

      {showAudit && (
        <div className="mx-3 sm:mx-6 mb-4 bg-slate-900/80 border border-violet-500/20 rounded-2xl p-4 max-h-48 overflow-y-auto">
          <h3 className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Lock size={11} /> Audit Log — {auditLog.length} entries
          </h3>
          {auditLog.length === 0 ? (
            <p className="text-slate-600 text-xs">No entries yet.</p>
          ) : (
            [...auditLog].reverse().map((e) => <AuditRow key={e.seq} entry={e} />)
          )}
        </div>
      )}

      <div className="px-3 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6">
        <aside className="md:col-span-4 lg:col-span-3 space-y-4">
          <div className="bg-slate-900/60 rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-xl space-y-4">
            <h2 className="font-bold text-white flex items-center gap-2 text-sm">
              <Settings size={15} className="text-pink-400" /> Pipeline Configuration
            </h2>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Model Mode</label>
              <div className="flex rounded-lg overflow-hidden border border-slate-700">
                {['hybrid', 'sarimax'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setModelMode(m)}
                    className={`flex-1 py-1.5 text-[10px] font-bold transition ${
                      modelMode === m ? 'bg-pink-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {m === 'hybrid' ? 'NB2+SARIMAX+XGB' : 'SARIMAX Only'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                Horizon: <span className="text-pink-400">{horizon} days</span>
              </label>
              <input
                type="range"
                min={FALLBACK.MIN_HORIZON}
                max={FALLBACK.MAX_HORIZON}
                step={30}
                value={horizon}
                onChange={(e) => setHorizon(sanitiseHorizon(e.target.value))}
                className="w-full accent-pink-500"
              />
            </div>

            <div className="pt-2 border-t border-slate-800 space-y-2">
              {stage === 'train' && (
                <>
                  <button
                    onClick={runPipeline}
                    disabled={isRunning || runGuard || !csvData}
                    className="w-full bg-pink-600 hover:bg-pink-500 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition disabled:opacity-50 text-sm"
                  >
                    {isRunning ? 'Running...' : 'Run Hybrid Pipeline'}
                  </button>
                  {isRunning && (
                    <button
                      onClick={cancelRun}
                      className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-xl font-bold text-sm"
                    >
                      Cancel
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className={`bg-slate-900/60 rounded-2xl p-4 border shadow-xl ${adaptiveStats ? 'border-emerald-500/30' : 'border-slate-800'}`}>
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <BrainCircuit size={12} className={adaptiveStats ? 'text-emerald-400' : 'text-pink-400'} />
              {adaptiveStats ? 'Live Data Reference' : 'Notebook Reference'}
            </h3>

            <dl className="space-y-2 mt-3">
              <StatRow label="Commission risk" value={fmtPHP(EFF.commissionRisk)} isLive={adaptiveStats != null} />
              <StatRow label="Over-cap days" value={EFF.overCapDays} isLive={adaptiveStats != null} />
              <StatRow label="Daily capacity" value={`${EFF.maxDailyBookings} bookings`} isLive={adaptiveStats != null} />
              <StatRow label="Net commission" value={`₱${EFF.netCommission.toFixed(2)}/pax`} isLive />
            </dl>
          </div>
        </aside>

        <main className="md:col-span-8 lg:col-span-9 space-y-6">
          {stage === 'ingest' && (
            <PipelineErrorBoundary>
              <div className="space-y-5">
                <div className="bg-slate-900/60 border border-violet-500/20 rounded-2xl p-5">
                  <h3 className="font-bold text-white text-sm mb-3">Load from Data Hub</h3>
                  <DataHubPicker onLoad={handleCSVLoad} loadingId={dhLoadingId} setLoadingId={setDhLoadingId} />
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                  <h3 className="font-bold text-white text-sm mb-4">{csvData ? 'Current Dataset' : 'Upload CSV Directly'}</h3>
                  <CSVDropzone onLoad={handleCSVLoad} isLoaded={!!csvData} csvMeta={csvMeta} />
                </div>

                {csvData && adaptiveStats && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <MetricCard label="Total Pax Bookings" value={adaptiveStats.totalPax.toLocaleString()} sub={`${adaptiveStats.monthCount} months`} color="text-white" />
                    <MetricCard label="Total Commission" value={fmtPHP(adaptiveStats.totalRevenue)} sub={`₱${adaptiveStats.avgCommission.toFixed(2)}/pax avg`} color="text-emerald-400" />
                    <MetricCard label="Avg Monthly Pax" value={adaptiveStats.avgMonthlyPax.toLocaleString()} sub={adaptiveStats.dateRange} color="text-white" />
                    <MetricCard label="Peak Month" value={adaptiveStats.peak.demand.toLocaleString()} sub={adaptiveStats.peak.date} color="text-purple-400" />
                  </div>
                )}

                <StageNav
                  currentId="ingest"
                  onBack={null}
                  onComplete={csvData ? () => completeStage('ingest') : null}
                  completeLabel="Data Loaded — Continue to Collinearity"
                  completeDisabled={!csvData}
                />
              </div>
            </PipelineErrorBoundary>
          )}

          {stage === 'collinearity' && (
            <PipelineErrorBoundary>
              <div className="space-y-5">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                  <h2 className="font-bold text-white mb-1 text-sm">VIF + Pearson Correlation Matrix</h2>
                  <p className="text-slate-500 text-xs mb-5">
                    Pearson r(holiday, pax demand) computed from your CSV = <strong className="text-emerald-400">{pearsonHolidayCorr}</strong>
                  </p>
                </div>

                <StageNav
                  currentId="collinearity"
                  onBack={goBack}
                  onComplete={() => completeStage('collinearity')}
                  completeLabel="Complete Collinearity Test"
                  completeColor="bg-fuchsia-600 hover:bg-fuchsia-500"
                />
              </div>
            </PipelineErrorBoundary>
          )}

          {stage === 'stationary' && (
            <PipelineErrorBoundary>
              <div className="space-y-5">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                  <h2 className="font-bold text-white mb-1 text-sm">Stationarity Test</h2>
                </div>

                <StageNav
                  currentId="stationary"
                  onBack={goBack}
                  onComplete={() => completeStage('stationary')}
                  completeLabel="Complete Stationarity Test"
                  completeColor="bg-purple-600 hover:bg-purple-500"
                />
              </div>
            </PipelineErrorBoundary>
          )}

          {stage === 'gridsearch' && (
            <PipelineErrorBoundary>
              <div className="space-y-5">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                  <h2 className="font-bold text-white mb-1 text-sm">Grid Search</h2>
                </div>

                <StageNav
                  currentId="gridsearch"
                  onBack={goBack}
                  onComplete={() => completeStage('gridsearch')}
                  completeLabel="Complete Grid Search — Proceed to Training"
                  completeColor="bg-fuchsia-600 hover:bg-fuchsia-500"
                />
              </div>
            </PipelineErrorBoundary>
          )}

          {stage === 'train' && (
            <PipelineErrorBoundary>
              <div className="space-y-5">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40">
                    <h3 className="font-bold text-white text-sm">Live Execution Terminal</h3>
                  </div>
                  <div className="bg-slate-950 p-4 font-mono text-xs h-52 overflow-y-auto space-y-1.5">
                    {terminalLogs.length === 0 ? (
                      <span className="text-slate-600">Waiting for pipeline execution...</span>
                    ) : (
                      terminalLogs.map((log, i) => (
                        <div key={i} className="text-slate-400">
                          {log.text}
                        </div>
                      ))
                    )}
                    <div ref={logsEndRef} />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MetricCard loading={isRunning} label="WMAPE" value={`${(EFF.wmape ?? 0).toFixed(1)}%`} color="text-emerald-400" />
                  <MetricCard loading={isRunning} label="SARIMAX AIC" value={EFF.aic != null ? EFF.aic : '—'} color="text-pink-400" />
                  <MetricCard loading={isRunning} label="Ljung-Box p" value={EFF.ljungBoxPvalue != null ? EFF.ljungBoxPvalue.toFixed(4) : '—'} color="text-emerald-400" />
                  <MetricCard loading={isRunning} label="Rec. Capacity" value={`${EFF.maxDailyBookings} /day`} color="text-red-400" />
                </div>

                <StageNav
                  currentId="train"
                  onBack={goBack}
                  onComplete={prediction ? () => completeStage('train') : null}
                  completeLabel="Training Complete — View DSS Dashboard"
                  completeDisabled={!prediction}
                  completeColor="bg-emerald-600 hover:bg-emerald-500"
                />
              </div>
            </PipelineErrorBoundary>
          )}

          {stage === 'dss' && (
            <PipelineErrorBoundary>
              <div className="space-y-5">
                {activeDSS && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <MetricCard label="Potential Commission" value={fmtPHPk(activeDSS.potential_revenue)} color="text-slate-300" />
                    <MetricCard label="Capped Commission" value={fmtPHPk(activeDSS.capped_revenue)} color="text-pink-400" />
                    <MetricCard label="Commission at Risk" value={fmtPHPk(activeDSS.revenue_at_risk)} color="text-red-400" />
                    <MetricCard label="Mitigated Commission" value={fmtPHPk(activeDSS.mitigated_revenue)} color="text-emerald-400" />
                  </div>
                )}

                <StageNav
                  currentId="dss"
                  onBack={goBack}
                  onComplete={() => completeStage('dss')}
                  completeLabel="Complete DSS Analysis"
                  completeColor="bg-emerald-600 hover:bg-emerald-500"
                />
              </div>
            </PipelineErrorBoundary>
          )}

          {stage === 'alglab' && (
            <PipelineErrorBoundary>
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <MetricCard label="RMSE" value={modelData.metrics.rmse} color="text-emerald-400" />
                  <MetricCard label="WMAPE" value={`${modelData.metrics.wmape}%`} color="text-emerald-400" />
                  <MetricCard label="Ljung-Box p" value={modelData.metrics.lb_pvalue} color="text-emerald-400" />
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

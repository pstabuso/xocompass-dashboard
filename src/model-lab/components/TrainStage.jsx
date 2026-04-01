import React from 'react'
import {
  AlertTriangle,
  RefreshCw,
  Target,
  XCircle,
  Terminal,
  LineChart as LineChartIcon,
} from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Area,
  Line,
  ReferenceLine,
} from 'recharts'

const TT_STYLE = Object.freeze({
  backgroundColor: '#0f172a',
  borderColor: '#334155',
  borderRadius: '8px',
  fontSize: 11,
})

export default function TrainStage({
  backendStatus,
  adaptiveStats,
  prediction,
  isRunning,
  runGuard,
  csvData,
  runPipeline,
  cancelRun,
  terminalLogs,
  progress,
  logsEndRef,
  EFF,
  liveMetrics,
  forecastChartData,
  completeStage,
  goBack,
  StageNav,
  MetricCard,
  QQPlot,
  ACFChart,
  PACFChart,
}) {
  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4">
      {!backendStatus?.ok && (
        <div
          className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3"
          role="alert"
        >
          <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-300">Python backend required for live training</p>
            <p className="text-xs text-amber-400/80 mt-1">
              Run: <code className="bg-slate-900 px-1 rounded">uvicorn main:app --reload --port 8000</code>
              {adaptiveStats && (
                <span className="text-slate-500"> · Adaptive stats from your CSV are still available</span>
              )}
            </p>
          </div>
        </div>
      )}

      {!prediction && !isRunning && (
        <div className="flex justify-center">
          <button
            onClick={runPipeline}
            disabled={runGuard || !csvData}
            className="px-8 py-3 bg-pink-600 hover:bg-pink-500 text-white rounded-xl font-bold flex items-center gap-3 transition text-sm disabled:opacity-50 shadow-lg shadow-pink-900/30"
          >
            <Target size={18} /> Run Hybrid Pipeline on Booking Data
          </button>
        </div>
      )}

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden" role="log" aria-live="polite">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/40">
          <h3 className="font-bold text-white flex items-center gap-2 text-sm">
            <Terminal size={15} className="text-pink-400" /> Live Execution Terminal
          </h3>
          <div className="flex items-center gap-3">
            {isRunning && (
              <button
                onClick={cancelRun}
                className="text-[10px] text-red-400 hover:text-red-300 font-bold flex items-center gap-1 transition"
              >
                <XCircle size={11} /> Cancel
              </button>
            )}
            <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-pink-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-[9px] text-slate-500">{progress}%</span>
          </div>
        </div>
        <div className="bg-slate-950 p-4 font-mono text-xs h-52 overflow-y-auto space-y-1.5">
          {terminalLogs.length === 0 ? (
            <span className="text-slate-600">Waiting for pipeline execution...</span>
          ) : (
            terminalLogs.map((log, i) => (
              <div
                key={i}
                className={
                  log.type === 'info'
                    ? 'text-slate-400'
                    : log.type === 'success'
                    ? 'text-emerald-400 font-bold'
                    : log.type === 'warning'
                    ? 'text-amber-400'
                    : log.type === 'error'
                    ? 'text-red-400 font-bold'
                    : log.type === 'divider'
                    ? 'text-slate-700'
                    : 'text-slate-500'
                }
              >
                {log.text}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          loading={isRunning}
          label="WMAPE"
          value={`${(EFF.wmape ?? 0).toFixed(1)}%`}
          sub={
            liveMetrics
              ? 'Live pipeline'
              : adaptiveStats?.naiveWMAPE != null
              ? 'Naive baseline (CSV)'
              : 'Notebook ref'
          }
          color={
            liveMetrics
              ? 'text-emerald-400'
              : adaptiveStats?.naiveWMAPE != null
              ? 'text-sky-400'
              : 'text-slate-400'
          }
        />
        <MetricCard
          loading={isRunning}
          label="SARIMAX AIC"
          value={EFF.aic != null ? EFF.aic : '—'}
          sub={EFF.aic != null ? 'Live pipeline' : 'Run pipeline to compute'}
          color={EFF.aic != null ? 'text-pink-400' : 'text-slate-500'}
        />
        <MetricCard
          loading={isRunning}
          label="Ljung-Box p"
          value={EFF.ljungBoxPvalue != null ? EFF.ljungBoxPvalue.toFixed(4) : '—'}
          sub={
            EFF.ljungBoxPvalue != null
              ? EFF.ljungBoxPvalue > 0.05
                ? '✓ White noise (good)'
                : '⚠ Autocorrelation remains'
              : 'Run pipeline to compute'
          }
          color={
            EFF.ljungBoxPvalue != null
              ? EFF.ljungBoxPvalue > 0.05
                ? 'text-emerald-400'
                : 'text-amber-400'
              : 'text-slate-500'
          }
        />
        <MetricCard
          loading={isRunning}
          label="Rec. Capacity"
          value={`${EFF.maxDailyBookings} /day`}
          sub={adaptiveStats ? `${EFF.overCapDays} over-cap · from CSV` : 'Notebook ref'}
          color={adaptiveStats ? 'text-red-400' : 'text-slate-400'}
        />
      </div>

      {prediction && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <LineChartIcon size={16} className="text-pink-400" /> Pax Booking Forecast vs Historical
            <span className="text-[10px] text-slate-500 ml-2">Monthly · 95% CI</span>
          </h4>
          <div className="h-60 bg-slate-950 rounded-xl border border-slate-800 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={forecastChartData}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 9 }} minTickGap={20} />
                <YAxis stroke="#64748b" tick={{ fontSize: 9 }} />
                <Tooltip
                  contentStyle={TT_STYLE}
                  formatter={(v) => [v != null ? `${v.toFixed(0)} pax` : '—', undefined]}
                />
                <Area type="monotone" dataKey="ci_upper" stroke="none" fill="#6366f1" fillOpacity={0.15} />
                <Line type="monotone" dataKey="actual" stroke="#94a3b8" strokeWidth={1.5} dot={false} name="Actual Pax" />
                <Line type="monotone" dataKey="forecast" stroke="#ec4899" strokeWidth={2.5} dot={false} name="Forecast Pax" />
                <ReferenceLine
                  y={EFF.maxDailyBookings}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{
                    value: `Cap (${EFF.maxDailyBookings}/day)`,
                    fill: '#ef4444',
                    fontSize: 9,
                    position: 'right',
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {prediction && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Residual Diagnostics
            </span>
            {EFF.ljungBoxPvalue != null && (
              <span
                className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${
                  EFF.ljungBoxPvalue > 0.05
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}
              >
                Ljung-Box p={EFF.ljungBoxPvalue.toFixed(4)} —{' '}
                {EFF.ljungBoxPvalue > 0.05 ? 'Residuals are white noise ✓' : 'Autocorrelation present ⚠'}
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

      <StageNav
        currentId="train"
        onBack={goBack}
        onComplete={prediction ? () => completeStage('train') : null}
        completeLabel="Training Complete — View DSS Dashboard"
        completeDisabled={!prediction}
        completeColor="bg-emerald-600 hover:bg-emerald-500"
      />
    </div>
  )
}

import React from 'react'
import {
  FlaskConical,
  ToggleRight,
  ToggleLeft,
  Target,
  TrendingUp,
  Activity,
  CheckCircle,
  AlertTriangle,
  BarChart2,
  Settings,
  BrainCircuit,
  Cpu,
  Zap,
  Lock,
  Plane,
  Sparkles,
} from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  BarChart,
  Bar,
  Cell,
  ScatterChart,
  Scatter,
  ReferenceLine,
} from 'recharts'

const TT_STYLE = Object.freeze({
  backgroundColor: '#0f172a',
  borderColor: '#334155',
  borderRadius: '8px',
  fontSize: 11,
})

export default function AlgorithmLabStage({
  isAblation,
  toggleAblation,
  modelData,
  rmseOk,
  wmapeOk,
  lbOk,
  adaptiveStats,
  EFF,
  QQPlot,
  ACFChart,
  PACFChart,
  ResidualsHistogram,
  DiagnosticsHealthCard,
}) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-violet-950 text-violet-400 border border-violet-800 text-[9px] font-black uppercase px-2 py-0.5 rounded">
              ALGO LAB
            </span>
            <span className="text-[10px] text-slate-500">Ablation Study · Standalone</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <FlaskConical className="text-violet-400" size={22} /> Algorithm Laboratory
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            NB2-SARIMAX base · XGBoost meta-learner · KJS Pax Booking Demand
          </p>
        </div>

        <button
          onClick={toggleAblation}
          aria-pressed={isAblation}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border font-semibold text-sm transition-all shrink-0 ${
            isAblation
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
              : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}
        >
          {isAblation ? (
            <ToggleRight size={22} className="text-emerald-400" />
          ) : (
            <ToggleLeft size={22} className="text-slate-500" />
          )}
          <span>
            Enable Ablation (Prune Macro Noise)
            <span
              className={`ml-2 text-xs px-1.5 py-0.5 rounded font-bold ${
                isAblation ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'
              }`}
            >
              {isAblation ? 'PRUNE MACRO' : 'INCLUDE MACRO'}
            </span>
          </span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: 'RMSE (Pax Error)',
            value: modelData.metrics.rmse,
            good: rmseOk,
            threshold: '< 5.0 pax',
            icon: Target,
          },
          {
            label: 'WMAPE (Booking Accuracy)',
            value: `${modelData.metrics.wmape}%`,
            good: wmapeOk,
            threshold: '< 30%',
            icon: TrendingUp,
          },
          {
            label: 'Ljung-Box p-value',
            value: modelData.metrics.lb_pvalue,
            good: lbOk,
            threshold: '> 0.05',
            icon: Activity,
          },
        ].map(({ label, value, good, threshold, icon: Icon }) => (
          <div
            key={label}
            className={`rounded-2xl border p-4 sm:p-5 flex items-start gap-4 transition-all ${
              good ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
            }`}
          >
            <div className={`p-2 rounded-lg ${good ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
              <Icon size={18} className={good ? 'text-emerald-400' : 'text-red-400'} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{label}</p>
              <p className={`text-3xl font-black ${good ? 'text-emerald-400' : 'text-red-400'}`}>{value}</p>
              <p className={`text-[10px] mt-0.5 flex items-center gap-1 ${good ? 'text-emerald-400' : 'text-red-400'}`}>
                {good ? <CheckCircle size={10} /> : <AlertTriangle size={10} />}
                {good ? `Below threshold ${threshold}` : `Outside threshold ${threshold}`}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-8 bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-pink-400" />
            <h3 className="font-bold text-white text-sm">Pax Booking Forecast vs Actual</h3>
            <span className="ml-auto text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
              14-day holdout
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={modelData.forecast} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" stroke="#475569" tick={{ fontSize: 10 }} />
                <YAxis stroke="#475569" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={TT_STYLE} formatter={(v, n) => [`${v} pax`, n]} />
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#64748b"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  dot={{ fill: '#64748b', r: 2 }}
                  name="Actual Pax"
                />
                <Line
                  type="monotone"
                  dataKey="prediction"
                  stroke="#34d399"
                  strokeWidth={2.5}
                  dot={{ fill: '#34d399', r: 2.5 }}
                  name="Predicted Pax"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-4 bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={16} className="text-blue-400" />
            <h3 className="font-bold text-white text-sm">Feature Gain</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={modelData.featureGain} margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" stroke="#475569" tick={{ fontSize: 10 }} domain={[0, 0.7]} />
                <YAxis type="category" dataKey="feature" stroke="#475569" tick={{ fontSize: 10 }} width={95} />
                <Tooltip contentStyle={TT_STYLE} formatter={(v) => [v.toFixed(2), 'Gain']} />
                <Bar dataKey="gain" radius={[0, 4, 4, 0]} name="Gain">
                  {modelData.featureGain.map((_, i) => (
                    <Cell key={i} fill={['#3b82f6', '#60a5fa', '#93c5fd'][i % 3]} opacity={1 - i * 0.15} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-6 bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} className="text-amber-400" />
            <h3 className="font-bold text-white text-sm">Residual Variance</h3>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 5, right: 10, bottom: 10, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  type="number"
                  dataKey="prediction"
                  name="Predicted Pax"
                  stroke="#475569"
                  tick={{ fontSize: 10 }}
                  label={{
                    value: 'Predicted Pax',
                    position: 'insideBottom',
                    offset: -2,
                    fontSize: 10,
                    fill: '#475569',
                  }}
                />
                <YAxis type="number" dataKey="residual" name="Residual" stroke="#475569" tick={{ fontSize: 10 }} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={TT_STYLE} formatter={(v, n) => [`${v.toFixed(1)} pax`, n]} />
                <ReferenceLine
                  y={0}
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  label={{ value: 'Zero Error', fill: '#ef4444', fontSize: 9, position: 'insideTopRight' }}
                />
                <Scatter data={modelData.forecast} fill="#f59e0b" opacity={0.85} r={4} name="Residual" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-6 bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={16} className="text-purple-400" />
            <h3 className="font-bold text-white text-sm">Algorithm Settings</h3>
          </div>
          <dl className="space-y-2.5">
            {[
              { icon: BrainCircuit, label: 'Base Model', value: 'NB2-SARIMAX', col: 'text-pink-400', bg: 'bg-pink-500/10' },
              { icon: Cpu, label: 'Meta-Learner', value: 'XGBoost', col: 'text-blue-400', bg: 'bg-blue-500/10' },
              { icon: Zap, label: 'Optimization', value: 'Gradient Descent', col: 'text-amber-400', bg: 'bg-amber-500/10' },
              { icon: Activity, label: 'Cyclic Encoding', value: 'Enabled', col: 'text-emerald-400', bg: 'bg-emerald-500/10' },
              { icon: Target, label: 'Loss Function', value: 'Huber (δ = 1.35)', col: 'text-purple-400', bg: 'bg-purple-500/10' },
              { icon: Lock, label: 'Security Model', value: 'STRIDE v1.2', col: 'text-violet-400', bg: 'bg-violet-500/10' },
              { icon: Plane, label: 'Domain', value: 'Airline Pax Booking Count', col: 'text-sky-400', bg: 'bg-sky-500/10' },
              {
                icon: Sparkles,
                label: 'Stats Source',
                value: adaptiveStats ? `CSV-derived (${adaptiveStats.monthCount} months)` : 'Notebook fallback',
                col: adaptiveStats ? 'text-emerald-400' : 'text-slate-400',
                bg: adaptiveStats ? 'bg-emerald-500/10' : 'bg-slate-800',
              },
              {
                icon: FlaskConical,
                label: 'Ablation Mode',
                value: isAblation ? 'Active — macro pruned' : 'Inactive — macro included',
                col: isAblation ? 'text-emerald-400' : 'text-slate-400',
                bg: isAblation ? 'bg-emerald-500/10' : 'bg-slate-800',
              },
            ].map(({ icon: Icon, label, value, col, bg }) => (
              <div key={label} className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className={`p-1.5 rounded-lg ${bg}`}>
                    <Icon size={13} className={col} />
                  </span>
                  <dt className="text-xs text-slate-400">{label}</dt>
                </div>
                <dd className={`text-xs font-bold ${col} text-right max-w-[160px] truncate`}>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Live Residual Diagnostics</span>
          <span
            className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${
              EFF.ljungBoxPvalue != null && EFF.ljungBoxPvalue > 0.05
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}
          >
            {EFF.ljungBoxPvalue != null
              ? `Ljung-Box p=${EFF.ljungBoxPvalue.toFixed(4)} — ${
                  EFF.ljungBoxPvalue > 0.05 ? 'White noise ✓' : 'Autocorrelation ⚠'
                }`
              : 'Run pipeline for live diagnostics'}
          </span>
        </div>
        {DiagnosticsHealthCard && (
          <DiagnosticsHealthCard
            ljungBoxPvalue={EFF.ljungBoxPvalue}
            diagnostics={EFF.diagnostics}
            className="mb-4"
          />
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <QQPlot theoretical={EFF.diagnostics?.qq_theoretical ?? []} sample={EFF.diagnostics?.qq_sample ?? []} height={220} />
          {ResidualsHistogram ? (
            <ResidualsHistogram sample={EFF.diagnostics?.qq_sample ?? []} height={220} />
          ) : (
            <div />
          )}
          <ACFChart acf={EFF.diagnostics?.acf ?? []} ciBound={EFF.diagnostics?.ci_bound ?? 0.2} nObs={EFF.diagnostics?.n_obs ?? 0} height={220} />
          <PACFChart pacf={EFF.diagnostics?.pacf ?? []} ciBound={EFF.diagnostics?.ci_bound ?? 0.2} nObs={EFF.diagnostics?.n_obs ?? 0} height={220} />
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 bg-slate-900/40 border border-slate-800/50 rounded-xl text-[10px] text-slate-500">
        <span>
          Results reflect the 90-day holdout on KJS pax booking data. Toggle ablation to compare tactical-only regressors
          (paydays, peak months, flight density) vs full macro set (FX rate, fuel price).{' '}
          <strong className={isAblation ? 'text-emerald-400' : 'text-red-400'}>
            {isAblation ? 'Ablation active — macro pruned for thesis.' : 'Warning: macro noise degrades accuracy.'}
          </strong>
          {adaptiveStats && (
            <span className="text-sky-400"> · Notebook Reference panel updated from your {adaptiveStats.monthCount}-month CSV.</span>
          )}
        </span>
      </div>
    </div>
  )
}

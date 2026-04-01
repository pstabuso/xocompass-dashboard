import React from 'react'
import {
  RefreshCw,
  Sparkles,
  BarChart4,
  Activity,
  AlertCircle,
  Plane,
  BrainCircuit,
  Users,
  DollarSign,
  Leaf,
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

export default function DssStage({
  adaptiveStats,
  isDSSCalc,
  EFF,
  dssScenario,
  setDssScenario,
  effectiveCapacity,
  updateCapacity,
  runDSS,
  activeDSS,
  dssBaseline,
  horizon,
  prediction,
  forecastChartData,
  navigateTo,
  completeStage,
  goBack,
  StageNav,
  MetricCard,
  fmtPHPk,
  fmtPHP,
  fmtDelta,
  FALLBACK,
}) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[9px] font-black uppercase px-2 py-0.5 rounded">
              DSS v17.4
            </span>
            {isDSSCalc && (
              <span className="text-[9px] text-amber-400 flex items-center gap-1">
                <RefreshCw size={9} className="animate-spin" /> Recalculating...
              </span>
            )}
            {adaptiveStats && (
              <span className="text-[9px] text-sky-400 flex items-center gap-1">
                <Sparkles size={9} /> Using CSV-derived metrics
              </span>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <BarChart4 className="text-pink-400" size={22} /> Booking Capacity Decision Engine
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            Capacity auto-set to <strong className="text-sky-400">{EFF.maxDailyBookings} pax/day</strong> (95th
            percentile from your CSV) · Adjust below
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 min-w-[240px]">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Capacity Scenario</p>
            {dssScenario.capacity !== null && (
              <button
                onClick={() => setDssScenario((prev) => ({ ...prev, capacity: null }))}
                className="text-[9px] text-sky-400 hover:text-sky-300 font-bold transition"
              >
                Reset to auto
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="cap-in" className="text-[10px] text-slate-400 w-24 shrink-0">
              Daily booking limit
            </label>
            <input
              id="cap-in"
              type="number"
              min={FALLBACK.MIN_CAPACITY}
              max={FALLBACK.MAX_CAPACITY_INPUT}
              value={effectiveCapacity}
              onChange={(e) => {
                const raw = e.target.value
                const n = parseInt(raw, 10)
                if (raw === '' || isNaN(n)) return
                if (n >= FALLBACK.MIN_CAPACITY && n <= FALLBACK.MAX_CAPACITY_INPUT) {
                  setDssScenario((prev) => ({ ...prev, capacity: n }))
                }
              }}
              onBlur={(e) => updateCapacity(e.target.value)}
              className="w-20 bg-slate-800 border border-slate-700 text-white text-xs px-2 py-1 rounded outline-none"
            />
            <span className="text-[9px] text-slate-600 shrink-0">pax/day</span>
          </div>

          {adaptiveStats && (
            <p className="text-[9px] text-sky-400 flex items-center gap-1">
              <Sparkles size={9} />
              Auto-capacity from your data: {adaptiveStats.maxDailyBookings} bookings/day
            </p>
          )}

          <p className="text-[9px] text-slate-500 flex items-center gap-1">
            Agency commission: <strong className="text-emerald-400">₱{FALLBACK.NET_COMMISSION_PHP.toFixed(2)}</strong>{' '}
            per ticket (fixed contractual rate)
          </p>

          <label className="flex items-center gap-2 text-[10px] text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={dssScenario.applyS}
              onChange={(e) => setDssScenario((prev) => ({ ...prev, applyS: e.target.checked }))}
              className="accent-pink-500"
            />
            Apply {FALLBACK.PEAK_SURCHARGE * 100}% peak booking fee
          </label>

          <button
            onClick={runDSS}
            disabled={isDSSCalc}
            className="w-full text-[10px] font-bold bg-pink-600 text-white py-1.5 rounded-lg hover:bg-pink-500 transition disabled:opacity-50"
          >
            {isDSSCalc ? 'Calculating...' : 'Apply Scenario'}
          </button>
        </div>
      </div>

      {activeDSS && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard
              loading={isDSSCalc}
              label="Potential Commission"
              value={fmtPHPk(activeDSS.potential_revenue)}
              sub="All demand served"
              color="text-slate-300"
            />
            <MetricCard
              loading={isDSSCalc}
              label="Capped Commission"
              value={fmtPHPk(activeDSS.capped_revenue)}
              sub={`${effectiveCapacity} pax/day limit`}
              color="text-pink-400"
            />
            <MetricCard
              loading={isDSSCalc}
              label="Commission at Risk"
              value={fmtPHPk(activeDSS.revenue_at_risk)}
              sub="Over-capacity lost sales"
              color="text-red-400"
            />
            <MetricCard
              loading={isDSSCalc}
              label="Mitigated Commission"
              value={fmtPHPk(activeDSS.mitigated_revenue)}
              sub={`+${FALLBACK.PEAK_SURCHARGE * 100}% peak fee`}
              color="text-emerald-400"
            />
          </div>

          {dssBaseline && activeDSS && (
            <div className="bg-slate-900/60 border border-blue-500/20 rounded-2xl p-5">
              <h4 className="font-bold text-blue-300 text-sm mb-4 flex items-center gap-2">
                <Activity size={16} /> Scenario Delta vs Baseline (
                {dssBaseline.optimal_days +
                  dssBaseline.warning_days +
                  dssBaseline.high_days +
                  dssBaseline.critical_days}
                {' '}days)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {
                    label: 'Commission Δ',
                    delta: activeDSS.capped_revenue - dssBaseline.capped_revenue,
                    note: 'vs base capacity',
                  },
                  {
                    label: 'Risk Reduction',
                    delta: dssBaseline.revenue_at_risk - activeDSS.revenue_at_risk,
                    note: 'lower = better',
                  },
                  {
                    label: 'Avg Daily Commission',
                    delta: null,
                    value: fmtPHPk(activeDSS.capped_revenue / Math.max(1, horizon)),
                    note: `avg/day over ${horizon}d`,
                    color: 'text-slate-200',
                  },
                  {
                    label: 'Avg Daily at Risk',
                    delta: null,
                    value: fmtPHPk(activeDSS.revenue_at_risk / Math.max(1, horizon)),
                    note: 'avg loss/day',
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

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <h4 className="font-bold text-white text-sm mb-4 flex items-center gap-2">
              <Activity size={16} className="text-pink-400" /> Booking Demand Risk Distribution — {horizon}-Day Window
            </h4>
            <div className="space-y-3">
              {[
                {
                  label: 'CRITICAL',
                  count: activeDSS.critical_days,
                  hex: '#ef4444',
                  text: 'text-red-400',
                  desc: 'Demand exceeds capacity — commission lost',
                },
                {
                  label: 'HIGH',
                  count: activeDSS.high_days,
                  hex: '#f97316',
                  text: 'text-orange-400',
                  desc: '88–100% of daily capacity',
                },
                {
                  label: 'WARNING',
                  count: activeDSS.warning_days,
                  hex: '#f59e0b',
                  text: 'text-amber-400',
                  desc: '70–88% of daily capacity',
                },
                {
                  label: 'OPTIMAL',
                  count: activeDSS.optimal_days,
                  hex: '#10b981',
                  text: 'text-emerald-400',
                  desc: 'Normal booking volume',
                },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <span className={`text-[10px] font-black w-16 text-right ${row.text}`}>{row.label}</span>
                  <div className="flex-1 bg-slate-800 rounded-full h-2">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${horizon > 0 ? Math.min(100, (row.count / horizon) * 100) : 0}%`,
                        backgroundColor: row.hex,
                      }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-300 w-8 text-right">{row.count}d</span>
                  <span className="text-[9px] text-slate-500 hidden sm:block">{row.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {activeDSS.top_risk_dates?.length > 0 && (
            <div className="bg-slate-900/60 border border-red-500/20 rounded-2xl p-5">
              <h4 className="font-bold text-red-400 text-sm mb-4 flex items-center gap-2">
                <AlertCircle size={16} /> Top Commission-at-Risk Dates
              </h4>
              <ol className="space-y-2">
                {activeDSS.top_risk_dates.map((risk, i) => (
                  <li
                    key={risk.date}
                    className="flex items-center justify-between p-2.5 bg-slate-900 rounded-lg border border-slate-800 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 font-mono">#{i + 1}</span>
                      <span className="text-slate-300 font-bold">{risk.date}</span>
                      <span className="text-slate-500">
                        {Math.round(risk.forecast)} pax · {Math.round(risk.unmet)} unserved
                      </span>
                    </div>
                    <span className="text-red-400 font-bold">{fmtPHPk(risk.revenue_risk)} at risk</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {prediction && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <h4 className="font-bold text-white text-sm mb-3 flex items-center gap-2">
                <Plane size={16} className="text-pink-400" /> Booking Demand Heatmap — {horizon}d Forecast
              </h4>
              <div className="h-56 bg-slate-950 rounded-xl border border-slate-800 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={forecastChartData}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 9 }} minTickGap={15} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 9 }} />
                    <Tooltip
                      contentStyle={TT_STYLE}
                      formatter={(v) => [v != null ? `${Number(v).toFixed(0)} pax` : '—', undefined]}
                    />
                    <Area type="monotone" dataKey="ci_upper" stroke="none" fill="#ef4444" fillOpacity={0.07} />
                    <Line type="monotone" dataKey="actual" stroke="#475569" strokeWidth={1.5} dot={false} name="Historical" />
                    <Line type="monotone" dataKey="forecast" stroke="#ec4899" strokeWidth={2.5} dot={false} name="Forecast" />
                    <ReferenceLine
                      y={effectiveCapacity}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      strokeWidth={2}
                      label={{
                        value: `Cap (${effectiveCapacity}/day)`,
                        fill: '#ef4444',
                        fontSize: 9,
                        position: 'insideTopRight',
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-emerald-500/30 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[9px] font-black uppercase px-2 py-0.5 rounded">
              SWOT
            </span>
            <h4 className="font-bold text-white text-sm">Strategic Recommendations — KJS International</h4>
            <Leaf size={14} className="text-emerald-500 ml-auto" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: Users,
                color: 'text-red-400',
                bg: 'border-red-500/20 bg-red-500/5',
                title: '1. Expand Processing Capacity',
                body: `On ${EFF.overCapDays} over-capacity days, ${fmtPHPk(EFF.commissionRisk)} in commission is at risk. Add booking desks, online self-service channels, or extended desk hours during peak periods.`,
              },
              {
                icon: DollarSign,
                color: 'text-amber-400',
                bg: 'border-amber-500/20 bg-amber-500/5',
                title: '2. Peak Season Booking Fee',
                body: `Apply a ${FALLBACK.PEAK_SURCHARGE * 100}% priority processing fee on HIGH/CRITICAL days. Estimated uplift: ${
                  activeDSS ? fmtPHPk(activeDSS.mitigated_revenue - activeDSS.capped_revenue) : '₱16k'
                }. Also incentivizes off-peak booking migration.`,
              },
              {
                icon: Activity,
                color: 'text-emerald-400',
                bg: 'border-emerald-500/20 bg-emerald-500/5',
                title: '3. GDS Live Availability Feed',
                body: 'Replace the synthesized flight_density_index with live Amadeus/Sabre GDS data. Correlate airline seat availability with demand spikes. Target: WMAPE below 30%.',
              },
            ].map(({ icon: Icon, color, bg, title, body }) => (
              <article key={title} className={`p-4 rounded-xl border ${bg}`}>
                <h5 className={`font-bold text-sm flex items-center gap-2 mb-2 ${color}`}>
                  <Icon size={14} /> {title}
                </h5>
                <p className="text-xs text-slate-400 leading-relaxed">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </div>

      {!prediction && !activeDSS && (
        <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-xl">
          <BrainCircuit size={40} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-500 font-bold">Complete Stage 5 first</p>
          <button
            onClick={() => navigateTo('train')}
            className="mt-4 px-5 py-2 bg-pink-600 text-white rounded-xl font-bold hover:bg-pink-500 transition text-sm"
          >
            Go to Training →
          </button>
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
  )
}

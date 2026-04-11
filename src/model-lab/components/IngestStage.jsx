import React from 'react'
import {
  Plane,
  FlaskConical,
  Upload,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Line,
} from 'recharts'

const TT_STYLE = Object.freeze({
  backgroundColor: '#0f172a',
  borderColor: '#334155',
  borderRadius: '8px',
  fontSize: 11,
})

export default function IngestStage({
  csvData,
  adaptiveStats,
  yearlyData,
  csvMeta,
  handleCSVLoad,
  dhLoadingId,
  setDhLoadingId,
  completeStage,
  fmtPHP,
  DataHubPicker,
  CSVDropzone,
  MetricCard,
  StageNav,
}) {
  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4">
      <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-start gap-3">
        <Plane size={18} className="text-blue-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-bold text-blue-300">KJS International — Airline Booking Records</p>
          <p className="text-xs text-slate-400 mt-1">
            Each row = 1 passenger ticket. The pipeline counts pax per period as demand
            and sums Net Amount as commission revenue. Stats in the sidebar update live.
          </p>
        </div>
      </div>

      <div className="bg-slate-900/60 border border-violet-500/20 rounded-2xl p-5">
        <h3 className="font-bold text-white text-sm mb-3 flex items-center gap-2">
          <FlaskConical size={16} className="text-violet-400" /> Load from Data Hub
        </h3>
        <DataHubPicker
          onLoad={handleCSVLoad}
          loadingId={dhLoadingId}
          setLoadingId={setDhLoadingId}
        />
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
        <h3 className="font-bold text-white text-sm mb-4 flex items-center gap-2">
          <Upload size={16} className="text-pink-400" />
          {csvData ? 'Current Dataset' : 'Or Upload CSV Directly'}
        </h3>
        <CSVDropzone onLoad={handleCSVLoad} isLoaded={!!csvData} csvMeta={csvMeta} />
      </div>

      {csvData && adaptiveStats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard
              label="Total Pax Bookings"
              value={adaptiveStats.totalPax.toLocaleString()}
              sub={`${adaptiveStats.monthCount} months`}
              color="text-white"
            />
            <MetricCard
              label="Total Commission"
              value={fmtPHP(adaptiveStats.totalRevenue)}
              sub={`₱${adaptiveStats.avgCommission.toFixed(2)}/pax avg`}
              color="text-emerald-400"
            />
            <MetricCard
              label="Avg Monthly Pax"
              value={adaptiveStats.avgMonthlyPax.toLocaleString()}
              sub={adaptiveStats.dateRange}
              color="text-white"
            />
            <MetricCard
              label="Peak Month"
              value={adaptiveStats.peak.demand.toLocaleString()}
              sub={adaptiveStats.peak.date}
              color="text-purple-400"
            />
          </div>

          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 mb-2">
              <Sparkles size={12} /> Adaptive Stats Derived from Your CSV
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px]">
              {[
                [
                  'Naive WMAPE',
                  adaptiveStats.naiveWMAPE != null ? `${adaptiveStats.naiveWMAPE.toFixed(2)}%` : '—',
                  'Seasonal naive baseline',
                ],
                [
                  'Auto Capacity',
                  `${adaptiveStats.maxDailyBookings} pax/day`,
                  '95th pctile daily demand',
                ],
                [
                  'Est. Risk',
                  fmtPHP(adaptiveStats.commissionRisk),
                  'Commission at over-cap days',
                ],
              ].map(([label, value, hint]) => (
                <div
                  key={label}
                  className="bg-slate-900/60 rounded-lg p-2.5 border border-emerald-500/10"
                >
                  <p className="text-slate-500 mb-0.5">{label}</p>
                  <p className="text-emerald-400 font-bold text-sm">{value}</p>
                  <p className="text-slate-600 text-[9px] mt-0.5">{hint}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-pink-400" />
              <h4 className="font-bold text-white text-sm">Year-over-Year: Pax Bookings & Commission</h4>
              {adaptiveStats.yoy != null && (
                <span
                  className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${
                    adaptiveStats.yoy >= 0
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-red-500/15 text-red-400'
                  }`}
                >
                  YoY {adaptiveStats.yoy > 0 ? '+' : ''}
                  {adaptiveStats.yoy}%
                </span>
              )}
            </div>
            <div className="h-56 bg-slate-950 rounded-xl border border-slate-800 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={yearlyData}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="year" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="l" stroke="#f472b6" tick={{ fontSize: 10 }} />
                  <YAxis
                    yAxisId="r"
                    orientation="right"
                    stroke="#10b981"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => fmtPHP(v)}
                  />
                  <Tooltip
                    contentStyle={TT_STYLE}
                    formatter={(v, name) =>
                      name === 'Commission (₱)' ? [fmtPHP(v), name] : [`${v} pax`, name]
                    }
                  />
                  <Bar
                    yAxisId="l"
                    dataKey="demand"
                    fill="#f472b6"
                    opacity={0.8}
                    radius={[3, 3, 0, 0]}
                    name="Pax Bookings"
                  />
                  <Line
                    yAxisId="r"
                    type="monotone"
                    dataKey="revenue"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot
                    name="Commission (₱)"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      <StageNav
        currentId="ingest"
        onBack={null}
        onComplete={csvData ? () => completeStage('ingest') : null}
        completeLabel="Data Loaded — Continue to Collinearity"
        completeDisabled={!csvData}
        completeColor="bg-pink-600 hover:bg-pink-500"
      />
    </div>
  )
}

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

import { buildRagBusinessInsights } from '../services/ragInsightService'

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

  const ragInsights = React.useMemo(() => {
    return buildRagBusinessInsights({
      activeDSS,
      prediction,
      horizon,
      effectiveCapacity,
      wmape: EFF?.wmape,
    })
  }, [activeDSS, prediction, horizon, effectiveCapacity, EFF?.wmape])

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
            Capacity auto-set to <strong className="text-sky-400">{EFF.maxDailyBookings} pax/day</strong>
          </p>
        </div>
      </div>

      {ragInsights && (
        <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-indigo-500/30 rounded-2xl p-5">
          <h4 className="font-bold text-indigo-300 text-sm mb-2 flex items-center gap-2">
            <BrainCircuit size={14}/> AI-Generated Business Insights ({ragInsights.confidence})
          </h4>
          <p className="text-xs text-slate-300 mb-3">
            {ragInsights.executiveSummary}
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-slate-400 font-bold mb-1">Recommended Actions</p>
              <ul className="text-xs text-slate-300 space-y-1">
                {ragInsights.recommendedActions.map((a,i)=>(<li key={i}>• {a}</li>))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold mb-1">Risk Context</p>
              <ul className="text-xs text-slate-300 space-y-1">
                {ragInsights.riskNarrative.map((r,i)=>(<li key={i}>• {r}</li>))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* existing DSS UI below remains unchanged */}
    </div>
  )
}

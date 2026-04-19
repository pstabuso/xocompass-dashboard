/**
 * RevenueWaterfall.jsx — Potential → Capped → At-Risk → Mitigated
 * ================================================================
 * Classic finance waterfall showing how total forecasted commission
 * breaks down under the current capacity scenario. Makes the revenue
 * story a single-glance narrative instead of four disconnected KPI cards.
 *
 * Props
 * ─────
 * potential   number  — uncapped commission if all demand were served
 * capped      number  — commission after capacity cap
 * atRisk      number  — commission lost to over-capacity
 * mitigated   number  — extra commission recovered by peak-fee scenario
 * fmt         fn      — formatter for pretty PHP amounts (fmtPHPk)
 * className   string
 */

import React, { useMemo } from 'react'
import {
  ComposedChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

const TT_STYLE = {
  backgroundColor: '#0f172a',
  borderColor:     '#334155',
  borderRadius:    '8px',
  fontSize:        11,
}

function WaterfallTooltip({ active, payload, fmt }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div style={TT_STYLE} className="px-3 py-2 border border-slate-700 rounded-xl">
      <p className="text-slate-400 text-[10px] mb-1">{d.label}</p>
      <p className="text-white font-bold text-sm">{fmt(d.raw)}</p>
      <p className="text-slate-500 text-[10px] mt-0.5">{d.hint}</p>
    </div>
  )
}

export default function RevenueWaterfall({
  potential  = 0,
  capped     = 0,
  atRisk     = 0,
  mitigated  = 0,
  fmt        = (v) => `₱${Math.round(Number(v) || 0).toLocaleString()}`,
  className  = '',
}) {
  const data = useMemo(() => {
    const pot    = Number(potential)  || 0
    const cap    = Number(capped)     || 0
    const riskIn = Number(atRisk)
    const mit    = Number(mitigated)  || cap
    const uplift = Math.max(0, mit - cap)
    const loss   = Number.isFinite(riskIn) && riskIn > 0 ? riskIn : Math.max(0, pot - cap)

    return [
      {
        label: 'Potential',
        base: 0,
        value: pot,
        raw:   pot,
        color: '#94a3b8',
        hint:  'If every pax booking served',
      },
      {
        label: 'Capacity loss',
        base: cap,
        value: loss,
        raw: -loss,
        color: '#ef4444',
        hint:  'Rejected bookings above cap',
      },
      {
        label: 'Capped',
        base: 0,
        value: cap,
        raw:   cap,
        color: '#ec4899',
        hint:  'Realistic commission under cap',
      },
      {
        label: 'Peak-fee uplift',
        base: cap,
        value: uplift,
        raw: uplift,
        color: '#10b981',
        hint:  'Extra from priority surcharge',
      },
      {
        label: 'Mitigated total',
        base: 0,
        value: mit,
        raw:   mit,
        color: '#22d3ee',
        hint:  'Capped + peak-fee recovery',
      },
    ]
  }, [potential, capped, atRisk, mitigated])

  const mitigatedTotal = data[4].raw
  const realisedShare  = potential > 0 ? (mitigatedTotal / potential) * 100 : 0

  return (
    <div className={`bg-slate-900/60 border border-slate-800 rounded-2xl p-5 ${className}`}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h4 className="font-bold text-white text-sm flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round">
            <path d="M3 3v18h18" />
            <path d="M7 15l4-4 4 3 5-7" />
          </svg>
          Commission Waterfall — Capacity Economics
        </h4>
        <span className="text-[10px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">
          {realisedShare.toFixed(1)}% of potential realised
        </span>
      </div>

      <div className="h-56 bg-slate-950 rounded-xl border border-slate-800 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 18, right: 12, bottom: 12, left: 30 }}
          >
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 9 }} interval={0} />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 9 }}
              tickFormatter={(v) => fmt(v).replace('₱', '₱')}
            />
            <Tooltip content={<WaterfallTooltip fmt={fmt} />} cursor={{ fill: 'rgba(34,211,238,0.05)' }} />
            <ReferenceLine y={0} stroke="#475569" />

            {/* invisible base for stacking */}
            <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="value" stackId="wf" isAnimationActive={false} radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} fillOpacity={0.85} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        {data.filter(d => d.label !== 'Mitigated total').map((d) => (
          <div key={d.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color, opacity: 0.85 }} />
            <div className="min-w-0">
              <p className="text-[9px] text-slate-500 truncate">{d.label}</p>
              <p className="text-[10px] font-bold text-slate-300">{fmt(Math.abs(d.raw))}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

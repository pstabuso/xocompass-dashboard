/**
 * ResidualsHistogram.jsx — Distribution of standardized residuals
 * ================================================================
 * Complements Q-Q plot by showing the empirical distribution of residuals
 * against an overlayed standard-normal PDF. Departures from the bell curve
 * (skew, heavy tails, bimodality) indicate model misspecification.
 *
 * Props
 * ─────
 * sample     list[float]  — standardized residuals (from qq_sample)
 * height     number       — chart height in px
 * bins       number       — histogram bins (default 16)
 * className  string       — optional wrapper class
 */

import React, { useMemo } from 'react'
import {
  ComposedChart, Bar, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const TT_STYLE = {
  backgroundColor: '#0f172a',
  borderColor:     '#334155',
  borderRadius:    '8px',
  fontSize:        11,
}

const SQRT_2PI = Math.sqrt(2 * Math.PI)
const normalPdf = (z) => Math.exp(-0.5 * z * z) / SQRT_2PI

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 20V10M9 20V4M14 20V12M19 20V7" strokeLinecap="round" />
      </svg>
      <p className="text-xs font-bold">No residual distribution</p>
      <p className="text-[10px]">Run the pipeline to generate diagnostics</p>
    </div>
  )
}

function HistTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div style={TT_STYLE} className="px-3 py-2 border border-slate-700 rounded-xl">
      <p className="text-slate-400 text-[10px] mb-1">Bin [{d.lo.toFixed(2)}, {d.hi.toFixed(2)})</p>
      <p className="text-white font-bold text-sm">{d.count} obs · {(d.density * 100).toFixed(1)}%</p>
      <p className="text-indigo-300 text-[10px] mt-0.5">Normal PDF: {d.normal.toFixed(3)}</p>
    </div>
  )
}

export default function ResidualsHistogram({
  sample    = [],
  height    = 220,
  bins      = 16,
  className = '',
}) {
  const { data, stats } = useMemo(() => {
    const safeSample = Array.isArray(sample) ? sample.filter(Number.isFinite) : []
    if (safeSample.length < 4) return { data: [], stats: null }

    const n = safeSample.length
    const min = Math.min(...safeSample, -3)
    const max = Math.max(...safeSample, 3)
    const lo = Math.floor(Math.min(min, -3) * 2) / 2
    const hi = Math.ceil(Math.max(max, 3) * 2) / 2
    const width = (hi - lo) / bins

    const counts = Array.from({ length: bins }, () => 0)
    for (const v of safeSample) {
      const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / width)))
      counts[idx] += 1
    }

    const mean = safeSample.reduce((a, b) => a + b, 0) / n
    const variance = safeSample.reduce((a, b) => a + (b - mean) ** 2, 0) / n
    const std = Math.sqrt(variance) || 1
    const skew = safeSample.reduce((a, b) => a + ((b - mean) / std) ** 3, 0) / n
    const kurt = safeSample.reduce((a, b) => a + ((b - mean) / std) ** 4, 0) / n - 3

    const built = counts.map((c, i) => {
      const binLo = lo + i * width
      const binHi = binLo + width
      const mid   = (binLo + binHi) / 2
      return {
        lo: binLo,
        hi: binHi,
        mid,
        count: c,
        density: c / n,
        normal: normalPdf(mid) * width,
      }
    })

    return { data: built, stats: { n, mean, std, skew, kurt } }
  }, [sample, bins])

  const isEmpty = data.length === 0
  const maxY = useMemo(
    () => Math.max(...data.map(d => Math.max(d.density, d.normal)), 0) * 1.15,
    [data],
  )

  const normalityVerdict = useMemo(() => {
    if (!stats) return null
    const absSkew = Math.abs(stats.skew)
    const absKurt = Math.abs(stats.kurt)
    if (absSkew < 0.5 && absKurt < 1) {
      return { ok: true, label: '✓ Approximately normal', color: 'emerald' }
    }
    if (absSkew > 1 || absKurt > 2) {
      return { ok: false, label: '⚠ Strong departure from normal', color: 'red' }
    }
    return { ok: false, label: '⚠ Mild departure from normal', color: 'amber' }
  }, [stats])

  return (
    <div className={`bg-slate-900/70 border border-slate-800 rounded-2xl p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shrink-0" />
        <h3 className="font-bold text-white text-sm">Residual Distribution</h3>
        <span className="text-slate-500 text-[10px]">Histogram vs N(0,1)</span>
        {stats && (
          <span className="ml-auto text-[9px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded-full">
            n={stats.n}
          </span>
        )}
      </div>

      {normalityVerdict && (
        <div className={`text-[10px] mb-3 px-2 py-1.5 rounded-lg border ${
          normalityVerdict.color === 'emerald'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : normalityVerdict.color === 'amber'
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {normalityVerdict.label}
          {stats && (
            <span className="text-slate-500 ml-1">
              · skew={stats.skew.toFixed(2)} · excess kurt={stats.kurt.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {isEmpty && (
        <p className="text-[10px] text-slate-500 mb-3 leading-relaxed">
          Bars = empirical density of standardised residuals. Overlay = standard normal PDF.
          A close match confirms Gaussian errors (GLM/SARIMAX assumption).
        </p>
      )}

      <div
        style={{ height, minHeight: height }}
        className="bg-slate-950 rounded-xl border border-slate-800"
      >
        {isEmpty ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 10, right: 12, bottom: 20, left: 4 }}
              barCategoryGap={1}
            >
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="mid"
                type="number"
                domain={[data[0].lo, data[data.length - 1].hi]}
                stroke="#64748b"
                tick={{ fontSize: 9 }}
                tickFormatter={v => v.toFixed(1)}
                label={{
                  value: 'Standardised residual (z)',
                  position: 'insideBottom',
                  offset: -8,
                  fontSize: 9,
                  fill: '#64748b',
                }}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 9 }}
                domain={[0, maxY]}
                tickFormatter={v => v.toFixed(2)}
              />
              <Tooltip content={<HistTooltip />} cursor={{ fill: 'rgba(34,211,238,0.05)' }} />
              <Bar dataKey="density" name="Empirical">
                {data.map((d, i) => {
                  const extreme = Math.abs(d.mid) > 2.5
                  return (
                    <Cell
                      key={i}
                      fill={extreme ? '#f97316' : '#22d3ee'}
                      fillOpacity={0.65}
                    />
                  )
                })}
              </Bar>
              <Line
                type="monotone"
                dataKey="normal"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={false}
                name="N(0,1) PDF"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {!isEmpty && (
        <div className="flex items-center gap-4 mt-2.5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-cyan-400 opacity-65 shrink-0" />
            <span className="text-[9px] text-slate-500">Empirical density</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-[2px] bg-violet-400 shrink-0" />
            <span className="text-[9px] text-slate-500">Standard normal PDF</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-orange-500 opacity-65 shrink-0" />
            <span className="text-[9px] text-slate-500">|z| &gt; 2.5 (outliers)</span>
          </div>
        </div>
      )}
    </div>
  )
}

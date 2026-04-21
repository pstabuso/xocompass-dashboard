/**
 * PACFChart.jsx — Partial Autocorrelation Function Chart
 * =======================================================
 * Bar chart of PACF coefficients at lags 1…N with 95% confidence bands.
 * PACF at lag k shows the direct correlation between e_t and e_{t-k}
 * after removing the influence of intermediate lags 1..k-1.
 *
 * Props
 * ─────
 * pacf       list[float]  — PACF values at lags 1…N (lag-0 excluded)
 * ciBound    number       — 95% CI half-width = 1.96/√n (from backend)
 * nObs       number       — number of residual observations
 * height     number       — chart height in px (default 220)
 * className  string       — optional outer wrapper class
 *
 * [ISO 25010 - Usability]   Colour coding, CI bands, empty state
 * [ISO 25010 - Reliability] NaN/Inf filtered, ciBound fallback
 */

import React, { useMemo } from 'react';
import {
  ComposedChart, Bar, Cell,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';

const TT_STYLE = {
  backgroundColor: '#0f172a',
  borderColor:     '#334155',
  borderRadius:    '8px',
  fontSize:        11,
};

function EmptyState({ missingFromBackend = false }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600 px-4 text-center">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <line x1="4" y1="20" x2="4" y2="4"/>
        {[6, 9, 12, 15, 18].map((x, i) => (
          <rect key={x} x={x} y={20 - (i % 2 + 1) * 5} width="2" height={(i % 2 + 1) * 5}/>
        ))}
      </svg>
      <p className="text-xs font-bold">No PACF data available</p>
      <p className="text-[10px] leading-relaxed">
        {missingFromBackend
          ? 'The pipeline ran, but the backend did not return diagnostics.pacf. Generate PACF in the backend and include it in the diagnostics payload.'
          : 'Run the pipeline to generate diagnostics.'}
      </p>
    </div>
  );
}

// Custom tooltip: Lag / PACF value / significance
function PACFTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const sig      = Math.abs(d.value) > d.ci;
  const sigLabel = sig ? '⚠ Significant' : '✓ Within CI';
  const sigColor = sig ? '#f59e0b' : '#10b981';
  return (
    <div style={TT_STYLE} className="px-3 py-2 border border-slate-700 rounded-xl">
      <p className="text-slate-400 text-[10px] mb-1">Lag {d.lag}</p>
      <p className="text-white font-bold text-sm">{d.value.toFixed(4)}</p>
      <p style={{ color: sigColor }} className="text-[10px] mt-0.5">{sigLabel}</p>
      <p className="text-slate-600 text-[10px]">95% CI: ±{d.ci.toFixed(4)}</p>
    </div>
  );
}

export default function PACFChart({
  pacf      = [],
  ciBound   = 0.2,
  nObs      = 0,
  height    = 220,
  className = '',
}) {
  // [iOS FIX + ISO 25010 - Reliability]
  // Guard: coerce incoming pacf prop to a safe array before any processing.
  // On iOS, if the parent renders before liveMetrics is populated the prop may
  // arrive as undefined, causing .map() to throw a TypeError that silently
  // swallows the error and leaves the chart blank.
  const safePACF = Array.isArray(pacf) ? pacf : [];

  const data = useMemo(() => {
    const ci = Number.isFinite(ciBound) && ciBound > 0 ? ciBound : 0.2;
    return safePACF
      // [iOS FIX] Explicit Number() coercion — ensures no bare NaN reaches Recharts SVG
      .map((v, i) => ({ lag: i + 1, value: Number.isFinite(Number(v)) ? Number(v) : 0, ci }))
      .filter(d => Number.isFinite(d.value));
  }, [safePACF, ciBound]);

  const effectiveCi = useMemo(() => {
    if (Number.isFinite(ciBound) && ciBound > 0) return ciBound;
    return nObs > 0 ? 1.96 / Math.sqrt(nObs) : 0.2;
  }, [ciBound, nObs]);

  const isEmpty = data.length === 0;
  const missingFromBackend = isEmpty && nObs > 0;

  // Count significant lags for the interpretation note
  const sigCount = useMemo(
    () => data.filter(d => Math.abs(d.value) > effectiveCi).length,
    [data, effectiveCi],
  );

  return (
    <div className={`bg-slate-900/70 border border-slate-800 rounded-2xl p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2.5 h-2.5 rounded-full bg-violet-500 shrink-0" />
        <h3 className="font-bold text-white text-sm">PACF</h3>
        <span className="text-slate-500 text-[10px]">Partial Autocorrelation</span>
        {nObs > 0 && (
          <span className="ml-auto text-[9px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded-full">
            n={nObs}
          </span>
        )}
      </div>

      {/* Dynamic interpretation */}
      {!isEmpty && (
        <div className={`text-[10px] mb-3 px-2 py-1.5 rounded-lg border ${
          sigCount === 0
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
        }`}>
          {sigCount === 0
            ? '✓ No significant partial autocorrelations — AR terms not needed.'
            : `⚠ ${sigCount} significant lag${sigCount > 1 ? 's' : ''} detected — consider adding AR(${sigCount}) term.`}
        </div>
      )}

      {isEmpty && (
        <p className="text-[10px] text-slate-500 mb-3 leading-relaxed">
          {missingFromBackend
            ? 'The chart component rendered successfully, but the PACF array was missing from the diagnostics payload.'
            : 'Shows direct lag correlations after removing intermediate effects. Significant lags outside bands suggest the AR order needs adjustment.'}
        </p>
      )}

      {/* [iOS FIX] Explicit minHeight prevents Safari ResponsiveContainer collapse */}
      <div
        style={{ height, minHeight: height }}
        className="bg-slate-950 rounded-xl border border-slate-800"
      >
        {isEmpty ? (
          <EmptyState missingFromBackend={missingFromBackend} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 10, right: 12, bottom: 20, left: 4 }}
              barCategoryGap="20%"
            >
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />

              <XAxis
                dataKey="lag"
                stroke="#64748b"
                tick={{ fontSize: 9 }}
                label={{
                  value: 'Lag',
                  position: 'insideBottom',
                  offset: -8,
                  fontSize: 9,
                  fill: '#64748b',
                }}
              />
              <YAxis
                domain={[-1, 1]}
                stroke="#64748b"
                tick={{ fontSize: 9 }}
                tickFormatter={v => v.toFixed(1)}
              />

              <Tooltip content={<PACFTooltip />} cursor={{ fill: 'rgba(139,92,246,0.08)' }} />

              {/* Zero baseline */}
              <ReferenceLine y={0} stroke="#475569" strokeWidth={1.5} />

              {/* 95% CI upper band */}
              <ReferenceLine
                y={effectiveCi}
                stroke="#f59e0b"
                strokeWidth={1}
                strokeDasharray="4 3"
                label={{ value: `+${effectiveCi.toFixed(2)}`, fill: '#f59e0b', fontSize: 8, position: 'right' }}
              />

              {/* 95% CI lower band */}
              <ReferenceLine
                y={-effectiveCi}
                stroke="#f59e0b"
                strokeWidth={1}
                strokeDasharray="4 3"
                label={{ value: `-${effectiveCi.toFixed(2)}`, fill: '#f59e0b', fontSize: 8, position: 'right' }}
              />

              <Bar dataKey="value" barSize={4} name="PACF" radius={[2, 2, 0, 0]}>
                {data.map((d, i) => {
                  const significant = Math.abs(d.value) > effectiveCi;
                  const positive    = d.value >= 0;
                  const fill = significant
                    ? (positive ? '#f59e0b' : '#f97316')
                    : (positive ? '#8b5cf6' : '#a78bfa');
                  return <Cell key={i} fill={fill} fillOpacity={0.85} />;
                })}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend */}
      {!isEmpty && (
        <div className="flex items-center gap-4 mt-2.5 flex-wrap">
          {[
            { color: '#8b5cf6', label: 'Within CI (non-significant)' },
            { color: '#f59e0b', label: 'Outside CI (significant)' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[9px] text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

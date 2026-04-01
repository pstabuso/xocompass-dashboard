/**
 * QQPlot.jsx — Quantile-Quantile Normality Plot
 * =============================================
 * Plots standardised sample residual quantiles (Y) against theoretical
 * N(0,1) quantiles (X). Points on the y=x diagonal = normally distributed
 * residuals, which is a key assumption for SARIMAX validity.
 *
 * Props
 * ─────
 * theoretical  list[float]  — N(0,1) theoretical quantiles (X axis)
 * sample       list[float]  — standardised sample quantiles   (Y axis)
 * height       number       — chart height in px (default 240)
 * className    string       — optional outer wrapper class
 *
 * [ISO 25010 - Usability]   Square domain, reference line, empty state
 * [ISO 25010 - Reliability] All NaN/Inf filtered before render
 */

import React, { useMemo } from 'react';
import {
  ScatterChart, Scatter,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';

// ── Shared tooltip style ─────────────────────────────────────────────────
const TT_STYLE = {
  backgroundColor: '#0f172a',
  borderColor:     '#334155',
  borderRadius:    '8px',
  fontSize:        11,
};

// ── Empty state ──────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="9" cy="9" r="6"/><circle cx="15" cy="15" r="6"/>
        <line x1="4" y1="20" x2="20" y2="4"/>
      </svg>
      <p className="text-xs font-bold">No Q-Q data available</p>
      <p className="text-[10px]">Run the pipeline to generate diagnostics</p>
    </div>
  );
}

// ── Custom dot — colour by distance from diagonal ────────────────────────
function QQDot(props) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const dist = Math.abs(payload.sample - payload.theoretical);
  // Green near diagonal, amber if drifting, red if far
  const fill = dist < 0.3 ? '#10b981' : dist < 0.8 ? '#f59e0b' : '#ef4444';
  return <circle cx={cx} cy={cy} r={3} fill={fill} fillOpacity={0.8} stroke="none" />;
}

// ── Main component ────────────────────────────────────────────────────────
export default function QQPlot({
  theoretical = [],
  sample      = [],
  height      = 240,
  className   = '',
}) {
  // [ISO 25010 - Reliability] Filter NaN/Inf pairs before any calculation
  const data = useMemo(() => {
    const out = [];
    const len = Math.min(theoretical.length, sample.length);
    for (let i = 0; i < len; i++) {
      const t = theoretical[i];
      const s = sample[i];
      if (Number.isFinite(t) && Number.isFinite(s)) {
        out.push({ theoretical: t, sample: s });
      }
    }
    return out;
  }, [theoretical, sample]);

  // Square domain — same range on both axes so the y=x line is truly diagonal
  const domain = useMemo(() => {
    if (data.length === 0) return [-3, 3];
    const allVals = data.flatMap(d => [d.theoretical, d.sample]);
    const lo = Math.floor(Math.min(...allVals) - 0.5);
    const hi = Math.ceil(Math.max(...allVals) + 0.5);
    const bound = Math.max(Math.abs(lo), Math.abs(hi));
    return [-bound, bound];
  }, [data]);

  const isEmpty = data.length === 0;

  return (
    <div className={`bg-slate-900/70 border border-slate-800 rounded-2xl p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2.5 h-2.5 rounded-full bg-pink-500 shrink-0" />
        <h3 className="font-bold text-white text-sm">Q-Q Plot</h3>
        <span className="ml-auto text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
          Normality check
        </span>
      </div>

      {/* Interpretation hint */}
      <p className="text-[10px] text-slate-500 mb-3 leading-relaxed">
        Points on the <span className="text-red-400 font-bold">red diagonal</span> = normally distributed residuals.
        Systematic S-curves or outliers indicate non-normality.
      </p>

      {/* Chart */}
      <div style={{ height }} className="bg-slate-950 rounded-xl border border-slate-800">
        {isEmpty ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 12, bottom: 20, left: 4 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />

              <XAxis
                type="number"
                dataKey="theoretical"
                domain={domain}
                name="Theoretical"
                stroke="#64748b"
                tick={{ fontSize: 9 }}
                label={{
                  value: 'Theoretical N(0,1)',
                  position: 'insideBottom',
                  offset: -8,
                  fontSize: 9,
                  fill: '#64748b',
                }}
              />
              <YAxis
                type="number"
                dataKey="sample"
                domain={domain}
                name="Sample"
                stroke="#64748b"
                tick={{ fontSize: 9 }}
                label={{
                  value: 'Sample Quantiles',
                  angle: -90,
                  position: 'insideLeft',
                  offset: 12,
                  fontSize: 9,
                  fill: '#64748b',
                }}
              />

              <Tooltip
                contentStyle={TT_STYLE}
                cursor={{ strokeDasharray: '3 3', stroke: '#475569' }}
                formatter={(v, name) => [v.toFixed(3), name === 'theoretical' ? 'Theoretical' : 'Sample']}
              />

              {/* y = x reference line — perfect normality diagonal */}
              <ReferenceLine
                segment={[
                  { x: domain[0], y: domain[0] },
                  { x: domain[1], y: domain[1] },
                ]}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                label={{ value: 'y = x', fill: '#ef4444', fontSize: 8, position: 'insideTopLeft' }}
              />

              <Scatter
                data={data}
                shape={<QQDot />}
                name="Residual"
              />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend */}
      {!isEmpty && (
        <div className="flex items-center gap-4 mt-2.5 flex-wrap">
          {[
            { color: '#10b981', label: 'Near normal (dist < 0.3)' },
            { color: '#f59e0b', label: 'Mild deviation' },
            { color: '#ef4444', label: 'Strong deviation' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[9px] text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

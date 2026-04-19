/**
 * CalendarHeatmap.jsx — Day-grid view of forecast demand
 * =======================================================
 * Airline-dashboard staple: Mon–Sun columns × ISO weeks, each cell coloured
 * by forecast utilisation against capacity. Reveals day-of-week seasonality
 * and clustered risk periods that a time-series line chart hides.
 *
 * Props
 * ─────
 * forecasts  list[{date, forecast, unmet_demand, risk_level}]
 * capacity   number    — daily booking cap for % utilisation
 * className  string
 */

import React, { useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function parseIsoDate(str) {
  if (typeof str !== 'string' || str.length < 10) return null
  const [y, m, d] = str.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d))
}

function mondayIndex(date) {
  const dow = date.getUTCDay()
  return dow === 0 ? 6 : dow - 1
}

function weekStart(date) {
  const d = new Date(date.getTime())
  d.setUTCDate(d.getUTCDate() - mondayIndex(d))
  return d
}

function heatColor(util) {
  if (!Number.isFinite(util)) return 'rgba(30,41,59,0.6)'
  if (util < 0.55) return 'rgba(16,185,129,0.75)'
  if (util < 0.70) return 'rgba(34,197,94,0.75)'
  if (util < 0.85) return 'rgba(245,158,11,0.8)'
  if (util < 1.00) return 'rgba(249,115,22,0.85)'
  return 'rgba(239,68,68,0.9)'
}

function formatPct(util) {
  if (!Number.isFinite(util)) return '—'
  return `${Math.round(util * 100)}%`
}

export default function CalendarHeatmap({
  forecasts = [],
  capacity  = 1,
  className = '',
}) {
  const [hover, setHover] = useState(null)

  const { weeks, labels, stats } = useMemo(() => {
    const rows = Array.isArray(forecasts) ? forecasts : []
    const cap  = Number.isFinite(capacity) && capacity > 0 ? capacity : 1

    const cells = []
    for (const f of rows) {
      const d = parseIsoDate(f.date)
      if (!d) continue
      const demand = Number(f.forecast) || 0
      const util   = demand / cap
      cells.push({
        date: d,
        iso:  f.date,
        demand,
        unmet: Number(f.unmet_demand) || 0,
        risk:  f.risk_level,
        util,
      })
    }

    if (cells.length === 0) {
      return { weeks: [], labels: [], stats: null }
    }

    cells.sort((a, b) => a.date - b.date)
    const first = weekStart(cells[0].date)
    const last  = weekStart(cells[cells.length - 1].date)
    const weeksCount = Math.round((last - first) / (7 * 86400000)) + 1

    const grid = Array.from({ length: weeksCount }, () => Array(7).fill(null))
    const monthLabels = Array(weeksCount).fill(null)

    for (const c of cells) {
      const wIdx = Math.round((weekStart(c.date) - first) / (7 * 86400000))
      if (wIdx < 0 || wIdx >= weeksCount) continue
      grid[wIdx][mondayIndex(c.date)] = c
    }

    let lastLabel = ''
    for (let w = 0; w < weeksCount; w++) {
      const ws = new Date(first.getTime() + w * 7 * 86400000)
      const label = ws.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
      if (label !== lastLabel) {
        monthLabels[w] = label
        lastLabel = label
      }
    }

    const peak = cells.reduce((best, c) => (c.util > (best?.util ?? 0) ? c : best), null)
    const critical = cells.filter(c => c.util >= 1).length
    const high     = cells.filter(c => c.util >= 0.85 && c.util < 1).length
    const avgUtil  = cells.reduce((s, c) => s + c.util, 0) / cells.length

    return {
      weeks: grid,
      labels: monthLabels,
      stats: { peak, critical, high, avgUtil, count: cells.length },
    }
  }, [forecasts, capacity])

  if (weeks.length === 0) {
    return (
      <div className={`bg-slate-900/60 border border-slate-800 rounded-2xl p-5 ${className}`}>
        <h4 className="font-bold text-white text-sm mb-3 flex items-center gap-2">
          <CalendarDays size={16} className="text-cyan-400" /> Demand Calendar
        </h4>
        <div className="py-10 text-center text-slate-600 text-xs">
          No forecast data to plot
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-slate-900/60 border border-slate-800 rounded-2xl p-5 ${className}`}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h4 className="font-bold text-white text-sm flex items-center gap-2">
          <CalendarDays size={16} className="text-cyan-400" /> Demand Calendar — Utilisation vs {capacity} pax/day
        </h4>
        {stats && (
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span>
              Avg <strong className="text-slate-300">{formatPct(stats.avgUtil)}</strong>
            </span>
            <span>·</span>
            <span className="text-orange-400">{stats.high}d high</span>
            <span>·</span>
            <span className="text-red-400">{stats.critical}d critical</span>
          </div>
        )}
      </div>

      <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 overflow-x-auto">
        <div className="relative" style={{ minWidth: weeks.length * 18 + 40 }}>
          {/* Month labels */}
          <div className="flex pl-8 mb-1">
            {labels.map((label, i) => (
              <div
                key={i}
                className="text-[9px] text-slate-500 font-bold"
                style={{ width: 18, flexShrink: 0 }}
              >
                {label || ''}
              </div>
            ))}
          </div>

          {/* Grid: DOW rows × week columns */}
          <div className="flex">
            <div className="flex flex-col gap-[2px] pr-2">
              {DOW.map((d, i) => (
                <div
                  key={d}
                  className="text-[9px] text-slate-600 text-right"
                  style={{ height: 16, lineHeight: '16px', opacity: i % 2 === 0 ? 1 : 0 }}
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="flex gap-[2px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[2px]">
                  {week.map((cell, di) => {
                    const empty = !cell
                    const bg = empty ? 'rgba(15,23,42,0.4)' : heatColor(cell.util)
                    return (
                      <div
                        key={di}
                        onMouseEnter={() => !empty && setHover(cell)}
                        onMouseLeave={() => setHover(null)}
                        className={`rounded-sm transition ${empty ? '' : 'cursor-pointer hover:ring-1 hover:ring-white/40'}`}
                        style={{ width: 16, height: 16, backgroundColor: bg }}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend + hover readout */}
      <div className="flex items-center justify-between flex-wrap gap-3 mt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-slate-500">Low</span>
          {[0.3, 0.6, 0.75, 0.9, 1.05].map(v => (
            <span
              key={v}
              className="w-4 h-3 rounded-sm"
              style={{ backgroundColor: heatColor(v) }}
            />
          ))}
          <span className="text-[9px] text-slate-500">Over capacity</span>
        </div>

        <div className="text-[10px] text-slate-400 min-h-[16px]">
          {hover ? (
            <span>
              <strong className="text-white">{hover.iso}</strong>
              {' · '}
              <span className="text-cyan-400">{Math.round(hover.demand)} pax</span>
              {' · '}
              <span className={hover.util >= 1 ? 'text-red-400 font-bold' : 'text-slate-400'}>
                {formatPct(hover.util)} util
              </span>
              {hover.unmet > 0 && (
                <span className="text-red-400"> · {Math.round(hover.unmet)} unserved</span>
              )}
            </span>
          ) : (
            stats?.peak && (
              <span>
                Peak: <strong className="text-white">{stats.peak.iso}</strong>
                {' · '}
                <span className="text-red-400 font-bold">{formatPct(stats.peak.util)}</span>
              </span>
            )
          )}
        </div>
      </div>
    </div>
  )
}

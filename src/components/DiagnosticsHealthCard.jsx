/**
 * DiagnosticsHealthCard.jsx — Single-glance SARIMAX health readout
 * =================================================================
 * Rolls up the four residual-diagnostic checks (Ljung-Box whiteness,
 * ACF significance, PACF significance, approximate normality) into a
 * traffic-light grid. Lets a non-statistician see at a glance whether
 * the fit can be trusted before acting on the forecast.
 *
 * Props
 * ─────
 * ljungBoxPvalue  number | null
 * diagnostics     {acf, pacf, ci_bound, qq_sample, n_obs} | null
 * className       string
 */

import React, { useMemo } from 'react'
import { ShieldCheck, CircleAlert } from 'lucide-react'

const STATUS = {
  pass: {
    icon: '✓',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    dot: 'bg-emerald-400',
    text: 'text-emerald-400',
    label: 'Pass',
  },
  warn: {
    icon: '!',
    bg: 'bg-amber-500/10 border-amber-500/30',
    dot: 'bg-amber-400',
    text: 'text-amber-400',
    label: 'Warning',
  },
  fail: {
    icon: '✗',
    bg: 'bg-red-500/10 border-red-500/30',
    dot: 'bg-red-500',
    text: 'text-red-400',
    label: 'Fail',
  },
  unknown: {
    icon: '—',
    bg: 'bg-slate-800 border-slate-700',
    dot: 'bg-slate-600',
    text: 'text-slate-500',
    label: 'No data',
  },
}

function significantCount(arr, ci) {
  if (!Array.isArray(arr) || !Number.isFinite(ci)) return 0
  return arr.filter((v) => Number.isFinite(v) && Math.abs(v) > ci).length
}

function computeMoments(sample) {
  if (!Array.isArray(sample) || sample.length < 4) return null
  const clean = sample.filter(Number.isFinite)
  const n = clean.length
  if (n < 4) return null
  const mean = clean.reduce((a, b) => a + b, 0) / n
  const variance = clean.reduce((a, b) => a + (b - mean) ** 2, 0) / n
  const std = Math.sqrt(variance) || 1
  const skew = clean.reduce((a, b) => a + ((b - mean) / std) ** 3, 0) / n
  const kurt = clean.reduce((a, b) => a + ((b - mean) / std) ** 4, 0) / n - 3
  return { n, mean, std, skew, kurt }
}

export default function DiagnosticsHealthCard({
  ljungBoxPvalue = null,
  diagnostics = null,
  className = '',
}) {
  const checks = useMemo(() => {
    const diag = diagnostics || {}
    const ci = Number(diag.ci_bound)
    const acfSig  = significantCount(diag.acf, ci)
    const pacfSig = significantCount(diag.pacf, ci)
    const moments = computeMoments(diag.qq_sample)

    const lb = Number.isFinite(ljungBoxPvalue)
      ? ljungBoxPvalue > 0.05
        ? { status: 'pass', detail: `p = ${ljungBoxPvalue.toFixed(3)} > 0.05 — residuals look like white noise` }
        : ljungBoxPvalue > 0.01
          ? { status: 'warn', detail: `p = ${ljungBoxPvalue.toFixed(3)} — marginal autocorrelation` }
          : { status: 'fail', detail: `p = ${ljungBoxPvalue.toFixed(3)} — structure remains in residuals` }
      : { status: 'unknown', detail: 'Ljung-Box not available' }

    const acfCheck = Array.isArray(diag.acf) && diag.acf.length > 0
      ? acfSig === 0
        ? { status: 'pass', detail: 'All ACF lags within 95% CI' }
        : acfSig <= 2
          ? { status: 'warn', detail: `${acfSig} lag${acfSig > 1 ? 's' : ''} outside CI — consider MA term` }
          : { status: 'fail', detail: `${acfSig} significant lags — MA order under-specified` }
      : { status: 'unknown', detail: 'No ACF data' }

    const pacfCheck = Array.isArray(diag.pacf) && diag.pacf.length > 0
      ? pacfSig === 0
        ? { status: 'pass', detail: 'All PACF lags within 95% CI' }
        : pacfSig <= 2
          ? { status: 'warn', detail: `${pacfSig} lag${pacfSig > 1 ? 's' : ''} outside CI — consider AR term` }
          : { status: 'fail', detail: `${pacfSig} significant lags — AR order under-specified` }
      : { status: 'unknown', detail: 'No PACF data' }

    const normalCheck = moments
      ? Math.abs(moments.skew) < 0.5 && Math.abs(moments.kurt) < 1
        ? { status: 'pass', detail: `skew=${moments.skew.toFixed(2)}, kurt=${moments.kurt.toFixed(2)} — Gaussian` }
        : Math.abs(moments.skew) < 1 && Math.abs(moments.kurt) < 2
          ? { status: 'warn', detail: `skew=${moments.skew.toFixed(2)}, kurt=${moments.kurt.toFixed(2)} — mild departure` }
          : { status: 'fail', detail: `skew=${moments.skew.toFixed(2)}, kurt=${moments.kurt.toFixed(2)} — non-normal errors` }
      : { status: 'unknown', detail: 'No residual sample' }

    return [
      { key: 'ljung', name: 'Whiteness (Ljung-Box)',  ...lb,         hint: 'Residuals should be uncorrelated.' },
      { key: 'acf',   name: 'ACF structure',          ...acfCheck,    hint: 'No lag should exceed the 95% band.' },
      { key: 'pacf',  name: 'PACF structure',         ...pacfCheck,   hint: 'No lag should exceed the 95% band.' },
      { key: 'norm',  name: 'Residual normality',     ...normalCheck, hint: 'Errors should be roughly Gaussian.' },
    ]
  }, [ljungBoxPvalue, diagnostics])

  const summary = useMemo(() => {
    const weight = { pass: 0, warn: 1, fail: 3, unknown: 0 }
    const known = checks.filter(c => c.status !== 'unknown')
    if (known.length === 0) return { grade: 'unknown', score: null, note: 'Run the pipeline to populate diagnostics.' }
    const total = known.reduce((s, c) => s + weight[c.status], 0)
    if (total === 0)    return { grade: 'pass', score: `${known.length}/${known.length}`, note: 'All assumptions satisfied — forecast is trustworthy.' }
    if (total <= 2)     return { grade: 'warn', score: `${known.filter(c => c.status === 'pass').length}/${known.length}`, note: 'Minor deviations — forecast usable with caveats.' }
    return { grade: 'fail', score: `${known.filter(c => c.status === 'pass').length}/${known.length}`, note: 'Model misspecification likely — retune order/seasonal terms.' }
  }, [checks])

  const summaryStyle = STATUS[summary.grade]

  return (
    <div className={`bg-slate-900/60 border border-slate-800 rounded-2xl p-5 ${className}`}>
      <div className="flex items-start gap-3 mb-4">
        <div className={`p-2 rounded-xl ${summaryStyle.bg}`}>
          {summary.grade === 'pass' ? (
            <ShieldCheck size={20} className={summaryStyle.text} />
          ) : (
            <CircleAlert size={20} className={summaryStyle.text} />
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-white text-sm">Model Health Summary</h4>
            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${summaryStyle.bg} ${summaryStyle.text}`}>
              {summary.grade === 'unknown' ? 'Pending' : summary.grade.toUpperCase()}
            </span>
            {summary.score && (
              <span className="text-[10px] text-slate-500 font-mono">{summary.score} checks pass</span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{summary.note}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {checks.map((c) => {
          const style = STATUS[c.status]
          return (
            <div
              key={c.key}
              className={`px-3 py-2 rounded-xl border ${style.bg}`}
            >
              <div className="flex items-center gap-2">
                <span className={`inline-flex w-5 h-5 items-center justify-center rounded-full text-[10px] font-black text-slate-950 ${style.dot}`}>
                  {style.icon}
                </span>
                <span className={`text-[11px] font-bold ${style.text}`}>{c.name}</span>
                <span className={`ml-auto text-[9px] ${style.text}`}>{style.label}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 leading-snug">{c.detail}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

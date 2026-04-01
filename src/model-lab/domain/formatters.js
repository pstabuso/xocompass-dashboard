export const safeN = (v) => (typeof v === 'number' && isFinite(v) ? v : 0)

export const fmt = (v, d = 1) => safeN(v).toFixed(d)

export const fmtPct = (v) => `${safeN(v).toFixed(1)}%`

export function fmtPHP(v) {
  const n = safeN(v)
  if (n === 0) return '₱0'
  if (n < 10_000) return `₱${Math.round(n).toLocaleString()}`
  if (n < 1_000_000) return `₱${(n / 1_000).toFixed(1)}k`
  return `₱${(n / 1_000_000).toFixed(2)}M`
}

export function fmtPHPk(v) {
  const n = safeN(v)
  if (n === 0) return '₱0'
  if (n < 1_000) return `₱${Math.round(n)}`
  return `₱${(n / 1_000).toFixed(1)}k`
}

export function fmtDelta(v) {
  const n = safeN(v)
  return `${n >= 0 ? '+' : ''}${fmtPHP(n)}`
}

/**
 * Convert forecast values into whole passenger counts.
 */
export const paxInt = (v) => Math.round(safeN(v))

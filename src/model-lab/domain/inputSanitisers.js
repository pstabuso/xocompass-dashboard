import { FALLBACK } from './constants'

export function clamp(value, min, max, fallback = min) {
  const numericValue = Number(value)
  return isFinite(numericValue)
    ? Math.max(min, Math.min(max, numericValue))
    : fallback
}

export function sanitiseCapacity(value, max = FALLBACK.MAX_DAILY_BOOKINGS) {
  return Math.round(
    clamp(
      value,
      FALLBACK.MIN_CAPACITY,
      FALLBACK.MAX_CAPACITY_INPUT,
      max
    )
  )
}

export function sanitiseHorizon(value) {
  return (
    Math.round(
      clamp(
        value,
        FALLBACK.MIN_HORIZON,
        FALLBACK.MAX_HORIZON,
        90
      ) / 30
    ) * 30
  )
}

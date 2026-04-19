import { paxInt, fmt } from './formatters'

const Z95 = 1.959963984540054
const Z80 = 1.2815515655446004
const Z50 = 0.6744897501960817

const PI_80_SCALE = Z80 / Z95
const PI_50_SCALE = Z50 / Z95

export function buildForecastChartData(csvData, prediction) {
  if (!csvData) return []

  const history = csvData.slice(-24).map((entry) => ({
    date: entry.date,
    actual: entry.demand,
    forecast: null,
    ci_upper: null,
    ci95_range: null,
    ci80_range: null,
    ci50_range: null,
  }))

  if (!prediction?.forecasts) return history

  const monthly = {}

  prediction.forecasts.forEach((forecastPoint) => {
    const monthKey = forecastPoint.date.slice(0, 7)

    if (!monthly[monthKey]) {
      monthly[monthKey] = {
        date: monthKey,
        actual: null,
        demands: [],
        ci_lows: [],
        ci_ups: [],
      }
    }

    const mean = paxInt(forecastPoint.forecast)
    const lo   = Number(forecastPoint.ci_lower)
    const hi   = Number(forecastPoint.ci_upper)

    monthly[monthKey].demands.push(mean)
    monthly[monthKey].ci_lows.push(Number.isFinite(lo) ? lo : mean)
    monthly[monthKey].ci_ups.push(Number.isFinite(hi) ? hi : mean)
  })

  const future = Object.values(monthly).map((month) => {
    const sum = (arr) => arr.reduce((acc, v) => acc + v, 0)
    const forecast = sum(month.demands)
    const ci95_low = Math.max(0, sum(month.ci_lows))
    const ci95_high = sum(month.ci_ups)
    const halfWidth = (ci95_high - ci95_low) / 2
    const pi80Half  = halfWidth * PI_80_SCALE
    const pi50Half  = halfWidth * PI_50_SCALE

    return {
      date: month.date,
      actual: null,
      forecast,
      ci_upper: +fmt(ci95_high),
      ci95_range: [+fmt(ci95_low), +fmt(ci95_high)],
      ci80_range: [+fmt(Math.max(0, forecast - pi80Half)), +fmt(forecast + pi80Half)],
      ci50_range: [+fmt(Math.max(0, forecast - pi50Half)), +fmt(forecast + pi50Half)],
    }
  })

  return [...history, ...future]
}

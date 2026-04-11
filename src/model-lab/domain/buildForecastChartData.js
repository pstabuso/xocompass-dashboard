import { paxInt, fmt } from './formatters'

export function buildForecastChartData(csvData, prediction) {
  if (!csvData) return []

  const history = csvData.slice(-24).map((entry) => ({
    date: entry.date,
    actual: entry.demand,
    forecast: null,
    ci_upper: null,
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
        ci_ups: [],
      }
    }

    monthly[monthKey].demands.push(paxInt(forecastPoint.forecast))
    monthly[monthKey].ci_ups.push(Number(forecastPoint.ci_upper) || 0)
  })

  const future = Object.values(monthly).map((month) => ({
    date: month.date,
    actual: null,
    forecast: month.demands.reduce((sum, value) => sum + value, 0),
    ci_upper: +fmt(month.ci_ups.reduce((sum, value) => sum + value, 0)),
  }))

  return [...history, ...future]
}

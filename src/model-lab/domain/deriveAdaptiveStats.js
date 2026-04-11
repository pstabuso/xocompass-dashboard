import { FALLBACK } from './constants'

function pctile(arr, p) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const index = Math.min(
    Math.floor((p / 100) * (sorted.length - 1)),
    sorted.length - 1
  )
  return sorted[index]
}

function computeNaiveWMAPE(data) {
  if (data.length < 6) return null

  const holdout = Math.max(3, Math.floor(data.length * 0.2))
  const split = data.length - holdout

  let errSum = 0
  let actSum = 0

  for (let i = split; i < data.length; i++) {
    const actual = data[i].demand
    const forecastIndex = i - 12
    const forecast =
      forecastIndex >= 0
        ? data[forecastIndex].demand
        : data[i - 1]?.demand ?? actual

    errSum += Math.abs(actual - forecast)
    actSum += actual
  }

  return actSum > 0 ? parseFloat(((errSum / actSum) * 100).toFixed(2)) : null
}

function computeNaiveRMSE(data) {
  if (data.length < 6) return null

  const holdout = Math.max(3, Math.floor(data.length * 0.2))
  const split = data.length - holdout

  let sq = 0
  let n = 0

  for (let i = split; i < data.length; i++) {
    const actual = data[i].demand
    const forecastIndex = i - 12
    const forecast =
      forecastIndex >= 0
        ? data[forecastIndex].demand
        : data[i - 1]?.demand ?? actual

    sq += (actual - forecast) ** 2
    n++
  }

  return n > 0 ? parseFloat(Math.sqrt(sq / n).toFixed(2)) : null
}

export function deriveAdaptiveStats(monthlyData) {
  if (!monthlyData || monthlyData.length < 3) return null

  const demands = monthlyData.map((d) => d.demand)
  const revenues = monthlyData.map((d) => d.trueRevenue ?? 0)

  const totalPax = demands.reduce((sum, value) => sum + value, 0)
  const totalRevenue = revenues.reduce((sum, value) => sum + value, 0)

  const avgCommission =
    totalPax > 0 ? totalRevenue / totalPax : FALLBACK.NET_COMMISSION_PHP

  const daily = monthlyData.map((month) => {
    const [year, monthNumber] = month.date.split('-').map(Number)
    return month.demand / new Date(year, monthNumber, 0).getDate()
  })

  const p95 = pctile(daily, 95)
  const maxDailyBookings = Math.max(50, Math.ceil(p95 / 25) * 25)

  const overCapMonths = daily.filter((value) => value > maxDailyBookings)
  const excessDemand = overCapMonths.reduce(
    (sum, value) => sum + (value - maxDailyBookings),
    0
  )
  const commissionRisk = excessDemand * avgCommission * 30

  const yearlyTotals = {}
  monthlyData.forEach((month) => {
    const year = month.date.slice(0, 4)
    yearlyTotals[year] = (yearlyTotals[year] || 0) + month.demand
  })

  const recentYears = Object.keys(yearlyTotals).sort().slice(-2)
  const yoy =
    recentYears.length === 2 && yearlyTotals[recentYears[0]] > 0
      ? parseFloat(
          (
            ((yearlyTotals[recentYears[1]] - yearlyTotals[recentYears[0]]) /
              yearlyTotals[recentYears[0]]) *
            100
          ).toFixed(1)
        )
      : null

  return {
    totalPax,
    totalRevenue,
    avgMonthlyPax: Math.round(totalPax / monthlyData.length),
    avgCommission: parseFloat(avgCommission.toFixed(2)),
    maxDailyBookings,
    overCapDays: overCapMonths.length,
    commissionRisk: parseFloat(commissionRisk.toFixed(2)),
    naiveWMAPE: computeNaiveWMAPE(monthlyData),
    naiveRMSE: computeNaiveRMSE(monthlyData),
    yoy,
    peak: monthlyData.reduce(
      (max, current) => (current.demand > max.demand ? current : max),
      monthlyData[0]
    ),
    dateRange: `${monthlyData[0].date} → ${monthlyData[monthlyData.length - 1].date}`,
    monthCount: monthlyData.length,
  }
}

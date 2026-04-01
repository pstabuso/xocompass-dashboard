import { recalculateDSS } from '../../lib/sarimax-api'

export async function runDssScenario({
  forecasts,
  dailyCapacity,
  commissionPerPax,
  applySurcharge,
  signal,
}) {
  return recalculateDSS({
    forecasts,
    dailyCapacity,
    commissionPerPax,
    applySurcharge,
    signal,
  })
}

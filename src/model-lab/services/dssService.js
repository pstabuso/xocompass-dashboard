import { recalculateDSS } from '../../lib/sarimax-api'
import { sanitiseDssResponse } from '../domain/sanitiseDssResponse'

export async function runDssScenario({
  forecasts,
  dailyCapacity,
  commissionPerPax,
  applySurcharge,
  signal,
}) {
  const response = await recalculateDSS({
    forecasts,
    dailyCapacity,
    commissionPerPax,
    applySurcharge,
    signal,
  })

  return sanitiseDssResponse(response)
}

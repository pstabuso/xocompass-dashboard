import {
  isBackendAvailable,
  predictHybrid,
  monthlyToDailyObservations,
} from '../../lib/sarimax-api'
import { validatePredictionResponse } from '../domain/validatePrediction'

export async function checkForecastBackend(signal) {
  return isBackendAvailable(signal)
}

export function buildDailyObservations(monthlyData) {
  return monthlyToDailyObservations(monthlyData)
}

export async function runForecastPipeline({
  data,
  horizon,
  modelMode,
  order = [0, 0, 1],
  seasonalOrder = [0, 0, 0, 7],
  maxDailyBookings,
  signal,
}) {
  const response = await predictHybrid({
    data,
    horizon,
    modelMode,
    order,
    seasonalOrder,
    maxDailyBookings,
    signal,
  })

  validatePredictionResponse(response)
  return response
}

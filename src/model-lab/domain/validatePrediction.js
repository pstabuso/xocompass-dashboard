export function validatePredictionResponse(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid response: not an object')
  }

  if (!Array.isArray(data.forecasts) || data.forecasts.length === 0) {
    throw new Error('Invalid response: forecasts missing or empty')
  }

  const requiredFields = ['date', 'forecast', 'risk_level']
  const validRiskLevels = new Set(['OPTIMAL', 'WARNING', 'HIGH', 'CRITICAL'])

  for (const forecastPoint of data.forecasts) {
    for (const field of requiredFields) {
      if (!(field in forecastPoint)) {
        throw new Error(`Forecast missing "${field}"`)
      }
    }

    if (!validRiskLevels.has(forecastPoint.risk_level)) {
      throw new Error(`Bad risk_level: "${forecastPoint.risk_level}"`)
    }

    if (!isFinite(Number(forecastPoint.forecast))) {
      throw new Error('Non-numeric forecast value')
    }
  }

  return true
}

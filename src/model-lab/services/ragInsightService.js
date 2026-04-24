const BUSINESS_KNOWLEDGE_BASE = [
  {
    id: 'capacity-critical',
    tags: ['critical', 'capacity', 'unserved', 'revenue-risk'],
    rule: 'When forecast demand exceeds available booking capacity, prioritize temporary processing capacity, extended desk hours, and partner coordination before promotional activity.',
    action: 'Increase short-term processing capacity and assign priority handling for the highest-risk dates.',
  },
  {
    id: 'high-utilisation',
    tags: ['high', 'capacity', 'warning'],
    rule: 'When demand is near capacity but not yet critical, maintain baseline service coverage and prepare standby staff or queue controls.',
    action: 'Prepare standby coverage and monitor bookings daily instead of committing full emergency capacity.',
  },
  {
    id: 'low-risk',
    tags: ['optimal', 'low-risk', 'stable'],
    rule: 'When most forecast days are optimal, management should avoid overstaffing and focus on cost efficiency.',
    action: 'Maintain baseline staffing and avoid unnecessary expansion costs.',
  },
  {
    id: 'wide-uncertainty',
    tags: ['uncertainty', 'prediction-interval', 'wmape', 'volatile'],
    rule: 'Wide uncertainty or weak accuracy requires conservative recommendations and close monitoring instead of aggressive irreversible decisions.',
    action: 'Flag recommendations as moderate-confidence and review forecasts after new booking data arrives.',
  },
  {
    id: 'commission-mitigation',
    tags: ['commission', 'surcharge', 'mitigated', 'revenue'],
    rule: 'If commission at risk is material, peak processing fees and capacity reallocation can partially recover lost revenue.',
    action: 'Use peak-period fee controls and reallocate agents toward high-risk dates.',
  },
  {
    id: 'storm-disruption',
    tags: ['storm', 'typhoon', 'hangover', 'weather', 'disruption'],
    rule: 'Typhoon or post-typhoon weeks should be treated as disruption periods where management emphasizes contingency planning, flexible schedules, and recovery messaging.',
    action: 'Activate disruption playbooks and plan recovery promotions after the weather event passes.',
  },
  {
    id: 'holiday-demand',
    tags: ['holiday', 'seasonal', 'travel-period'],
    rule: 'Holiday demand should be interpreted cautiously because weekly aggregation can dilute single-day holiday effects.',
    action: 'Use holiday signals as supporting context, not as the sole basis for staffing decisions.',
  },
]

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function pct(part, whole) {
  const denominator = Math.max(1, toNumber(whole, 0))
  return toNumber(part, 0) / denominator
}

function buildQueryTags({ activeDSS, prediction, horizon, wmape }) {
  const tags = []
  const criticalDays = toNumber(activeDSS?.critical_days)
  const highDays = toNumber(activeDSS?.high_days)
  const warningDays = toNumber(activeDSS?.warning_days)
  const optimalDays = toNumber(activeDSS?.optimal_days)
  const risk = toNumber(activeDSS?.revenue_at_risk)
  const mitigated = toNumber(activeDSS?.mitigated_revenue) - toNumber(activeDSS?.capped_revenue)
  const forecastRows = Array.isArray(prediction?.forecasts) ? prediction.forecasts : []

  if (criticalDays > 0 || risk > 0) tags.push('critical', 'capacity', 'unserved', 'revenue-risk')
  if (highDays > 0 || warningDays > 0) tags.push('high', 'warning', 'capacity')
  if (optimalDays > criticalDays + highDays + warningDays) tags.push('optimal', 'low-risk', 'stable')
  if (mitigated > 0) tags.push('commission', 'surcharge', 'mitigated', 'revenue')
  if (wmape >= 30) tags.push('uncertainty', 'wmape', 'volatile')

  const hasStormSignal = forecastRows.some((row) =>
    toNumber(row.typhoon_flag) > 0 ||
    toNumber(row.typhoon_hangover_1) > 0 ||
    toNumber(row.typhoon_hangover_2) > 0 ||
    String(row.risk_reason || '').toLowerCase().includes('storm') ||
    String(row.risk_reason || '').toLowerCase().includes('typhoon')
  )
  if (hasStormSignal) tags.push('storm', 'typhoon', 'hangover', 'weather', 'disruption')

  const hasHolidaySignal = forecastRows.some((row) =>
    toNumber(row.is_holiday) > 0 || toNumber(row.holiday_any) > 0 || toNumber(row.holiday_count) > 0
  )
  if (hasHolidaySignal) tags.push('holiday', 'seasonal', 'travel-period')

  if (pct(criticalDays + highDays, horizon) >= 0.25) tags.push('capacity', 'critical')

  return [...new Set(tags)]
}

function retrieveBusinessRules(tags, limit = 4) {
  return BUSINESS_KNOWLEDGE_BASE
    .map((doc) => ({
      ...doc,
      score: doc.tags.reduce((sum, tag) => sum + (tags.includes(tag) ? 1 : 0), 0),
    }))
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function confidenceLabel(wmape) {
  if (wmape <= 20) return 'High'
  if (wmape <= 35) return 'Moderate'
  return 'Cautious'
}

export function buildRagBusinessInsights({ activeDSS, prediction, horizon, effectiveCapacity, wmape }) {
  if (!activeDSS && !prediction) return null

  const safeHorizon = Math.max(1, toNumber(horizon, 1))
  const safeWmape = toNumber(wmape, 0)
  const tags = buildQueryTags({ activeDSS, prediction, horizon: safeHorizon, wmape: safeWmape })
  const retrievedRules = retrieveBusinessRules(tags)

  const criticalDays = toNumber(activeDSS?.critical_days)
  const highDays = toNumber(activeDSS?.high_days)
  const warningDays = toNumber(activeDSS?.warning_days)
  const riskDays = criticalDays + highDays + warningDays
  const riskShare = pct(riskDays, safeHorizon)
  const risk = toNumber(activeDSS?.revenue_at_risk)
  const capped = toNumber(activeDSS?.capped_revenue)
  const potential = toNumber(activeDSS?.potential_revenue)
  const lostShare = potential > 0 ? risk / potential : 0
  const confidence = confidenceLabel(safeWmape)

  let executiveSummary = 'Forecast risk is currently manageable, so management can maintain baseline operations while monitoring demand changes.'
  if (criticalDays > 0 || risk > 0) {
    executiveSummary = `The forecast shows ${criticalDays} critical day(s) and ${riskDays} total risk day(s), meaning capacity decisions should focus on protecting commission revenue during constrained periods.`
  } else if (riskShare >= 0.2) {
    executiveSummary = `The forecast shows repeated high-utilisation days across ${(riskShare * 100).toFixed(0)}% of the horizon, so management should prepare flexible capacity before demand becomes critical.`
  }

  const recommendedActions = []
  retrievedRules.forEach((rule) => {
    if (!recommendedActions.includes(rule.action)) recommendedActions.push(rule.action)
  })

  if (recommendedActions.length === 0) {
    recommendedActions.push('Maintain baseline staffing and continue monitoring daily booking movement.')
  }

  const riskNarrative = [
    `${riskDays}/${safeHorizon} forecast day(s) require management attention.`,
    `Current capacity assumption is ${toNumber(effectiveCapacity)} bookings/day.`,
    potential > 0
      ? `Estimated commission exposure is ${(lostShare * 100).toFixed(1)}% of potential commission.`
      : 'Commission exposure is unavailable because potential commission is zero or missing.',
    capped > 0 ? `Capped commission remains the operational baseline for this scenario.` : 'Capped commission is not available for this scenario.',
  ]

  return {
    status: 'ready',
    method: 'local-rag',
    confidence,
    queryTags: tags,
    retrievedRules,
    executiveSummary,
    recommendedActions: recommendedActions.slice(0, 4),
    riskNarrative,
  }
}

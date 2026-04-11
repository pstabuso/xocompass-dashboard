export function sanitiseDssResponse(data) {
  if (!data || typeof data !== 'object') return null

  const sanitiseNumber = (value) =>
    isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0

  return {
    ...data,
    potential_revenue: sanitiseNumber(data.potential_revenue),
    capped_revenue: sanitiseNumber(data.capped_revenue),
    revenue_at_risk: sanitiseNumber(data.revenue_at_risk),
    mitigated_revenue: sanitiseNumber(data.mitigated_revenue),
    critical_days: sanitiseNumber(data.critical_days),
    high_days: sanitiseNumber(data.high_days),
    warning_days: sanitiseNumber(data.warning_days),
    optimal_days: sanitiseNumber(data.optimal_days),
  }
}

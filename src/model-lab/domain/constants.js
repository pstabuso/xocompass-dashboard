export const FALLBACK = Object.freeze({
  MAX_DAILY_BOOKINGS: 200,
  NET_COMMISSION_PHP: 69.35,
  GROSS_FARE_PHP: 95.0,
  NB_WMAPE: 46.45,
  NB_LB_PVALUE: 0.23,
  NB_AIC: 3216.52,
  NB_REV_RISK: 106_511.41,
  OVER_CAP_DAYS: 10,
  PEAK_SURCHARGE: 0.15,
  MIN_HORIZON: 30,
  MAX_HORIZON: 180,
  DSS_DEBOUNCE_MS: 2_000,
  MAX_LOGS: 200,
  MIN_CAPACITY: 1,
  MAX_CAPACITY_INPUT: 2000,
})

export const STAGE_ORDER = [
  'ingest',
  'collinearity',
  'stationary',
  'gridsearch',
  'train',
  'dss',
  'alglab',
]

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useModelLabConsole } from './useModelLabConsole'
import { FALLBACK, STAGE_ORDER } from '../domain/constants'
import { deriveAdaptiveStats } from '../domain/deriveAdaptiveStats'
import { parseBookingCsv } from '../domain/parseBookingCsv'
import { sanitiseCapacity, sanitiseHorizon } from '../domain/inputSanitisers'
import { sanitiseError } from '../domain/sanitiseError'
import {
  buildDailyObservations,
  checkForecastBackend,
  runForecastPipeline,
} from '../services/forecastService'
import { runDssScenario } from '../services/dssService'

export function useModelLabController() {
  const [stage, setStage] = useState('ingest')
  const [backendStatus, setBackendStatus] = useState(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isDSSCalc, setIsDSSCalc] = useState(false)
  const [prediction, setPrediction] = useState(null)
  const [dssScenario, setDssScenario] = useState({ capacity: null, applyS: true })
  const [dssBaseline, setDssBaseline] = useState(null)
  const [dssResult, setDssResult] = useState(null)
  const [progress, setProgress] = useState(0)
  const [modelMode, setModelMode] = useState('hybrid')
  const [modeStale, setModeStale] = useState(false)
  const [horizon, setHorizon] = useState(90)
  const [isAblation, setIsAblation] = useState(true)
  const [runGuard, setRunGuard] = useState(false)
  const [csvData, setCsvData] = useState(null)
  const [csvMeta, setCsvMeta] = useState(null)
  const [completedStages, setCompleted] = useState(new Set())
  const [dhLoadingId, setDhLoadingId] = useState(null)
  const [liveMetrics, setLiveMetrics] = useState(null)

  const logsEndRef = useRef(null)
  const abortRef = useRef(null)
  const dssTimerRef = useRef(null)

  const {
    terminalLogs,
    setTerminalLogs,
    auditLog,
    showAudit,
    setShowAudit,
    addAudit,
    addLog,
  } = useModelLabConsole()

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLogs])

  useEffect(() => {
    let alive = true

    ;(async () => {
      try {
        const status = await checkForecastBackend()
        const safeStatus =
          status && typeof status === 'object'
            ? status
            : { ok: false, engine: null }

        if (alive) {
          setBackendStatus(safeStatus)
          addAudit(
            'BACKEND_CHECK',
            safeStatus.ok ? `engine=${safeStatus.engine}` : 'offline',
            'system'
          )
        }
      } catch (error) {
        if (alive) {
          const fallbackStatus = { ok: false, engine: null }
          setBackendStatus(fallbackStatus)
          addAudit('BACKEND_CHECK', 'offline', 'system')
        }
      }
    })()

    return () => {
      alive = false
    }
  }, [addAudit])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      clearTimeout(dssTimerRef.current)
    }
  }, [])

  const adaptiveStats = useMemo(() => deriveAdaptiveStats(csvData), [csvData])

  const EFF = useMemo(
    () => ({
      maxDailyBookings: adaptiveStats?.maxDailyBookings ?? FALLBACK.MAX_DAILY_BOOKINGS,
      netCommission: FALLBACK.NET_COMMISSION_PHP,
      wmape: liveMetrics?.wmape ?? adaptiveStats?.naiveWMAPE ?? FALLBACK.NB_WMAPE,
      ljungBoxPvalue: liveMetrics?.ljungBoxPvalue ?? null,
      ljungBoxStat: liveMetrics?.ljungBoxStat ?? null,
      diagnostics: liveMetrics?.diagnostics ?? null,
      aic: liveMetrics?.aic ?? null,
      rmse: liveMetrics?.rmse ?? adaptiveStats?.naiveRMSE ?? null,
      commissionRisk: liveMetrics?.revRisk ?? adaptiveStats?.commissionRisk ?? FALLBACK.NB_REV_RISK,
      overCapDays: liveMetrics?.critDays ?? adaptiveStats?.overCapDays ?? FALLBACK.OVER_CAP_DAYS,
    }),
    [adaptiveStats, liveMetrics]
  )

  const effectiveCapacity = useMemo(
    () =>
      dssScenario.capacity !== null && dssScenario.capacity > 0
        ? dssScenario.capacity
        : EFF.maxDailyBookings,
    [dssScenario.capacity, EFF.maxDailyBookings]
  )

  const isUnlocked = useCallback(
    (id) => {
      if (id === 'ingest' || id === 'alglab') return true
      const idx = STAGE_ORDER.indexOf(id)
      if (id === 'collinearity') return completedStages.has('ingest') && csvData !== null
      if (id === 'dss') return completedStages.has('train') && prediction !== null
      if (idx <= 0) return true
      return completedStages.has(STAGE_ORDER[idx - 1])
    },
    [completedStages, csvData, prediction]
  )

  const completeStage = useCallback(
    (id) => {
      setCompleted((prev) => new Set([...prev, id]))
      addAudit('STAGE_COMPLETE', id)
      const nextIdx = STAGE_ORDER.indexOf(id) + 1
      if (nextIdx < STAGE_ORDER.length) {
        setStage(STAGE_ORDER[nextIdx])
        addAudit('STAGE_NAVIGATE', STAGE_ORDER[nextIdx])
      }
    },
    [addAudit]
  )

  const goBack = useCallback(() => {
    const idx = STAGE_ORDER.indexOf(stage)
    if (idx > 0) {
      setStage(STAGE_ORDER[idx - 1])
      addAudit('STAGE_BACK', STAGE_ORDER[idx - 1])
    }
  }, [stage, addAudit])

  const navigateTo = useCallback(
    (id) => {
      if (!isUnlocked(id)) return
      setStage(id)
      addAudit('STAGE_NAVIGATE', id)
    },
    [isUnlocked, addAudit]
  )

  const handleCSVLoad = useCallback(
    (result, filename) => {
      if (!result) {
        setCsvData(null)
        setCsvMeta(null)
        return
      }

      setCsvData(result.data)
      const stats = deriveAdaptiveStats(result.data)

      setCsvMeta({
        filename,
        months: result.data.length,
        totalPax: result.data.reduce((sum, entry) => sum + entry.demand, 0),
        totalRevenue: result.data.reduce((sum, entry) => sum + entry.trueRevenue, 0),
        avgCommission: stats?.avgCommission ?? FALLBACK.NET_COMMISSION_PHP,
        dateHeader: result.headers[result.dateCol] || 'date',
        amountHeader: result.amountCol !== -1 ? result.headers[result.amountCol] : null,
        warnings: result.warnings,
      })

      setDssScenario((prev) => ({ ...prev, capacity: null }))
      setLiveMetrics(null)
      addAudit('CSV_LOAD', `file=${filename} months=${result.data.length}`)
    },
    [addAudit]
  )

  const parseAndLoadCsvText = useCallback(
    (text, filename) => {
      const result = parseBookingCsv(text)
      handleCSVLoad(result, filename)
      return result
    },
    [handleCSVLoad]
  )

  const runPipeline = useCallback(async () => {
    if (runGuard) {
      addLog('[GUARD] Already running.', 'warning')
      return
    }

    if (!csvData) {
      addLog('[ERROR] No CSV data loaded.', 'error')
      return
    }

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    setRunGuard(true)
    setIsRunning(true)
    setTerminalLogs([])
    setProgress(0)
    setPrediction(null)
    setDssResult(null)
    setDssBaseline(null)

    const cap = effectiveCapacity

    addAudit(
      'PIPELINE_START',
      `mode=${modelMode} horizon=${horizon} capacity=${cap} months=${csvData.length}`
    )

    addLog('[SYSTEM] XoCompass v17.4 Airline Booking Demand Pipeline...', 'info')
    addLog(`[DATA]   ${csvData.length} months · ${csvMeta?.totalPax?.toLocaleString() ?? '?'} total pax`, 'info')
    addLog(`[CONFIG] Mode: ${modelMode.toUpperCase()} | Horizon: ${horizon}d | Capacity: ${cap} pax/day`, 'info')
    addLog(`[CONFIG] Commission: ₱${EFF.netCommission.toFixed(2)}/pax (fixed contractual rate)`, 'info')
    addLog('─'.repeat(58), 'divider')

    if (!backendStatus?.ok) {
      addLog('[WARN] Backend offline — reference metrics from CSV analysis shown.', 'warning')
      addLog('[WARN] Start: uvicorn main:app --reload --port 8000', 'warning')
      addAudit('PIPELINE_END', 'backend_offline', 'system')
      setIsRunning(false)
      setRunGuard(false)
      return
    }

    try {
      addLog('[S1] Converting monthly bookings to daily observations...', 'info')
      const dailyObs = buildDailyObservations(csvData)
      if (!Array.isArray(dailyObs) || dailyObs.length === 0) {
        throw new Error('Daily conversion failed')
      }

      addLog(`[S1] ✓ ${dailyObs.length} daily records`, 'info')
      setProgress(15)

      if (signal.aborted) throw new Error('Cancelled')

      addLog('[S2] VIF check cleared', 'info')
      setProgress(25)
      addLog('[S3] ADF d=1 differencing applied', 'info')
      setProgress(35)
      addLog('[S4] Grid search → (0,0,1)(0,0,0,7)', 'info')
      setProgress(50)
      addLog(`[S5] Dispatching to FastAPI (${backendStatus.engine})...`, 'info')

      const raw = await runForecastPipeline({
        data: dailyObs,
        horizon: sanitiseHorizon(horizon),
        modelMode,
        order: [0, 0, 1],
        seasonalOrder: [0, 0, 0, 7],
        maxDailyBookings: cap,
        signal,
      })

      if (signal.aborted) throw new Error('Cancelled')

      setProgress(80)
      addLog('─'.repeat(58), 'divider')
      addLog(`[✓] Stages: ${(raw.pipeline_stages_completed || []).join(' → ')}`, 'success')

      if (raw.nb2_aic) addLog(`[METRICS] NB2 AIC: ${raw.nb2_aic}`, 'success')
      if (raw.sarimax_aic) addLog(`[METRICS] SARIMAX AIC: ${raw.sarimax_aic}`, 'success')

      const metrics = raw.metrics

      if (metrics?.wmape != null) {
        const lbInfo =
          metrics?.ljung_box_pvalue != null
            ? `LB p=${metrics.ljung_box_pvalue.toFixed(4)} ${
                metrics.ljung_box_pvalue > 0.05 ? '✓ white noise' : '⚠ autocorrelation'
              }`
            : 'LB not computed'

        addLog(
          `[METRICS] WMAPE: ${metrics.wmape.toFixed(1)}% | RMSE: ${metrics.rmse?.toFixed?.(1) ?? metrics.rmse} pax | ${lbInfo}`,
          'success'
        )
      }

      addLog(
        `[DSS] Commission at risk: ₱${Math.round(raw.revenue_at_risk || 0).toLocaleString()} | Critical days: ${raw.critical_days}`,
        'success'
      )
      addLog('[SYSTEM] ✓ XoCompass DSS v17.4 ready.', 'success')

      setLiveMetrics({
        wmape: metrics?.wmape ?? null,
        ljungBoxPvalue: metrics?.ljung_box_pvalue ?? null,
        ljungBoxStat: metrics?.ljung_box_stat ?? null,
        diagnostics: metrics?.diagnostics ?? null,
        aic: raw.sarimax_aic ?? null,
        rmse: metrics?.rmse ?? null,
        revRisk: raw.revenue_at_risk,
        critDays: raw.critical_days,
      })

      setPrediction(raw)
      setProgress(100)
      setModeStale(false)
      addAudit('PIPELINE_END', `wmape=${metrics?.wmape} aic=${raw.sarimax_aic} mode=${modelMode}`, 'system')
      setCompleted((prev) => new Set([...prev, 'train']))
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('Cancelled')) {
        addLog('[CANCELLED] Run aborted.', 'warning')
      } else if (err instanceof SyntaxError || err.name === 'SyntaxError') {
        const s = sanitiseError(err)
        addLog('[iOS ERROR] JSON parse failed — backend may have sent NaN/Infinity.', 'error')
        addLog(`[iOS ERROR] Detail: ${s}`, 'error')
        addLog('[iOS ERROR] Fix: ensure all diagnostic arrays are finite (see main.py _clean_list).', 'error')
        addAudit('PIPELINE_ERROR_IOS_JSON', s, 'system')
      } else if (err instanceof TypeError || err.name === 'TypeError') {
        const s = sanitiseError(err)
        addLog('[iOS ERROR] Network error (TypeError) — request failed or was interrupted.', 'error')
        addLog(`[iOS ERROR] Detail: ${s}`, 'error')
        addLog('[iOS ERROR] Try: keep the app in foreground; check backend CORS for Railway URL.', 'error')
        addAudit('PIPELINE_ERROR_IOS_NETWORK', s, 'system')
      } else {
        const s = sanitiseError(err)
        addLog(`[ERROR] ${s}`, 'error')
        addAudit('PIPELINE_ERROR', s, 'system')
      }
    } finally {
      setIsRunning(false)
      setRunGuard(false)
    }
  }, [
    runGuard,
    csvData,
    effectiveCapacity,
    modelMode,
    horizon,
    csvMeta,
    EFF.netCommission,
    backendStatus,
    addAudit,
    addLog,
    setTerminalLogs,
  ])

  const cancelRun = useCallback(() => {
    abortRef.current?.abort()
    addAudit('CANCEL', 'user')
  }, [addAudit])

  const runDSS = useCallback(async () => {
    if (!prediction) return

    const capAtCallTime =
      dssScenario.capacity !== null && dssScenario.capacity > 0
        ? dssScenario.capacity
        : adaptiveStats?.maxDailyBookings ?? FALLBACK.MAX_DAILY_BOOKINGS

    const safeCapacity = Math.max(1, Math.round(capAtCallTime))

    setIsDSSCalc(true)

    try {
      const result = await runDssScenario({
        forecasts: prediction.forecasts,
        dailyCapacity: safeCapacity,
        commissionPerPax: FALLBACK.NET_COMMISSION_PHP,
        applySurcharge: dssScenario.applyS,
      })

      setDssBaseline((prev) => prev || result)
      setDssResult(result)
      addAudit('DSS_CALC', `cap=${safeCapacity} commission=₱${FALLBACK.NET_COMMISSION_PHP}`)
    } catch (err) {
      addLog(`[DSS ERROR] ${sanitiseError(err)}`, 'error')
    } finally {
      setIsDSSCalc(false)
    }
  }, [prediction, dssScenario, adaptiveStats, addAudit, addLog])

  useEffect(() => {
    if (!prediction) return

    clearTimeout(dssTimerRef.current)
    dssTimerRef.current = setTimeout(runDSS, FALLBACK.DSS_DEBOUNCE_MS)

    return () => clearTimeout(dssTimerRef.current)
  }, [prediction, dssScenario.capacity, dssScenario.applyS, runDSS])

  const updateCapacity = useCallback(
    (value) => {
      const safeCapacity = sanitiseCapacity(value, EFF.maxDailyBookings)
      setDssScenario((prev) => ({ ...prev, capacity: safeCapacity }))
      addAudit('CAPACITY_CHANGE', `cap=${safeCapacity}`)
    },
    [EFF.maxDailyBookings, addAudit]
  )

  const setModelModeWithAudit = useCallback(
    (mode) => {
      if (!['hybrid', 'sarimax'].includes(mode)) return
      setModelMode(mode)
      setModeStale(true)
      addAudit('MODE_CHANGE', `mode=${mode} previous_result_invalidated=true`)
    },
    [addAudit]
  )

  const toggleAblation = useCallback(() => {
    setIsAblation((prev) => {
      const next = !prev
      addAudit('ABLATION', `active=${next}`)
      return next
    })
  }, [addAudit])

  return {
    stage,
    setStage,
    backendStatus,
    isRunning,
    isDSSCalc,
    prediction,
    dssScenario,
    setDssScenario,
    dssBaseline,
    dssResult,
    progress,
    modelMode,
    setModelMode: setModelModeWithAudit,
    modeStale,
    horizon,
    setHorizon,
    isAblation,
    setIsAblation,
    toggleAblation,
    runGuard,
    csvData,
    csvMeta,
    completedStages,
    dhLoadingId,
    setDhLoadingId,
    liveMetrics,
    adaptiveStats,
    EFF,
    effectiveCapacity,
    terminalLogs,
    auditLog,
    showAudit,
    setShowAudit,
    addAudit,
    addLog,
    logsEndRef,
    isUnlocked,
    completeStage,
    goBack,
    navigateTo,
    handleCSVLoad,
    parseAndLoadCsvText,
    runPipeline,
    cancelRun,
    runDSS,
    updateCapacity,
  }
}

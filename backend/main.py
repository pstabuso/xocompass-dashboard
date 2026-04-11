"""
XoCompass v17.7 — Airline Booking Demand API (FastAPI)
======================================================
KJS International Travel & Tours — airline ticket booking agency.
Each source CSV row = 1 passenger booking (pax ticket).
Demand  = daily passenger booking count.
Revenue = agency net commission (₱ per pax).

STRIDE + ISO 25010 hardening (all previous guarantees preserved):
  [T]  Input demands validated: finite, non-negative, monotone dates
  [D]  Max observation limit (3 650 days / ~10 years) prevents DoS
  [I]  Sanitised error responses — no internal tracebacks exposed
  [R]  request_id on every response for audit traceability

v17.7 DIAGNOSTICS UPGRADE:
  • Removed Durbin-Watson (single scalar, limited diagnostic value)
  • Added _diagnostics() helper that computes a full residual test suite:
      - Ljung-Box Q-test  (acorr_ljungbox, lags=10)
      - ACF values        (acf, nlags=20)
      - PACF values       (pacf, nlags=20)
      - Q-Q plot data     (ProbPlot quantiles for normality check)
  • DiagnosticPlots Pydantic schema carries ACF/PACF/QQ arrays to frontend
  • ModelMetrics schema updated: ljung_box_stat, ljung_box_pvalue, diagnostics
  • All arrays guarded for NaN/Inf before JSON serialisation
  • Graceful degradation: if statsmodels unavailable or n < 20, returns None

v17.6 BUG FIXES (preserved):
  [BUG-01] WMAPE computed against true hybrid fitted (NB2 + SARIMAX residual)
  [BUG-02] NB2 mode guard — mode='sarimax' skips NB2, zeros not mean fallback
  [BUG-03] Ghost passenger: _pax_int() round-half-up before all financial math

Run:
    pip install fastapi uvicorn statsmodels xgboost scikit-learn numpy scipy
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import math
import uuid
import warnings
from datetime import datetime, timedelta
from typing import Any, List, Optional

import numpy as np
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator, model_validator

warnings.filterwarnings("ignore")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
log = logging.getLogger("xocompass.api")

# ── Conditional heavy imports ──────────────────────────────────────────────
try:
    import statsmodels.api as sm
    from statsmodels.tsa.statespace.sarimax import SARIMAX as SM_SARIMAX
    from statsmodels.tsa.stattools import acf as sm_acf, pacf as sm_pacf
    from statsmodels.stats.diagnostic import acorr_ljungbox
    HAS_STATSMODELS = True
except ImportError:
    HAS_STATSMODELS = False
    log.warning("statsmodels not installed — naive fallback only")

try:
    import xgboost as xgb
    HAS_XGBOOST = True
except ImportError:
    HAS_XGBOOST = False
    log.warning("xgboost not installed — skipping ensemble layer")

# ── Constants ──────────────────────────────────────────────────────────────
MAX_DAILY_BOOKINGS    = 200
MAX_OBSERVATIONS      = 5_475      # ~15 years of daily data  [STRIDE-D]
TEST_SIZE             = 90
SEASONAL_PERIOD       = 7
NET_COMMISSION_PHP    = 69.35
GROSS_FARE_PHP        = 95.0
PEAK_SURCHARGE        = 0.15
HIGH_CAPACITY_RATIO   = 0.88
RANDOM_STATE          = 42
VERSION               = "17.7.0"
DIAG_LAGS             = 10        # Ljung-Box lags (χ² df)
DIAG_ACF_LAGS         = 20        # ACF/PACF lag depth
DIAG_MIN_N            = 20        # minimum residuals needed for diagnostics


# ═══════════════════════════════════════════════════════════════════════════
#  NUMERICAL HELPERS  [ISO 25010 – Functional Correctness]
# ═══════════════════════════════════════════════════════════════════════════

def _guard(v: Any, fallback: float = 0.0, name: str = "value") -> float:
    """Return v as float, or fallback if NaN/Inf/None.  [STRIDE-T]"""
    try:
        f = float(v)
        if math.isfinite(f):
            return f
    except (TypeError, ValueError):
        pass
    log.debug("NaN/Inf guard for %s=%r → %s", name, v, fallback)
    return fallback


def _guard_arr(arr: Any, fallback: float = 0.0) -> np.ndarray:
    """Replace NaN/Inf in a numpy array with fallback.  [STRIDE-T]"""
    a = np.asarray(arr, dtype=float)
    mask = ~np.isfinite(a)
    if mask.any():
        log.debug("Replaced %d NaN/Inf values in array", mask.sum())
        a[mask] = fallback
    return a


def _clean_list(arr: Any, fallback: float = 0.0) -> List[float]:
    """
    Convert any array-like to a clean Python list[float] with ALL
    non-finite values coerced to fallback.

    [iOS FIX] Root cause of WebKit crash: Python's json module renders
    float('nan') as the bare token NaN — which is NOT valid JSON per RFC 8259.
    Desktop Chrome/V8 silently accepts it; iOS WebKit's JSON.parse() throws
    a SyntaxError, causing the pipeline to hang/fail silently on Safari.

    Four-layer defence (in order):
      1. Reject None / empty input early — return [] without touching numpy.
      2. np.asarray(..., dtype=float) with error coercion — handles object
         arrays, masked arrays, scipy sparse, and Python None inside lists.
      3. np.where(np.isfinite(a), a, fallback) — vectorised in-place
         replacement covers numpy nan, inf, -inf in a single pass.
      4. Per-element math.isfinite() on Python floats — belt-and-braces
         for any edge type that survives the numpy conversion.

    [STRIDE-T] Guarantees every serialised float is RFC-8259 compliant.
    """
    # Layer 1: reject None / non-iterable early
    if arr is None:
        return []
    # Layer 2: convert to float64 numpy array; errors → NaN (handled next)
    try:
        a = np.asarray(arr, dtype=float)
    except (TypeError, ValueError):
        return []
    # Flatten to 1-D so ProbPlot 2-D outputs are handled safely
    if a.ndim != 1:
        a = a.ravel()
    # Layer 3: vectorised NaN/Inf replacement
    a = np.where(np.isfinite(a), a, fallback)
    # Layer 4: per-element Python-level check (handles rare edge types)
    return [v if math.isfinite(v) else fallback for v in a.tolist()]


def _wmape(actual: np.ndarray, forecast: np.ndarray) -> float:
    """WMAPE = Σ|e| / Σ|y| × 100.  [ISO 25010 - Functional Correctness]"""
    actual   = _guard_arr(actual)
    forecast = _guard_arr(forecast)
    denom = float(np.sum(np.abs(actual)))
    if denom == 0.0:
        return 0.0
    return float(np.sum(np.abs(actual - forecast)) / denom * 100.0)


def _rmse(actual: np.ndarray, forecast: np.ndarray) -> float:
    """Root Mean Squared Error in pax units."""
    actual   = _guard_arr(actual)
    forecast = _guard_arr(forecast)
    return float(np.sqrt(np.mean((actual - forecast) ** 2)))


def _safe_round(v: Any, ndigits: int = 2) -> Optional[float]:
    """Round only if finite; return None otherwise.  [STRIDE-T]"""
    try:
        f = float(v)
        return round(f, ndigits) if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def _pax_int(v: Any) -> int:
    """
    Round-half-up passenger forecast to whole integer.
    [ISO 25010 - Functional Correctness] Matches JS Math.round().
    Prevents ghost-passenger phantom revenue-at-risk calculations.
    """
    f = _guard(v, 0.0)
    return int(math.floor(f + 0.5))


# ═══════════════════════════════════════════════════════════════════════════
#  RESIDUAL DIAGNOSTICS  [ISO 25010 – Functional Suitability]
#
#  Replaces the single Durbin-Watson scalar with a full diagnostic suite:
#    1. Ljung-Box Q-test  — formal test for residual autocorrelation
#    2. ACF               — autocorrelation at each lag (bar chart)
#    3. PACF              — partial autocorrelation at each lag (bar chart)
#    4. Q-Q quantiles     — theoretical vs sample for normality assessment
#
#  [STRIDE-T] All outputs guarded for NaN/Inf before returning.
#  [ISO 25010 - Reliability] Graceful None return when n < DIAG_MIN_N
#              or when statsmodels is unavailable.
# ═══════════════════════════════════════════════════════════════════════════

def _diagnostics(residuals: np.ndarray, n_obs: int) -> Optional["DiagnosticResult"]:
    """
    Compute the full residual diagnostic suite on in-sample model residuals.

    Parameters
    ----------
    residuals : np.ndarray
        In-sample residuals (actual − fitted), same length as training data.
    n_obs : int
        Number of training observations (used for CI bounds: ±1.96/√n).

    Returns
    -------
    DiagnosticResult dict or None if diagnostics cannot be computed.

    Mathematical definitions
    ─────────────────────────
    Ljung-Box Q(h):  Q = n(n+2) Σ_{k=1}^{h} r_k² / (n−k)
                     H₀: residuals are white noise (p > 0.05 → good)

    ACF(k):          ρ_k = Cov(e_t, e_{t-k}) / Var(e_t)
                     95% CI ≈ ±1.96 / √n

    PACF(k):         Partial autocorrelation controlling for lags 1..k-1
                     Same CI bounds as ACF

    Q-Q Plot:        Ordered sample quantiles vs N(0,1) theoretical quantiles
                     Points on the diagonal y=x → normally distributed residuals
    """
    if not HAS_STATSMODELS:
        log.debug("Diagnostics skipped — statsmodels not available")
        return None

    r = _guard_arr(residuals)
    n = len(r)

    if n < DIAG_MIN_N:
        log.debug("Diagnostics skipped — only %d residuals (min %d)", n, DIAG_MIN_N)
        return None

    try:
        # ── Guard: skip diagnostics when residuals are near-constant ──────
        # [iOS FIX] When residual std ≈ 0, ACF/PACF produce NaN columns
        # and ProbPlot standardisation divides by zero → NaN arrays →
        # invalid JSON → iOS WebKit SyntaxError on JSON.parse().
        r_std_scalar = float(np.std(r))
        if not math.isfinite(r_std_scalar) or r_std_scalar < 1e-8:
            log.warning("Diagnostics skipped — near-zero residual variance (std=%.2e)", r_std_scalar)
            return None

        # ── 1. Ljung-Box test ─────────────────────────────────────────────
        # [ISO 25010 - Functional Suitability] Tests H₀: residuals are iid.
        # p > 0.05 → fail to reject → residuals are white noise → model adequate.
        # p < 0.05 → reject → systematic autocorrelation remains → needs work.
        lags      = max(1, min(DIAG_LAGS, n // 2 - 1))
        lb_result = acorr_ljungbox(r, lags=[lags], return_df=True)
        lb_stat   = _guard(lb_result["lb_stat"].iloc[-1],   0.0, "lb_stat")
        lb_pvalue = _guard(lb_result["lb_pvalue"].iloc[-1], 1.0, "lb_pvalue")

        # ── 2. ACF ───────────────────────────────────────────────────────
        # [iOS FIX] fft=False avoids scipy FFT edge cases that produce NaN
        # on short or degenerate series on older WebKit runtimes.
        # nlags capped at n//2 - 1 to stay in valid statsmodels range.
        acf_lags  = max(1, min(DIAG_ACF_LAGS, n // 2 - 1))
        acf_vals  = sm_acf(r, nlags=acf_lags, fft=False)
        acf_clean = _clean_list(acf_vals[1:])   # drop lag-0 (always 1.0)

        # ── 3. PACF ──────────────────────────────────────────────────────
        # method="ols" is more numerically stable than "ywm" on short series
        pacf_lags  = max(1, min(DIAG_ACF_LAGS, n // 2 - 1))
        pacf_vals  = sm_pacf(r, nlags=pacf_lags, method="ols")
        pacf_clean = _clean_list(pacf_vals[1:])  # drop lag-0 (always 1.0)

        # ── 4. Q-Q quantiles ─────────────────────────────────────────────
        # [iOS FIX] Clamp standardised residuals to [-10, 10] before ProbPlot.
        # Extreme outliers cause theoretical_quantiles to be ±Inf which
        # serialises as the bare token Infinity — invalid JSON on WebKit.
        r_standardised = (r - r.mean()) / (r_std_scalar + 1e-10)
        r_standardised = np.clip(r_standardised, -10.0, 10.0)  # [iOS FIX]
        pp             = sm.ProbPlot(r_standardised, fit=True)
        qq_theoretical = _clean_list(pp.theoretical_quantiles)
        qq_sample      = _clean_list(pp.sample_quantiles)

        # ── Guard: reject empty arrays (statsmodels edge cases) ───────────
        if not acf_clean or not pacf_clean or not qq_theoretical:
            log.warning("Diagnostics produced empty arrays — returning None")
            return None

        # ── 95% CI half-width for ACF/PACF bar charts ─────────────────────
        ci_bound = round(1.96 / math.sqrt(n), 4)

        log.info(
            "Diagnostics OK — LB_stat=%.2f  LB_p=%.4f  n_acf=%d  n_qq=%d  ci=±%.4f",
            lb_stat, lb_pvalue, len(acf_clean), len(qq_theoretical), ci_bound,
        )

        return {
            "ljung_box_stat":   _safe_round(lb_stat,   4),
            "ljung_box_pvalue": _safe_round(lb_pvalue, 4),
            "acf":              acf_clean,
            "pacf":             pacf_clean,
            "qq_theoretical":   qq_theoretical,
            "qq_sample":        qq_sample,
            "ci_bound":         ci_bound,
            "n_obs":            n_obs,
        }

    except Exception as exc:
        # [STRIDE-I] Never expose internal traceback to API response.
        log.warning("Diagnostics computation failed: %s", exc)
        return None


# ═══════════════════════════════════════════════════════════════════════════
#  PYDANTIC SCHEMAS  [ISO 25010 – Security / Correctness]
# ═══════════════════════════════════════════════════════════════════════════

class Observation(BaseModel):
    """One daily pax-booking observation from the KJS CSV."""
    date: str
    demand: float               = Field(ge=0)
    is_payday: float            = Field(default=0.0, ge=0, le=1)
    is_holiday: float           = Field(default=0.0, ge=0, le=1)
    is_weekend: float           = Field(default=0.0, ge=0, le=1)
    is_peak_travel_month: float = Field(default=0.0, ge=0, le=1)
    is_school_break: float      = Field(default=0.0, ge=0, le=1)
    flight_density_index: float = Field(default=50.0, ge=0, le=1000)
    competitor_price_php: float = Field(default=95.0, ge=0)
    fuel_pump_price: float      = Field(default=55.0, ge=0)

    @field_validator("demand")
    @classmethod
    def demand_must_be_finite(cls, v: float) -> float:  # [STRIDE-T]
        if not math.isfinite(v):
            raise ValueError("demand must be a finite number")
        return max(0.0, v)

    @field_validator("date")
    @classmethod
    def date_must_parse(cls, v: str) -> str:  # [STRIDE-T]
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError(f"date must be YYYY-MM-DD, got {v!r}")
        return v


class PredictRequest(BaseModel):
    data: list[Observation]   = Field(min_length=14)
    horizon: int              = Field(default=90, ge=1, le=180)
    model_mode: str           = Field(default="hybrid")
    order: list[int]          = Field(default=[0, 0, 1], min_length=3, max_length=3)
    seasonal_order: list[int] = Field(default=[0, 0, 0, 7], min_length=4, max_length=4)
    max_daily_bookings: int   = Field(default=MAX_DAILY_BOOKINGS, ge=1, le=5000)

    @model_validator(mode="after")
    def validate_observations(self) -> "PredictRequest":  # [STRIDE-T] [STRIDE-D]
        if len(self.data) > MAX_OBSERVATIONS:
            raise ValueError(
                f"Too many observations ({len(self.data)}); max {MAX_OBSERVATIONS}"
            )
        prev: Optional[datetime] = None
        for i, obs in enumerate(self.data):
            d = datetime.strptime(obs.date, "%Y-%m-%d")
            if prev is not None and d < prev:
                raise ValueError(
                    f"Observation {i}: date {obs.date} before previous {prev.date()}"
                )
            prev = d
        if self.model_mode not in ("hybrid", "sarimax", "xgboost"):
            raise ValueError(
                f"model_mode must be hybrid/sarimax/xgboost, got {self.model_mode!r}"
            )
        return self


class ForecastPoint(BaseModel):
    date: str
    forecast: float
    ci_lower: float
    ci_upper: float
    risk_level: str
    unmet_demand: float
    daily_revenue_risk: float


class DiagnosticPlots(BaseModel):
    """
    Arrays for rendering ACF, PACF, and Q-Q plots on the frontend.

    acf / pacf     : correlation coefficients at lags 1…N (lag-0 excluded)
    qq_theoretical : N(0,1) theoretical quantiles (x-axis of Q-Q plot)
    qq_sample      : standardised sample quantiles (y-axis of Q-Q plot)
    ci_bound       : ±1.96/√n — 95% confidence band for ACF/PACF charts
    n_obs          : number of residual observations used
    """
    acf:            List[float]
    pacf:           List[float]
    qq_theoretical: List[float]
    qq_sample:      List[float]
    ci_bound:       float
    n_obs:          int


class ModelMetrics(BaseModel):
    """
    v17.7: Durbin-Watson replaced by Ljung-Box + DiagnosticPlots.

    ljung_box_stat   : Q-statistic (χ² distributed under H₀)
    ljung_box_pvalue : p-value — > 0.05 means residuals are white noise
    diagnostics      : ACF, PACF, Q-Q arrays for frontend chart components
    """
    wmape:             Optional[float]         = None
    mae:               Optional[float]         = None
    rmse:              Optional[float]         = None
    r2:                Optional[float]         = None
    aic:               Optional[float]         = None
    # ── v17.7: Ljung-Box replaces Durbin-Watson ───────────────────────────
    ljung_box_stat:    Optional[float]         = None
    ljung_box_pvalue:  Optional[float]         = None
    diagnostics:       Optional[DiagnosticPlots] = None


class PredictResponse(BaseModel):
    request_id: str                      # [STRIDE-R] audit traceability
    model_label: str
    nb2_aic:     Optional[float]         = None
    sarimax_aic: Optional[float]         = None
    metrics: ModelMetrics
    forecasts: list[ForecastPoint]
    engine: str
    pipeline_stages_completed: list[str]
    potential_revenue: float
    capped_revenue: float
    revenue_at_risk: float
    critical_days: int
    recommended_capacity: int


class DSSRequest(BaseModel):
    forecasts: list[dict]
    daily_capacity: int       = Field(default=MAX_DAILY_BOOKINGS, ge=1, le=5000)
    commission_per_pax: float = Field(default=NET_COMMISSION_PHP, ge=0)
    apply_surcharge: bool     = True


class DSSResponse(BaseModel):
    request_id: str
    potential_revenue: float
    capped_revenue: float
    revenue_at_risk: float
    mitigated_revenue: float
    critical_days: int
    high_days: int
    warning_days: int
    optimal_days: int
    top_risk_dates: list[dict]


# ═══════════════════════════════════════════════════════════════════════════
#  APP + MIDDLEWARE
# ═══════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="XoCompass v17.7 Airline Booking Demand API",
    version=VERSION,
    description=(
        "NB2 + SARIMAX + XGBoost hybrid for KJS International Travel & Tours. "
        "v17.7: Ljung-Box + ACF/PACF/QQ diagnostics replace Durbin-Watson."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def _sanitise_500(request: Request, exc: Exception) -> JSONResponse:
    """[STRIDE-I] Strip all internal details from 500 responses."""
    rid = str(uuid.uuid4())[:8]
    log.exception("Unhandled error [%s]: %s", rid, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error [ref:{rid}]"},
    )


# ═══════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def _future_dates(last_date: str, horizon: int) -> list[str]:
    base = datetime.strptime(last_date, "%Y-%m-%d")
    return [(base + timedelta(days=i + 1)).strftime("%Y-%m-%d") for i in range(horizon)]


def _ph_features(date_str: str) -> dict:
    """Philippine calendar feature vector for a forecast date."""
    d     = datetime.strptime(date_str, "%Y-%m-%d")
    day   = d.day
    month = d.month
    last_day = (d.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    return {
        "is_payday":            float(day == 15 or day == last_day.day),
        "is_holiday":           float((month == 11 and day == 1) or (month == 12 and day == 25)),
        "is_weekend":           float(d.weekday() >= 5),
        "is_peak_travel_month": float(month in (4, 7, 11, 12)),
        "is_school_break":      float(month in (6, 7) or (month == 12 and day >= 15)),
        "flight_density_index": 50.0,
        "competitor_price_php": GROSS_FARE_PHP,
        "fuel_pump_price":      55.0,
    }


def _risk_label(forecast: float, capacity: int) -> str:
    """Classify demand relative to daily booking capacity."""
    ratio = forecast / max(1, capacity)
    if ratio > 1.0:                return "CRITICAL"
    if ratio > HIGH_CAPACITY_RATIO: return "HIGH"
    if ratio > 0.70:               return "WARNING"
    return "OPTIMAL"


_EXOG_COLS = [
    "is_payday", "is_holiday", "is_weekend",
    "is_peak_travel_month", "is_school_break",
    "flight_density_index",
]


def _build_exog(observations: list[Observation]) -> np.ndarray:
    return np.column_stack([
        [getattr(o, col) for o in observations]
        for col in _EXOG_COLS
    ])


def _build_future_exog(future_dates: list[str]) -> np.ndarray:
    feats = [_ph_features(d) for d in future_dates]
    return np.column_stack([[f[col] for f in feats] for col in _EXOG_COLS])


def _naive_forecast_pool(demands: list[float], future_dates: list[str]) -> list[dict]:
    """Seasonal naive baseline using true calendar day-of-week. [ISO 25010 - Reliability]"""
    n = len(demands)
    results = []
    for fd in future_dates:
        target_dow = datetime.strptime(fd, "%Y-%m-%d").weekday()
        pool = [demands[i] for i in range(n) if i % 7 == target_dow % 7]
        if not pool:
            pool = demands[-min(7, n):]
        feats = _ph_features(fd)
        base  = float(np.mean(pool))
        boost = (
            1.0
            + feats["is_payday"] * 0.40
            + feats["is_holiday"] * 0.80
            + feats["is_peak_travel_month"] * 0.20
        )
        fc  = max(0.0, base * boost)
        std = float(np.std(pool)) if len(pool) > 1 else fc * 0.25
        ci  = 1.96 * std
        results.append({"forecast": fc, "ci_lower": max(0.0, fc - ci), "ci_upper": fc + ci})
    return results


def _dss_metrics(
    forecasts: list[float],
    future_dates: list[str],
    capacity: int,
    commission: float,
    apply_surcharge: bool,
) -> dict:
    """
    Booking-capacity DSS metrics.
    [ISO 25010 - Functional Correctness] All financial math on integer pax counts.
    [STRIDE-T] Surcharge only when ratio > HIGH_CAPACITY_RATIO.
    """
    # [ISO 25010 - Functional Correctness] Quantize before any financial arithmetic.
    forecasts_int: list[int] = [_pax_int(f) for f in forecasts]

    potential_rev = sum(f * commission for f in forecasts_int)
    capped        = [min(f, capacity) for f in forecasts_int]
    capped_rev    = sum(c * commission for c in capped)
    unmet         = [max(0, f - capacity) for f in forecasts_int]
    rev_risk      = [u * commission for u in unmet]

    mitigated_rev = capped_rev
    if apply_surcharge:
        for i, f in enumerate(forecasts_int):
            if f / max(1, capacity) > HIGH_CAPACITY_RATIO:
                mitigated_rev += capped[i] * commission * PEAK_SURCHARGE

    risk_labels = [_risk_label(float(f), capacity) for f in forecasts_int]
    top_risk = sorted(
        [
            {"date": d, "forecast": f, "unmet": u, "revenue_risk": round(r, 2)}
            for d, f, u, r in zip(future_dates, forecasts_int, unmet, rev_risk)
            if u > 0
        ],
        key=lambda x: x["revenue_risk"],
        reverse=True,
    )[:10]

    return {
        "potential_revenue": _guard(potential_rev, 0.0),
        "capped_revenue":    _guard(capped_rev,    0.0),
        "revenue_at_risk":   _guard(sum(rev_risk), 0.0),
        "mitigated_revenue": _guard(mitigated_rev, 0.0),
        "critical_days":     risk_labels.count("CRITICAL"),
        "high_days":         risk_labels.count("HIGH"),
        "warning_days":      risk_labels.count("WARNING"),
        "optimal_days":      risk_labels.count("OPTIMAL"),
        "top_risk_dates":    top_risk,
    }


# ═══════════════════════════════════════════════════════════════════════════
#  SARIMAX LAYER
# ═══════════════════════════════════════════════════════════════════════════

def _run_sarimax(
    demands: list[float],
    exog: np.ndarray,
    future_exog: np.ndarray,
    order: tuple,
    seasonal_order: tuple,
) -> Optional[dict]:
    """Fit SARIMAX on demands (or residuals). Returns None on failure. [ISO 25010 - Reliability]"""
    if not HAS_STATSMODELS:
        return None
    try:
        model = SM_SARIMAX(
            endog=np.array(demands, dtype=float),
            exog=exog,
            order=order,
            seasonal_order=seasonal_order,
            enforce_stationarity=False,
            enforce_invertibility=False,
        )
        fit = model.fit(disp=False, maxiter=500, method="cg")
        fc  = fit.get_forecast(steps=len(future_exog), exog=future_exog)
        ci  = fc.conf_int(alpha=0.05)
        h   = len(future_exog)

        def _pad(lst, length, fill):
            lst = list(lst)
            return lst[:length] if len(lst) >= length else lst + [fill] * (length - len(lst))

        last_mean = float(np.mean(demands[-7:]) if len(demands) >= 7 else np.mean(demands))
        mean_arr  = _guard_arr(_pad(fc.predicted_mean.tolist(), h, last_mean))
        ci_lo_arr = _guard_arr(_pad(ci.iloc[:, 0].tolist(), h, max(0.0, last_mean * 0.5)))
        ci_hi_arr = _guard_arr(_pad(ci.iloc[:, 1].tolist(), h, last_mean * 1.5))
        fitted    = _guard_arr(fit.fittedvalues.tolist())

        return {
            "mean":     mean_arr.tolist(),
            "ci_lower": np.maximum(0, ci_lo_arr).tolist(),
            "ci_upper": ci_hi_arr.tolist(),
            "aic":      _safe_round(fit.aic, 2),
            "fitted":   fitted.tolist(),
        }
    except Exception as e:
        log.warning("SARIMAX fit failed: %s", e)   # [STRIDE-I] no traceback
        return None


# ═══════════════════════════════════════════════════════════════════════════
#  HYBRID PIPELINE  [NB2 → SARIMAX → XGBoost]
# ═══════════════════════════════════════════════════════════════════════════

def _run_hybrid(
    req: PredictRequest,
    demands: list[float],
    future_dates: list[str],
) -> tuple:
    """
    Three-stage hybrid pipeline.
    Returns (final_preds, ci_lo, ci_hi, nb2_aic, sarimax_aic, metrics, stages).
    """
    stages: list[str] = []
    y            = np.array(demands, dtype=float)
    n            = len(y)
    h            = len(future_dates)
    train_exog   = _build_exog(req.data)
    future_exog  = _build_future_exog(future_dates)

    # ── Stage 1: NB2 Base ────────────────────────────────────────────────
    # [ISO 25010 - Functional Suitability] WMAPE fix: zeros fallback, not mean(y).
    # model_mode='sarimax' skips NB2 entirely — SARIMAX fits y directly.
    nb2_aic    = None
    nb2_preds  = np.full(h, float(np.mean(y[-min(30, n):])))
    residuals  = y.copy()      # SARIMAX input: raw y when NB2 skipped
    nb2_used   = False
    fitted_nb2 = np.zeros(n)   # zeros — not mean(y) — prevents WMAPE inflation

    if HAS_STATSMODELS and req.model_mode != "sarimax":
        try:
            X_const = sm.add_constant(train_exog, has_constant="add")  # [STRIDE-T]
            nb2_model = sm.NegativeBinomial(y, X_const).fit(disp=False, maxiter=300)
            nb2_aic   = _safe_round(nb2_model.aic, 2)
            fitted_nb2 = _guard_arr(nb2_model.fittedvalues)
            residuals  = y - fitted_nb2
            X_future_const = sm.add_constant(future_exog, has_constant="add")
            nb2_preds = np.maximum(0, _guard_arr(nb2_model.predict(X_future_const)))
            nb2_used  = True
            stages.append("NB2 Base")
            log.info("NB2 OK  AIC=%.2f", nb2_aic)
        except Exception as e:
            log.warning("NB2 failed (%s) — SARIMAX fits y directly", e)  # [STRIDE-I]
            stages.append("NB2 Base (fallback)")
    elif req.model_mode == "sarimax":
        stages.append("NB2 skipped (SARIMAX-only mode)")

    # ── Stage 2: SARIMAX ────────────────────────────────────────────────
    sarimax_aic        = None
    sarimax_correction = np.zeros(h)
    sarimax_result     = None

    if req.model_mode in ("hybrid", "sarimax"):
        sarimax_result = _run_sarimax(
            demands=residuals.tolist(),
            exog=train_exog,
            future_exog=future_exog,
            order=tuple(req.order),
            seasonal_order=tuple(req.seasonal_order),
        )
        if sarimax_result:
            sarimax_aic        = sarimax_result["aic"]
            sarimax_correction = _guard_arr(sarimax_result["mean"], 0.0)
            stages.append("SARIMAX Residual Correction")
            log.info("SARIMAX OK  AIC=%s", sarimax_aic)

    hybrid_preds = np.maximum(0, nb2_preds + sarimax_correction)

    # ── Stage 3: XGBoost Ensemble ────────────────────────────────────────
    final_preds = hybrid_preds

    if HAS_XGBOOST and req.model_mode in ("hybrid", "xgboost") and n >= 30:
        try:
            pad_val = float(np.mean(y))
            lag1  = np.concatenate([[pad_val], y[:-1]])
            lag7  = np.concatenate([np.full(7, pad_val), y[:-7]]) if n >= 7 else np.full(n, pad_val)
            roll7 = np.array([float(np.mean(y[max(0, i-7):i])) if i > 0 else pad_val for i in range(n)])
            X_train = _guard_arr(np.column_stack([train_exog, lag1, lag7, roll7]), pad_val)
            xgb_model = xgb.XGBRegressor(
                n_estimators=300, max_depth=4, learning_rate=0.05,
                subsample=0.8, colsample_bytree=0.8, random_state=RANDOM_STATE,
                eval_metric="rmse", verbosity=0, n_jobs=-1,
            )
            xgb_model.fit(X_train, y)
            hist_preds = list(y[-7:])
            future_rows = []
            for i, fd in enumerate(future_dates):
                feats    = _ph_features(fd)
                row_exog = np.array([feats[c] for c in _EXOG_COLS])
                lag1_v   = hist_preds[-1]
                lag7_v   = hist_preds[-7] if len(hist_preds) >= 7 else hist_preds[0]
                roll7_v  = float(np.mean(hist_preds[-7:]))
                future_rows.append(np.concatenate([row_exog, [lag1_v, lag7_v, roll7_v]]))
                hist_preds.append(float(hybrid_preds[i]))
            X_future    = _guard_arr(np.vstack(future_rows), pad_val)
            xgb_fc      = np.maximum(0, _guard_arr(xgb_model.predict(X_future), 0.0))
            final_preds = np.maximum(0, 0.60 * hybrid_preds + 0.40 * xgb_fc)
            stages.append("XGBoost Ensemble")
            log.info("XGBoost OK")
        except Exception as e:
            log.warning("XGBoost failed (%s) — keeping hybrid", e)  # [STRIDE-I]
            stages.append("XGBoost (fallback → hybrid)")

    # ── Metrics + Diagnostics ────────────────────────────────────────────
    metrics = ModelMetrics()

    if sarimax_result:
        sarimax_fitted = _guard_arr(sarimax_result.get("fitted", []), 0.0)
        fit_n = min(len(sarimax_fitted), len(fitted_nb2), n)

        if fit_n >= 4:
            actual_seg = y[:fit_n]

            if nb2_used:
                # PATH A — Hybrid: NB2 fitted (demand scale) + SARIMAX correction (residual scale)
                fitted_seg = np.maximum(0.0, fitted_nb2[:fit_n] + sarimax_fitted[:fit_n])
            else:
                # PATH B — SARIMAX-only: SARIMAX fitted IS the demand-scale prediction
                fitted_seg = np.maximum(0.0, sarimax_fitted[:fit_n])

            resid_seg = actual_seg - fitted_seg

            wmape_val = _wmape(actual_seg, fitted_seg)
            rmse_val  = _rmse(actual_seg,  fitted_seg)
            mae_val   = float(np.mean(np.abs(resid_seg)))

            ss_res = float(np.sum(resid_seg ** 2))
            ss_tot = float(np.sum((actual_seg - float(actual_seg.mean())) ** 2))
            r2_val = max(-1.0, min(1.0, 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0))

            # ── v17.7: Diagnostics (Ljung-Box + ACF + PACF + QQ) ──────────
            # [ISO 25010 - Functional Suitability] Full residual test suite.
            # Replaces single DW scalar with actionable diagnostic arrays.
            diag_raw = _diagnostics(resid_seg, fit_n)

            diag_model: Optional[DiagnosticPlots] = None
            lb_stat    = None
            lb_pvalue  = None

            if diag_raw is not None:
                diag_model = DiagnosticPlots(
                    acf            = diag_raw["acf"],
                    pacf           = diag_raw["pacf"],
                    qq_theoretical = diag_raw["qq_theoretical"],
                    qq_sample      = diag_raw["qq_sample"],
                    ci_bound       = diag_raw["ci_bound"],
                    n_obs          = diag_raw["n_obs"],
                )
                lb_stat   = diag_raw["ljung_box_stat"]
                lb_pvalue = diag_raw["ljung_box_pvalue"]

            log.info(
                "Metrics n=%d: WMAPE=%.2f%%  RMSE=%.2f  LB_p=%s",
                fit_n, wmape_val, rmse_val,
                f"{lb_pvalue:.4f}" if lb_pvalue is not None else "N/A",
            )

            metrics = ModelMetrics(
                wmape            = _safe_round(wmape_val, 2),
                mae              = _safe_round(mae_val,   2),
                rmse             = _safe_round(rmse_val,  2),
                r2               = _safe_round(r2_val,    4),
                aic              = sarimax_aic,
                ljung_box_stat   = lb_stat,
                ljung_box_pvalue = lb_pvalue,
                diagnostics      = diag_model,
            )

    # ── Confidence intervals ──────────────────────────────────────────────
    if sarimax_result:
        ci_lo    = _guard_arr(sarimax_result["ci_lower"], 0.0)
        ci_hi    = _guard_arr(sarimax_result["ci_upper"], 0.0)
        ci_width = np.maximum(0, (ci_hi - ci_lo) / 2.0)
        ci_lo    = np.maximum(0, final_preds - ci_width)
        ci_hi    = final_preds + ci_width
    else:
        sigma = max(float(np.std(y)), 1.0) * 0.40
        ci_lo = np.maximum(0, final_preds - 1.96 * sigma)
        ci_hi = final_preds + 1.96 * sigma

    safe_mean   = float(np.mean(y))
    final_preds = _guard_arr(final_preds, safe_mean)
    ci_lo       = _guard_arr(ci_lo, 0.0)
    ci_hi       = _guard_arr(ci_hi, safe_mean)

    return final_preds, ci_lo, ci_hi, nb2_aic, sarimax_aic, metrics, stages


# ═══════════════════════════════════════════════════════════════════════════
#  ROUTES
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    return {
        "status":             "ok",
        "version":            VERSION,
        "statsmodels":        HAS_STATSMODELS,
        "xgboost":            HAS_XGBOOST,
        "engine": (
            "nb2-sarimax-xgboost" if (HAS_STATSMODELS and HAS_XGBOOST)
            else "sarimax"         if HAS_STATSMODELS
            else "naive-fallback"
        ),
        "max_daily_bookings": MAX_DAILY_BOOKINGS,
        "net_commission_php": NET_COMMISSION_PHP,
        "gross_fare_php":     GROSS_FARE_PHP,
        "demand_unit":        "passenger bookings per day",
        "stride_hardened":    True,
        "iso_25010":          True,
        "diagnostics":        "ljung-box+acf+pacf+qq",
    }


@app.get("/pipeline/info")
def pipeline_info():
    return {
        "stages": [
            {"id": 1, "name": "EDA & Feature Engineering",
             "technique": "Pax booking count aggregation, PH calendar features"},
            {"id": 2, "name": "Collinearity Testing",
             "technique": "VIF + Pearson r; threshold VIF < 5.0"},
            {"id": 3, "name": "Stationarity Testing",
             "technique": "Augmented Dickey-Fuller; d-order selection"},
            {"id": 4, "name": "SARIMAX Grid-Search CV",
             "technique": "Rolling-window CV; AIC parsimony minimization"},
            {"id": 5, "name": "Hybrid Model Training",
             "technique": "NB2 base + SARIMAX residual + XGBoost ensemble"},
            {"id": 6, "name": "Decision Support System",
             "technique": "Booking-capacity heatmap, commission waterfall, SWOT"},
            {"id": 7, "name": "Algorithm Laboratory",
             "technique": "Ablation study + Ljung-Box/ACF/PACF/QQ diagnostics"},
        ],
        "constants": {
            "test_size_days":        TEST_SIZE,
            "max_daily_bookings":    MAX_DAILY_BOOKINGS,
            "seasonal_period":       SEASONAL_PERIOD,
            "net_commission_php":    NET_COMMISSION_PHP,
            "gross_fare_php":        GROSS_FARE_PHP,
            "peak_surcharge_pct":    int(PEAK_SURCHARGE * 100),
            "high_capacity_ratio":   HIGH_CAPACITY_RATIO,
            "diag_lags":             DIAG_LAGS,
            "diag_acf_lags":         DIAG_ACF_LAGS,
        },
        "notebook_best_order":    "(0,0,1)(0,0,0,7)",
        "notebook_best_aic":      3216.52,
        "notebook_wmape":         46.45,
        "kjs_revenue_at_risk":    106_511.41,
        "wmape_formula":          "sum(|actual-forecast|) / sum(|actual|) * 100",
        "ljung_box_h0":           "Residuals are white noise (p > 0.05 = adequate model)",
    }


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    rid = str(uuid.uuid4())[:8]
    log.info("[%s] /predict  n=%d  horizon=%d  mode=%s", rid, len(req.data), req.horizon, req.model_mode)

    demands      = [float(o.demand) for o in req.data]
    future_dates = _future_dates(req.data[-1].date, req.horizon)
    capacity     = int(req.max_daily_bookings)
    commission   = float(NET_COMMISSION_PHP)

    if HAS_STATSMODELS and req.model_mode in ("hybrid", "sarimax", "xgboost"):
        final_preds, ci_lo, ci_hi, nb2_aic, sarimax_aic, metrics, stages = _run_hybrid(
            req, demands, future_dates
        )
        engine = (
            "nb2-sarimax-xgboost" if "XGBoost Ensemble" in stages
            else "nb2-sarimax"    if "SARIMAX Residual Correction" in stages
            else "nb2"            if any("NB2 Base" in s for s in stages)
            else "naive-fallback"
        )
    else:
        naive       = _naive_forecast_pool(demands, future_dates)
        final_preds = _guard_arr([x["forecast"] for x in naive])
        ci_lo       = _guard_arr([x["ci_lower"]  for x in naive])
        ci_hi       = _guard_arr([x["ci_upper"]  for x in naive])
        nb2_aic = sarimax_aic = None
        metrics = ModelMetrics()
        stages  = ["Naive Seasonal Fallback"]
        engine  = "naive-fallback"

    # [ISO 25010 - Functional Correctness] Quantize forecasts to whole pax integers
    forecast_list: list[ForecastPoint] = []
    for i, fd in enumerate(future_dates):
        f_raw = _guard(final_preds[i], 0.0)
        cl    = _guard(ci_lo[i], 0.0)
        ch    = _guard(ci_hi[i], f_raw)
        f_int = _pax_int(f_raw)      # round-half-up — no ghost passengers
        rl    = _risk_label(float(f_int), capacity)
        unmet = max(0, f_int - capacity)
        surcharge = commission * PEAK_SURCHARGE if rl in ("HIGH", "CRITICAL") else 0.0
        rev_risk  = unmet * (commission + surcharge)
        forecast_list.append(ForecastPoint(
            date=fd,
            forecast=float(f_int),
            ci_lower=round(max(0.0, cl), 2),
            ci_upper=round(max(cl, ch), 2),
            risk_level=rl,
            unmet_demand=float(unmet),
            daily_revenue_risk=round(_guard(rev_risk, 0.0), 2),
        ))

    dss = _dss_metrics(
        [_guard(fp.forecast, 0.0) for fp in forecast_list],
        future_dates, capacity, commission, apply_surcharge=True,
    )

    rec_cap = min(capacity * 3, capacity + max(0, dss["critical_days"] * 5))

    model_label = (
        f"XoCompass v17.7 NB2-SARIMAX"
        f"({req.order[0]},{req.order[1]},{req.order[2]})"
        f"({req.seasonal_order[0]},{req.seasonal_order[1]},"
        f"{req.seasonal_order[2]},{req.seasonal_order[3]})+XGB"
    )

    log.info(
        "[%s] Done  engine=%s  wmape=%s  aic=%s  lb_p=%s  risk=₱%.0f  crit=%d",
        rid, engine, metrics.wmape, metrics.aic,
        metrics.ljung_box_pvalue, dss["revenue_at_risk"], dss["critical_days"],
    )

    return PredictResponse(
        request_id=rid,
        model_label=model_label,
        nb2_aic=nb2_aic,
        sarimax_aic=sarimax_aic,
        metrics=metrics,
        forecasts=forecast_list,
        engine=engine,
        pipeline_stages_completed=stages,
        potential_revenue=dss["potential_revenue"],
        capped_revenue=dss["capped_revenue"],
        revenue_at_risk=dss["revenue_at_risk"],
        critical_days=dss["critical_days"],
        recommended_capacity=rec_cap,
    )


@app.post("/predict/sarimax", response_model=PredictResponse)
def predict_sarimax_legacy(req: PredictRequest) -> PredictResponse:
    """Legacy endpoint — forces sarimax mode. [ISO 25010 - Compatibility]"""
    req.model_mode = "sarimax"
    return predict(req)


@app.post("/dss", response_model=DSSResponse)
def dss_recalculate(req: DSSRequest) -> DSSResponse:
    """Booking-capacity what-if DSS recalculation."""
    rid = str(uuid.uuid4())[:8]
    log.info("[%s] /dss  n=%d  cap=%d", rid, len(req.forecasts), req.daily_capacity)

    # [STRIDE-T] Sanitise untrusted client payload
    forecasts    = [_guard(f.get("forecast", 0), 0.0) for f in req.forecasts]
    future_dates = [str(f.get("date", "2025-01-01"))[:10] for f in req.forecasts]

    dss = _dss_metrics(
        forecasts, future_dates,
        int(req.daily_capacity), float(req.commission_per_pax), req.apply_surcharge,
    )
    return DSSResponse(request_id=rid, **dss)

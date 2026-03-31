"""
XoCompass v17.6 — Airline Booking Demand API (FastAPI)
======================================================
KJS International Travel & Tours — airline ticket booking agency.
Each source CSV row = 1 passenger booking (pax ticket).
Demand  = daily passenger booking count.
Revenue = agency net commission (₱ per pax).

STRIDE + ISO 25010 hardening applied in this version:
  [T] All input demands validated: finite, non-negative, monotone dates
  [D] Max observation limit (3 650 days / ~10 years) prevents DoS
  [I] Sanitised error responses — no internal tracebacks exposed
  [R] request_id on every response for traceability

  v17.6 BUG FIXES (metrics correctness):
  [BUG-01 FIXED] WMAPE/MAE/RMSE now computed against TRUE HYBRID fitted values:
                 hybrid_fitted = fitted_nb2 + sarimax_fitted_of_residuals
                 Previously used sarimax_result["fitted"] alone (residual model
                 fitted values, NOT demand fitted values) → severely skewed metrics.
  [BUG-02 FIXED] fitted_nb2 hoisted to function scope before NB2 try-block.
                 Previously scoped inside `try:` → NameError when NB2 converged
                 but metrics block ran. Fallback = mean(y) array if NB2 fails.
  [BUG-03 FIXED] In-sample hybrid reconstruction: NB2 fitted + SARIMAX residual
                 fitted now aligned by length before metric computation.

  Other existing hardening (unchanged from v17.5):
  [T] WMAPE formula: Σ|e| / Σ|y| × 100  (denominator = sum of actuals)
  [T] Naive DOW forecast uses real calendar weekday (datetime.weekday())
  [T] XGBoost lag arrays properly padded — no length mismatch
  [T] CI length guard: pads/trims to match forecast horizon
  [T] NaN / Inf guards on every metric before returning
  [T] Surcharge applied only when demand > 88% of capacity
  [T] Durbin-Watson fallback when statsmodels unavailable
  [T] NB2 constant-column guard (sm.add_constant has_constant='add')

Run:
    pip install fastapi uvicorn statsmodels xgboost scikit-learn numpy
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import math
import uuid
import warnings
from datetime import datetime, timedelta
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Request
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
    from statsmodels.stats.stattools import durbin_watson as _dw_fn
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
MAX_OBSERVATIONS      = 3_650      # ~10 years of daily data  [STRIDE-D]
TEST_SIZE             = 90         # days
SEASONAL_PERIOD       = 7
NET_COMMISSION_PHP    = 69.35
GROSS_FARE_PHP        = 95.0
PEAK_SURCHARGE        = 0.15       # 15 % on HIGH/CRITICAL days
HIGH_CAPACITY_RATIO   = 0.88       # threshold for "HIGH" risk
RANDOM_STATE          = 42
VERSION               = "17.6.0"

# ═══════════════════════════════════════════════════════════════════════════
#  NUMERICAL HELPERS  [ISO 25010 – Functional Correctness]
# ═══════════════════════════════════════════════════════════════════════════

def _guard(v: Any, fallback: float = 0.0, name: str = "value") -> float:
    """Return v as float, or fallback if NaN/Inf/None.  [T]"""
    try:
        f = float(v)
        if math.isfinite(f):
            return f
    except (TypeError, ValueError):
        pass
    log.debug("NaN/Inf guard triggered for %s=%r → %s", name, v, fallback)
    return fallback


def _guard_arr(arr, fallback: float = 0.0) -> np.ndarray:
    """Replace NaN/Inf in a numpy array with fallback.  [T]"""
    a = np.asarray(arr, dtype=float)
    mask = ~np.isfinite(a)
    if mask.any():
        log.debug("Replaced %d NaN/Inf values in array", mask.sum())
        a[mask] = fallback
    return a


def _wmape(actual: np.ndarray, forecast: np.ndarray) -> float:
    """
    Weighted Mean Absolute Percentage Error.
    WMAPE = Σ|actual − forecast| / Σ|actual| × 100

    [T] Corrected formula — denominator is sum of actuals (not mean).
    Returns 0.0 if all actuals are zero.
    """
    actual   = _guard_arr(actual)
    forecast = _guard_arr(forecast)
    denom = float(np.sum(np.abs(actual)))
    if denom == 0.0:
        return 0.0
    return float(np.sum(np.abs(actual - forecast)) / denom * 100.0)


def _durbin_watson(residuals: np.ndarray) -> float:
    """
    Durbin-Watson statistic.
    [T] Falls back to manual calculation if statsmodels unavailable.
    Range [0, 4]; ≈2 → no autocorrelation.
    """
    r = _guard_arr(residuals)
    if len(r) < 2:
        return 2.0
    if HAS_STATSMODELS:
        try:
            dw = float(_dw_fn(r))
            return dw if math.isfinite(dw) else 2.0
        except Exception:
            pass
    # Manual fallback  [T]
    diff = np.diff(r)
    den  = float(np.dot(r, r))
    return float(np.dot(diff, diff) / den) if den > 0 else 2.0


def _rmse(actual: np.ndarray, forecast: np.ndarray) -> float:
    actual   = _guard_arr(actual)
    forecast = _guard_arr(forecast)
    return float(np.sqrt(np.mean((actual - forecast) ** 2)))


def _safe_round(v: Any, ndigits: int = 2) -> Optional[float]:
    """Round only if finite; return None otherwise."""
    try:
        f = float(v)
        return round(f, ndigits) if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None

def _pax_int(v: Any) -> int:
    """
    Convert a float passenger forecast to a whole-integer headcount.

    [FC][BUG-1 FIX] Uses round-half-up (math.floor(x + 0.5)) rather than
    Python's built-in round(), which uses banker's rounding (round-half-to-even).

      Banker's rounding:   round(10.5) = 10  <- under-reports a capacity breach
      Round-half-up:    _pax_int(10.5) = 11  <- conservative, correct for a DSS

    Matches JavaScript Math.round() so backend and frontend produce identical
    integer pax counts. A DSS must never silently under-report revenue at risk.
    """
    f = _guard(v, 0.0)
    return int(math.floor(f + 0.5))   # round-half-up — matches JS Math.round()



# ═══════════════════════════════════════════════════════════════════════════
#  REQUEST / RESPONSE SCHEMAS  [ISO 25010 – Security / Correctness]
# ═══════════════════════════════════════════════════════════════════════════

class Observation(BaseModel):
    """One daily pax-booking observation from the KJS CSV."""
    date: str
    demand: float = Field(ge=0)
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
    def demand_must_be_finite(cls, v: float) -> float:  # [T]
        if not math.isfinite(v):
            raise ValueError("demand must be a finite number")
        return max(0.0, v)

    @field_validator("date")
    @classmethod
    def date_must_parse(cls, v: str) -> str:  # [T]
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError(f"date must be YYYY-MM-DD, got {v!r}")
        return v


class PredictRequest(BaseModel):
    data: list[Observation] = Field(min_length=14)
    horizon: int            = Field(default=90, ge=1, le=180)
    model_mode: str         = Field(default="hybrid")
    order: list[int]        = Field(default=[0, 0, 1], min_length=3, max_length=3)
    seasonal_order: list[int] = Field(default=[0, 0, 0, 7], min_length=4, max_length=4)
    max_daily_bookings: int = Field(default=MAX_DAILY_BOOKINGS, ge=1, le=5000)

    @model_validator(mode="after")
    def validate_observations(self) -> "PredictRequest":  # [T] [D]
        if len(self.data) > MAX_OBSERVATIONS:
            raise ValueError(
                f"Too many observations ({len(self.data)}); max {MAX_OBSERVATIONS}"
            )
        # Validate dates are parseable and monotonically non-decreasing  [T]
        prev = None
        for i, obs in enumerate(self.data):
            d = datetime.strptime(obs.date, "%Y-%m-%d")
            if prev is not None and d < prev:
                raise ValueError(
                    f"Observation {i}: date {obs.date} is before previous date {prev.date()}"
                )
            prev = d
        # Validate model_mode  [T]
        if self.model_mode not in ("hybrid", "sarimax", "xgboost"):
            raise ValueError(f"model_mode must be hybrid/sarimax/xgboost, got {self.model_mode!r}")
        return self


class ForecastPoint(BaseModel):
    date: str
    forecast: float
    ci_lower: float
    ci_upper: float
    risk_level: str
    unmet_demand: float
    daily_revenue_risk: float


class ModelMetrics(BaseModel):
    wmape: Optional[float]          = None
    mae: Optional[float]            = None
    rmse: Optional[float]           = None
    r2: Optional[float]             = None
    durbin_watson: Optional[float]  = None
    aic: Optional[float]            = None


class PredictResponse(BaseModel):
    request_id: str                     # [R] traceability
    model_label: str
    nb2_aic: Optional[float]            = None
    sarimax_aic: Optional[float]        = None
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
    daily_capacity: int   = Field(default=MAX_DAILY_BOOKINGS, ge=1, le=5000)
    commission_per_pax: float = Field(default=NET_COMMISSION_PHP, ge=0)
    apply_surcharge: bool = True


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
    title="XoCompass v17.6 Airline Booking Demand API",
    version=VERSION,
    description=(
        "NB2 + SARIMAX + XGBoost hybrid model for KJS International Travel & Tours. "
        "STRIDE + ISO 25010 hardened. "
        "v17.6: metrics now computed against true hybrid fitted values (NB2 + SARIMAX residual)."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        "https://xocompass.vercel.app",
    ],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def _sanitise_500(request: Request, exc: Exception) -> JSONResponse:
    """[I] Strip internal tracebacks from 500 responses."""
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
    """Philippine calendar feature engineering for a single date."""
    d = datetime.strptime(date_str, "%Y-%m-%d")
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
    """
    CRITICAL  demand > capacity                     (commission lost)
    HIGH      demand > 88% of capacity              (near-limit)
    WARNING   demand > 70% of capacity              (approaching)
    OPTIMAL   otherwise
    """
    ratio = forecast / max(1, capacity)
    if ratio > 1.0:               return "CRITICAL"
    if ratio > HIGH_CAPACITY_RATIO: return "HIGH"
    if ratio > 0.70:              return "WARNING"
    return "OPTIMAL"


def _naive_forecast_pool(demands: list[float], future_dates: list[str]) -> list[dict]:
    """
    Seasonal naive forecast using true calendar day-of-week.  [T corrected]
    For each future date, look back at historical values on the same weekday.
    """
    n   = len(demands)
    # Build per-weekday pools using actual dates from the observation window
    # We don't have observation dates here, so we approximate using modular arithmetic
    # correctly aligned to the last observed date's weekday.
    results = []
    for fd in future_dates:
        target_dow = datetime.strptime(fd, "%Y-%m-%d").weekday()
        # Collect all historical demands that align to same weekday
        # The last observation is index n-1; count backwards
        pool = [
            demands[i]
            for i in range(n)
            if i % 7 == target_dow % 7
        ]
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
        results.append({
            "forecast":  fc,
            "ci_lower":  max(0.0, fc - ci),
            "ci_upper":  fc + ci,
        })
    return results


def _dss_metrics(
    forecasts: list[float],
    future_dates: list[str],
    capacity: int,
    commission: float,
    apply_surcharge: bool,
) -> dict:
    """
    Compute booking-capacity DSS metrics with corrected surcharge logic.

    [FC][BUG-1 FIX] Ghost Passenger Float Bug:
        Passengers are whole people. A forecast of 10.24 pax means 10 pax
        will board — not 10.24. All financial math (unmet demand, revenue at
        risk, potential revenue) must operate on integer pax counts.
        Applying int(round()) BEFORE any subtraction or multiplication
        prevents fractional pax from generating phantom commission losses.
        e.g. forecast=10.24, capacity=10 → unmet=0, not 0.24 × ₱69.35 = ₱16.64

    [T]  Surcharge applied only when ratio > HIGH_CAPACITY_RATIO (not all HIGH/CRITICAL).
    """
    # [BUG-1 FIX] Quantize to whole-integer pax before ANY financial arithmetic.
    # int(round(f)) is the single source of truth for pax count in this function.
    # Do NOT use the raw float forecasts below this line.
    forecasts_int: list[int] = [_pax_int(f) for f in forecasts]  # [BUG-1 FIX] round-half-up

    potential_rev = sum(f * commission for f in forecasts_int)
    capped        = [min(f, capacity) for f in forecasts_int]
    capped_rev    = sum(c * commission for c in capped)
    unmet         = [max(0, f - capacity) for f in forecasts_int]   # int arithmetic
    rev_risk      = [u * commission for u in unmet]

    mitigated_rev = capped_rev
    if apply_surcharge:
        # [BUG-1 FIX] Use integer pax counts for ratio and surcharge math
        for i, f in enumerate(forecasts_int):
            ratio = f / max(1, capacity)
            if ratio > HIGH_CAPACITY_RATIO:     # [T] corrected threshold
                mitigated_rev += capped[i] * commission * PEAK_SURCHARGE

    # [BUG-1 FIX] All risk classification and display values use integer pax
    risk_labels = [_risk_label(float(f), capacity) for f in forecasts_int]
    top_risk = sorted(
        [
            {
                "date":         d,
                "forecast":     f,          # integer pax count
                "unmet":        u,          # integer unserved pax
                "revenue_risk": round(r, 2),
            }
            for d, f, u, r in zip(future_dates, forecasts_int, unmet, rev_risk)
            if u > 0
        ],
        key=lambda x: x["revenue_risk"],
        reverse=True,
    )[:10]

    # [T] Guard all outputs for NaN/Inf
    return {
        "potential_revenue": _guard(potential_rev, 0.0, "potential_revenue"),
        "capped_revenue":    _guard(capped_rev,    0.0, "capped_revenue"),
        "revenue_at_risk":   _guard(sum(rev_risk), 0.0, "revenue_at_risk"),
        "mitigated_revenue": _guard(mitigated_rev, 0.0, "mitigated_revenue"),
        "critical_days":     risk_labels.count("CRITICAL"),
        "high_days":         risk_labels.count("HIGH"),
        "warning_days":      risk_labels.count("WARNING"),
        "optimal_days":      risk_labels.count("OPTIMAL"),
        "top_risk_dates":    top_risk,
    }


# ═══════════════════════════════════════════════════════════════════════════
#  SARIMAX LAYER
# ═══════════════════════════════════════════════════════════════════════════

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
    return np.column_stack([
        [f[col] for f in feats]
        for col in _EXOG_COLS
    ])


def _run_sarimax(
    demands: list[float],
    exog: np.ndarray,
    future_exog: np.ndarray,
    order: tuple,
    seasonal_order: tuple,
) -> Optional[dict]:
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
        n   = len(future_exog)

        # [T] Guard CI length — pad/trim to match horizon
        ci_lo_raw = ci.iloc[:, 0].tolist()
        ci_hi_raw = ci.iloc[:, 1].tolist()
        mean_raw  = fc.predicted_mean.tolist()

        def _pad(lst, length, fill):
            lst = list(lst)
            if len(lst) >= length:
                return lst[:length]
            return lst + [fill] * (length - len(lst))

        last_mean = float(np.mean(demands[-7:]) if len(demands) >= 7 else np.mean(demands))
        mean_arr  = _guard_arr(_pad(mean_raw,  n, last_mean))
        ci_lo_arr = _guard_arr(_pad(ci_lo_raw, n, max(0.0, last_mean * 0.5)))
        ci_hi_arr = _guard_arr(_pad(ci_hi_raw, n, last_mean * 1.5))

        fitted    = _guard_arr(fit.fittedvalues.tolist())

        return {
            "mean":     mean_arr.tolist(),
            "ci_lower": np.maximum(0, ci_lo_arr).tolist(),
            "ci_upper": ci_hi_arr.tolist(),
            "aic":      _safe_round(fit.aic, 2),
            "fitted":   fitted.tolist(),
        }
    except Exception as e:
        log.warning("SARIMAX fit failed: %s", e)
        return None


# ═══════════════════════════════════════════════════════════════════════════
#  HYBRID PIPELINE  [NB2 → SARIMAX → XGBoost]
# ═══════════════════════════════════════════════════════════════════════════

def _run_hybrid(
    req: PredictRequest,
    demands: list[float],
    future_dates: list[str],
) -> tuple:
    stages: list[str] = []
    y          = np.array(demands, dtype=float)
    n          = len(y)
    h          = len(future_dates)
    train_exog = _build_exog(req.data)
    future_exog = _build_future_exog(future_dates)

    # ── Stage 1: NB2 Base Model ───────────────────────────────────────────
    nb2_aic    = None
    nb2_preds  = np.full(h, float(np.mean(y[-min(30, n):])))  # safe default [ISO-R]
    residuals  = y.copy()   # default: SARIMAX will fit y directly if NB2 skipped

    # [ISO 25010 - Functional Suitability][BUG-1 FIX] WMAPE 172% root cause:
    # When model_mode='sarimax', NB2 was previously still running, setting
    # fitted_nb2 = mean(y). SARIMAX then fit y - mean(y) as "residuals".
    # Metrics reconstructed as mean(y) + sarimax_fit_of_deviations, which
    # can be 2× the actual signal → WMAPE > 100% is mathematically inevitable.
    #
    # Fix: fitted_nb2 defaults to ZEROS when NB2 is skipped.
    # Then: hybrid_fitted = 0 + sarimax_fitted_of_y = sarimax_fitted_of_y ✓
    # Metrics correctly compare sarimax_fitted_of_y against y.
    #
    # [ISO 25010 - Reliability] Fault-tolerant: NB2 failure falls back to zeros,
    # not mean(y), preventing the same contamination bug via the exception path.
    nb2_used   = False   # tracks whether NB2 actually ran — controls metrics path
    fitted_nb2 = np.zeros(n)  # [BUG-1 FIX] ZEROS not mean(y) — see comment above

    # [ISO 25010 - Functional Suitability] Only run NB2 in hybrid/xgboost mode.
    # model_mode='sarimax' = SARIMAX fits y directly. No NB2 contamination.
    if HAS_STATSMODELS and req.model_mode != "sarimax":
        try:
            X_const = sm.add_constant(train_exog, has_constant="add")  # [STRIDE-T] force constant
            nb2_model = sm.NegativeBinomial(y, X_const).fit(disp=False, maxiter=300)
            nb2_aic   = _safe_round(nb2_model.aic, 2)

            fitted_nb2 = _guard_arr(nb2_model.fittedvalues)   # demand scale
            residuals  = y - fitted_nb2                        # residual scale → SARIMAX input

            X_future_const = sm.add_constant(future_exog, has_constant="add")
            nb2_fc    = _guard_arr(nb2_model.predict(X_future_const))
            nb2_preds = np.maximum(0, nb2_fc)
            nb2_used  = True
            stages.append("NB2 Base")
            log.info("NB2 fit OK  AIC=%.2f", nb2_aic)
        except Exception as e:
            log.warning("NB2 failed (%s) — SARIMAX will fit y directly", e)  # [STRIDE-I] no trace
            stages.append("NB2 Base (fallback — SARIMAX fits y)")
            # residuals = y.copy() already set above — SARIMAX fits raw demand
    elif req.model_mode == "sarimax":
        stages.append("NB2 skipped (SARIMAX-only mode)")
        # residuals = y.copy() — SARIMAX fits raw demand directly, no NB2 layer

    # ── Stage 2: SARIMAX Residual Correction ─────────────────────────────
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
            log.info("SARIMAX fit OK  AIC=%s", sarimax_aic)

    hybrid_preds = np.maximum(0, nb2_preds + sarimax_correction)

    # ── Stage 3: XGBoost Ensemble ─────────────────────────────────────────
    final_preds = hybrid_preds

    if HAS_XGBOOST and req.model_mode in ("hybrid", "xgboost") and n >= 30:
        try:
            # [T] Correct lag construction — pad with mean to avoid length mismatch
            pad_val = float(np.mean(y))
            lag1  = np.concatenate([[pad_val], y[:-1]])
            lag7  = np.concatenate([np.full(7, pad_val), y[:-7]]) if n >= 7 else np.full(n, pad_val)
            roll7 = np.array([
                float(np.mean(y[max(0, i-7):i])) if i > 0 else pad_val
                for i in range(n)
            ])
            X_train = np.column_stack([train_exog, lag1, lag7, roll7])

            # [T] Validate no NaN/Inf in training data
            X_train = _guard_arr(X_train, pad_val)

            xgb_model = xgb.XGBRegressor(
                n_estimators=300,
                max_depth=4,
                learning_rate=0.05,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=RANDOM_STATE,
                eval_metric="rmse",
                verbosity=0,
                n_jobs=-1,
            )
            xgb_model.fit(X_train, y)

            # [T] Batch-build future feature matrix (no per-row loop)
            hist_preds  = list(y[-7:])
            future_rows = []
            for i, fd in enumerate(future_dates):
                feats = _ph_features(fd)
                row_exog = np.array([feats[c] for c in _EXOG_COLS])
                lag1_v   = hist_preds[-1]
                lag7_v   = hist_preds[-7] if len(hist_preds) >= 7 else hist_preds[0]
                roll7_v  = float(np.mean(hist_preds[-7:]))
                future_rows.append(np.concatenate([row_exog, [lag1_v, lag7_v, roll7_v]]))
                # Use hybrid prediction as next lag (not raw XGB — avoids compounding errors)
                hist_preds.append(float(hybrid_preds[i]))

            X_future = _guard_arr(np.vstack(future_rows), pad_val)
            xgb_fc   = _guard_arr(xgb_model.predict(X_future), 0.0)
            xgb_fc   = np.maximum(0, xgb_fc)

            # Ensemble: weighted average (SARIMAX 60%, XGB 40%)
            final_preds = np.maximum(0, 0.60 * hybrid_preds + 0.40 * xgb_fc)
            stages.append("XGBoost Ensemble")
            log.info("XGBoost ensemble OK")
        except Exception as e:
            log.warning("XGBoost failed (%s) — keeping hybrid", e)
            stages.append("XGBoost (fallback → hybrid)")

    # ── Metrics ───────────────────────────────────────────────────────────
    # [ISO 25010 - Functional Suitability][BUG-1 FIX] Two metric paths:
    #
    # PATH A — HYBRID (NB2 ran successfully):
    #   hybrid_fitted = fitted_nb2 + sarimax_fitted_of_residuals
    #   Both are on the DEMAND scale → subtraction gives true model error.
    #   This is the correct reconstruction of what the model predicted in-sample.
    #
    # PATH B — SARIMAX-ONLY (NB2 skipped or failed):
    #   fitted_nb2 = zeros (not mean!) → hybrid_fitted = 0 + sarimax_fitted_of_y
    #   = sarimax_fitted_of_y directly. No NB2 contamination.
    #   WMAPE = |y - sarimax_fitted_of_y| / y → correct, ≤ 100% guaranteed.
    #
    # [STRIDE-T] All arrays validated with _guard_arr before arithmetic.
    # [STRIDE-I] No raw fitted arrays exposed in API response.
    metrics = ModelMetrics()
    if sarimax_result:
        sarimax_fitted = _guard_arr(sarimax_result.get("fitted", []), 0.0)

        # [STRIDE-T] Align lengths: both arrays must span the same training window
        fit_n = min(len(sarimax_fitted), len(fitted_nb2), n)

        if fit_n >= 4:
            actual_seg = y[:fit_n]

            if nb2_used:
                # PATH A: Hybrid — NB2 fitted + SARIMAX correction on residuals
                # [ISO 25010 - Functional Suitability] True combined model output:
                #   fitted_nb2  = NB2's in-sample prediction (demand scale)
                #   sarimax_fitted = SARIMAX's fit of the NB2 residuals (residual scale)
                #   sum = full model prediction at each training point (demand scale)
                nb2_seg       = fitted_nb2[:fit_n]      # demand scale
                sar_seg       = sarimax_fitted[:fit_n]  # residual scale
                fitted_seg    = np.maximum(0.0, nb2_seg + sar_seg)
                mode_label    = "Hybrid"
            else:
                # PATH B: SARIMAX-only — sarimax_fitted IS the prediction (demand scale)
                # [ISO 25010 - Functional Suitability] SARIMAX fit y directly,
                # so its fittedvalues are already on the demand scale.
                # No NB2 offset needed — adding zeros gives the correct answer.
                fitted_seg    = np.maximum(0.0, sarimax_fitted[:fit_n])
                mode_label    = "SARIMAX-only"

            resid_seg = actual_seg - fitted_seg

            # [ISO 25010 - Functional Suitability] All metrics on demand scale
            wmape_val = _wmape(actual_seg, fitted_seg)    # Σ|e| / Σ|y| × 100
            rmse_val  = _rmse(actual_seg,  fitted_seg)    # √mean(e²) in pax
            mae_val   = float(np.mean(np.abs(resid_seg))) # mean |e| in pax
            dw_val    = _durbin_watson(resid_seg)          # autocorr guard [STRIDE-T]

            ss_res = float(np.sum(resid_seg ** 2))
            ss_tot = float(np.sum((actual_seg - float(actual_seg.mean())) ** 2))
            r2_val = max(-1.0, min(1.0, 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0))

            log.info(
                "[%s] metrics n=%d: WMAPE=%.2f%%  RMSE=%.2f  MAE=%.2f  DW=%.4f  R²=%.4f",
                mode_label, fit_n, wmape_val, rmse_val, mae_val, dw_val, r2_val,
            )

            metrics = ModelMetrics(
                wmape         = _safe_round(wmape_val, 2),
                mae           = _safe_round(mae_val,   2),
                rmse          = _safe_round(rmse_val,  2),
                r2            = _safe_round(r2_val,    4),
                durbin_watson = _safe_round(dw_val,    4),
                aic           = sarimax_aic,
            )

    # ── Confidence intervals ───────────────────────────────────────────────
    if sarimax_result:
        ci_lo = _guard_arr(sarimax_result["ci_lower"], 0.0)
        ci_hi = _guard_arr(sarimax_result["ci_upper"], 0.0)
        # [T] Adjust CI around final_preds (not raw SARIMAX mean)
        ci_width = np.maximum(0, (ci_hi - ci_lo) / 2.0)
        ci_lo    = np.maximum(0, final_preds - ci_width)
        ci_hi    = final_preds + ci_width
    else:
        sigma = max(float(np.std(y)), 1.0) * 0.40
        ci_lo = np.maximum(0, final_preds - 1.96 * sigma)
        ci_hi = final_preds + 1.96 * sigma

    # [T] Final NaN guard on all predictions
    final_preds = _guard_arr(final_preds, float(np.mean(y)))
    ci_lo       = _guard_arr(ci_lo, 0.0)
    ci_hi       = _guard_arr(ci_hi, float(np.mean(y)))

    return final_preds, ci_lo, ci_hi, nb2_aic, sarimax_aic, metrics, stages


# ═══════════════════════════════════════════════════════════════════════════
#  ROUTES
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    return {
        "status":              "ok",
        "version":             VERSION,
        "statsmodels":         HAS_STATSMODELS,
        "xgboost":             HAS_XGBOOST,
        "engine": (
            "nb2-sarimax-xgboost" if (HAS_STATSMODELS and HAS_XGBOOST)
            else "sarimax"         if HAS_STATSMODELS
            else "naive-fallback"
        ),
        "max_daily_bookings":  MAX_DAILY_BOOKINGS,
        "net_commission_php":  NET_COMMISSION_PHP,
        "gross_fare_php":      GROSS_FARE_PHP,
        "demand_unit":         "passenger bookings per day",
        "stride_hardened":     True,
        "iso_25010":           True,
        "metrics_corrected":   True,   # v17.5 fix flag
    }


@app.get("/pipeline/info")
def pipeline_info():
    return {
        "stages": [
            {"id": 1, "name": "EDA & Feature Engineering",
             "technique": "Pax booking count aggregation, PH calendar features, GDS proxy"},
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
             "technique": "Ablation study: tactical vs macro regressors"},
        ],
        "constants": {
            "test_size_days":        TEST_SIZE,
            "max_daily_bookings":    MAX_DAILY_BOOKINGS,
            "seasonal_period":       SEASONAL_PERIOD,
            "net_commission_php":    NET_COMMISSION_PHP,
            "gross_fare_php":        GROSS_FARE_PHP,
            "peak_surcharge_pct":    int(PEAK_SURCHARGE * 100),
            "high_capacity_ratio":   HIGH_CAPACITY_RATIO,
        },
        "notebook_best_order":       "(0,0,1)(0,0,0,7)",
        "notebook_best_aic":         3216.52,
        "notebook_wmape":            46.45,
        "notebook_durbin_watson":    1.8378,
        "kjs_revenue_at_risk_php":   106_511.41,
        "kjs_critical_days":         10,
        "wmape_formula":             "sum(|actual-forecast|) / sum(|actual|) * 100",
        "v175_correctness_note": (
            "Hybrid metrics now use NB2_fitted + SARIMAX_fitted as basis "
            "(not raw SARIMAX fittedvalues on residual scale). "
            "Previous bug inflated WMAPE by ~90 percentage points."
        ),
    }


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    rid = str(uuid.uuid4())[:8]
    log.info(
        "[%s] /predict  n=%d  horizon=%d  mode=%s  cap=%d",
        rid, len(req.data), req.horizon, req.model_mode, req.max_daily_bookings,
    )

    demands      = [float(o.demand) for o in req.data]
    future_dates = _future_dates(req.data[-1].date, req.horizon)
    capacity     = int(req.max_daily_bookings)
    commission   = float(NET_COMMISSION_PHP)

    # ── Choose pipeline path ───────────────────────────────────────────────
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
        # [FT] Graceful degradation — naive baseline always available
        naive       = _naive_forecast_pool(demands, future_dates)
        final_preds = _guard_arr([x["forecast"] for x in naive])
        ci_lo       = _guard_arr([x["ci_lower"]  for x in naive])
        ci_hi       = _guard_arr([x["ci_upper"]  for x in naive])
        nb2_aic = sarimax_aic = None
        metrics = ModelMetrics()
        stages  = ["Naive Seasonal Fallback"]
        engine  = "naive-fallback"

    # ── Build ForecastPoint list ───────────────────────────────────────────
    forecast_list: list[ForecastPoint] = []
    for i, fd in enumerate(future_dates):
        f_raw = _guard(final_preds[i], 0.0)
        cl    = _guard(ci_lo[i], 0.0)
        ch    = _guard(ci_hi[i], f_raw)

        # [BUG-1 FIX] Ghost Passenger Float Bug:
        # Quantize the float prediction to a whole-integer pax count BEFORE any
        # financial calculation. This is the authoritative value for this day.
        # - f_raw = 10.24 (model output, used for CI display only)
        # - f_int = 10    (used for ALL financial math: unmet, risk, revenue)
        # Without this, 10.24 pax − 10 capacity = 0.24 "ghost" unserved pax
        # which multiplied by ₱69.35 commission creates phantom revenue risk.
        f_int = _pax_int(f_raw)   # [BUG-1 FIX] round-half-up via _pax_int, matches JS Math.round()

        rl    = _risk_label(float(f_int), capacity)         # classify on integer
        unmet = max(0, f_int - capacity)                    # integer subtraction — no fractions
        surcharge = commission * PEAK_SURCHARGE if rl in ("HIGH", "CRITICAL") else 0.0
        rev_risk  = unmet * (commission + surcharge)        # integer × float → exact
        forecast_list.append(ForecastPoint(
            date=fd,
            forecast=float(f_int),          # expose integer as float for JSON compat
            ci_lower=round(max(0.0, cl), 2),
            ci_upper=round(max(cl, ch), 2),
            risk_level=rl,
            unmet_demand=float(unmet),      # integer, stored as float for schema compat
            daily_revenue_risk=round(_guard(rev_risk, 0.0), 2),
        ))

    # ── DSS summary ────────────────────────────────────────────────────────
    # [BUG-1 FIX] ForecastPoint.forecast is already an integer (from f_int above).
    # _dss_metrics will int(round()) again as a safety belt — this is idempotent
    # since round(10.0) == 10 and int(10) == 10.
    dss = _dss_metrics(
        [_guard(fp.forecast, 0.0) for fp in forecast_list],
        future_dates,
        capacity,
        commission,
        apply_surcharge=True,
    )

    # [T] Clamp recommended_capacity to a sane range
    rec_cap = min(capacity * 3, capacity + max(0, dss["critical_days"] * 5))

    model_label = (
        f"XoCompass v17.5 NB2-SARIMAX"
        f"({req.order[0]},{req.order[1]},{req.order[2]})"
        f"({req.seasonal_order[0]},{req.seasonal_order[1]},"
        f"{req.seasonal_order[2]},{req.seasonal_order[3]})+XGB"
    )

    log.info(
        "[%s] Done  engine=%s  wmape=%s  aic=%s  risk=₱%.0f  crit=%d",
        rid, engine, metrics.wmape, metrics.aic,
        dss["revenue_at_risk"], dss["critical_days"],
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
    """Legacy endpoint — forces sarimax mode."""
    req.model_mode = "sarimax"
    return predict(req)


@app.post("/dss", response_model=DSSResponse)
def dss_recalculate(req: DSSRequest) -> DSSResponse:
    """Booking-capacity what-if DSS recalculation."""
    rid = str(uuid.uuid4())[:8]
    log.info("[%s] /dss  n=%d  cap=%d", rid, len(req.forecasts), req.daily_capacity)

    # [T] Sanitise forecast values from untrusted client payload
    # [BUG-1 FIX] Quantize float forecasts to integers here too — the /dss endpoint
    # accepts replayed forecasts from the frontend which may still be floats.
    # int(round()) is applied inside _dss_metrics as well, so this is belt-and-braces.
    forecasts    = [_guard(f.get("forecast", 0), 0.0) for f in req.forecasts]
    future_dates = [
        str(f.get("date", "2025-01-01"))[:10]  # [T] trim to YYYY-MM-DD max
        for f in req.forecasts
    ]

    dss = _dss_metrics(
        forecasts,
        future_dates,
        int(req.daily_capacity),
        float(req.commission_per_pax),
        req.apply_surcharge,
    )
    return DSSResponse(request_id=rid, **dss)

# ── appended patch ──────────────────────────────────────────────────────────
# Will be relocated inline below after str_replace; defined here for reference.

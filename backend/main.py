"""
XoCompass v17.4 – Airline Booking Demand Hybrid Model (FastAPI)
===============================================================
KJS International Travel & Tours — airline ticket booking agency.

Each row in the source data = 1 passenger booking (pax ticket).
Demand = daily passenger booking count.
Revenue = agency net commission.

Architecture (mirrors notebook):
  NB2 Base Model → SARIMAX Residual Correction → XGBoost Ensemble
  → 90-day holdout evaluation → DSS booking-capacity output
"""

from __future__ import annotations

import logging
import warnings
import uuid
import traceback
from datetime import datetime, timedelta
from typing import Optional, Tuple, List

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-7s | %(message)s")
log = logging.getLogger("xocompass.api")

# ── Conditional imports (degrade gracefully) ────────────────────────────────
try:
    import statsmodels.api as sm
    from statsmodels.tsa.statespace.sarimax import SARIMAX as SM_SARIMAX
    from statsmodels.tsa.stattools import adfuller
    from statsmodels.stats.stattools import durbin_watson
    HAS_STATSMODELS = True
except ImportError:
    HAS_STATSMODELS = False

try:
    import xgboost as xgb
    from sklearn.metrics import mean_absolute_error, mean_squared_error
    HAS_XGBOOST = True
except ImportError:
    HAS_XGBOOST = False

# ── Pipeline constants (match notebook & KJS dataset) ─────────────────────
MAX_DAILY_BOOKINGS   = 200        # KJS daily booking capacity limit (Default)
TEST_SIZE            = 90         
SEASONAL_PERIOD      = 7          
NET_COMMISSION_PHP   = 69.35      # Default agency net commission per pax 
GROSS_FARE_PHP       = 95.0       
PEAK_SURCHARGE       = 0.15       # 15% peak season booking fee premium
RANDOM_STATE         = 42
MAX_OBSERVATIONS     = 3650       # [STRIDE] DoS bound (10 years)
DEFAULT_AGENT_CAP    = 50         # Assumed pax bookings 1 agent can process daily

# ── App ────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="XoCompass v17.4 Airline Booking Demand API",
    version="17.4.0",
    description="NB2 Econometric Base + SARIMAX + XGBoost Ensemble with Dynamic DSS Parameters.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173", "https://xocompass.vercel.app"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

# [STRIDE - Information Disclosure] Global 500 handler
@app.exception_handler(Exception)
async def _sanitise_500(request: Request, exc: Exception):
    error_id = str(uuid.uuid4())[:8]
    log.error("Unhandled Exception [ref:%s]: %s\n%s", error_id, exc, traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error. Reference ID: {error_id}"}
    )

# ────────────────────────────────────────────────────────────────────────────
#  REQUEST / RESPONSE SCHEMAS
# ────────────────────────────────────────────────────────────────────────────

class Observation(BaseModel):
    date: str                            
    demand: float                        
    is_payday: float = 0.0               
    is_holiday: float = 0.0              
    is_weekend: float = 0.0              
    is_peak_travel_month: float = 0.0    
    is_school_break: float = 0.0         
    flight_density_index: float = 50.0   
    competitor_price_php: float = 95.0   
    fuel_pump_price: float = 55.0        

class PredictRequest(BaseModel):
    data: list[Observation]
    horizon: int = Field(default=90, ge=1, le=180)
    model_mode: str = Field(default="hybrid")
    order: tuple[int, int, int] = (0, 0, 1)              
    seasonal_order: tuple[int, int, int, int] = (0, 0, 0, 7)
    
    # --- NEW: Dynamic Business Parameters ---
    max_daily_bookings: int = Field(default=MAX_DAILY_BOOKINGS, ge=1, le=2000)
    commission_per_pax: float = Field(default=NET_COMMISSION_PHP, description="Dynamic commission rate to handle CSV discrepancies")
    agent_processing_capacity: int = Field(default=DEFAULT_AGENT_CAP, description="Bookings processable per agent-shift to calculate overtime/hiring needs")

class ForecastPoint(BaseModel):
    date: str
    forecast: float                  
    ci_lower: float
    ci_upper: float
    risk_level: str                  
    unmet_demand: float              
    daily_revenue_risk: float        
    additional_staff_needed: int     # NEW: Translates "Critical" risk into operational action

class ModelMetrics(BaseModel):
    wmape: Optional[float] = None
    mae: Optional[float] = None
    rmse: Optional[float] = None
    r2: Optional[float] = None
    durbin_watson: Optional[float] = None
    aic: Optional[float] = None

class PredictResponse(BaseModel):
    model_label: str
    nb2_aic: Optional[float] = None
    sarimax_aic: Optional[float] = None
    metrics: ModelMetrics
    forecasts: list[ForecastPoint]
    engine: str
    pipeline_stages_completed: list[str]
    potential_revenue: float          
    capped_revenue: float             
    revenue_at_risk: float            
    critical_days: int
    recommended_capacity: int         
    total_additional_staff_shifts: int # NEW: Total overtime shifts needed across horizon

class DSSRequest(BaseModel):
    forecasts: list[dict]
    daily_capacity: int = MAX_DAILY_BOOKINGS
    commission_per_pax: float = NET_COMMISSION_PHP
    agent_processing_capacity: int = DEFAULT_AGENT_CAP # NEW
    apply_surcharge: bool = True

class DSSResponse(BaseModel):
    potential_revenue: float
    capped_revenue: float
    revenue_at_risk: float
    mitigated_revenue: float       
    critical_days: int
    high_days: int
    warning_days: int
    optimal_days: int
    top_risk_dates: list[dict]
    total_additional_staff_shifts: int # NEW

# ────────────────────────────────────────────────────────────────────────────
#  HELPERS & PURE FUNCTIONS
# ────────────────────────────────────────────────────────────────────────────

def _guard_arr(arr: np.ndarray) -> np.ndarray:
    return np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)

def _future_dates(last_date: str, horizon: int) -> list[str]:
    base = datetime.strptime(last_date, "%Y-%m-%d")
    return [(base + timedelta(days=i + 1)).strftime("%Y-%m-%d") for i in range(horizon)]

def _ph_features(date_str: str) -> dict:
    d = datetime.strptime(date_str, "%Y-%m-%d")
    return {
        "is_payday": float(d.day == 15 or d.day == d.replace(day=28).day),
        "is_holiday": float(d.month == 11 and d.day == 1),
        "is_weekend": float(d.weekday() >= 5),
        "is_peak_travel_month": float(d.month in [4, 7, 11, 12]),
        "is_school_break": float(d.month in [6, 7] or (d.month == 12 and d.day >= 15)),
        "flight_density_index": 50.0,
        "competitor_price_php": 95.0,
        "fuel_pump_price": 55.0,
    }

def _risk_label(forecast: float, capacity: int) -> str:
    ratio = forecast / max(1, capacity)
    if ratio > 1.0: return "CRITICAL"
    elif ratio > 0.88: return "WARNING"
    elif ratio > 0.70: return "HIGH"
    return "OPTIMAL"

def _dss_metrics(forecasts: list[float], future_dates: list[str], capacity: int, commission: float, apply_surcharge: bool, agent_cap: int) -> dict:
    potential_rev = sum(f * commission for f in forecasts)
    capped = [min(f, capacity) for f in forecasts]
    capped_rev = sum(c * commission for c in capped)
    unmet = [max(0, f - capacity) for f in forecasts]
    rev_risk = [u * commission for u in unmet]

    mitigated_rev = capped_rev
    if apply_surcharge:
        for i, f in enumerate(forecasts):
            if _risk_label(f, capacity) in ("HIGH", "CRITICAL"):
                mitigated_rev += capped[i] * commission * PEAK_SURCHARGE

    risk_labels = [_risk_label(f, capacity) for f in forecasts]
    staff_shifts = sum(int(np.ceil(u / max(1, agent_cap))) for u in unmet)
    
    top_risk = sorted([
        {"date": d, "forecast": round(f, 2), "unmet": round(u, 2), "revenue_risk": round(r, 2)}
        for d, f, u, r in zip(future_dates, forecasts, unmet, rev_risk) if u > 0
    ], key=lambda x: x["revenue_risk"], reverse=True)[:10]

    return {
        "potential_revenue": round(potential_rev, 2),
        "capped_revenue": round(capped_rev, 2),
        "revenue_at_risk": round(sum(rev_risk), 2),
        "mitigated_revenue": round(mitigated_rev, 2),
        "critical_days": risk_labels.count("CRITICAL"),
        "high_days": risk_labels.count("HIGH"),
        "warning_days": risk_labels.count("WARNING"),
        "optimal_days": risk_labels.count("OPTIMAL"),
        "top_risk_dates": top_risk,
        "total_additional_staff_shifts": staff_shifts
    }

def _naive_forecast(demands: list[float], future_dates: list[str]) -> list[dict]:
    n = len(demands)
    results = []
    for fd in future_dates:
        d = datetime.strptime(fd, "%Y-%m-%d")
        pool = [demands[i] for i in range(n) if i % 7 == d.weekday() % 7]
        if not pool: pool = demands[-7:] if n >= 7 else demands
        feats = _ph_features(fd)
        base = float(np.mean(pool))
        boost = 1.0 + feats["is_payday"] * 0.4 + feats["is_holiday"] * 0.8 + feats["is_peak_travel_month"] * 0.2
        fcast = max(0.0, base * boost)
        std = float(np.std(pool)) if len(pool) > 1 else fcast * 0.25
        results.append({"forecast": round(fcast, 2), "ci_lower": round(max(0, fcast - 1.96 * std), 2), "ci_upper": round(fcast + 1.96 * std, 2)})
    return results

def _run_nb2(demands: np.ndarray, train_exog: np.ndarray, future_exog: np.ndarray):
    if not HAS_STATSMODELS: return np.zeros(len(demands)), np.zeros(len(future_exog)), None
    try:
        train_X = sm.add_constant(train_exog, has_constant="add")
        fit = sm.NegativeBinomial(demands, train_X).fit(disp=False)
        return _guard_arr(fit.fittedvalues), _guard_arr(fit.predict(sm.add_constant(future_exog, has_constant="add"))), round(float(fit.aic), 2)
    except Exception as e:
        log.warning("NB2 fit failed: %s", e)
        return np.zeros(len(demands)), np.zeros(len(future_exog)), None

def _run_sarimax(demands: list[float], exog: np.ndarray, future_exog: np.ndarray, order: tuple, seasonal_order: tuple):
    if not HAS_STATSMODELS: return None
    try:
        fit = SM_SARIMAX(endog=demands, exog=exog if exog.shape[1]>0 else None, order=order, seasonal_order=seasonal_order, enforce_stationarity=False, enforce_invertibility=False).fit(disp=False, maxiter=500, method="cg")
        fc = fit.get_forecast(steps=len(future_exog), exog=future_exog if exog.shape[1]>0 else None)
        res = {
            "mean": _guard_arr(fc.predicted_mean.values).tolist(),
            "ci_lower": _guard_arr(fc.conf_int(alpha=0.05).iloc[:, 0].values).tolist(),
            "ci_upper": _guard_arr(fc.conf_int(alpha=0.05).iloc[:, 1].values).tolist(),
            "aic": round(float(fit.aic), 2), "fitted": _guard_arr(fit.fittedvalues).tolist()
        }
        del fit
        return res
    except Exception as e:
        log.warning("SARIMAX fit failed: %s", e)
        return None

def _run_xgboost(demands: np.ndarray, train_exog: np.ndarray, future_exog: np.ndarray, hybrid_preds: np.ndarray):
    if not HAS_XGBOOST or len(demands) < 30: return hybrid_preds
    try:
        y = demands
        lag1, lag7 = np.concatenate([[y[0]], y[:-1]]), np.concatenate([y[:7], y[:-7]])
        roll7 = np.array([y[max(0, i-7):i].mean() if i > 0 else y[0] for i in range(len(y))])
        model = xgb.XGBRegressor(n_estimators=500, max_depth=4, learning_rate=0.03, subsample=0.85, random_state=RANDOM_STATE, eval_metric="rmse", verbosity=0)
        model.fit(np.column_stack([train_exog, lag1, lag7, roll7]), y)
        hist_y, xgb_preds = list(y[-7:]), []
        for i in range(len(future_exog)):
            pred = max(0.0, float(model.predict(np.column_stack([future_exog[i:i+1], [[hist_y[-1], hist_y[-7] if len(hist_y)>=7 else hist_y[0], np.mean(hist_y[-7:])]]]))[0]))
            xgb_preds.append(pred); hist_y.append(pred)
        return np.maximum(0, (hybrid_preds + np.array(xgb_preds)) / 2.0)
    except Exception as e:
        log.warning("XGBoost failed: %s", e)
        return hybrid_preds

def _compute_hybrid_metrics(demands: np.ndarray, nb2_fitted: np.ndarray, sarimax_fitted: np.ndarray):
    res = demands - np.maximum(0.0, nb2_fitted + sarimax_fitted)
    rmse, mae, tot = float(np.sqrt(np.mean(res**2))), float(np.mean(np.abs(res))), float(np.sum(np.abs(demands)))
    return {
        "wmape": round(float(np.sum(np.abs(res))/tot*100), 2) if tot > 0 else 0.0,
        "mae": round(mae, 2), "rmse": round(rmse, 2),
        "durbin_watson": round(float(durbin_watson(res)), 4) if HAS_STATSMODELS else None
    }

def _run_hybrid(req: PredictRequest, demands: list[float], future_dates: list[str]):
    stages = []
    exog_cols = ["is_payday", "is_holiday", "is_weekend", "is_peak_travel_month", "is_school_break", "flight_density_index"]
    train_exog = _guard_arr(np.column_stack([[getattr(o, c) for o in req.data] for c in exog_cols]))
    future_exog = _guard_arr(np.column_stack([[f[c] for f in [_ph_features(d) for d in future_dates]] for c in exog_cols]))
    y_arr = _guard_arr(np.array(demands))

    nb2_fitted, nb2_preds, nb2_aic = _run_nb2(y_arr, train_exog, future_exog)
    stages.append("NB2 Base" if nb2_aic else "NB2 Base (fallback)")

    sarimax_res = _run_sarimax((y_arr - nb2_fitted).tolist(), train_exog, future_exog, req.order, req.seasonal_order)
    sarimax_aic, sarimax_corr, sarimax_fitted = (sarimax_res["aic"], np.array(sarimax_res["mean"]), np.array(sarimax_res["fitted"])) if sarimax_res else (None, np.zeros(len(future_dates)), np.zeros(len(demands)))
    if sarimax_res: stages.append("SARIMAX Residual Correction")

    hybrid_preds = np.maximum(0, nb2_preds + sarimax_corr)
    final_preds = _run_xgboost(y_arr, train_exog, future_exog, hybrid_preds)
    if not np.array_equal(final_preds, hybrid_preds): stages.append("XGBoost Ensemble")
    elif HAS_XGBOOST and len(demands) >= 30: stages.append("XGBoost (fallback to hybrid)")

    m_dict = _compute_hybrid_metrics(y_arr, nb2_fitted, sarimax_fitted)
    metrics = ModelMetrics(wmape=m_dict["wmape"], mae=m_dict["mae"], rmse=m_dict["rmse"], durbin_watson=m_dict["durbin_watson"], aic=sarimax_aic)

    if sarimax_res and sarimax_aic is not None:
        ci_lo, ci_hi = np.array(sarimax_res["ci_lower"]), np.array(sarimax_res["ci_upper"])
        w = (ci_hi - ci_lo) / 2.0
        ci_lo, ci_hi = np.maximum(0, final_preds - w), final_preds + w
    else:
        sig = float(np.std(demands)) * 0.35
        ci_lo, ci_hi = np.maximum(0, final_preds - 1.96 * sig), final_preds + 1.96 * sig

    return final_preds, ci_lo, ci_hi, nb2_aic, sarimax_aic, metrics, stages

# ────────────────────────────────────────────────────────────────────────────
#  ROUTES
# ────────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok", "version": "17.4.0", "statsmodels": HAS_STATSMODELS, "xgboost": HAS_XGBOOST,
        "engine": "nb2-sarimax-xgboost" if (HAS_STATSMODELS and HAS_XGBOOST) else "sarimax" if HAS_STATSMODELS else "naive-fallback"
    }

@app.get("/pipeline/info")
def pipeline_info():
    return {
        "constants": {
            "test_size_days": TEST_SIZE, "max_daily_bookings": MAX_DAILY_BOOKINGS, "seasonal_period": SEASONAL_PERIOD,
            "net_commission_php": NET_COMMISSION_PHP, "gross_fare_php": GROSS_FARE_PHP, "peak_surcharge_pct": int(PEAK_SURCHARGE * 100),
        },
        "notebook_best_order": "(0,0,1)(0,0,0,7)", "notebook_best_aic": 3216.52, "notebook_wmape": 46.45
    }

@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    if len(req.data) > MAX_OBSERVATIONS: req.data = req.data[-MAX_OBSERVATIONS:]
    if len(req.data) < 14: raise HTTPException(status_code=422, detail=f"Need >=14 obs, got {len(req.data)}.")

    demands, future_dates = [float(o.demand) for o in req.data], _future_dates(req.data[-1].date, req.horizon)
    commission, capacity, agent_cap = req.commission_per_pax, req.max_daily_bookings, req.agent_processing_capacity

    if req.model_mode in ("hybrid", "xgboost") and (HAS_STATSMODELS or HAS_XGBOOST):
        final_preds, ci_lo, ci_hi, nb2_aic, sari_aic, metrics, stages = _run_hybrid(req, demands, future_dates)
        engine = "nb2-sarimax-xgboost" if "XGBoost Ensemble" in stages else "nb2-sarimax" if "SARIMAX Residual Correction" in stages else "naive-fallback"
    elif req.model_mode == "sarimax" and HAS_STATSMODELS:
        train_exog = np.column_stack([[getattr(o, c) for o in req.data] for c in ["is_payday", "is_holiday", "is_weekend", "is_peak_travel_month", "is_school_break", "flight_density_index"]])
        future_exog = np.column_stack([[f[c] for f in [_ph_features(d) for d in future_dates]] for c in ["is_payday", "is_holiday", "is_weekend", "is_peak_travel_month", "is_school_break", "flight_density_index"]])
        res = _run_sarimax(demands, train_exog, future_exog, req.order, req.seasonal_order)
        if res:
            final_preds, ci_lo, ci_hi, nb2_aic, sari_aic = np.maximum(0, np.array(res["mean"])), np.maximum(0, np.array(res["ci_lower"])), np.array(res["ci_upper"]), None, res["aic"]
            metrics, stages, engine = ModelMetrics(aic=sari_aic), ["SARIMAX"], "sarimax"
        else:
            naive = _naive_forecast(demands, future_dates)
            final_preds, ci_lo, ci_hi, nb2_aic, sari_aic, metrics, stages, engine = np.array([x["forecast"] for x in naive]), np.array([x["ci_lower"] for x in naive]), np.array([x["ci_upper"] for x in naive]), None, None, ModelMetrics(), ["Naive Fallback"], "naive-fallback"
    else:
        naive = _naive_forecast(demands, future_dates)
        final_preds, ci_lo, ci_hi, nb2_aic, sari_aic, metrics, stages, engine = np.array([x["forecast"] for x in naive]), np.array([x["ci_lower"] for x in naive]), np.array([x["ci_upper"] for x in naive]), None, None, ModelMetrics(), ["Naive Fallback"], "naive-fallback"

    forecast_list = []
    for i, fd in enumerate(future_dates):
        f = float(final_preds[i])
        rl = _risk_label(f, capacity)
        unmet = max(0.0, f - capacity)
        rev_risk = unmet * (commission + (commission * PEAK_SURCHARGE if rl in ("HIGH", "CRITICAL") else 0.0))
        # Calculates extra staff needed for this specific day
        staff_needed = int(np.ceil(unmet / max(1, agent_cap))) if unmet > 0 else 0
        
        forecast_list.append(ForecastPoint(date=fd, forecast=round(f, 2), ci_lower=round(float(ci_lo[i]), 2), ci_upper=round(float(ci_hi[i]), 2), risk_level=rl, unmet_demand=round(unmet, 2), daily_revenue_risk=round(rev_risk, 2), additional_staff_needed=staff_needed))

    dss = _dss_metrics(list(final_preds), future_dates, capacity, commission, apply_surcharge=True, agent_cap=agent_cap)

    return PredictResponse(
        model_label=f"XoCompass v17.4 NB2-SARIMAX({req.order[0]},{req.order[1]},{req.order[2]})({req.seasonal_order[0]},{req.seasonal_order[1]},{req.seasonal_order[2]},{req.seasonal_order[3]})+XGB",
        nb2_aic=nb2_aic, sarimax_aic=sari_aic, metrics=metrics, forecasts=forecast_list, engine=engine, pipeline_stages_completed=stages,
        potential_revenue=dss["potential_revenue"], capped_revenue=dss["capped_revenue"], revenue_at_risk=dss["revenue_at_risk"],
        critical_days=dss["critical_days"], recommended_capacity=capacity + max(0, dss["critical_days"] // 2),
        total_additional_staff_shifts=dss["total_additional_staff_shifts"]
    )

@app.post("/predict/sarimax", response_model=PredictResponse)
def predict_sarimax_legacy(req: PredictRequest):
    req.model_mode = "sarimax"
    return predict(req)

@app.post("/dss", response_model=DSSResponse)
def dss_recalculate(req: DSSRequest):
    return DSSResponse(**_dss_metrics([float(f.get("forecast", 0)) for f in req.forecasts], [f.get("date", "2025-01-01") for f in req.forecasts], req.daily_capacity, req.commission_per_pax, req.apply_surcharge, req.agent_processing_capacity))

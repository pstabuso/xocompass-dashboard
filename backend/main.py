"""
XoCompass v17.0 â Hybrid Econometric-ML Model Bridge (FastAPI)
===============================================================
Bridges the React frontend (ModelLab.jsx) to the Python pipeline from
XoCompass_v17_Thesis_Pipeline.ipynb.

Architecture (mirrors notebook):
  NB2 Base Model  â  SARIMAX Residual Correction  â  XGBoost Ensemble
  â 90-day holdout evaluation â DSS fleet-risk output

Run:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

Endpoints:
    GET  /health         â liveness + capability check
    POST /predict        â run hybrid forecast (NB2+SARIMAX+XGB)
    POST /predict/sarimax â SARIMAX-only mode (legacy ModelLab compat)
    POST /dss            â fleet risk + revenue DSS layer
    GET  /pipeline/info  â pipeline metadata for frontend display
"""

from __future__ import annotations

import logging
import warnings
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-7s | %(message)s")
log = logging.getLogger("xocompass.api")

# ââ Conditional imports (degrade gracefully) ââââââââââââââââââââââââââââââââ
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

# ââ Pipeline constants (match notebook) ââââââââââââââââââââââââââââââââââââ
MAX_FLEET       = 25          # KJS fleet saturation cap
TEST_SIZE       = 90          # 90-day holdout window
SEASONAL_PERIOD = 7           # Weekly seasonality
TICKET_PRICE_PHP = 1_350.0   # Base ticket price
PEAK_SURCHARGE  = 0.15        # 15% surcharge on HIGH/CRITICAL days
RANDOM_STATE    = 42

# ââ App âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
app = FastAPI(
    title="XoCompass v17.0 Hybrid Model API",
    version="17.0.0",
    description=(
        "NB2 Econometric Base + SARIMAX Residual Correction + XGBoost Ensemble "
        "for KJS International Travel & Tours airline booking demand forecasting."
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


# ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
#  REQUEST / RESPONSE SCHEMAS
# ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

class Observation(BaseModel):
    """One daily data point (matches notebook df_master schema)."""
    date: str                            # "YYYY-MM-DD"
    demand: float                        # y â daily booking count
    is_payday: float = 0.0               # PH payday flag (15th / month-end)
    is_holiday: float = 0.0              # PH public holiday flag
    is_weekend: float = 0.0              # Saturday / Sunday
    is_peak_travel_month: float = 0.0    # Apr, Jul, Nov, Dec
    is_school_break: float = 0.0         # JunâJul + Dec 15+
    flight_density_index: float = 50.0   # Proxy for airport arrivals
    competitor_price_php: float = 1500.0
    fuel_pump_price: float = 55.0


class PredictRequest(BaseModel):
    """Payload from ModelLab.jsx â mirrors notebook train_and_evaluate() inputs."""
    data: list[Observation]
    horizon: int = Field(default=90, ge=1, le=180, description="Forecast horizon in days")
    model_mode: str = Field(
        default="hybrid",
        description="'hybrid' (NB2+SARIMAX+XGB), 'sarimax', or 'xgboost'",
    )
    order: tuple[int, int, int] = (0, 0, 1)              # Notebook best: (0,0,1)
    seasonal_order: tuple[int, int, int, int] = (0, 0, 0, 7)
    max_fleet: int = Field(default=MAX_FLEET, ge=1, le=200)


class ForecastPoint(BaseModel):
    date: str
    forecast: float
    ci_lower: float
    ci_upper: float
    risk_level: str          # "OPTIMAL" | "WARNING" | "HIGH" | "CRITICAL"
    unmet_demand: float
    daily_revenue_risk: float


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
    # DSS summary
    potential_revenue: float
    capped_revenue: float
    revenue_at_risk: float
    critical_days: int
    recommended_fleet: int


class DSSRequest(BaseModel):
    """Lightweight DSS recalculation (fleet what-if scenarios)."""
    forecasts: list[dict]          # List of {date, forecast, risk_level, unmet_demand, ...}
    fleet_size: int = MAX_FLEET
    ticket_price: float = TICKET_PRICE_PHP
    apply_surcharge: bool = True


class DSSResponse(BaseModel):
    potential_revenue: float
    capped_revenue: float
    revenue_at_risk: float
    mitigated_revenue: float       # With surcharge + fleet expansion
    critical_days: int
    high_days: int
    warning_days: int
    optimal_days: int
    top_risk_dates: list[dict]


# ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
#  HELPERS
# ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

def _future_dates(last_date: str, horizon: int) -> list[str]:
    """Generate consecutive calendar dates starting the day after last_date."""
    base = datetime.strptime(last_date, "%Y-%m-%d")
    return [(base + timedelta(days=i + 1)).strftime("%Y-%m-%d") for i in range(horizon)]


def _ph_features(date_str: str) -> dict:
    """Generate Philippine calendar features for a forecast date."""
    d = datetime.strptime(date_str, "%Y-%m-%d")
    is_payday = float(d.day == 15 or d.day == d.replace(day=28).day)
    is_holiday = float(d.month == 11 and d.day == 1)   # All Saints' Day is peak
    is_weekend = float(d.weekday() >= 5)
    is_peak = float(d.month in [4, 7, 11, 12])
    is_school_break = float(d.month in [6, 7] or (d.month == 12 and d.day >= 15))
    return {
        "is_payday": is_payday,
        "is_holiday": is_holiday,
        "is_weekend": is_weekend,
        "is_peak_travel_month": is_peak,
        "is_school_break": is_school_break,
        "flight_density_index": 50.0,
        "competitor_price_php": 1500.0,
        "fuel_pump_price": 55.0,
    }


def _risk_label(forecast: float, fleet: int) -> str:
    ratio = forecast / fleet
    if ratio <= 0.88:
        return "OPTIMAL"
    elif ratio <= 1.0:
        return "WARNING"
    elif ratio <= 1.20:
        return "HIGH"
    else:
        return "CRITICAL"


def _dss_metrics(
    forecasts: list[float],
    future_dates: list[str],
    fleet: int,
    ticket_price: float,
    apply_surcharge: bool,
) -> dict:
    """Compute KJS fleet-risk DSS metrics (mirrors notebook Step 6)."""
    potential_rev = sum(f * ticket_price for f in forecasts)
    capped = [min(f, fleet) for f in forecasts]
    capped_rev = sum(c * ticket_price for c in capped)
    unmet = [max(0, f - fleet) for f in forecasts]
    rev_risk = [u * ticket_price for u in unmet]

    # Surcharge: 15% premium on HIGH/CRITICAL days â reduces unmet, increases yield
    mitigated_rev = capped_rev
    if apply_surcharge:
        for i, f in enumerate(forecasts):
            rl = _risk_label(f, fleet)
            if rl in ("HIGH", "CRITICAL"):
                mitigated_rev += capped[i] * ticket_price * PEAK_SURCHARGE

    risk_labels = [_risk_label(f, fleet) for f in forecasts]
    top_risk = sorted(
        [
            {"date": d, "forecast": round(f, 2), "unmet": round(u, 2), "revenue_risk": round(r, 2)}
            for d, f, u, r in zip(future_dates, forecasts, unmet, rev_risk)
            if u > 0
        ],
        key=lambda x: x["revenue_risk"],
        reverse=True,
    )[:10]

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
    }


# ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
#  NAIVE / SEASONAL FALLBACK (no statsmodels)
# ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

def _naive_forecast(demands: list[float], future_dates: list[str]) -> list[dict]:
    """Seasonal naive: forecast = weighted average of same-DOW historical values."""
    n = len(demands)
    results = []
    for fd in future_dates:
        d = datetime.strptime(fd, "%Y-%m-%d")
        dow = d.weekday()
        # Collect all same-DOW historical values
        pool = [demands[i] for i in range(n) if i % 7 == dow % 7]
        if not pool:
            pool = demands[-7:] if n >= 7 else demands
        # Payday/holiday boost
        feats = _ph_features(fd)
        base = float(np.mean(pool))
        boost = 1.0 + feats["is_payday"] * 0.4 + feats["is_holiday"] * 0.8 + feats["is_peak_travel_month"] * 0.2
        fcast = max(0.0, base * boost)
        std = float(np.std(pool)) if len(pool) > 1 else fcast * 0.25
        ci_margin = 1.96 * std
        results.append({
            "forecast": round(fcast, 2),
            "ci_lower": round(max(0, fcast - ci_margin), 2),
            "ci_upper": round(fcast + ci_margin, 2),
        })
    return results


# ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
#  SARIMAX-ONLY FORECAST (legacy compat + standalone mode)
# ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

def _run_sarimax(
    demands: list[float],
    exog: np.ndarray,
    future_exog: np.ndarray,
    order: tuple,
    seasonal_order: tuple,
) -> dict:
    """Fit SARIMAX and return predictions. Returns dict with model metadata."""
    if not HAS_STATSMODELS:
        return None
    try:
        model = SM_SARIMAX(
            endog=demands,
            exog=exog if exog.shape[1] > 0 else None,
            order=order,
            seasonal_order=seasonal_order,
            enforce_stationarity=False,
            enforce_invertibility=False,
        )
        fit = model.fit(disp=False, maxiter=500, method="cg")
        fc = fit.get_forecast(
            steps=len(future_exog),
            exog=future_exog if exog.shape[1] > 0 else None,
        )
        return {
            "mean": fc.predicted_mean.tolist(),
            "ci_lower": fc.conf_int(alpha=0.05).iloc[:, 0].tolist(),
            "ci_upper": fc.conf_int(alpha=0.05).iloc[:, 1].tolist(),
            "aic": round(float(fit.aic), 2),
            "fitted": fit.fittedvalues.tolist(),
        }
    except Exception as e:
        log.warning("SARIMAX fit failed: %s", e)
        return None


# ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
#  HYBRID PIPELINE (NB2 + SARIMAX + XGBOOST â mirrors notebook Steps 4 & 5)
# ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

def _run_hybrid(req: PredictRequest, demands: list[float], future_dates: list[str]):
    """
    Run the full NB2-SARIMAX-XGBoost hybrid pipeline.
    Falls back to SARIMAX â naive as capabilities degrade.
    """
    stages_completed = []
    exog_cols = [
        "is_payday", "is_holiday", "is_weekend",
        "is_peak_travel_month", "is_school_break",
        "flight_density_index",
    ]

    # Build exog matrices
    train_exog = np.column_stack([
        [getattr(obs, col) for obs in req.data] for col in exog_cols
    ])

    future_feats = [_ph_features(d) for d in future_dates]
    future_exog = np.column_stack([
        [f[col] for f in future_feats] for col in exog_cols
    ])

    # ââ Stage 1: NB2 Base âââââââââââââââââââââââââââââââââââââââââââââââââ
    nb2_aic = None
    nb2_preds = np.array(demands[-len(future_dates):]) if len(demands) >= len(future_dates) else np.zeros(len(future_dates))
    raw_residuals = np.array(demands)

    if HAS_STATSMODELS:
        try:
            train_X_const = sm.add_constant(train_exog, has_constant="add")
            nb2_model = sm.NegativeBinomial(np.array(demands), train_X_const).fit(disp=False)
            nb2_aic = round(float(nb2_model.aic), 2)
            raw_residuals = np.array(demands) - nb2_model.fittedvalues
            # NB2 forecast for future
            future_X_const = sm.add_constant(future_exog, has_constant="add")
            nb2_fc = nb2_model.predict(future_X_const)
            nb2_preds = nb2_fc
            stages_completed.append("NB2 Base")
            log.info("NB2 fit complete. AIC=%.2f, Residual Mean=%.4f", nb2_aic, float(np.mean(raw_residuals)))
        except Exception as e:
            log.warning("NB2 fit failed (%s) â using raw demands as residuals", e)
            stages_completed.append("NB2 Base (fallback)")

    # ââ Stage 2: SARIMAX Residual Correction âââââââââââââââââââââââââââââ
    sarimax_aic = None
    sarimax_correction = np.zeros(len(future_dates))

    sarimax_result = _run_sarimax(
        demands=raw_residuals.tolist(),
        exog=train_exog,
        future_exog=future_exog,
        order=req.order,
        seasonal_order=req.seasonal_order,
    )
    if sarimax_result:
        sarimax_aic = sarimax_result["aic"]
        sarimax_correction = np.array(sarimax_result["mean"])
        stages_completed.append("SARIMAX Residual Correction")
        log.info("SARIMAX correction fit complete. AIC=%.2f", sarimax_aic)

    # Hybrid = NB2 base + SARIMAX correction
    hybrid_preds = np.maximum(0, nb2_preds + sarimax_correction)

    # ââ Stage 3: XGBoost Ensemble Layer ââââââââââââââââââââââââââââââââââ
    final_preds = hybrid_preds
    dw_stat = None

    if HAS_XGBOOST and len(demands) >= 30:
        try:
            # Build lag features for training
            y = np.array(demands)
            lag1 = np.concatenate([[y[0]], y[:-1]])
            lag7 = np.concatenate([y[:7], y[:-7]])
            roll7 = np.array([y[max(0, i-7):i].mean() if i > 0 else y[0] for i in range(len(y))])

            X_train = np.column_stack([train_exog, lag1, lag7, roll7])
            xgb_model = xgb.XGBRegressor(
                n_estimators=500, max_depth=4, learning_rate=0.03,
                subsample=0.85, random_state=RANDOM_STATE,
                eval_metric="rmse", verbosity=0,
            )
            xgb_model.fit(X_train, y)

            # Recursive forecast
            hist_y = list(y[-7:])
            xgb_fc_list = []
            for i, fd in enumerate(future_dates):
                feats = future_feats[i]
                row_exog = np.array([[feats[c] for c in exog_cols]])
                lag1_v = hist_y[-1]
                lag7_v = hist_y[-7] if len(hist_y) >= 7 else hist_y[0]
                roll7_v = np.mean(hist_y[-7:])
                X_row = np.column_stack([row_exog, [[lag1_v, lag7_v, roll7_v]]])
                pred = max(0.0, float(xgb_model.predict(X_row)[0]))
                xgb_fc_list.append(pred)
                hist_y.append(pred)

            xgb_preds = np.array(xgb_fc_list)
            # Ensemble: equal-weight blend
            final_preds = np.maximum(0, (hybrid_preds + xgb_preds) / 2.0)
            stages_completed.append("XGBoost Ensemble")
            log.info("XGBoost recursive forecast complete.")
        except Exception as e:
            log.warning("XGBoost failed (%s) â using NB2+SARIMAX hybrid", e)
            stages_completed.append("XGBoost (fallback to hybrid)")

    # ââ Metrics on in-sample fit âââââââââââââââââââââââââââââââââââââââââ
    metrics = ModelMetrics()
    if sarimax_result and len(sarimax_result.get("fitted", [])) == len(demands):
        residuals = np.array(demands) - np.array(sarimax_result["fitted"])
        rmse = float(np.sqrt(np.mean(residuals ** 2)))
        mae = float(np.mean(np.abs(residuals)))
        total_actual = float(np.sum(np.abs(np.array(demands))))
        wmape = float(np.sum(np.abs(residuals)) / total_actual * 100) if total_actual > 0 else 0.0
        dw_stat = float(durbin_watson(residuals)) if HAS_STATSMODELS else None
        metrics = ModelMetrics(
            wmape=round(wmape, 2),
            mae=round(mae, 2),
            rmse=round(rmse, 2),
            aic=sarimax_aic,
            durbin_watson=round(dw_stat, 4) if dw_stat else None,
        )

    # ââ Build confidence intervals âââââââââââââââââââââââââââââââââââââââââ
    sigma = float(np.std(demands)) * 0.35  # Conservative CI width
    if sarimax_result:
        ci_lo = np.array(sarimax_result["ci_lower"])
        ci_hi = np.array(sarimax_result["ci_upper"])
        # Re-center CIs around final hybrid preds
        ci_width = (ci_hi - ci_lo) / 2.0
        ci_lo = np.maximum(0, final_preds - ci_width)
        ci_hi = final_preds + ci_width
    else:
        ci_lo = np.maximum(0, final_preds - 1.96 * sigma)
        ci_hi = final_preds + 1.96 * sigma

    return final_preds, ci_lo, ci_hi, nb2_aic, sarimax_aic, metrics, stages_completed


# ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
#  ROUTES
# ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "17.0.0",
        "statsmodels": HAS_STATSMODELS,
        "xgboost": HAS_XGBOOST,
        "engine": (
            "nb2-sarimax-xgboost" if (HAS_STATSMODELS and HAS_XGBOOST)
            else "sarimax" if HAS_STATSMODELS
            else "naive-fallback"
        ),
        "max_fleet": MAX_FLEET,
        "ticket_price_php": TICKET_PRICE_PHP,
    }


@app.get("/pipeline/info")
def pipeline_info():
    """Metadata about the 6-stage pipeline for frontend display."""
    return {
        "stages": [
            {"id": 1, "name": "EDA & Feature Engineering",       "technique": "Poisson/NB2 target construction, PH calendar features"},
            {"id": 2, "name": "Collinearity Testing",             "technique": "VIF + Pearson r; threshold VIF < 5.0"},
            {"id": 3, "name": "Stationarity Testing",             "technique": "Augmented Dickey-Fuller; d-order selection"},
            {"id": 4, "name": "SARIMAX Grid-Search CV",           "technique": "Rolling-window CV; AIC parsimony minimization"},
            {"id": 5, "name": "Hybrid Model Training",            "technique": "NB2 base + SARIMAX residual + XGBoost ensemble"},
            {"id": 6, "name": "Decision Support System",          "technique": "Fleet-risk heatmap, revenue waterfall, SWOT recommendations"},
        ],
        "constants": {
            "test_size_days": TEST_SIZE,
            "max_fleet": MAX_FLEET,
            "seasonal_period": SEASONAL_PERIOD,
            "ticket_price_php": TICKET_PRICE_PHP,
            "peak_surcharge_pct": int(PEAK_SURCHARGE * 100),
        },
        "notebook_best_order": "(0,0,1)(0,0,0,7)",
        "notebook_best_aic": 3216.52,
        "notebook_wmape": 46.45,
        "notebook_durbin_watson": 1.8378,
        "kjs_revenue_at_risk_php": 106_511.41,
        "kjs_critical_days": 10,
    }


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    """
    Full hybrid forecast endpoint.
    Mirrors notebook train_and_evaluate() â DSS pipeline.
    """
    if len(req.data) < 14:
        raise HTTPException(
            status_code=422,
            detail=f"Need at least 14 observations, got {len(req.data)}.",
        )

    demands = [float(obs.demand) for obs in req.data]
    future_dates = _future_dates(req.data[-1].date, req.horizon)
    fleet = req.max_fleet

    # ââ Run selected model mode âââââââââââââââââââââââââââââââââââââââââââ
    engine_label = "naive-fallback"

    if req.model_mode in ("hybrid", "xgboost") and (HAS_STATSMODELS or HAS_XGBOOST):
        final_preds, ci_lo, ci_hi, nb2_aic, sarimax_aic, metrics, stages = _run_hybrid(
            req, demands, future_dates
        )
        engine_label = (
            "nb2-sarimax-xgboost" if "XGBoost Ensemble" in stages
            else "nb2-sarimax" if "SARIMAX Residual Correction" in stages
            else "naive-fallback"
        )
    elif req.model_mode == "sarimax" and HAS_STATSMODELS:
        exog_cols = ["is_payday", "is_holiday", "is_weekend", "is_peak_travel_month", "is_school_break", "flight_density_index"]
        train_exog = np.column_stack([[getattr(obs, c) for obs in req.data] for c in exog_cols])
        future_feats = [_ph_features(d) for d in future_dates]
        future_exog = np.column_stack([[f[c] for f in future_feats] for c in exog_cols])
        res = _run_sarimax(demands, train_exog, future_exog, req.order, req.seasonal_order)
        if res:
            final_preds = np.maximum(0, np.array(res["mean"]))
            ci_lo = np.maximum(0, np.array(res["ci_lower"]))
            ci_hi = np.array(res["ci_upper"])
            sarimax_aic = res["aic"]
            nb2_aic = None
            metrics = ModelMetrics(aic=sarimax_aic)
            stages = ["SARIMAX"]
            engine_label = "sarimax"
        else:
            naive = _naive_forecast(demands, future_dates)
            final_preds = np.array([x["forecast"] for x in naive])
            ci_lo = np.array([x["ci_lower"] for x in naive])
            ci_hi = np.array([x["ci_upper"] for x in naive])
            nb2_aic = sarimax_aic = None
            metrics = ModelMetrics()
            stages = ["Naive Seasonal Fallback"]
    else:
        naive = _naive_forecast(demands, future_dates)
        final_preds = np.array([x["forecast"] for x in naive])
        ci_lo = np.array([x["ci_lower"] for x in naive])
        ci_hi = np.array([x["ci_upper"] for x in naive])
        nb2_aic = sarimax_aic = None
        metrics = ModelMetrics()
        stages = ["Naive Seasonal Fallback"]

    # ââ Build ForecastPoint list âââââââââââââââââââââââââââââââââââââââââ
    forecast_list: list[ForecastPoint] = []
    for i, fd in enumerate(future_dates):
        f = float(final_preds[i])
        rl = _risk_label(f, fleet)
        unmet = max(0.0, f - fleet)
        surcharge = TICKET_PRICE_PHP * PEAK_SURCHARGE if rl in ("HIGH", "CRITICAL") else 0.0
        rev_risk = unmet * (TICKET_PRICE_PHP + surcharge)
        forecast_list.append(ForecastPoint(
            date=fd,
            forecast=round(f, 2),
            ci_lower=round(float(ci_lo[i]), 2),
            ci_upper=round(float(ci_hi[i]), 2),
            risk_level=rl,
            unmet_demand=round(unmet, 2),
            daily_revenue_risk=round(rev_risk, 2),
        ))

    # ââ DSS Metrics ââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    dss = _dss_metrics(
        list(final_preds), future_dates, fleet, TICKET_PRICE_PHP, apply_surcharge=True
    )

    model_label = f"XoCompass v17 NB2-SARIMAX({req.order[0]},{req.order[1]},{req.order[2]})({req.seasonal_order[0]},{req.seasonal_order[1]},{req.seasonal_order[2]},{req.seasonal_order[3]})+XGB"

    return PredictResponse(
        model_label=model_label,
        nb2_aic=nb2_aic,
        sarimax_aic=sarimax_aic,
        metrics=metrics,
        forecasts=forecast_list,
        engine=engine_label,
        pipeline_stages_completed=stages,
        potential_revenue=dss["potential_revenue"],
        capped_revenue=dss["capped_revenue"],
        revenue_at_risk=dss["revenue_at_risk"],
        critical_days=dss["critical_days"],
        recommended_fleet=fleet + max(0, dss["critical_days"] // 2),  # Suggest 1 extra unit per 2 critical days
    )


@app.post("/predict/sarimax", response_model=PredictResponse)
def predict_sarimax_legacy(req: PredictRequest):
    """Legacy endpoint â routes to full predict() with sarimax mode."""
    req.model_mode = "sarimax"
    return predict(req)


@app.post("/dss", response_model=DSSResponse)
def dss_recalculate(req: DSSRequest):
    """
    Fleet what-if DSS endpoint.
    Frontend can call this after /predict to recalculate revenue metrics
    with different fleet sizes or pricing scenarios.
    """
    forecasts = [float(f.get("forecast", 0)) for f in req.forecasts]
    future_dates = [f.get("date", "2025-01-01") for f in req.forecasts]

    dss = _dss_metrics(
        forecasts, future_dates,
        req.fleet_size, req.ticket_price, req.apply_surcharge
    )
    return DSSResponse(**dss)

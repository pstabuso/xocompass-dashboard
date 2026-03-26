"""
XoCompass — SARIMAX Model Bridge (FastAPI Microservice)
Phase 2: Connects the React frontend to a real Python SARIMAX pipeline.

Run:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

The frontend calls POST /predict with historical booking data + exogenous vars.
This service fits a SARIMAX model and returns 12-month forecasts with CIs.
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import numpy as np
import time
import collections
from typing import Optional

# ── Simple in-process rate limiter ──────────────────────────────────────
_RATE_LIMIT_CALLS = 10       # max requests
_RATE_LIMIT_WINDOW = 60      # per N seconds
_rate_buckets: dict[str, collections.deque] = {}

def _check_rate_limit(client_ip: str) -> None:
    now = time.monotonic()
    bucket = _rate_buckets.setdefault(client_ip, collections.deque())
    # Drop timestamps outside the window
    while bucket and now - bucket[0] > _RATE_LIMIT_WINDOW:
        bucket.popleft()
    if len(bucket) >= _RATE_LIMIT_CALLS:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded: max {_RATE_LIMIT_CALLS} requests per {_RATE_LIMIT_WINDOW}s.",
        )
    bucket.append(now)

# ── Conditional statsmodels import ──────────────────────────────────────
# Falls back to a naive seasonal forecast if statsmodels is not installed.
try:
    from statsmodels.tsa.statespace.sarimax import SARIMAX as SM_SARIMAX
    HAS_STATSMODELS = True
except ImportError:
    HAS_STATSMODELS = False

app = FastAPI(
    title="XoCompass SARIMAX Engine",
    version="1.0.0",
    description="Lightweight bridge between the React dashboard and the Python statistical backend.",
)

# ── CORS: allow the Vite dev server and Vercel production ───────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",       # Vite dev
        "http://localhost:4173",       # Vite preview
        "https://paotabs.vercel.app",    # Production
    ],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


# ── Request / Response Schemas ──────────────────────────────────────────

class Observation(BaseModel):
    """One monthly data point."""
    date: str                       # "YYYY-MM"
    demand: float                   # Booking volume (target Y)
    rainfall: float = 0.0           # Exogenous X1
    holiday: int = 0                # Exogenous X2


class PredictRequest(BaseModel):
    """Payload sent from ModelLab.jsx."""
    data: list[Observation]         # Historical monthly records
    horizon: int = Field(default=12, ge=1, le=36)  # Months to forecast
    order: tuple[int, int, int] = (1, 1, 1)         # ARIMA (p,d,q)
    seasonal_order: tuple[int, int, int, int] = (1, 1, 1, 12)  # (P,D,Q,s)


class ForecastPoint(BaseModel):
    date: str
    forecast: float
    ci_lower: float
    ci_upper: float


class PredictResponse(BaseModel):
    model: str
    aic: Optional[float] = None
    rmse: Optional[float] = None
    forecasts: list[ForecastPoint]
    engine: str  # "statsmodels" or "naive-fallback"


# ── Health Check ────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "statsmodels": HAS_STATSMODELS,
        "engine": "statsmodels" if HAS_STATSMODELS else "naive-fallback",
    }


# ── Naive Seasonal Fallback ────────────────────────────────────────────

def _naive_forecast(
    demands: list[float],
    horizon: int,
    season: int = 12,
) -> list[dict]:
    """Simple seasonal naive: forecast = average of same-month historical values."""
    n = len(demands)
    results = []
    for h in range(1, horizon + 1):
        # Collect all values at the same seasonal position
        pool = [demands[i] for i in range(n) if (n - i) % season == h % season]
        if not pool:
            pool = demands[-season:] if n >= season else demands
        mean = float(np.mean(pool))
        std = float(np.std(pool)) if len(pool) > 1 else mean * 0.2
        results.append({
            "forecast": round(max(0, mean), 1),
            "ci_lower": round(max(0, mean - 1.96 * std), 1),
            "ci_upper": round(mean + 1.96 * std, 1),
        })
    return results


# ── Main Prediction Endpoint ────────────────────────────────────────────

@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest, request: Request):
    _check_rate_limit(request.client.host)
    if len(req.data) < 24:
        raise HTTPException(
            status_code=422,
            detail=f"Need at least 24 observations, got {len(req.data)}.",
        )

    demands = [obs.demand for obs in req.data]
    exog = np.column_stack([
        [obs.rainfall for obs in req.data],
        [obs.holiday for obs in req.data],
    ])

    # Generate future month labels
    last_date = req.data[-1].date  # "YYYY-MM"
    year, month = int(last_date[:4]), int(last_date[5:7])
    future_dates = []
    for _ in range(req.horizon):
        month += 1
        if month > 12:
            month = 1
            year += 1
        future_dates.append(f"{year}-{month:02d}")

    model_name = (
        f"SARIMAX({req.order[0]},{req.order[1]},{req.order[2]})"
        f"({req.seasonal_order[0]},{req.seasonal_order[1]},"
        f"{req.seasonal_order[2]},{req.seasonal_order[3]})"
    )

    # ── Try real SARIMAX ────────────────────────────────────────────────
    if HAS_STATSMODELS:
        try:
            model = SM_SARIMAX(
                endog=demands,
                exog=exog,
                order=req.order,
                seasonal_order=req.seasonal_order,
                enforce_stationarity=False,
                enforce_invertibility=False,
            )
            fit = model.fit(disp=False, maxiter=200)

            # Future exogenous: use historical averages per month
            future_exog = []
            for fd in future_dates:
                m = int(fd[5:7])
                same_month = [
                    obs for obs in req.data
                    if int(obs.date[5:7]) == m
                ]
                avg_rain = np.mean([o.rainfall for o in same_month]) if same_month else 0
                avg_hol = round(np.mean([o.holiday for o in same_month])) if same_month else 0
                future_exog.append([avg_rain, avg_hol])
            future_exog = np.array(future_exog)

            fc = fit.get_forecast(steps=req.horizon, exog=future_exog)
            pred_mean = fc.predicted_mean
            ci = fc.conf_int(alpha=0.05)

            # In-sample RMSE
            in_sample = fit.fittedvalues
            residuals = np.array(demands) - in_sample
            rmse = float(np.sqrt(np.mean(residuals**2)))

            forecasts = [
                ForecastPoint(
                    date=future_dates[i],
                    forecast=round(max(0, float(pred_mean.iloc[i])), 1),
                    ci_lower=round(max(0, float(ci.iloc[i, 0])), 1),
                    ci_upper=round(float(ci.iloc[i, 1]), 1),
                )
                for i in range(req.horizon)
            ]

            return PredictResponse(
                model=model_name,
                aic=round(float(fit.aic), 2),
                rmse=round(rmse, 2),
                forecasts=forecasts,
                engine="statsmodels",
            )
        except Exception as e:
            # Fall through to naive if SARIMAX fails to converge
            print(f"[WARN] SARIMAX fit failed: {e}. Using naive fallback.")

    # ── Naive Fallback ──────────────────────────────────────────────────
    naive = _naive_forecast(demands, req.horizon)
    forecasts = [
        ForecastPoint(date=future_dates[i], **naive[i])
        for i in range(req.horizon)
    ]

    return PredictResponse(
        model=model_name,
        aic=None,
        rmse=None,
        forecasts=forecasts,
        engine="naive-fallback",
    )

# XoCompass Dashboard

XoCompass is a React + Vite thesis workspace and forecasting dashboard for managing team operations, datasets, and an airline booking demand pipeline.

The app combines:
- a collaborative project workspace
- role-based access control
- Supabase-backed sync with local/offline fallback
- a Data Hub for dataset registration
- a Model Lab for airline booking demand forecasting and DSS analysis

## Core modules

- **Overview / Dashboard** — high-level workspace summary
- **Task Tracker** — task CRUD, comments, subtasks, nudges
- **Calendar & Schedule** — event planning and tracking
- **Minutes** — meeting records
- **Data Hub** — dataset metadata plus session-available files
- **Defense Prep / Resources** — thesis support pages
- **SARIMAX Lab / Model Lab** — staged forecasting pipeline and DSS views
- **Admin Panel** — user role management, notifications, activity logs

## Tech stack

- React 19
- Vite / Rolldown Vite
- React Router
- Tailwind CSS
- Recharts
- Supabase JS
- Lucide React

See dependencies in `package.json`. The frontend uses React Router, Supabase, and Recharts directly from the app shell and page modules.

## How the app is structured

### App shell

`src/App.jsx`
- wires routes
- renders sidebar and onboarding
- applies route guards
- shows sync/session/offline UI states

### Global app state

`src/context/AppContext.jsx`
- auth state
- task/event/minutes/dataset/activity/notification CRUD
- localStorage mirroring
- retry queue for failed cloud writes
- Supabase hydration and realtime subscriptions
- role-aware notifications and access requests

### Dataset file registry

`src/context/DatasetFileContext.jsx`
- stores uploaded `File` objects in memory for the current session
- lets Data Hub and Model Lab share session-available files

Important limitation:
- dataset **metadata** persists
- uploaded file **contents do not persist across refreshes**
- after refresh, files must be re-uploaded to be usable again in Model Lab

### Model Lab

Main files:
- `src/pages/ModelLab.jsx`
- `src/model-lab/hooks/useModelLabController.js`
- `src/model-lab/services/forecastService.js`
- `src/model-lab/services/dssService.js`
- `src/lib/sarimax-api.js`
- `src/model-lab/domain/*`

Pipeline stages currently surfaced in the UI:
1. Data ingestion
2. Collinearity
3. Stationarity
4. Grid search
5. Hybrid training
6. DSS dashboard
7. Algorithm lab

The frontend checks a Python forecasting backend, converts monthly booking aggregates into daily observations, calls the backend for prediction, then renders forecast and DSS outputs.

## Environment variables

Create a `.env` file in the project root.

### Required for cloud sync

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Required for Model Lab backend

```env
VITE_SARIMAX_API_URL=http://localhost:8000
```

If Supabase variables are missing, the app falls back to localStorage-only mode.

## Local development

Install dependencies:

```bash
npm install
```

Run the frontend:

```bash
npm run dev
```

Build production assets:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Python forecasting backend

The Model Lab expects a backend reachable at `VITE_SARIMAX_API_URL`.

The frontend currently calls these endpoints:
- `GET /health`
- `GET /pipeline/info`
- `POST /predict`
- `POST /predict/sarimax`
- `POST /dss`

A common local command referenced in the UI is:

```bash
uvicorn main:app --reload --port 8000
```

## Supabase expectations

The frontend expects these tables to exist:
- `profiles`
- `tasks`
- `events`
- `minutes`
- `datasets`
- `activity_log`
- `notifications`

The app assumes Row Level Security is enforced in Supabase.

## Roles and access

Defined roles live in `src/auth/domain/roles.js`:
- `pm`
- `backend`
- `frontend`
- `guest`
- `restricted`

Notes:
- the canonical PM email is currently hard-coded as `pstabuso@fit.edu.ph`
- guests are view-only on selected routes
- restricted users have minimal access
- blocked actions can trigger access-request notifications to the PM

## Data Hub and Model Lab behavior

The Data Hub accepts several file extensions for registration:
- `.csv`
- `.tsv`
- `.txt`
- `.json`
- `.xlsx`
- `.xls`

Current Model Lab ingestion is narrower:
- Model Lab currently loads **CSV datasets only** from Data Hub
- direct upload in Model Lab also expects CSV content

So Data Hub may hold dataset metadata for many file types, but only session-available CSV files are loadable into Model Lab in the current implementation.

## Known limitations

- README had previously been the default Vite template; this file now documents the actual project.
- Dataset files are session-only and are not yet persisted to object storage or IndexedDB.
- Model Lab stages 2 to 4 are lighter in UI depth than ingestion, training, and DSS stages.
- The app is currently optimized around a specific airline booking demand workflow.

## Suggested next improvements

- persist uploaded dataset files via Supabase Storage or IndexedDB
- move large sections of `AppContext.jsx` into smaller domain stores
- surface richer statistical outputs for VIF, stationarity, and grid search
- externalize business constants and operational thresholds
- replace single-email PM override with role-based admin assignment in profile data

## Repository notes

If you are onboarding into this repo, start with these files:
- `src/App.jsx`
- `src/context/AppContext.jsx`
- `src/pages/DataHub.jsx`
- `src/pages/ModelLab.jsx`
- `src/model-lab/hooks/useModelLabController.js`
- `src/lib/sarimax-api.js`
- `src/lib/supabase.js`

That set covers most of the application architecture and the forecasting flow.

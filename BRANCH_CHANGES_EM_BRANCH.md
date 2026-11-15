# BioTelemetry Branch Documentation: em-branch vs. master

**Event:** NASA Space Apps Challenge 2026  
**Challenge:** Create Health Monitoring Software for Astronauts on Space Missions  
**Target Branch:** `em-branch`  
**Base Branch:** `master` (and `origin/master`)

---

## Executive Summary

The `em-branch` extends the base BioTelemetry frontend and minimal backend from `master` into an integrated, spaceflight-ready platform. It establishes end-to-end connectivity between the React Progressive Web App (PWA) and the Python FastAPI backend, introduces live NASA DONKI space weather tracking, deploys a multi-hazard diagnostic engine grounded in NASA Open Science Data Repository (OSDR) baselines, and implements clean, responsive user experience refinements across all primary application pages.

---

## High-Level Comparison Matrix

| Capability / Area | master (Base) | em-branch (Current) |
|---|---|---|
| Overall Health Index | Buried inside diagnostics modal; no home card | Prominently displayed on Dashboard as Overall Mission Readiness Index (0 to 100) |
| Diagnostic Analysis | 4 basic rules (hypoxia, tachycardia, bradycardia, radiation) | 6 spaceflight hazard domains with clinical countermeasures grounded in NASA OSDR baselines |
| Space Weather | Unconnected UI placeholder | Live NASA DONKI API integration (Kp index, storm level G0-G5, flare class C/M/X) |
| Flight Assistant | Local regex simulation only | Connected to FastAPI `/assistant/ask` with live telemetry strip, OSDR references, and onboard fallback |
| Check-In Storage | IndexedDB local storage only | Automatic background synchronization to `/wellness/checkins` with privacy safeguards |
| Check-In Layout | Narrow centered container (850px) with empty side void | Responsive 2-column layout with auto-attached live biometrics sidebar and leveled cards |
| Dashboard Alignment | Disclosures split awkwardly between column and full width | Unified left-column alignment and 22px vertical panel spacing |
| Daily Activities | Progress bar restricted to 600px width | Full-width responsive progress bar matching activity grid |
| AI Assistant Page | Chat container capped at 950px | Full-width clinical consultation view with responsive suggestion chips |
| Backend Python Stack | Failed installation on Windows due to PyYAML compile error | Fixed requirements.txt to pure-Python uvicorn, ensuring zero C++ compiler dependency |

---

## Detailed Backend Modifications

### 1. New API Routes
- **`backend/app/routes/assistant.py`:**
  - Implements `POST /api/v1/assistant/ask`
  - Accepts astronaut telemetry, metabolic entries, mood/fatigue scores, and mission day.
  - Queries clinical protocols or Google Gemini and returns structured summary, recommended actions, escalation criteria, and NASA reference citations.
- **`backend/app/routes/space_weather.py`:**
  - Implements `GET /api/v1/space-weather/live` for live CCMC DONKI geomagnetic storm and solar flare telemetry with 5-minute TTL caching.
  - Implements `GET /api/v1/space-weather/iss` for ISS orbital position, velocity, and daylight/eclipsed/SAA transit phase calculation.
- **`backend/app/routes/wellness.py`:**
  - Implements `POST /api/v1/wellness/checkins` for syncing astronaut check-ins with Supabase or in-memory fallback.
  - Implements `GET /api/v1/wellness/checkins/{astronaut_id}` for historical check-in retrieval.
  - Implements `POST /api/v1/wellness/assessments` and `GET /api/v1/wellness/assessments/{astronaut_id}` for medical self-exam logs.

### 2. Enhanced API Routes
- **`backend/app/routes/diagnostics.py`:**
  - Upgraded `/diagnostics/analyze` to evaluate 6 NASA spaceflight hazard domains:
    1. Radiation and Space Weather (SPE/GCR/SAA trapped protons)
    2. SANS and Cephalad Fluid Shift (optic sheath & intracranial pressure)
    3. Bone and Muscle Deconditioning (skeletal unloading & ARED loading)
    4. Cardiovascular and Orthostatic Strain (plasma volume drift)
    5. Closed-Loop Atmosphere and Thermal Stress (hypoxia, CO2, core temperature)
    6. Distance, Latency, and Circadian Disruption (sleep architecture & comms lag)
- **`backend/app/routes/telemetry.py`:**
  - Expanded `/telemetry/latest` to incorporate simulated mission zone (`LEO_ISS`, `DEEP_SPACE`, `LUNAR_GATEWAY`, `MARS_TRANSIT`), orbital phase, and cumulative radiation dose (mSv).
- **`backend/app/routes/alerts.py`:**
  - Added alert deduplication and the `/alerts/ack-all` endpoint to batch-acknowledge active crew alarms.
- **`backend/app/main.py`:**
  - Registered all new routers under `/api/v1`.

### 3. Backend Services and Analytical Engines
- **`backend/app/services/analyzer.py`:**
  - Added `compute_space_environment_risks()` executing the 6-domain spaceflight diagnostic evaluation.
- **`backend/app/services/donki_service.py`:**
  - Asynchronous client fetching from NASA Goddard Space Flight Center DONKI web services.
  - Maps Kp index to NOAA space weather storm levels (G0_QUIET to G5_EXTREME).
- **`backend/app/services/nasa_baselines.py`:**
  - Mathematical model of the South Atlantic Anomaly (AP8 model contour at ~420 km altitude) to detect when spacecraft enters elevated trapped proton zones.
  - Computes orbital daylight, eclipse, and high-latitude phases.
- **`backend/app/services/assistant_service.py`:**
  - Formulates clinical advice grounded in NASA Human Research Program (HRP) protocols and OSDR studies.
- **`backend/app/services/supabase_sync.py`:**
  - Resilient database insertion layer with column-fallback detection if remote tables have varying schemas.

### 4. Pydantic Schemas
- Created `schemas/assistant.py`, `schemas/space_weather.py`, and `schemas/wellness.py`.
- Extended `schemas/telemetry.py` with mission environment fields, cumulative radiation dose, and health index.
- Extended `schemas/diagnostic.py` with `environment_risks` list.

### 5. Dependency Management
- **`backend/requirements.txt`:** Changed `uvicorn[standard]` to `uvicorn>=0.29.0`. This eliminates dependencies on `watchfiles` and `PyYAML`, allowing the server to install and run immediately on Windows environments without requiring Microsoft C++ Build Tools.

---

## Detailed Frontend Modifications

### 1. User Interface and Visual Refinements
- **Overall Mission Readiness Index (`App.tsx`, `index.css`):**
  - Added a dedicated health index card on the home dashboard displaying an overall 0 to 100 score, status pill (NOMINAL / STRAINED / CRITICAL), and explanatory text.
- **Panel Spacing & Alignment (`App.tsx`, `index.css`):**
  - Resolved the 0px margin defect between Readiness Index and "Things to review" by applying `margin-bottom: 22px` to both `.health-score-panel` and `.observation-panel`.
  - Moved `SpaceEnvironmentPanel` and `Mission details and simulation tools` inside the primary left column, giving all three expandable disclosure dropdowns identical widths and left/right margin alignment.
- **Check-In Page 2-Column Redesign (`CheckInPage.tsx`, `index.css`):**
  - Converted the single centered 850px container into an ergonomic 2-column grid (`minmax(0, 1fr) 310px` on desktop, responsive single-column on mobile).
  - Left column: Contains the 3-step check-in wizard flush with the page title.
  - Right column: Companion sidebar featuring "Auto-Attached Vitals" (displaying live pulse, SpO2, core temp, radiation rate captured upon submission) and a "Draft & History" status card.
  - Applied `align-items: start;` and relocated the draft status message to ensure both columns start at the exact same horizontal level.
- **Daily Activities Completion Bar (`MissionsPage.tsx`, `index.css`):**
  - Removed the `max-width: 600px` limitation on `.activity-progress` so the "Today's completion" progress bar spans the full width of the activities layout.
- **AI Assistant Full-Width Consultation View (`AIPage.tsx`, `index.css`):**
  - Expanded `.assistant-layout.assistant-focused` to `100%` width.
  - Reconfigured the suggested questions container into an auto-fitting responsive grid (`repeat(auto-fit, minmax(280px, 1fr))`).

### 2. Frontend Services and Hooks
- **`frontend/src/services/api.ts`:**
  - Added typed methods: `fetchSpaceWeather`, `fetchIssPosition`, `askFlightAssistantApi`, `syncCheckInRemote`, `fetchWellnessCheckIns`, `fetchTelemetryHistory`, and `acknowledgeAllAlerts`.
- **`frontend/src/hooks/useSpaceWeather.ts`:**
  - New React hook that queries `/space-weather/live` with automatic 5-minute cache management and graceful offline handling.
- **`frontend/src/services/ai.ts`:**
  - Added `flightAssistant` service that routes queries to the FastAPI `/assistant/ask` endpoint, feeding live telemetry and privacy-safe metadata, with fallback to local rules if offline.
- **`frontend/src/services/checkins.ts`:**
  - Integrated asynchronous background synchronization to `/wellness/checkins` upon check-in submission.
- **`frontend/src/hooks/useTelemetry.ts`:**
  - Enhanced simulation generator to calculate cumulative radiation dose, mission elapsed day, mission zone, and overall health index.
- **`frontend/src/types/telemetry.ts` and `frontend/src/types/wellness.ts`:**
  - Added `SpaceEnvironmentRisk`, `MetabolicCheckIn`, `SelfExamType`, `ImageAssessmentRecord`, and space weather interfaces.

---

## Challenge Requirement Verification

| NASA Challenge Requirement | How em-branch Fulfills It |
|---|---|
| "Gathers health indicators" | Monitors real-time cardiac signals (ECG, HR, HRV), respiratory rate, blood oxygen (SpO2), core temperature, blood glucose proxy, ambient radiation rates, and structured daily check-ins. |
| "Enables astronauts to evaluate status" | Surfaces the Overall Mission Readiness Index on the dashboard, visual alert banners with severity indicators, multi-metric trend charts, and the 6-domain spaceflight hazard diagnostic report. |
| "Enables astronauts to act on status" | The diagnostic engine pairs every detected anomaly with specific clinical countermeasures; the Flight Surgeon AI provides guided escalation steps; the Daily Activities system offers targeted physical, sleep, and emotional countermeasure routines. |
| "Space radiation" | Environmental radiation rate monitoring, cumulative mission radiation dose tracking (mSv), SAA trapped proton detection, and live NASA DONKI solar storm alerts. |
| "Isolation and confinement" | Structured self-reports for isolation (1-5), social connection (1-5), and emotional well-being (1-5) tracked over time with trend analysis. |
| "Altered gravity & bone loss" | Microgravity exposure tracking, resistive exercise minute logging, and SANS cephalad fluid shift risk modeling. |
| "Cardiovascular events" | Continuous 60 FPS Lead-II ECG waveform, real-time tachycardia/bradycardia triage, and resting heart rate baseline comparison. |
| "Long missions responsibility" | Offline-first Progressive Web App architecture functioning during Loss of Signal (LOS) comms blackouts with automatic synchronization upon signal reacquisition. |

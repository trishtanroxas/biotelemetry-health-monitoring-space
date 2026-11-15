# NASA Space Apps Challenge: Astronaut Biotelemetry & Health Monitoring Platform

An ultra-lightweight, offline-first Progressive Web App (PWA) and Serverless FastAPI monitoring platform designed for real-time astronaut biometric telemetry, spaceflight hazard evaluation, and autonomous medical self-action during long-duration space missions.

---

## Challenge Brief

**Challenge:** Create Health Monitoring Software for Astronauts on Space Missions  
Long-duration missions expose astronauts to space radiation, isolation and confinement, altered gravity, and a hostile closed environment, which can bring immune changes, bone loss, cardiovascular events, and behavioral health problems. On long missions, astronauts carry much of the responsibility for spotting these changes in themselves. This platform gathers health indicators and enables astronauts to evaluate and act on the status of their health.

---

## Key Capabilities

### 1. Overall Mission Readiness Index
- Direct glanceable health index (0 to 100) on the home dashboard.
- Evaluates real-time pulse rate, blood oxygen saturation (SpO2), heart rate variability (HRV) autonomic pacing, and ambient radiation dose rates against calibrated NASA biomedical limits.
- Color-coded status badges: NOMINAL, STRAINED, CRITICAL.

### 2. Autonomous Multi-Hazard Diagnostic Engine
- Evaluates six distinct spaceflight hazard domains grounded in NASA Open Science Data Repository (OSDR) physiological baselines:
  - **Radiation and Space Weather:** Solar Particle Events (SPE), Galactic Cosmic Rays (GCR), and South Atlantic Anomaly (SAA) trapped proton fluxes.
  - **SANS and Cephalad Fluid Shift:** Spaceflight-Associated Neuro-ocular Syndrome, optic nerve sheath distension, and intracranial pressure index.
  - **Bone and Muscle Deconditioning:** Microgravity skeletal unloading load index and resistive exercise tracking.
  - **Cardiovascular and Orthostatic Intolerance:** Plasma volume drift, resting heart rate elevations, and autonomic fatigue.
  - **Closed-Loop Atmosphere and Thermal Stress:** Hypoxia risk, carbon dioxide hypercapnia, core temperature regulation, and suit pressure.
  - **Distance, Latency, and Circadian Disruption:** Deep-space signal latency, circadian sleep architecture, and social isolation.
- Every diagnostic evaluation yields explicit, actionable countermeasures enabling astronauts to act autonomously.

### 3. NASA DONKI Space Weather Integration
- Direct integration with NASA Space Weather Database of Notifications, Knowledge, Information (DONKI) API.
- Live tracking of planetary Kp index, geomagnetic storm classifications (G0 to G5), solar flare classes (C, M, X), and radiation storm alerts.
- Calibrated historical prior fallbacks during communications blackout.

### 4. 60 FPS Real-Time Electrocardiogram (ECG)
- Hardware-accelerated HTML5 canvas rendering of Lead II P-Q-R-S-T cardiac waveform without React re-render overhead.
- Supports variable heart rate visualization and API sample streaming.

### 5. 3-Step Guided Check-In with Auto-Attached Telemetry
- Structured daily reporting covering:
  - Sleep duration, perceived sleep quality, tiredness/fatigue, and UTC sleep/wake circadian timing.
  - Stress rating, mood selector, and symptom notes.
  - Physical exercise duration, pain intensity (0 to 10 scale), and social connection self-reports.
- Companion sidebar auto-captures and links live biometric telemetry (heart rate, SpO2, core temp, ambient radiation rate) to the record upon submission.
- Continuously autosaves drafts locally per astronaut profile.

### 6. Flight Surgeon AI Assistant
- Clinical assistant interface grounded in live numeric vitals, space weather telemetry, and NASA OSDR research baselines.
- Provides factual telemetry summaries, clinical explanations, and escalation triggers.
- Privacy-safe: omits personal free-text reflections, discomfort notes, and private symptoms from assistant payloads.
- Operates with onboard rule-based fallbacks during offline loss-of-signal periods.

### 7. Offline-First Architecture & Loss of Signal (LOS) Buffer
- Uses Dexie.js (IndexedDB) and Service Workers (vite-plugin-pwa) for zero-connectivity mission operation.
- Telemetry buffer automatically queues readings during comms blackouts and synchronizes batches to the backend upon signal reacquisition.

### 8. Spaceflight Accessibility (WCAG 2.1)
- Color-blind safe indicator system pairing icons with clear textual severity tags.
- High-contrast mode toggle optimized for helmet visor readability.
- Screen reader assertive live region notifications for critical medical alarms.
- Synthesized Web Audio API alarms for off-screen hazard awareness.

---

## Project Architecture

```
biotelemetry-health-monitoring-space/
├── api/
│   └── index.py               # Vercel serverless Python adapter (Mangum)
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI application entry & CORS middleware
│   │   ├── core/              # Configuration & Supabase client initialization
│   │   ├── data/              # Clinical baselines, orbital ephemeris, and DONKI priors
│   │   ├── routes/            # REST API endpoints:
│   │   │   ├── alerts.py         # Anomaly alerts & acknowledgments
│   │   │   ├── assistant.py      # Flight Surgeon AI consultation
│   │   │   ├── astronauts.py     # Crew profile management
│   │   │   ├── diagnostics.py    # Multi-hazard diagnostic analysis
│   │   │   ├── space_weather.py  # Live DONKI & ISS ephemeris
│   │   │   ├── telemetry.py      # Real-time vitals & sync-batch
│   │   │   └── wellness.py       # Check-in persistence & sync
│   │   ├── schemas/           # Pydantic data validation models
│   │   └── services/          # Analytical & simulation engines
│   │       ├── analyzer.py       # 6-hazard spaceflight analyzer
│   │       ├── assistant_service.py # Flight Surgeon AI engine
│   │       ├── donki_service.py  # CCMC DONKI space weather client
│   │       ├── nasa_baselines.py # ISS orbital & SAA proton flux model
│   │       ├── simulator.py      # Calibrated biometric generator
│   │       └── supabase_sync.py  # Database replication with schema fallback
│   ├── requirements.txt       # Python dependencies (pure-Python uvicorn)
│   ├── run.py                 # Local server runner
│   └── supabase_schema.sql    # PostgreSQL schema
│
├── frontend/
│   ├── src/
│   │   ├── components/        # ECGMonitor, VitalCard, AlertBanner, DiagnosticsModal, SpaceEnvironment
│   │   ├── db/localDb.ts      # IndexedDB offline buffer (Dexie.js)
│   │   ├── hooks/             # useTelemetry, useWellness, useEnvironment, useSpaceWeather
│   │   ├── pages/             # Dashboard, CheckInPage, AnalyticsPage, MissionsPage, AIPage
│   │   ├── services/          # REST client, checkins, drafts, ai, missions, environment
│   │   ├── types/             # Telemetry, wellness, space wellness type definitions
│   │   └── App.tsx            # Main application shell & routing
│   ├── vite.config.ts         # PWA Service Worker & proxy configuration
│   └── package.json           # Frontend dependencies & scripts
│
└── vercel.json                # Cloud deployment configuration
```

---

## Quickstart

### 1. Start the Backend API (FastAPI)

```powershell
# From project root
python -m venv venv

# On Windows:
.\venv\Scripts\activate
# On macOS/Linux:
# source venv/bin/activate

pip install -r backend/requirements.txt
python backend/run.py
```

- API Server: `http://localhost:8000`
- Swagger Documentation: `http://localhost:8000/docs`

### 2. Start the Frontend PWA (React + Vite)

```powershell
cd frontend
npm install
npm run dev
```

- Application URL: `http://localhost:5173`

---

## API Endpoints Summary

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | API status and version |
| GET | `/api/v1/astronauts` | Crew members list and baseline profiles |
| GET | `/api/v1/telemetry/latest` | Real-time biometric vitals and orbital phase |
| GET | `/api/v1/telemetry/history` | Historical telemetry samples buffer |
| POST | `/api/v1/telemetry/sync-batch` | Offline IndexedDB batch synchronization |
| GET | `/api/v1/alerts` | Active medical and environmental alerts |
| POST | `/api/v1/alerts/{id}/ack` | Acknowledge single alert |
| POST | `/api/v1/alerts/ack-all` | Acknowledge all active alerts for crew |
| POST | `/api/v1/diagnostics/analyze` | Comprehensive 6-domain spaceflight diagnostic evaluation |
| GET | `/api/v1/space-weather/live` | Live NASA DONKI geomagnetic and solar flare feed |
| GET | `/api/v1/space-weather/iss` | Live ISS orbital tracking and day/night phase |
| POST | `/api/v1/assistant/ask` | Flight Surgeon AI consultation grounded in telemetry |
| POST | `/api/v1/wellness/checkins` | Daily wellness check-in record synchronization |
| GET | `/api/v1/wellness/checkins/{id}` | Retrieve historical check-ins for astronaut |

---

## Database Configuration (Optional)

The backend includes a graceful in-memory and local mock mode. If Supabase is configured, data persists to PostgreSQL:

1. Create a project at [supabase.com](https://supabase.com).
2. Execute `backend/supabase_schema.sql` in the Supabase SQL Editor.
3. Configure your `.env` file:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-anon-key
   NASA_API_KEY=DEMO_KEY
   GEMINI_API_KEY=your-gemini-key
   ```

---

## License

Developed for the NASA Space Apps Challenge 2026. Distributed under the MIT License.

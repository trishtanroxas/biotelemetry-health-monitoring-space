# BioTelemetry: Monitoring Human Health Beyond Earth

> An offline-first **Progressive Web App (PWA)** and **FastAPI Serverless** platform built for the **NASA Space Apps Challenge**, delivering continuous crew biotelemetry, geophysical and heliophysical hazard modeling, guided self-exams, and autonomous onboard clinical decision support across orbital and deep-space missions.

---

## Project Overview

Deep-space and orbital human missions expose crew members to overlapping physiological stressors while increasing one-way communication latency from milliseconds in Low Earth Orbit (LEO) to over 12 minutes at Mars. BioTelemetry is engineered to function as an **autonomous medical edge node**: crew habitats, EVA suits, and flight surgeons retain full monitoring, triage, and simulation capabilities even during complete Loss of Signal (LOS) or without external cloud API keys.

The platform aligns biometric monitoring, subjective crew check-ins, daily countermeasure routines, and space-weather feeds directly with NASA's five core human spaceflight hazard domains:

1. **Space Radiation** (Galactic Cosmic Rays, Solar Particle Events, geomagnetic storms, and South Atlantic Anomaly trapped-proton passes)
2. **Altered Gravity** (0g microgravity cephalad fluid shifts / SANS, 0.16g Lunar, and 0.38g Mars partial-gravity unloading)
3. **Distance from Earth** (increasing Earth-return autonomy from 420 km to 225 million km)
4. **Isolation & Confinement** (communication latency up to 12.5 minutes one-way, 16 orbital sunrise/sunset cycles per day, sleep/circadian drift, and mood/fatigue tracking)
5. **Closed-Loop Environments** (cabin/EVA hypoxia, CO2 hypercapnia, thermal cooling faults, decompression strain, and habitat dust exposure)

Every external integration follows a graceful degradation chain: live NASA, NOAA, Supabase, and Gemini services enrich the platform when online, while client-side physics/physiology mirrors, IndexedDB queuing, pre-calibrated NASA baseline priors, and deterministic clinical rules preserve uninterrupted operation offline.

---

## Core Features

### Real-Time Biotelemetry & 100 Hz Lead-II ECG Oscilloscope
- **60 FPS ECG Waveform Canvas (`ECGMonitor.tsx`):** Smooth scrolling Lead-II electrocardiogram rendered on HTML5 `<canvas>`, fed by 100 Hz telemetry buffers when connected to the API and an interactive phase-locked synthesizer during offline or measured heart-rate streams.
- **Multi-Vital Telemetry Matrix (`MultiMetricChart.tsx`):** Tracks 12 simultaneous biometric and environmental parameters: Heart Rate (BPM), SpO2 (%), Core Temperature (C), Systolic/Diastolic Blood Pressure (mmHg), Respiration Rate (breaths/min), Heart Rate Variability / RMSSD (ms), Ambient Radiation Rate (uSv/h), Cumulative Mission Dose (mSv), Blood Glucose (mg/dL), Leukocyte Count / WBC (K/uL), and Hydration (%).
- **Web Bluetooth Heart Rate Overlay (`bluetoothHr.ts`):** Optional pairing with Bluetooth SIG GATT Heart Rate monitors (`0x180D` / `0x2A37`), computing live RMSSD HRV from RR intervals and overlaying `telemetry_source: "measured"` data onto the crew stream without interrupting environmental or metabolic modeling.

### Interactive 3D Crew Body Map (`BodyAnatomy3D.tsx` & `BodyHealthMap.tsx`)
- Three.js anatomical model paired with live status mapping (`bodyHealthModel.ts`) across six crew physiological systems:
  1. **Brain & Ocular (SANS):** Sleep duration, mission elapsed days, head/eye pain reports, and optic nerve sheath ultrasound scheduling.
  2. **Cardiovascular:** Heart rate, systolic BP, HRV autonomic tone, and orthostatic intolerance risk.
  3. **Respiratory & Airway:** SpO2, respiration cadence, CO2 scrubber strain, and chest/airway symptom checks.
  4. **Metabolic, Nutrition & Glycemia:** Capillary blood glucose trends, hydration percentage, thermal stress, and nutrition quality.
  5. **Musculoskeletal:** Microgravity and partial-gravity duration combined with ARED resistive countermeasure completion status and joint/back discomfort.
  6. **Dermal & Immune:** Ambient radiation exposure, solar Kp levels, WBC trajectory, and skin/fever symptom checks.

### Guided Multimodal Self-Exam Capture (`SelfExamCapture.tsx`)
- Supports webcam capture, image file upload, and pre-loaded clinical reference scan workflows for three onboard medical checks:
  - `ocular_ultrasound`: Closed-eyelid SANS optic nerve sheath ultrasound evaluation.
  - `dermal_radiation`: Skin erythema, rash, or radiation-reaction inspection.
  - `glucometer_nutrition`: Capillary glucometer readout and metabolic nutrition check.
- Images and vital context submit to `POST /api/v1/diagnostics/analyze-image`, using **Gemini Vision** when `GEMINI_API_KEY` is configured and falling back to deterministic clinical inspection checklists (`protocol-offline`) when offline.

### Crew Check-Ins, Health Trends, Countermeasure Routines & Flight Surgeon AI
- **Structured Wellness Check-Ins:** Logs mood, energy, stress, sleep timing/quality, pain intensity and location, hydration (mL), glucose (mg/dL), nutrition quality, and immune symptoms to IndexedDB immediately and syncs via `/api/v1/wellness/checkins`.
- **Health Trends & Analytics:** Time-range filtering and sleep-schedule visualizations combining biometric snapshots with subjective check-in records.
- **Daily Countermeasure Routines:** Crew-specific activity checklists (including resistive exercise and SANS checks) tracked independently per astronaut and calendar date.
- **Flight Surgeon AI (`assistant_service.py` & `ai.ts`):** Context-aware medical consultation via `POST /api/v1/assistant/ask` powered by Gemini (`gemini-2.5-flash` default) with deterministic rule-based triage (`astro-clinical-rules-v2` / `demoAssistant`) offline. Sensitive free-text notes and symptom descriptions are filtered out of automated telemetry projections via `buildAssistantContext`.

### Offline-First PWA, Loss-of-Signal (LOS) Mode & Multi-Tier Sync
- **IndexedDB Storage (`localDb.ts` via Dexie):** Persists five local object stores (`vitalsQueue`, `alertsStore`, `checkins`, `missionCompletions`, `imagingAssessments`).
- **Workbox Service Worker (`vite-plugin-pwa`):** Precaches application UI assets for offline boot while enforcing a strict `NetworkOnly` strategy on `/api/` routes so stale cached API responses are never mistaken for live vital signs.
- **Loss-of-Signal (LOS) Resilience:** When LOS is toggled or network connectivity drops, telemetry switches seamlessly to the local simulation engine, buffers unsynced records locally, and replays batches to `POST /api/v1/telemetry/sync-batch` upon reconnection.
- **Optional Supabase Cloud & Realtime Sync:** Synchronizes astronauts, telemetry logs (throttled every `15 s` by default or immediately on anomalies), alerts, crew check-ins, imaging assessments, and space-weather tables across sessions and browser clients.

### Alert Lifecycle & Spaceflight Accessibility
- **Deduplicated Multi-Severity Alerts:** Tracks active `INFO`, `WARNING`, and `CRITICAL` episodes per `(astronaut_id, alert_type)`, preserving crew acknowledgement unless an episode escalates to `CRITICAL` or resolves and re-emerges.
- **Accessible Crew Controls:** Includes `aria-live` critical announcements, Web Audio alarm tones, explicit severity badges, and global keyboard shortcuts (`1`-`3` to switch between `ASTRO-01`, `ASTRO-02`, and `ASTRO-03`; `Space` to acknowledge the top active alert).

---

## Simulation Techniques & Physiological Modeling

BioTelemetry combines a backend stochastic-physiological engine (`backend/app/services/simulator.py` and `backend/app/services/analyzer.py`) with a synchronized TypeScript mirror in the browser (`frontend/src/hooks/useTelemetry.ts` and `frontend/src/services/simulationConfig.ts`).

### 1. Mean-Reverting Physiological Drift & Time-Series Coupling
- **Ornstein-Uhlenbeck-Style State Evolution:** Instead of independent random noise, heart rate, SpO2, core temperature, radiation dose rate, and HRV evolve smoothly via mean-reverting drift toward each astronaut's resting baseline and active scenario setpoint.
- **Microgravity & Mission-Day Deconditioning:** Elapsed `mission_day` under low gravity (`0g`, `0.16g`, `0.38g`) gradually introduces cardiovascular resting HR drift, lower orthostatic systolic BP margin, progressive immune leukocyte (`WBC`) reduction, mild hydration deficit, and elevated resting blood glucose aligned with NASA OSDR flight trends.
- **Orbital Day/Eclipse Periodicity:** A sinusoidal orbital clock aligned to a `5560 s` LEO orbital period (~16 sunrises/sunsets per 24 hours) modulates subtle circadian variations in core temperature, metabolic glucose, and autonomic HRV.

### 2. Mission Destination Zones & Communication Latency
Telemetry and risk scoring adapt across seven selectable operational zones (`MISSION_ZONES`):

| Zone ID | Label | Distance | One-Way Lag | Gravity | Magnetosphere | Baseline GCR |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `LEO_ISS` | ISS Low Earth Orbit | 420 km | 0.08 s | 0.00 g | Shielded | 13.5 uSv/h |
| `LUNAR_ORBIT` | Lunar Gateway Orbit | 384,400 km | 1.28 s | 0.00 g | Unshielded | 54.0 uSv/h |
| `LUNAR_SURFACE` | Lunar South Pole Base | 384,400 km | 1.28 s | 0.16 g | Unshielded | 36.0 uSv/h |
| `DEEP_SPACE_TRANSIT` | Deep Space Transit | 74.8M km (0.5 AU) | 249.5 s | 0.00 g | Unshielded | 112.0 uSv/h |
| `MARS_TRANSIT` | Mars Transfer Cruise | 225M km (1.52 AU) | 750.5 s | 0.00 g | Unshielded | 128.0 uSv/h |
| `MARS_SURFACE` | Mars Surface Habitat | 225M km | 750.5 s | 0.38 g | Unshielded | 44.0 uSv/h |
| `PLANETARY_ROVER` | Planetary Rover | 225M km | 750.5 s | 0.38 g | Unshielded | 62.0 uSv/h |

### 3. Radiation Shielding, Solar Storm Overrides & Cumulative Dose
- **Shielding Attenuation Multipliers (`SHIELDING_OPTIONS`):**
  - `NOMINAL` (`1.0x`): Standard spacecraft hull or EMU suit.
  - `STORM_SHELTER` (`0.35x`): 65% radiation reduction simulating water/polyethylene storm-shelter racks.
  - `UNSHIELDED_EVA` (`1.28x`): 28% increased external radiation load combined with suit exertion and thermal metabolic demand.
- **Solar Storm Injection Modes (`SOLAR_STORM_OPTIONS`):**
  - `LIVE_DONKI`: Coupled dynamically to live NASA CCMC DONKI geomagnetic `Kp`.
  - `M_FLARE_CME` (`G2`): Overrides `Kp = 5.5` and adds `+24 uSv/h` transient flux.
  - `X_CLASS_SPE` (`S3`): Overrides `Kp = 7.0` and adds `+68 uSv/h` solar particle flux.
  - `EXTREME_G5`: Overrides `Kp = 9.0` and adds `+115 uSv/h` extreme storm flux.
- **Cumulative Dose Integration:** `cumulative_dose_msv` accumulates zone baseline GCR flux scaled by shielding factor across `mission_day`, plus incremental exposure during orbital proton passes and solar particle events.

### 4. Geophysical South Atlantic Anomaly (SAA) & Polar Flux Model
In LEO, orbital radiation exposure varies strongly by geographic coordinates (`nasa_baselines.py` and `spaceWeather.ts`):
- **Asymmetric Tilted-Ellipse AP8 Contour:** Centered over `25.0 S, 48.0 W` with an `18 deg` tilt, `43.0 deg` semi-major axis, `17.0 deg` semi-minor axis, and an asymmetric kidney shaping function representing `~420 km` trapped-proton drift.
- **Gaussian Proton Flux Field:** Normalized contour distance `d <= 1.0` triggers `saa_transit` with flux modeled as `185 * exp(-2.9 * d^2)` protons/cm^2/s across `CORE`, `INNER`, `MID`, and `OUTER` contours.
- **Orbital Phase Classification & Ground-Track Propagation:** Classifies coordinates into `saa_transit`, `high_latitude` (`|lat| > 50 deg`, raising orbital radiation alerts when `Kp >= 5`), `eclipsed`, or `daylight`, paired with a `51.6 deg` inclination analytical ground-track predictor (`-45` to `+45 min` at `92.68 min/orbit` and `0.250684 deg/min` Earth rotation).

### 5. 17 Fault-Injection Scenarios (`SIMULATION_SCENARIOS`)
Crew medical officers can inject realistic multi-system anomalies across five operational categories:
- **Orbital & EVA:** `NONE` (Nominal Cruise), `EVA_HEAVY` (Heavy EVA Load), `SAA_TRANSIT` (SAA Proton Pass)
- **Atmosphere & Thermal:** `HYPOXIA` (O2 regulator drop, SpO2 86-89%, ECG ST depression), `HYPERCAPNIA` (CO2 scrubber failure, resp 24-28/min, BP/HR surge), `DCS_RISK` (EVA decompression strain), `HEAT_STRESS` (cooling loop failure, core temp 38.3-39.1 C), `HYPOTHERMIA` (eclipse heater fault, core temp 34.9-35.4 C + bradycardia), `DUST_EXPOSURE` (regolith dust inhalation)
- **Cardiovascular & Circadian:** `TACHYCARDIA` (HR 132-154 BPM, suppressed HRV), `BRADYCARDIA` (HR 38-44 BPM, lower BP), `ORTHOSTATIC` (post-G hypotension SBP < 90 mmHg + reflex tachycardia), `SLEEP_FATIGUE` (circadian deficit, HRV < 26 ms)
- **Radiation & Multi-System:** `RADIATION_SPIKE` (65-105 uSv/h SPE spike + immune suppression), `COMPOUND_CRISIS` (simultaneous SPE + cooling fault + hypoxia + hypoglycemia)
- **Metabolic:** `HYPOGLYCEMIA` (glucose < 65 mg/dL + adrenergic HR surge), `HYPERGLYCEMIA` (glucose > 190 mg/dL + dehydration strain)

### 6. 100 Hz Lead-II ECG Synthesis
Both the Python backend (`generate_ecg_sample`) and React canvas fallback (`synthesizeSample`) synthesize each heartbeat cycle in phase space `[0, 1)` as a sum of five Gaussian P, Q, R, S, and T waves. On the backend, beat timing incorporates respiratory sinus arrhythmia (RSA) and HRV jitter, and adds ischemic ST-segment depression during `HYPOXIA` and `COMPOUND_CRISIS` anomalies.

### 7. Composite Readiness Scoring & Diagnostic Engine
- **Weighted Health Score (`0-100`, clamped `[10, 100]`):** Deducts weighted penalties for hypoxemia (`SpO2 < 95%`), tachycardia/bradycardia (`> 100` or `< 48 BPM`), hyperthermia/hypothermia (`> 37.6 C` or `< 35.8 C`), high radiation (`> 25 uSv/h`), autonomic fatigue (`HRV < 38 ms`), SBP < 94 or > 142 mmHg, tachypnea (`> 21/min`), SAA/high-latitude storm passes, unshielded zones, microgravity duration (> 30 days), and cumulative dose (> 80 mSv). Maps scores into `NOMINAL` (`>= 82`), `STRAINED` (`>= 65`), `COMPROMISED` (`>= 45`), or `CRITICAL` (`< 45`).
- **Comprehensive Triage (`POST /api/v1/diagnostics/analyze`):** Evaluates recent rolling telemetry history (hydrating stateless serverless cold starts from Supabase or on-demand simulation when needed) to emit risk classifications and specific clinical countermeasures across all spaceflight hazard domains.

---

## How NASA APIs & Open Datasets Are Used

BioTelemetry uses NASA web services and NASA open science repositories in two coordinated stages: **live runtime telemetry enrichment** and **pre-flight statistical calibration**.

### 1. Live NASA CCMC DONKI Space Weather API (`donki_service.py`)
The backend queries five endpoints from NASA Goddard's Community Coordinated Modeling Center (`https://ccmc.gsfc.nasa.gov/DONKI/WS/get`) asynchronously across a trailing 7-day UTC window via `GET /api/v1/space-weather/live` and scheduled `POST /api/v1/space-weather/sync` (optionally guarded by `CRON_SECRET`):
- `FLR` (**Solar Flares**): Extracts flare class (`C`, `M`, `X`), peak time, active region number, and heliographic coordinates (e.g., `N32E90`), which `parseSolarLocation` projects onto the UI's normalized solar disk map.
- `SEP` (**Solar Energetic Particles**): Sets a 48-hour active radiation storm watch (`S1_ACTIVE` vs. `S0_NONE`).
- `GST` (**Geomagnetic Storms**): Computes peak recent `kpIndex` over the trailing 72 hours, maps it onto the NOAA G-scale (`G0_QUIET` through `G5_EXTREME`), and injects it directly into `simulator.set_space_weather_kp(kp)` so live solar weather increases high-latitude simulated crew dose.
- `CME` (**Coronal Mass Ejections**): Parses the most-accurate CME analysis speed (km/s), half-angle, longitude, and latitude.
- `WSAEnlilSimulations` (**Heliospheric Arrival Forecasts**): Extracts predicted Earth shock impact timestamps (`earth_impact_eta`) for countdown alerts.

Live responses are cached in memory for `DONKI_CACHE_TTL_SECONDS` (default `300 s`), persisted to Supabase (`space_weather_events` and `space_weather_status`) for cross-instance sharing and Realtime push, and backed up in the browser's `localStorage`. In `SpaceWeatherVisualizer.tsx`, NOAA SWPC's WSA-ENLIL solar-wind forecast animation (`services.swpc.noaa.gov/products/animations/enlil.json`, subsampled to ~48 frames with `latest.jpg` fallback) visualizes heliospheric propagation alongside the NASA DONKI feed. Note: runtime DONKI calls use CCMC's public Web Service directly without requiring an API key, while `.env.example` provides `NASA_API_KEY=DEMO_KEY` for API-keyed NASA endpoints.

### 2. NASA Open Science Data Repository (OSDR) Clinical Calibration (`https://osdr.nasa.gov`)
Offline data scripts (`backend/scripts/fetch_nasa_datasets.py` and `backend/scripts/analyze_nasa_baselines.py`) ingest **82 OSDR CSV datasets** across four biomedical domains (cataloged in `backend/data/dataset_manifest.json`) and compile empirical distributions into `backend/app/data/clinical_baselines.json`:
- **Human Clinical Chemistry & Hematology (11 CSVs, incl. `OSD-569`, `OSD-575`, `OSD-656`):** Quantifies pre-flight vs. post-flight R+1 biomarker shifts (for example, `OSD-575`/`OSD-569` mean blood glucose shifting from `75.33` to `93.25 mg/dL`, `+23.78%`, and lymphocytes decreasing from `2679.33` to `1855.25 cells/uL`, `-30.76%`). These distributions anchor simulated flight drift, metabolic glucose bounds (`70-180 mg/dL`), leukocyte suppression thresholds (`< 3.8 K/uL`), and clinical reference ranges.
- **Ocular & SANS Trajectories (10 CSVs, incl. `OSD-583`, `OSD-680`, `OSD-681`, `OSD-816`..`OSD-818`):** Captures spaceflight vs. ground-control intraocular pressure (IOP), optic nerve sheath diameter progression, and intracranial pressure curves that ground the app's SANS risk index and ocular exam guidance.
- **Bone & Muscle Unloading (15 CSVs, incl. `OSD-351`, `OSD-471`, `OSD-477`, `OSD-489`, `OSD-608`, `OSD-616`, `OSD-653`, `OSD-661`, `OSD-702`, `OSD-718`):** Summarizes partial weight-bearing (`PWB20`, `PWB40`, `PWB100` in `OSD-608`) trabecular BMD loss and flight comparisons (`OSD-351`, `OSD-489`) used to weight Lunar/Mars `0.16g`/`0.38g` vs. microgravity `0g` bone/muscle deconditioning risk.
- **Radiation, Neuro & Immune (46 CSVs, incl. `OSD-479`, `OSD-490`, `OSD-492`, `OSD-618`, `OSD-640`, `OSD-738`, `OSD-751`, `OSD-752`, `OSD-776`..`OSD-778`, `OSD-836`):** Aggregates behavioral anxiety metrics under GCR/ionizing exposure and brain neuro-inflammatory TNF-alpha changes for radiation risk weighting.

### 3. Multi-Year DONKI Climatology (`donki_priors.json`)
`fetch_nasa_datasets.py` and `analyze_nasa_baselines.py` process **2,510 days** (`2020-01-01` to `2026-11-14`) comprising **2,832 FLR**, **344 SEP**, and **253 GST Kp** records into `donki_priors.json` (`783` days with M/X flares, `88` X-flare days, `101` SEP storm days, `118` days with `Kp >= 5`, `35` days with `Kp >= 7`, conditional probabilities `P(SEP within 3d | X-flare) = 0.409` and `P(Kp >= 5 within 3d | X-flare) = 0.307`). This dataset serves as the `historical_fallback` baseline whenever live CCMC DONKI and cached snapshots are unreachable.

### 4. Live ISS Ephemeris & 48-Hour Orbital Profile (`WhereTheISS.at` NORAD `25544`)
- **Runtime Ephemeris (`nasa_baselines.py` & `spaceWeather.ts`):** Polls `https://api.wheretheiss.at/v1/satellites/25544` via `GET /api/v1/space-weather/iss` (`20 s` TTL cache and `45 s` failure backoff) or directly from the browser if the gateway is unreachable, extracting live latitude, longitude, altitude, velocity, and daylight/eclipse visibility to classify `orbital_phase` and project the 90-minute ground track.
- **48-Hour Orbital Fallback (`orbital_profile.json`):** Pre-fetches **288 ISS trajectory samples** (`api.wheretheiss.at/v1/satellites/25544/positions`) establishing baseline orbital exposure rates (`5.9%` time in SAA, `14.24%` high-latitude exposure, `37.5%` eclipsed, `32.0` daylight/eclipse transitions per 24h) and driving deterministic `5560 s` orbital propagation (`418.4 km`, `7.66 km/s`) offline.

### 5. NASA TechTransfer Medical Patent Catalog (`https://technology.nasa.gov/api/api/patent`)
`fetch_nasa_datasets.py` also catalogs **70 NASA medical and radiation-mitigation patents** across five domain queries (`medical`: 25, `radiation`: 25, `vision`: 15, `bone`: 4, `cardiovascular`: 1) inside `backend/data/dataset_manifest.json` as reference aerospace countermeasure literature.

---

## Technology Stack & Architecture

- **Frontend PWA:** React 18, TypeScript, Vite 5, Tailwind CSS 3, Three.js (`0.187`), Dexie 4 (IndexedDB), Lucide Icons, `vite-plugin-pwa` (Workbox), `@supabase/supabase-js`
- **Backend & Serverless API:** Python FastAPI, Pydantic v2, Uvicorn, Mangum, NumPy, HTTPX, `python-dotenv`, exposed for Vercel Python serverless deployment via `serverless/index.py` and `vercel.json` (`/api/*` -> `serverless/index.py`, static SPA fallback -> `frontend/dist`)
- **Cloud Database & AI (Optional):** Supabase PostgreSQL + Realtime (`supabase/migrations/` and `backend/supabase_schema.sql`), Google Gemini API (`gemini-2.5-flash` default)

### Key API Endpoints (`/api/v1`)

| Method & Path | Purpose |
| :--- | :--- |
| `GET /`, `GET /docs` | Health status check and interactive FastAPI OpenAPI docs |
| `GET /api/v1/astronauts`, `GET /api/v1/astronauts/{astronaut_id}`, `POST /api/v1/astronauts` | Crew roster retrieval and registration |
| `GET /api/v1/telemetry/latest` | Live NASA-calibrated simulated vitals, 100 Hz ECG chunk, and alert evaluation |
| `GET /api/v1/telemetry/history` | Rolling vital-sign history (Supabase or in-memory buffer) |
| `POST /api/v1/telemetry/sync-batch` | Batch reconciliation for PWA telemetry buffered offline during LOS |
| `GET /api/v1/alerts`, `POST /api/v1/alerts/ack-all`, `POST /api/v1/alerts/{id}/ack` | Active deduplicated alerts and crew acknowledgement |
| `POST /api/v1/diagnostics/analyze` | 6-domain spaceflight hazard analysis and clinical triage recommendations |
| `POST /api/v1/diagnostics/analyze-image` | Multimodal self-exam image assessment (Gemini Vision + protocol fallback) |
| `GET /api/v1/space-weather/live`, `POST /api/v1/space-weather/sync` | Live NASA CCMC DONKI snapshot (`300 s` cache) and cron-triggered Supabase sync |
| `GET /api/v1/space-weather/iss` | Live ISS telemetry, SAA flux status, and predicted 90-minute ground track |
| `POST /api/v1/assistant/ask` | Onboard Flight Surgeon AI response (Gemini + offline clinical fallback) |
| `POST/GET /api/v1/wellness/checkins`, `/api/v1/wellness/assessments` | Crew wellness check-in and self-exam imaging persistence |

---

## Setting Up Supabase (Optional for Cloud Sync & Realtime)

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the SQL migrations inside `supabase/migrations/` in chronological order (`20261114170024_init_schema.sql`, `20261115000001_clean_aligned_schema.sql`, `20261115020000_nasa_challenge_extensions.sql`), or run `backend/supabase_schema.sql` directly in the Supabase SQL Editor.
3. Populate `SUPABASE_URL`, `SUPABASE_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` in `.env` (or in your hosting environment variables).

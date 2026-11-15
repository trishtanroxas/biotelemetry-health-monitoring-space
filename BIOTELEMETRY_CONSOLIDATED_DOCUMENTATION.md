# BioTelemetry --- Consolidated Project Documentation

## Unified Concept, Technical Architecture, Branch Implementation Record, and Implementation Gap Register

**Project:** BioTelemetry: Monitoring Human Health Beyond Earth\
**Challenge:** NASA International Space Apps Challenge 2026 --- Create
Health Monitoring Software for Astronauts on Space Missions\
**Repository:**
https://github.com/trishtanroxas/biotelemetry-health-monitoring-space\
**Consolidated source documents:** 1. **Sakin** --- Challenge concept,
project rationale, core innovation, initial technology and feature
outline. 2. **Rence** --- System Technical Specification and Project
Documentation, Version 1.0.0. 3. **Joem** --- Branch Documentation:
`em-branch` compared with `master`.

**Purpose of this document:** Combine the three individually prepared
documents into one project-level reference. It preserves the central
concept, documented requirements, technical design, claimed branch
changes, and a consolidated list of capabilities that are not yet
evidenced as implemented in the branch documentation. It is intended to
guide development, auditing, testing, and future project documentation.

> **Important interpretation:** This document combines the contents of
> the three supplied documents; it is not an independent inspection of
> the live repository. The `em-branch` document describes implementation
> changes and test status, but those claims still need to be verified
> against source code and runtime behavior. Therefore, the gap register
> distinguishes **not documented / not evidenced in the branch report**
> from **confirmed missing**. Do not describe a feature as absent until
> the repository has been inspected.

------------------------------------------------------------------------

# 1. Executive Summary

BioTelemetry is an offline-first, autonomous crew health-monitoring and
clinical decision-support platform designed for long-duration human
spaceflight. It addresses the limitations of Earth-dependent
telemedicine during communication delays and Loss of Signal (LOS),
particularly for lunar and Mars missions.

The platform combines physiological telemetry, environmental and
space-weather monitoring, deterministic health-risk analysis, crew
wellness check-ins, clinical decision support, and local-first data
persistence. Its central objective is to help crew members monitor their
health, recognize developing risks, and follow appropriate operational
guidance when immediate support from Earth is unavailable.

The system is described as a Progressive Web App (PWA) supported by a
Python FastAPI backend and an optional cloud synchronization layer using
Supabase. The client is intended to retain essential capabilities during
network outages through local processing and IndexedDB persistence. When
communication becomes available, queued records can be synchronized with
the backend and cloud database.

The supplied branch documentation reports that `em-branch` extends the
base `master` implementation with a more prominent Mission Readiness
Index, six-domain spaceflight risk analysis, NASA DONKI space-weather
integration, a backend-connected Flight Assistant, check-in
synchronization, and responsive UI refinements.

The consolidated project vision is **Autonomous Edge Bio-Resilience**: a
health-monitoring system that remains useful during communication
outages rather than depending on continuous access to a remote server.

## 1.1 Project Objectives

-   Monitor relevant physiological and environmental indicators.
-   Present current measurements and historical trends.
-   Detect selected physiological and mission-environment risks.
-   Provide actionable, structured decision support.
-   Allow astronauts to record symptoms and wellness information.
-   Support daily countermeasure and activity tracking.
-   Preserve records during communication outages.
-   Synchronize stored information when connectivity returns.
-   Make the system usable on desktop and tablet-class interfaces.
-   Clearly distinguish actual connected measurements, simulated
    telemetry, and AI-assisted recommendations.

## 1.2 Intended Operational Environments

The technical specification identifies these operational environments:

-   Low Earth Orbit (ISS).
-   Cislunar space and Lunar Gateway.
-   Lunar orbit.
-   Lunar surface / Artemis Base Camp.
-   Deep-space transit.
-   Mars transit.
-   Mars surface habitats.
-   Planetary exploration rovers.

The branch report specifically mentions simulated mission zones
including `LEO_ISS`, `DEEP_SPACE`, `LUNAR_GATEWAY`, and `MARS_TRANSIT`.

------------------------------------------------------------------------

# 2. Problem Statement and Mission Context

Long-duration spaceflight exposes crew members to interacting
physiological, environmental, and operational hazards. These include
altered gravity, ionizing radiation, cardiovascular and musculoskeletal
deconditioning, fluid redistribution, sleep disruption, psychological
stress, and closed-loop habitat conditions.

Earth-based medical support is constrained by communication latency and
outages. During a communication blackout, a crew member cannot assume
that a remote flight surgeon or cloud service will be immediately
reachable. A health-monitoring application that requires a constant
internet connection would therefore be unreliable in the exact
circumstances where autonomous support matters most.

BioTelemetry is intended to address this problem by moving essential
monitoring, local record keeping, and deterministic risk evaluation
toward the client or onboard edge environment.

## 2.1 Core Challenges

  -----------------------------------------------------------------------
  Challenge               Operational consequence BioTelemetry response
  ----------------------- ----------------------- -----------------------
  Communication latency   Remote medical guidance Local analysis and
                          may be delayed          onboard decision
                                                  support

  Loss of Signal          Cloud services may be   IndexedDB-based local
                          unreachable             persistence and offline
                                                  operation

  Altered gravity         Fluid shifts and        Physiological trend
                          deconditioning          monitoring and
                                                  mission-context
                                                  modeling

  Space radiation         Acute and cumulative    Dose-rate and
                          exposure risks          cumulative-dose
                                                  monitoring

  Isolation and           Sleep, mood, fatigue,   Structured wellness
  confinement             and behavioral changes  check-ins and trend
                                                  tracking

  Medical uncertainty     Crew needs              Deterministic alerts
                          understandable next     and structured decision
                          steps                   support

  Limited operational     Crew needs quickly      Dashboard summaries,
  time                    accessible information  alerts, and guided
                                                  workflows
  -----------------------------------------------------------------------

## 2.2 Core Innovation: Autonomous Edge Bio-Resilience

The central innovation is an edge-first health-monitoring architecture
that is designed to continue core operations without an active
connection to Earth.

Its intended behavior is:

1.  Receive or generate telemetry at the client or backend.
2.  Process available measurements locally when required.
3.  Evaluate health and environmental conditions using deterministic
    rules.
4.  Present alerts and decision-support information.
5.  Store check-ins, telemetry, and other records locally.
6.  Queue records that cannot be transmitted.
7.  Synchronize queued records when connectivity returns.

The system should not imply that every feature is fully autonomous
merely because the application shell loads offline. Each offline
capability must be tested independently.

------------------------------------------------------------------------

# 3. Core System Capabilities

This section consolidates the functional scope described across the
concept and technical specification. The branch report is used later to
identify which capabilities it explicitly claims to have implemented.

## 3.1 Physiological and Environmental Telemetry

The technical specification defines a twelve-parameter monitoring
matrix:

  -----------------------------------------------------------------------------
                    No. Parameter        Unit /           Purpose
                                         representation   
  --------------------- ---------------- ---------------- ---------------------
                      1 Heart rate       BPM              Cardiovascular
                                                          monitoring and rate
                                                          abnormalities

                      2 Blood oxygen     SpO₂ (%)         Oxygenation and
                        saturation                        hypoxia-related
                                                          monitoring

                      3 Core body        °C               Thermal status and
                        temperature                       temperature-related
                                                          risk

                      4 Blood pressure   Systolic /       Hemodynamic and
                                         diastolic mmHg   orthostatic
                                                          monitoring

                      5 Respiration      Breaths/min      Respiratory status
                        cadence                           and possible distress

                      6 Heart rate       ms               Autonomic status,
                        variability                       fatigue, and stress
                        (RMSSD)                           indicators

                      7 Ambient ionizing µSv/h            Current radiation
                        radiation dose                    environment
                        rate                              

                      8 Cumulative       mSv              Accumulated mission
                        mission                           exposure
                        radiation                         
                        exposure                          

                      9 Capillary blood  mg/dL            Glycemic and
                        glucose                           metabolic monitoring

                     10 Leukocyte /      K/µL             Immune-status
                        white blood cell                  estimation
                        count                             

                     11 Hydration and    \%               Hydration and
                        fluid-balance                     fluid-status
                        index                             estimation

                     12 ECG Lead-II      mV samples       Cardiac electrical
                        waveform                          waveform
                                                          visualization
  -----------------------------------------------------------------------------

The initial concept document also mentions spacesuit telemetry such as
battery percentage and life-support consumables. These should be treated
as an additional integration area unless the current implementation and
data source are verified.

**Implementation rule:** The UI must identify whether each value comes
from a physical sensor, a backend simulator, a client-side simulation,
an imported dataset, or a static demonstration value. Do not label
simulated values as live hardware measurements.

## 3.2 ECG Oscilloscope

The technical specification describes a Lead-II ECG visualization with:

-   A nominal 100 Hz signal stream.
-   HTML5 Canvas rendering.
-   A target visual rendering rate of up to 60 FPS.
-   P, Q, R, S, and T waveform components.
-   RR-interval behavior influenced by heart rate and heart rate
    variability.
-   Simulated waveform changes for selected anomaly conditions.
-   A possible backend-generated or client-synthesized signal source.

The document describes a Gaussian-wavelet model for waveform morphology
and a noise term for simulated bio-potential interface noise.

**Verification required:** Confirm the actual sampling rate, signal
source, Canvas update loop, anomaly coupling, and cleanup behavior. A
visually moving waveform alone does not prove that a 100 Hz signal
pipeline exists.

## 3.3 Three-Dimensional Anatomical Health Map

The technical specification proposes an interactive Three.js anatomical
model that presents six health domains:

1.  Neuro-ocular and intracranial / SANS.
2.  Cardiovascular.
3.  Respiratory and life support.
4.  Metabolic, endocrine, and nutrition.
5.  Musculoskeletal.
6.  Integumentary and immune.

The map is intended to connect health-domain status to telemetry, risk
indicators, and relevant assessments.

**Verification required:** The branch documentation does not explicitly
describe a completed Three.js anatomical health map. Inspect the
repository for the 3D scene, anatomical assets, data bindings,
interactions, and responsive behavior.

## 3.4 Guided Multimodal Self-Examination

The technical specification describes guided self-exam workflows for:

-   Ocular ultrasound / optic nerve sheath assessment.
-   Dermal inspection for radiation-related skin findings.
-   Capillary glucometer or biochemical test-strip readout verification.

The intended operating modes are:

-   Connected mode: image payloads may be submitted for multimodal
    evaluation.
-   Offline mode: deterministic clinical checklists are used when remote
    inference is unavailable.

The system must not present image-model output as a definitive medical
diagnosis. Any AI-assisted findings must be clearly identified and
paired with appropriate safety messaging and escalation guidance.

**Verification required:** Confirm camera access, image capture, local
storage, upload behavior, backend image-analysis route, structured
response validation, and offline checklist fallback.

## 3.5 Clinical Decision Support and Flight Surgeon Assistant

BioTelemetry includes a clinical decision-support concept intended to
summarize available health context and provide structured
recommendations.

The technical specification describes:

-   Aerospace SBAR formatting: Situation, Background, Assessment,
    Recommendation.
-   Clinical context drawn from available telemetry and wellness
    records.
-   Recommended actions and countermeasures.
-   Escalation conditions (`escalate_when`).
-   Privacy filtering before external AI processing.
-   Deterministic fallback rules during offline operation.

The branch report states that the Flight Assistant is connected to
FastAPI through `/api/v1/assistant/ask`, with telemetry context, OSDR
references, and onboard fallback.

**Safety requirements:**

-   The assistant must not invent missing telemetry.
-   It must distinguish observations from interpretations.
-   It must not replace the deterministic analyzer.
-   It must not present generated responses as a confirmed diagnosis.
-   It must explain when information is simulated, unavailable, or
    stale.
-   It must preserve privacy and avoid sending unnecessary identifiers
    or diary content to an external model.
-   It must provide a fallback when the AI provider is unavailable.

## 3.6 Mission Zone and Communication-Latency Modeling

The technical specification defines seven mission zones:

  ---------------------------------------------------------------------------------
  Zone ID                Environment        One-way latency in              Gravity
                                                      supplied 
                                                 specification 
  ---------------------- ---------------- -------------------- --------------------
  `LEO_ISS`              ISS Low Earth                  0.08 s               0.00 g
                         Orbit                                 

  `LUNAR_ORBIT`          Lunar Gateway                  1.28 s               0.00 g
                         orbital outpost                       

  `LUNAR_SURFACE`        Lunar surface                  1.28 s               0.16 g

  `DEEP_SPACE_TRANSIT`   Interplanetary                249.5 s               0.00 g
                         cruise                                

  `MARS_TRANSIT`         Mars transfer                 750.5 s               0.00 g
                         trajectory                            

  `MARS_SURFACE`         Mars surface                  750.5 s               0.38 g
                         habitat                               

  `PLANETARY_ROVER`      Planetary                     750.5 s               0.38 g
                         exploration                           
                         rover                                 
  ---------------------------------------------------------------------------------

The interface should demonstrate the operational difference between
connected, delayed, and disconnected communication states. The initial
concept calls for a mission-latency switcher to simulate Earth-assisted
and Autonomous Edge modes.

**Important source discrepancy:** The initial concept document describes
Mars communication delay as up to 22 minutes one-way, while the
technical specification gives 750.5 seconds (approximately 12.5 minutes)
one-way for its Mars profile. The project must choose and document a
consistent, properly sourced assumption. Do not silently mix the two
values.

## 3.7 Fault-Injection and Anomaly Simulation

The technical specification lists seventeen fault-injection modes:

1.  `NONE` --- nominal operations.
2.  `EVA_HEAVY` --- elevated exertion and heat load.
3.  `SAA_TRANSIT` --- South Atlantic Anomaly transit.
4.  `HYPOXIA` --- reduced cabin oxygen partial pressure.
5.  `HYPERCAPNIA` --- elevated CO₂ / scrubber-related event.
6.  `DCS_RISK` --- decompression sickness risk.
7.  `HEAT_STRESS` --- thermal control failure / hyperthermia.
8.  `HYPOTHERMIA` --- low core temperature.
9.  `DUST_EXPOSURE` --- lunar or Martian regolith exposure.
10. `TACHYCARDIA` --- elevated heart rate event.
11. `BRADYCARDIA` --- low heart rate event.
12. `ORTHOSTATIC` --- postural blood-pressure instability.
13. `SLEEP_FATIGUE` --- circadian disruption and fatigue.
14. `RADIATION_SPIKE` --- acute radiation event.
15. `COMPOUND_CRISIS` --- multiple concurrent hazards.
16. `HYPOGLYCEMIA` --- low blood glucose.
17. `HYPERGLYCEMIA` --- high blood glucose.

These scenarios are intended for demonstration, training, and
stress-testing of the telemetry and alerting pipeline.

**Verification required:** The branch report describes six hazard
domains but does not enumerate all seventeen modes or confirm that each
can be selected, injected, processed, and reset.

## 3.8 Crew Wellness Check-Ins

The technical specification describes structured crew self-reports that
complement continuous telemetry.

Documented inputs include:

-   Subjective fatigue.
-   Mood and energy levels.
-   Physical discomfort locations.
-   Sleep duration and quality.
-   Caloric nutrition quality.
-   Oral hydration volume.
-   Isolation and social connection indicators.
-   Symptoms associated with SANS and space motion sickness.

The initial concept specifically highlights logging eye strain,
headaches, and dizziness.

The branch report states that the check-in workflow includes a
three-step wizard, automatic telemetry attachment, local storage,
background synchronization, historical retrieval, and self-exam
assessment routes.

## 3.9 Daily Countermeasure and Activity Tracking

The technical specification identifies daily countermeasure routines
including:

-   Advanced Resistive Exercise Device (ARED) routines.
-   Cycle ergometer aerobic training.
-   SANS visual acuity self-assessments.
-   Daily activity and adherence records.

The branch report describes daily activity progress and targeted
physical, sleep, and emotional countermeasure routines.

The system should distinguish a completed activity record from a
clinically verified outcome.

## 3.10 Health Trends and Mission Readiness

The technical specification describes a Composite Health Readiness Score
ranging from 10 to 100, with four states:

  ------------------------------------------------------------------------
  State                                        Score Meaning in supplied
                                                     specification
  --------------------- ---------------------------- ---------------------
  NOMINAL                                       ≥ 82 Parameters within
                                                     operational baselines

  STRAINED                               65 to \< 82 Moderate
                                                     physiological load

  COMPROMISED                            45 to \< 65 Significant deficit
                                                     or environmental
                                                     hazard

  CRITICAL                                     \< 45 Severe emergency or
                                                     life-support failure
  ------------------------------------------------------------------------

The score is described as a deterministic calculation based on
physiological and environmental stressors. The branch report says
`em-branch` adds a prominent 0--100 Overall Mission Readiness Index and
status pill, but its summary lists NOMINAL / STRAINED / CRITICAL and
does not explicitly confirm the COMPROMISED category or the full
formula.

Historical charts should use persisted records, support meaningful time
filtering, show units, and identify gaps or stale data.

------------------------------------------------------------------------

# 4. Engineering Architecture

## 4.1 Three-Tier Architecture

The technical specification defines a three-tier architecture.

### Tier 1 --- Autonomous Edge PWA

The client is responsible for:

-   Application UI and navigation.
-   Local telemetry presentation and supported local analysis.
-   ECG rendering.
-   Local IndexedDB persistence.
-   Check-in and activity recording.
-   Offline alert handling.
-   Offline clinical checklist fallback.
-   Queuing records for later synchronization.

Technologies specified include React, TypeScript, Vite, Tailwind CSS,
Dexie.js, Workbox, Canvas, and Three.js.

### Tier 2 --- Backend / Serverless Gateway

The FastAPI backend is responsible for:

-   REST API endpoints.
-   Telemetry ingestion and retrieval.
-   Simulation and analytical services.
-   Deterministic diagnostic evaluation.
-   Space-weather data ingestion.
-   Assistant orchestration.
-   Check-in and assessment endpoints.
-   Request validation through Pydantic.
-   Integration with external services.

The technical specification identifies Python, FastAPI, Pydantic,
Uvicorn, Mangum, NumPy, and HTTPX.

### Tier 3 --- Cloud Synchronization and Realtime

The cloud tier is intended for:

-   Persistent shared records.
-   Historical data retrieval.
-   Mission-control synchronization.
-   Realtime updates.
-   Remote review and acknowledgment.
-   Event and telemetry storage.

The documented platform is Supabase PostgreSQL with Row-Level Security
and Supabase Realtime.

Cloud access is an enhancement to the edge-first system, not a
prerequisite for local record creation and supported local analysis.

## 4.2 Data Flow

Expected connected workflow:

1.  Telemetry is received or generated.
2.  Data is validated.
3.  The dashboard displays the current measurement and source.
4.  The deterministic analyzer evaluates applicable rules.
5.  Alerts and readiness indicators are updated.
6.  Records are stored locally as appropriate.
7.  The client sends eligible records to backend endpoints.
8.  The backend validates and persists records.
9.  Supabase stores and distributes cloud records where configured.

Expected offline workflow:

1.  The application loads from cached assets.
2.  Supported local telemetry and analysis remain available.
3.  User records are validated and saved in IndexedDB.
4.  Pending records remain queued.
5.  The UI communicates local-save and sync status.
6.  When connectivity returns, queued records are reconciled.
7.  Backend confirmation updates synchronization state.
8.  Duplicate records are avoided.

## 4.3 Local Persistence Stores

The technical specification identifies five IndexedDB stores:

  Store                  Purpose
  ---------------------- -----------------------------------------------
  `vitalsQueue`          Unsent telemetry records
  `alertsStore`          Active and historical alert episodes
  `checkins`             Crew wellness self-assessments
  `missionCompletions`   Daily countermeasure and activity completion
  `imagingAssessments`   Locally cached imaging and assessment records

The initial concept calls the database `SpaceBiotelemetryDB`. The exact
database name, schema version, migrations, and store definitions must be
checked in the implementation.

## 4.4 Service Worker and Offline Caching

The technical specification describes Workbox-based asset precaching and
a `NetworkOnly` policy for API routes to prevent stale API responses
from being mistaken for live telemetry.

The implementation should verify:

-   Application shell caching.
-   Asset precaching.
-   Offline navigation.
-   Correct API network behavior.
-   Local data persistence.
-   Reconnection handling.
-   Retry behavior.
-   Queue reconciliation.
-   Service-worker update behavior.

------------------------------------------------------------------------

# 5. Mathematical and Analytical Models

The following models are documented in the technical specification.
Their presence in documentation does not by itself prove that each
formula is implemented or validated in the current branch.

## 5.1 Physiological Drift --- Ornstein--Uhlenbeck Process

The specification describes a mean-reverting stochastic process:

`dX_t = θ · (μ - X_t) · dt + σ · dW_t`

Where:

-   `X_t` is the current physiological parameter.
-   `θ` is the mean-reversion coefficient.
-   `μ` is the contextual baseline.
-   `σ` is stochastic volatility.
-   `W_t` is a Wiener process.

The model is intended to produce continuous, bounded, context-sensitive
changes rather than independent random values.

## 5.2 Microgravity Deconditioning

The specification defines mission-duration and gravity-related factors:

-   `f_duration = min(1.0, D / 365.0)`
-   `g_relief = 1.0` when `g = 0.0`
-   `g_relief = 0.55` when `0.0 < g <= 0.38`
-   `g_relief = 0.0` when `g >= 1.0`

It then describes:

-   `ΔHR_drift = 11.5 · f_duration · g_relief`
-   `ΔHRV_loss = 15.0 · f_duration · g_relief`
-   `ΔSBP_reduction = 4.0 · f_duration · g_relief`
-   A mission-duration and radiation-sensitive WBC estimation formula.

These equations should be implemented in a traceable analytical service,
with units and input assumptions documented.

## 5.3 Orbital and Circadian Variations

The technical specification uses an orbital period of 5,560 seconds and
sinusoidal functions to model changes in core temperature, glucose, and
HRV over the orbital cycle.

The exact equations and coefficients should be preserved from the
technical specification when implementing or validating this model.

## 5.4 South Atlantic Anomaly Model

The specification describes an AP8-inspired elliptical contour model
using:

-   Center latitude: −25.0°.
-   Center longitude: −48.0°.
-   Orientation: 18°.
-   Semi-major axis: 43°.
-   Semi-minor axis: 17°.
-   An asymmetric shaping function.
-   A normalized distance threshold for SAA transit.
-   A radiation flux calculation.
-   An operational radiation penalty and alert.

The implementation should be identified as an analytical approximation
unless it is directly using a validated AP8 model dataset or
implementation. Do not overstate model fidelity.

## 5.5 ECG Waveform Synthesis

The specification defines a 100 Hz Lead-II waveform using a baseline
harmonic, Gaussian wavelets for P/Q/R/S/T deflections, a
pathology-dependent ST-segment shift, and a noise term.

Verification should include:

-   Correct waveform timing.
-   Heart-rate coupling.
-   Signal sampling.
-   Rendering frequency.
-   Pathology-mode coupling.
-   Stable behavior during start/stop and page navigation.

## 5.6 Composite Health Readiness Score

The score is documented as:

`H = 100.0 - Total Deductions`

The deductions cover oxygenation, tachycardia, bradycardia, temperature,
radiation, HRV, blood pressure, respiration, glucose, hydration, SAA
transit, geomagnetic storm, mission duration, and cumulative radiation.

The final score is clamped to the specified range and mapped to
readiness states.

**Required validation:** Compare the implemented formula, thresholds,
clamping, category mapping, and displayed score against the
specification. The branch summary confirms a readiness card but does not
reproduce the full formula.

------------------------------------------------------------------------

# 6. NASA, Open Science, and External Data Sources

## 6.1 NASA DONKI Space Weather

The technical specification describes five DONKI data categories:

-   Solar Flares (`FLR`).
-   Solar Energetic Particles (`SEP`).
-   Geomagnetic Storms (`GST`).
-   Coronal Mass Ejections (`CME`).
-   WSA-Enlil solar-wind simulations.

The document describes a 300-second cache, storage of space-weather
records, and use of active space-weather conditions in the simulator.

The branch report specifically claims live NASA DONKI integration for
geomagnetic storm and solar flare telemetry, with Kp index, storm level,
and flare class.

**Not explicitly confirmed by the branch report:** all five DONKI
categories, the full WSA-Enlil data flow, solar-particle alert
lifecycle, and persistence/mirroring behavior.

## 6.2 NASA Open Science Data Repository

The technical specification states that 82 open-access datasets were
processed across four broad domains:

-   Human clinical chemistry and hematology.
-   Ocular and SANS morphology.
-   Musculoskeletal unloading and bone loss.
-   Radiation, neurobiology, and immune stress.

Representative study identifiers include `OSD-569`, `OSD-575`,
`OSD-656`, `OSD-583`, `OSD-680`, `OSD-681`, `OSD-816`, `OSD-817`,
`OSD-818`, and other studies listed in the technical specification.

The document describes using these data to inform physiological priors,
deconditioning curves, SANS risk, immune estimates, and related models.

The branch report states that the diagnostic engine and assistant are
grounded in OSDR baselines, but does not independently enumerate the 82
datasets or demonstrate each dataset's processing and model use.

## 6.3 Other Sources and References

The supplied technical specification also identifies:

-   NASA RadLab radiation resources.
-   NASA Open Developer Portal.
-   NASA CCMC DONKI.
-   NASA OSDR and ALSDA.
-   PhysioNet / MIT-BIH ECG resources.
-   NASA TechTransfer patent catalog.
-   NOAA Space Weather Prediction Center.
-   WhereTheISS.at / ISS orbital position.
-   Supabase.
-   Vercel.

A source appearing in the documentation should not be described as an
active runtime integration unless code and data flow confirm it.

## 6.4 Standards and Guidance Cited

The supplied documents reference:

-   NASA-STD-3001, Volumes 1 and 2.
-   NASA Human Research Program / Human Research Roadmap.
-   International Commission on Radiological Protection Publication 123.
-   WCAG 2.1 AA in the initial concept document.
-   WCAG 2.2 AA in the technical specification.

**Standards discrepancy:** The accessibility target differs between the
supplied documents (WCAG 2.1 AA versus WCAG 2.2 AA). The team should
select one documented target and test against it.

------------------------------------------------------------------------

# 7. AI, Privacy, and Safety Design

## 7.1 AI-Assisted Capabilities

The technical specification describes AI use for:

-   Multimodal image assistance when communication is available.
-   Conversational clinical decision support.
-   SBAR-formatted summaries.
-   Audio transcription and voice interaction.
-   Software engineering assistance.

The technical specification names Gemini models and Edge-TTS / Gemini
transcription services. The branch report also describes Google Gemini
as the assistant provider. Any later provider change must be reflected
in the actual configuration and documentation.

## 7.2 Deterministic Offline Fallback

The project design requires deterministic local rules to remain
available when AI or network services are unavailable.

AI should be an additional decision-support layer, not the only way to
detect a health alert.

## 7.3 Privacy and Data Handling

The technical specification describes client-side filtering to remove
personal identifiers and unnecessary private journal content before AI
processing.

Verify:

-   Which fields are sent to an AI provider.
-   Whether identifiers are removed.
-   Whether audio and images are transmitted.
-   Whether API keys are stored only on the backend.
-   Whether requests and responses are logged.
-   Whether records have appropriate access controls.
-   Whether privacy notices accurately describe the actual behavior.

## 7.4 Provenance and AI Disclosure

The technical specification proposes machine-readable provenance
metadata for AI-assisted outputs and visible notices explaining that
AI-assisted clinical decision support must be checked against onboard
protocols.

Synthetic calibration assets should be visibly distinguished from real
clinical data.

------------------------------------------------------------------------

# 8. API and Backend Reference

## 8.1 Initial Core API Set

The initial concept lists:

  --------------------------------------------------------------------------------
  Method                  Endpoint                         Purpose
  ----------------------- -------------------------------- -----------------------
  GET                     `/api/v1/astronauts`             Crew profiles and
                                                           medical baselines

  GET                     `/api/v1/telemetry/latest`       Latest telemetry

  GET                     `/api/v1/telemetry/history`      Historical telemetry

  POST                    `/api/v1/telemetry/sync-batch`   Offline telemetry batch
                                                           synchronization

  GET / POST              `/api/v1/alerts`                 Alert retrieval and
                                                           acknowledgment

  POST                    `/api/v1/diagnostics/analyze`    Autonomous health
                                                           assessment
  --------------------------------------------------------------------------------

## 8.2 Additional Routes Claimed by Branch Documentation

The branch report identifies:

  -----------------------------------------------------------------------------------------------
  Method                  Endpoint                                        Purpose
  ----------------------- ----------------------------------------------- -----------------------
  POST                    `/api/v1/assistant/ask`                         Flight Assistant
                                                                          request

  GET                     `/api/v1/space-weather/live`                    Live space-weather data

  GET                     `/api/v1/space-weather/iss`                     ISS position and
                                                                          orbital phase

  POST                    `/api/v1/wellness/checkins`                     Check-in
                                                                          synchronization

  GET                     `/api/v1/wellness/checkins/{astronaut_id}`      Historical check-ins

  POST                    `/api/v1/wellness/assessments`                  Medical self-exam
                                                                          assessment record

  GET                     `/api/v1/wellness/assessments/{astronaut_id}`   Historical assessments

  POST                    `/api/v1/alerts/ack-all`                        Batch alert
                                                                          acknowledgment
  -----------------------------------------------------------------------------------------------

The branch report also describes enhancements to telemetry, diagnostics,
and alert routes.

**Verification required:** Check the actual FastAPI router registration,
route prefixes, request and response schemas, authentication,
persistence behavior, and API tests. The table is a documentation
reference, not a substitute for OpenAPI inspection.

------------------------------------------------------------------------

# 9. Data Persistence and Synchronization

## 9.1 Local-First Data

The client should be able to save supported records without a network
connection. The technical specification names Dexie.js and IndexedDB for
local persistence.

Records should have clear states such as:

-   Saved locally.
-   Pending synchronization.
-   Synchronization in progress.
-   Synchronized.
-   Synchronization failed.

## 9.2 Supabase Cloud Tier

The technical specification names PostgreSQL tables including:

-   `astronauts`
-   `telemetry_logs`
-   `alerts`

It also refers to:

-   `space_weather_events`
-   `space_weather_status`

The branch report additionally describes wellness check-in and
assessment persistence through Supabase or an in-memory fallback.

The technical specification identifies Supabase Realtime and Row-Level
Security. The branch report describes a resilient synchronization
service with column-fallback detection.

## 9.3 Synchronization Requirements

Verify:

-   Retry behavior.
-   Duplicate prevention.
-   Idempotency.
-   Conflict handling.
-   Acknowledgment of successfully synchronized records.
-   Failed-upload retention.
-   Correct handling of partial batch failures.
-   RLS policy behavior.
-   Local/cloud consistency.
-   Reconnection behavior.

An in-memory fallback is not equivalent to durable cloud persistence and
must be labeled accurately.

------------------------------------------------------------------------

# 10. Technology Stack

The supplied documents identify the following intended stack.

  -----------------------------------------------------------------------
  Layer                   Technology              Role
  ----------------------- ----------------------- -----------------------
  Frontend                React                   UI components and state

  Language                TypeScript              Typed frontend logic

  Build tooling           Vite                    Development and
                                                  production bundling

  Styling                 Tailwind CSS            Responsive dark cockpit
                                                  interface

  PWA                     `vite-plugin-pwa` /     Offline shell and
                          Workbox                 service worker

  Local storage           Dexie.js / IndexedDB    Offline record
                                                  persistence

  Backend                 Python / FastAPI        REST API and analytical
                                                  services

  Validation              Pydantic v2             Request and response
                                                  validation

  ASGI server             Uvicorn                 Backend serving

  Serverless adapter      Mangum                  Serverless deployment
                                                  adapter

  Numerical processing    NumPy                   Mathematical processing

  HTTP client             HTTPX                   External API ingestion

  Cloud database          Supabase PostgreSQL     Persistent cloud
                                                  records

  Realtime                Supabase Realtime       WebSocket updates

  ECG                     HTML5 Canvas            Waveform rendering

  3D visualization        Three.js                Anatomical model

  Audio                   Web Audio API           Alert sound generation

  Icons                   Lucide React            Interface iconography

  AI                      Gemini in supplied      Assistant and
                          technical documents     multimodal inference
  -----------------------------------------------------------------------

**Version discrepancies to reconcile:**

-   The initial concept lists Python 3.14, while the technical
    specification and branch documentation refer to Python 3.11.
-   The initial concept mentions React 18 / 19, while the technical
    specification lists React 18.2.
-   The technical specification lists Vite 5 and Tailwind 3.
-   The branch report states that the Windows dependency issue was
    addressed by changing to pure-Python Uvicorn dependencies.

The final stack description should reflect the versions actually
installed in the repository lockfiles and deployment configuration.

------------------------------------------------------------------------

# 11. Branch Implementation Record --- `em-branch` vs. `master`

This section records what the third supplied document explicitly says
was changed. These are branch-documentation claims, not independently
re-tested findings.

## 11.1 High-Level Changes Reported

  -----------------------------------------------------------------------
  Capability              `master` baseline       `em-branch` change
                          described in branch     reported
                          report                  
  ----------------------- ----------------------- -----------------------
  Overall Mission         Inside diagnostics      Prominent 0--100
  Readiness               modal; no home card     dashboard card

  Diagnostic analysis     Four basic rules        Six spaceflight hazard
                                                  domains

  Space weather           Unconnected placeholder NASA DONKI integration
                                                  for Kp, storm level,
                                                  and flare class

  Flight Assistant        Local regex simulation  FastAPI-connected
                                                  assistant with
                                                  telemetry context and
                                                  fallback

  Check-in storage        IndexedDB only          Background
                                                  synchronization to
                                                  wellness endpoint

  Check-in layout         Narrow centered layout  Responsive two-column
                                                  layout and biometrics
                                                  sidebar

  Dashboard alignment     Inconsistent disclosure Unified left-column
                          alignment               alignment and 22px
                                                  panel spacing

  Daily activities        Progress bar limited to Full-width responsive
                          600px                   progress bar

  AI Assistant page       Chat capped at 950px    Full-width consultation
                                                  layout and responsive
                                                  suggestions

  Backend dependencies    Windows installation    Uvicorn dependency
                          issue                   adjustment
  -----------------------------------------------------------------------

## 11.2 Backend Files and Services Reported

-   `backend/app/routes/assistant.py`
-   `backend/app/routes/space_weather.py`
-   `backend/app/routes/wellness.py`
-   `backend/app/routes/diagnostics.py`
-   `backend/app/routes/telemetry.py`
-   `backend/app/routes/alerts.py`
-   `backend/app/main.py`
-   `backend/app/services/analyzer.py`
-   `backend/app/services/donki_service.py`
-   `backend/app/services/nasa_baselines.py`
-   `backend/app/services/assistant_service.py`
-   `backend/app/services/supabase_sync.py`
-   Assistant, space-weather, wellness, telemetry, and diagnostic
    Pydantic schemas.

## 11.3 Frontend Files and Services Reported

-   `frontend/src/App.tsx`
-   `frontend/src/index.css`
-   `frontend/src/services/api.ts`
-   `frontend/src/services/ai.ts`
-   `frontend/src/services/checkins.ts`
-   `frontend/src/hooks/useSpaceWeather.ts`
-   `frontend/src/hooks/useTelemetry.ts`
-   `frontend/src/types/telemetry.ts`
-   `frontend/src/types/wellness.ts`
-   `CheckInPage.tsx`
-   `MissionsPage.tsx`
-   `AIPage.tsx`

The branch report describes API client methods for space weather, ISS
position, assistant requests, check-in synchronization, historical
check-ins, telemetry history, and alert acknowledgment.

## 11.4 Challenge Requirement Mapping Reported by the Branch Document

The branch report states that the branch supports:

-   Collection of cardiac, respiratory, oxygenation, temperature,
    glucose-proxy, radiation, and wellness information.
-   A Mission Readiness Index, alerts, trend charts, and six-domain
    hazard reporting.
-   Countermeasure recommendations and Flight Assistant guidance.
-   Radiation dose tracking and SAA detection.
-   Isolation, social connection, and emotional well-being self-reports.
-   Microgravity exposure, resistive exercise logging, and SANS risk
    modeling.
-   Lead-II ECG visualization and tachycardia/bradycardia triage.
-   Offline-first operation and synchronization after reconnection.

These claims should be verified against the current branch and automated
tests.

------------------------------------------------------------------------

# 12. Consolidated Implementation Gap Register

## 12.1 How to Read This Register

The third document is a summary of branch changes, not a complete code
audit. A feature omitted from that summary may still exist in the
repository.

Use these statuses:

-   **Not evidenced in branch document:** The branch report does not
    explicitly confirm implementation.
-   **Partially evidenced:** Related functionality is described, but the
    full specification is not confirmed.
-   **Requires repository verification:** Documentation alone cannot
    establish implementation status.
-   **Potential implementation gap:** The specification describes the
    feature, but the branch report does not provide enough evidence to
    confirm it.

Do not mark any item as definitively missing until the source code and
runtime behavior have been checked.

## 12.2 Features Not Explicitly Confirmed by the Branch Report

  -----------------------------------------------------------------------------------------------------
                No. Feature /           What the technical      What the branch report    Status for
                    requirement         specification expects   confirms                  audit
  ----------------- ------------------- ----------------------- ------------------------- -------------
                  1 Three-dimensional   Interactive Three.js    Not mentioned             Not evidenced
                    anatomical health   model with six health                             
                    map                 domains                                           

                  2 Guided ocular       Guided image            Assessment endpoints are  Partially
                    ultrasound capture  acquisition and         mentioned, but capture    evidenced
                                        ONSD-related workflow   workflow is not detailed  

                  3 Dermal inspection   Guided skin image       Not mentioned             Not evidenced
                    imaging             capture and assessment                            

                  4 Glucometer /        Optical test-strip or   Not mentioned             Not evidenced
                    biochemical readout readout assistance                                
                    verification                                                          

                  5 Offline imaging     Deterministic local     Offline assistant         Not evidenced
                    checklist           self-exam fallback      fallback is mentioned;    
                                                                imaging checklist is not  

                  6 All twelve          Full twelve-parameter   Some values and glucose   Partially
                    telemetry           matrix                  proxy are mentioned; full evidenced
                    parameters                                  set is not confirmed      

                  7 Leukocyte / WBC     Immune-status estimate  Not mentioned             Not evidenced
                    tracking            and trajectory                                    

                  8 Hydration /         Hydration percentage    Not explicitly confirmed  Not evidenced
                    fluid-balance index and risk evaluation                               

                  9 Blood glucose       Glucose value and       Glucose proxy is          Partially
                    monitoring          related risk rules      mentioned                 evidenced

                 10 Spacesuit battery   Battery and consumable  Not mentioned             Not evidenced
                    and life-support    status                                            
                    telemetry                                                             

                 11 Full 100 Hz ECG     100 Hz stream or        60 FPS Lead-II waveform   Partially
                    data pipeline       synthesis, morphology,  is claimed; 100 Hz        evidenced
                                        and 60 FPS rendering    pipeline is not confirmed 

                 12 ECG anomaly         P/Q/R/S/T behavior and  General ECG and           Partially
                    morphology          pathology-specific      tachycardia/bradycardia   evidenced
                                        changes                 triage are mentioned      

                 13 All seventeen       All listed scenarios    Six hazard domains are    Not evidenced
                    fault-injection     selectable and testable described; seventeen      
                    modes                                       modes are not enumerated  

                 14 Deep-space latency  Mission-zone selection  Mission zones are         Partially
                    switcher            and delay/blackout      included in telemetry;    evidenced
                                        simulation              interactive latency       
                                                                switcher is not confirmed 

                 15 Explicit            Connected, delayed, and Offline-first             Partially
                    autonomous-mode     LOS mode behavior       architecture is claimed;  evidenced
                    transition                                  transition UI and         
                                                                behavior are not detailed 

                 16 Full Composite      All deductions,         0--100 index is claimed;  Partially
                    Health Readiness    thresholds, clamping,   full formula and          evidenced
                    formula             and four states         COMPROMISED state are not 
                                                                detailed                  

                 17 Full SANS score     Risk score grounded in  SANS risk domain is       Partially
                                        ocular and fluid-shift  mentioned; full scoring   evidenced
                                        inputs                  workflow is not detailed  

                 18 Complete            Mission duration,       Microgravity modeling is  Partially
                    microgravity        gravity, HR, HRV, SBP,  claimed; all equations    evidenced
                    deconditioning      and WBC effects         are not confirmed         
                    equations                                                             

                 19 Orbital circadian   Orbital clock and       Orbital phase is          Not evidenced
                    model               sinusoidal              mentioned; full circadian 
                                        physiological variation model is not confirmed    

                 20 Full AP8 model      Contour calculations,   SAA contour model is      Partially
                    implementation      flux, and operational   claimed                   evidenced
                                        impact                                            

                 21 All five DONKI data FLR, SEP, GST, CME, and Kp, storm level, and      Partially
                    categories          WSA-Enlil               flare class are confirmed evidenced
                                                                in branch summary         

                 22 Historical          Offline climatology     Not mentioned             Not evidenced
                    space-weather       dataset and probability                           
                    priors              calculations                                      

                 23 Full ISS orbital    Orbital position,       ISS position and phase    Partially
                    profile             eclipse, SAA, and       endpoint are reported     evidenced
                                        high-latitude profile                             

                 24 OSDR 82-dataset     Manifest and            OSDR-grounded analysis is Partially
                    provenance          four-domain dataset     claimed; all 82 datasets  evidenced
                                        processing              are not verified in       
                                                                branch report             

                 25 NASA TechTransfer   Catalog and             Not mentioned             Not evidenced
                    patent catalog      clinical-domain mapping                           

                 26 External agency     ESA, CSA, JAXA, ISRO,   Not mentioned             Not evidenced
                    partner alignment   and other partner                                 
                                        references                                        

                 27 Full NASA /         Traceable thresholds    OSDR references are       Not evidenced
                    international       and guidance references mentioned; complete       
                    standards mapping                           standards mapping is not  

                 28 AI image-analysis   Multimodal image        Assessment routes are     Not evidenced
                    endpoint            analysis with           mentioned; image-analysis 
                                        structured response     route is not              

                 29 AI provenance       `si_generated`, model,  Not mentioned             Not evidenced
                    metadata            timestamp, provenance,                            
                                        and fallback fields                               

                 30 Audio transcription Recording,              Not mentioned             Not evidenced
                    and voice           transcription, MIME                               
                    interaction         filtering, and verbatim                           
                                        output                                            

                 31 Full privacy        Removal of identifiers  Privacy safeguards are    Partially
                    sanitization audit  and unnecessary private mentioned for check-ins   evidenced
                                        content before AI       and assistant context     
                                        processing                                        

                 32 Five-store          `vitalsQueue`,          Check-in local storage is Partially
                    IndexedDB schema    `alertsStore`,          mentioned; all stores are evidenced
                                        `checkins`,             not confirmed             
                                        `missionCompletions`,                             
                                        `imagingAssessments`                              

                 33 Service-worker      Workbox precaching and  PWA offline architecture  Partially
                    offline boot        offline app shell       is claimed; cache         evidenced
                    verification                                strategy is not detailed  

                 34 Queue               Batch sync,             Background check-in sync  Partially
                    reconciliation and  acknowledgment,         is reported; complete     evidenced
                    idempotency         duplicate prevention,   reconciliation behavior   
                                        and retries             is not                    

                 35 Supabase Realtime   Realtime publication    Supabase or in-memory     Not evidenced
                    and RLS             and row-level security  fallback is mentioned;    
                                                                RLS and Realtime are not  
                                                                detailed                  

                 36 Full alert          Deduplication,          Deduplication and ack-all Partially
                    lifecycle           acknowledgment,         are reported              evidenced
                                        clearing, and history                             

                 37 Daily               ARED, cycle ergometer,  Targeted activities are   Partially
                    countermeasure      SANS visual acuity      mentioned; all routines   evidenced
                    detail              routines                are not enumerated        

                 38 Accessibility and   High contrast,          Responsive UI             Not evidenced
                    cockpit ergonomics  glove-friendly          improvements are          
                                        controls, keyboard      reported; full            
                                        shortcuts, audio alerts accessibility behavior is 
                                                                not                       

                 39 Alarm sonification  Web Audio alert         Not mentioned in branch   Not evidenced
                    controls            behavior and user       report                    
                                        controls                                          

                 40 Formal provenance   Visible labels and      Not mentioned             Not evidenced
                    and synthetic-data  metadata for synthetic                            
                    labeling            assets                                            
  -----------------------------------------------------------------------------------------------------

## 12.3 Features That the Branch Report Does Explicitly Claim

These should still be checked in code, but they are documented as branch
changes:

-   Mission Readiness Index dashboard card.
-   Six-domain spaceflight diagnostic analysis.
-   NASA DONKI integration for Kp index, storm level, and flare class.
-   Flight Assistant connected to FastAPI with local fallback.
-   Check-in background synchronization.
-   Check-in history and assessment routes.
-   Telemetry mission-zone and cumulative-radiation fields.
-   Alert deduplication and batch acknowledgment.
-   SAA analytical contour model.
-   ISS position / orbital phase endpoint.
-   Responsive two-column Check-In layout.
-   Auto-attached vitals sidebar.
-   Full-width daily activity progress bar.
-   Full-width AI Assistant consultation layout.
-   Frontend API service and hook additions.
-   Windows backend dependency adjustment.

## 12.4 Required Repository Audit Before Calling Any Item Missing

For every item in the gap register, the developer should:

1.  Search for the relevant frontend component.
2.  Search for its backend route and service, if applicable.
3.  Trace the data source and transformations.
4.  Verify local persistence and cloud persistence where applicable.
5.  Run the feature and inspect its actual behavior.
6.  Add or run automated tests.
7.  Update the status with evidence, such as file paths, functions,
    endpoint names, and test results.

Use these final audit outcomes:

-   Implemented and tested.
-   Implemented but not adequately tested.
-   Partially implemented.
-   Static UI only.
-   Not implemented.
-   Blocked by hardware, credentials, or external dependency.
-   Not applicable to the current prototype scope.

------------------------------------------------------------------------

# 13. Source Discrepancies and Decisions to Resolve

The three documents contain details that should be reconciled before the
consolidated documentation is treated as the final technical source of
truth.

  -----------------------------------------------------------------------
  Topic                   Difference in supplied  Required decision
                          documents               
  ----------------------- ----------------------- -----------------------
  Mars one-way            Initial concept says up Select a sourced
  communication delay     to 22 minutes;          mission assumption and
                          technical specification use it consistently
                          lists 750.5 seconds /   
                          about 12.5 minutes      

  Python version          Initial concept says    Follow the actual
                          Python 3.14; technical  runtime and deployment
                          specification and       configuration
                          branch report use       
                          Python 3.11             

  React version           Initial concept says    Use the installed
                          React 18 / 19;          package and lockfile
                          technical specification version
                          lists React 18.2        

  Accessibility target    Initial concept says    Select and test one
                          WCAG 2.1 AA; technical  target
                          specification says WCAG 
                          2.2 AA                  

  Readiness categories    Technical specification Confirm all four
                          has four states; branch categories or formally
                          summary names three     revise the
                                                  specification

  AI provider             Technical specification Document the actual
                          describes Gemini; later configured provider and
                          development discussions fallback
                          may refer to other      
                          providers               

  Telemetry count         Technical specification Confirm which values
                          defines twelve          are implemented and
                          parameters; branch      which are proxies or
                          summary lists only a    simulations
                          subset                  

  Persistence             Technical specification Verify actual stores,
                          describes five local    tables, RLS, and
                          stores and Supabase;    synchronization
                          branch report mentions  
                          local check-ins and     
                          Supabase/in-memory      
                          fallback                

  NASA data               Technical specification Distinguish live
                          describes multiple NASA integrations, offline
                          sources and processed   datasets, research
                          datasets; branch        references, and planned
                          summary confirms        work
                          selected DONKI and OSDR 
                          integrations            
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 14. Testing and Verification Plan

## 14.1 Frontend

Verify:

-   Navigation and route behavior.
-   Dashboard rendering.
-   Responsive layouts.
-   Telemetry cards and source labels.
-   Historical trend charts.
-   ECG rendering and cleanup.
-   Check-in workflow.
-   Daily activity completion.
-   Alert acknowledgment.
-   Assistant interaction.
-   Voice recording and transcription, if implemented.
-   Loading, empty, error, and offline states.
-   Keyboard navigation and focus behavior.

## 14.2 Backend

Verify:

-   FastAPI startup.
-   Router registration.
-   Request validation.
-   Response schemas.
-   Telemetry latest and history.
-   Diagnostic analysis.
-   Assistant request and fallback.
-   DONKI integration and cache behavior.
-   ISS position integration.
-   Check-in creation and retrieval.
-   Assessment creation and retrieval.
-   Alert acknowledgment.
-   Supabase persistence.
-   Failure behavior when external services are unavailable.

## 14.3 Offline and Synchronization

Verify:

-   Initial app load.
-   Offline reload after assets are cached.
-   Local check-in persistence.
-   Local activity persistence.
-   Telemetry queue behavior.
-   Pending synchronization indicators.
-   Reconnection.
-   Retry behavior.
-   Duplicate prevention.
-   Partial batch failure.
-   Server acknowledgment.
-   Historical retrieval after synchronization.

## 14.4 Simulation and Analytical Tests

Test:

-   Nominal baseline.
-   Hypoxia.
-   Tachycardia.
-   Bradycardia.
-   Radiation spike.
-   SAA transit.
-   Compound crisis.
-   Other documented fault-injection modes.
-   Mission-zone changes.
-   Readiness score thresholds.
-   Boundary values and invalid inputs.
-   Offline deterministic fallback.

## 14.5 Commands and Test Evidence

Use the commands configured in the repository. The branch document
references Vitest and Pytest. Confirm the actual package scripts and
test configuration before running commands.

The branch report states that automated suites passed, but this
consolidated document does not independently verify that claim. Record
the actual command, result, date, and environment after execution.

------------------------------------------------------------------------

# 15. Development Priorities

The following order is recommended for turning the consolidated
specification into a reliable implementation.

## Priority 1 --- Verify the Existing Core

-   Confirm telemetry source and update cadence.
-   Confirm deterministic analyzer behavior.
-   Confirm readiness score calculations.
-   Confirm local IndexedDB persistence.
-   Confirm backend API connectivity.
-   Confirm check-in persistence and synchronization.
-   Confirm alert generation and lifecycle.

## Priority 2 --- Complete the Mission-Critical Demonstrations

-   Mission-zone and communication-latency switcher.
-   Autonomous Edge / Loss of Signal mode.
-   Cumulative radiation dosimeter and limits.
-   SANS and microgravity symptom logger.
-   Fault-injection scenario controls.
-   Clear simulated-versus-connected telemetry labeling.

## Priority 3 --- Verify Advanced Technical Capabilities

-   3D anatomical health map.
-   Guided imaging and self-exam workflows.
-   Full ECG pipeline.
-   Full twelve-parameter telemetry model.
-   Orbital and circadian modeling.
-   Full space-weather ingestion.
-   Historical OSDR baseline provenance.

## Priority 4 --- Reliability, Privacy, and Accessibility

-   Complete offline queue reconciliation.
-   Supabase RLS and Realtime verification.
-   AI privacy filtering.
-   AI provenance metadata.
-   Voice transcription safeguards.
-   Keyboard and high-contrast operation.
-   Alert sound behavior and user controls.

## Priority 5 --- Documentation and Presentation

-   Maintain a single source of truth.
-   Document actual implemented behavior.
-   Label simulations and limitations.
-   Maintain endpoint and data-schema references.
-   Keep screenshots consistent with the current application.
-   Update the gap register after every implementation cycle.

------------------------------------------------------------------------

# 16. Final Project Definition

BioTelemetry is an offline-first autonomous crew health-monitoring and
decision-support prototype for long-duration space exploration. It
combines physiological and environmental telemetry, deterministic risk
analysis, mission-context modeling, crew wellness reporting, and
local-first data persistence. Its purpose is to help crew members
monitor health conditions and respond to potential risks during
communication delays and Loss of Signal.

The project's defining innovation is not simply the presence of a
dashboard, charts, or an AI chatbot. It is the integration of edge-based
monitoring, deterministic analysis, operational context, and resilient
data handling into one coherent workflow.

The system should demonstrate the following end-to-end capability:

**Monitor → Analyze → Alert → Guide → Record → Synchronize**

The dashboard should make these stages understandable and verifiable.
Each displayed measurement should have a traceable source, each alert
should have a defined trigger, each recommendation should have an
identified basis, and each saved record should have a clear persistence
and synchronization state.

The project must be presented honestly as a prototype: simulated data,
analytical approximations, external API dependencies, and unavailable
hardware must be clearly identified. A documented capability is not
automatically an implemented capability, and a visually complete
interface is not proof of a working backend.

------------------------------------------------------------------------

# Appendix A --- Consolidated Feature Checklist

Use this checklist during repository inspection and implementation
review.

## Monitoring and telemetry

-   [ ] Heart rate
-   [ ] SpO₂
-   [ ] Core body temperature
-   [ ] Blood pressure
-   [ ] Respiration rate
-   [ ] HRV / RMSSD
-   [ ] Ambient radiation dose rate
-   [ ] Cumulative radiation dose
-   [ ] Blood glucose
-   [ ] Leukocyte / WBC estimate
-   [ ] Hydration / fluid-balance estimate
-   [ ] ECG Lead-II waveform
-   [ ] Spacesuit battery / life-support telemetry

## Analysis and simulation

-   [ ] Deterministic analyzer
-   [ ] Composite Mission Readiness Index
-   [ ] Four readiness states
-   [ ] SANS risk modeling
-   [ ] Microgravity deconditioning
-   [ ] Circadian/orbital variation
-   [ ] AP8/SAA approximation
-   [ ] Six-domain risk analysis
-   [ ] Seventeen fault-injection modes
-   [ ] Mission-zone modeling
-   [ ] Communication latency / LOS switcher

## Crew workflows

-   [ ] Three-step wellness check-in
-   [ ] Symptom logger
-   [ ] SANS symptom assessment
-   [ ] Sleep and fatigue history
-   [ ] Mood and stress history
-   [ ] Nutrition and hydration records
-   [ ] Daily countermeasure activities
-   [ ] Activity completion history
-   [ ] Auto-attached vitals
-   [ ] Medical self-exam records
-   [ ] Guided image capture

## Decision support

-   [ ] Flight Assistant API
-   [ ] SBAR response format
-   [ ] Escalation conditions
-   [ ] Deterministic offline fallback
-   [ ] Privacy filtering
-   [ ] AI provenance metadata
-   [ ] Voice recording
-   [ ] Audio transcription
-   [ ] Image-analysis endpoint
-   [ ] Offline imaging checklist

## Space environment

-   [ ] DONKI solar flares
-   [ ] DONKI solar energetic particles
-   [ ] DONKI geomagnetic storms
-   [ ] DONKI coronal mass ejections
-   [ ] WSA-Enlil integration
-   [ ] ISS position and orbital phase
-   [ ] SAA transit detection
-   [ ] Historical space-weather priors
-   [ ] Radiation alert lifecycle

## Architecture and reliability

-   [ ] PWA installability
-   [ ] Service-worker precaching
-   [ ] Offline application shell
-   [ ] IndexedDB / Dexie schema
-   [ ] All five documented local stores
-   [ ] Offline record creation
-   [ ] Sync queue
-   [ ] Retry and idempotency
-   [ ] Supabase persistence
-   [ ] Supabase RLS
-   [ ] Supabase Realtime
-   [ ] Error and empty states
-   [ ] Responsive UI
-   [ ] Accessibility verification
-   [ ] Automated frontend tests
-   [ ] Automated backend tests

------------------------------------------------------------------------

# Appendix B --- Source Document Ownership

  -----------------------------------------------------------------------
  Source                  Owner label supplied by Main contribution to
                          user                    this consolidated
                                                  document
  ----------------------- ----------------------- -----------------------
  Document 1              Sakin                   Challenge context,
                                                  project concept,
                                                  innovation, initial
                                                  feature outline, stack,
                                                  APIs, and resources

  Document 2              Rence                   Detailed technical
                                                  specification, system
                                                  architecture,
                                                  mathematical models,
                                                  data sources,
                                                  standards, and intended
                                                  capabilities

  Document 3              Joem                    `em-branch` versus
                                                  `master` implementation
                                                  summary, backend and
                                                  frontend changes, and
                                                  challenge requirement
                                                  mapping
  -----------------------------------------------------------------------

**Document control:** This consolidated Markdown file is the combined
project reference. Update it when the implementation changes, and retain
the gap register as a living audit record.

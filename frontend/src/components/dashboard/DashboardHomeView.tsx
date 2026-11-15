import React from 'react';
import { 
  Heart, 
  Wind, 
  Thermometer, 
  Waves, 
  Activity, 
  ShieldCheck, 
  ClipboardCheck, 
  Orbit, 
  CalendarDays, 
  ArrowRight, 
  Check, 
  Circle, 
  Wifi, 
  WifiOff, 
  Clock
} from 'lucide-react';
import { MissionProgress } from '../AppShell';
import { VitalCard } from '../VitalCard';
import { AlertBanner } from '../AlertBanner';
import { PhysiologicalTrendsSection } from './PhysiologicalTrendsSection';
import { CardiovascularSection } from './CardiovascularSection';
import { SpaceEnvironmentSection } from './SpaceEnvironmentSection';
import { MissionOperationsSection } from './MissionOperationsSection';
import { AIAssistantCard } from './AIAssistantCard';
import { missionCatalog, localDate } from '../../services/missions';
import type { useTelemetry } from '../../hooks/useTelemetry';
import type { useWellness } from '../../hooks/useWellness';
import type { useEnvironment } from '../../hooks/useEnvironment';
import type { Astronaut, AlertItem } from '../../types/telemetry';
import type { MissionCompletion } from '../../types/wellness';

type Telemetry = ReturnType<typeof useTelemetry>;
type WellnessHook = ReturnType<typeof useWellness>;
type EnvironmentHook = ReturnType<typeof useEnvironment>;

interface DashboardHomeViewProps {
  telemetry: Telemetry;
  wellness: WellnessHook;
  environment: EnvironmentHook;
}

export const DashboardHomeView: React.FC<DashboardHomeViewProps> = ({
  telemetry: t,
  wellness,
  environment
}) => {
  const astronaut = t.crew.find((member: Astronaut) => member.id === t.activeId);
  const today = localDate();
  const v = t.vitals;
  const observations = t.alerts.filter((alert: AlertItem) => alert.astronaut_id === t.activeId);
  const completed = wellness.completions.filter((item: MissionCompletion) => item.date === today);
  const todayRecord = [...wellness.records]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .find(record => localDate(new Date(record.createdAt)) === today);

  async function toggleMission(id: string) {
    try {
      await wellness.toggleActivity(id, today);
    } catch {
      /* Shared activity error state handles notification */
    }
  }

  // Active or critical alert counts
  const pendingAlerts = observations.filter((a: AlertItem) => !a.acknowledged);

  return (
    <div className="dashboard-master-flow animate-fade-in">
      {/* 1. UPGRADED WELCOME & OPERATIONAL STATUS HEADER */}
      <header className="dashboard-hero-header">
        <div className="header-top-row">
          <div className="header-greeting-wrap">
            <span className="hero-eyebrow">ASTRONAUT OPERATIONAL CONSOLE</span>
            <h1 className="hero-welcome-title">
              Good day, {astronaut?.name.replace('Dr. ', '').split(' ')[0] ?? 'Explorer'}.
            </h1>
            <p className="hero-welcome-sub">
              Your mission health workspace. Review your physiological trends, daily activities, and operational environment.
            </p>
          </div>

          <div className="header-meta-chips">
            <a href="#landing" className="meta-chip btn-back-home" title="Return to Landing Page">
              <ArrowRight size={14} className="rotate-180 text-cyan" />
              <span>Back to Home</span>
            </a>
            <div className="meta-chip">
              <CalendarDays size={15} className="text-cyan" />
              <span>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <div className="meta-chip">
              <span className="dot-pulse" />
              <span>MISSION DAY <strong>42 (SOL 18)</strong></span>
            </div>
            <div className="meta-chip font-mono">
              <span>CREW ID: <strong>{t.activeId}</strong></span>
            </div>
          </div>
        </div>

        {/* Compact Operational Status Strip */}
        <div className="dashboard-status-strip">
          <div className="status-strip-col">
            <span className="col-label">SYSTEM STATUS</span>
            <span className="col-val text-emerald">
              <span className="status-dot dot-emerald" /> NOMINAL ONLINE
            </span>
          </div>
          <div className="status-strip-divider" />

          <div className="status-strip-col">
            <span className="col-label">DATA CONNECTION</span>
            <span className={`col-val ${t.offline ? 'text-warning' : 'text-cyan'}`}>
              {t.offline ? <WifiOff size={14} /> : <Wifi size={14} />}
              {t.offline ? 'OFFLINE (BUFFERED)' : t.gateway ? 'LINKED (SIM GATEWAY)' : 'STANDALONE EDGE'}
            </span>
          </div>
          <div className="status-strip-divider" />

          <div className="status-strip-col">
            <span className="col-label">MISSION MODE</span>
            <span className="col-val text-purple">
              {t.los ? 'AUTONOMOUS EDGE (LOS)' : 'DUAL TELEMEDICINE (AOS)'}
            </span>
          </div>
          <div className="status-strip-divider" />

          <div className="status-strip-col">
            <span className="col-label">LAST TELEMETRY SYNC</span>
            <span className="col-val font-mono">
              <Clock size={13} className="text-muted" />
              {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>
      </header>

      {/* 2. DAILY WELLNESS CHECK-IN PROMINENT BANNER */}
      <section className="panel bio-dashboard-panel wellness-action-banner">
        <div className="banner-left-content">
          <div className="banner-icon-badge">
            <ClipboardCheck size={28} className="text-cyan" />
          </div>
          <div className="banner-text-info">
            <h2>{todayRecord ? 'You’ve completed today’s check-in.' : 'How are you feeling today?'}</h2>
            <p>
              {todayRecord
                ? `Personal health record logged: mood was recorded as “${todayRecord.mood.toLowerCase()}” with ${todayRecord.sleepHours} hrs sleep. Indexed securely on this edge node.`
                : 'Complete your daily wellness assessment to maintain your personal health record and update the flight surgeon log.'}
            </p>
            <div className="banner-sub-pills">
              <span className="sub-pill">Sleep Quality Log</span>
              <span className="sub-pill">Mood & Stress Metric</span>
              <span className="sub-pill">Exercise & Physical Work</span>
              <span className="sub-pill">Symptom Quick-Report</span>
            </div>
          </div>
        </div>

        <div className="banner-right-action">
          <a href="#checkin" className="button primary btn-glow-cyan">
            <span>{todayRecord ? 'Update Today’s Health' : 'Record Today’s Health'}</span>
            <ArrowRight size={17} />
          </a>
          {todayRecord && <span className="banner-sync-note">Locally stored • Ready for uplink</span>}
        </div>
      </section>

      {/* 3. PHYSIOLOGICAL HEALTH OVERVIEW (METRICS GRID) */}
      <section className="panel bio-dashboard-panel physiological-overview-panel">
        <div className="section-heading">
          <div className="panel-title-group">
            <span className="panel-eyebrow">BIO-RESILIENCE SENSORS</span>
            <h2>
              <Heart size={18} className="text-cyan" />
              Physiological Health Overview
            </h2>
          </div>
          <div className="telemetry-badges-row">
            <span className="pill pill-cyan">
              <span className="status-dot dot-cyan" /> 1.2s STREAM CADENCE
            </span>
            <span className="pill">SIMULATED SENSOR SAMPLES</span>
          </div>
        </div>

        <p className="section-description">
          Primary biometric indicators captured via smart-suit telemetry and near-field astronaut monitors.
        </p>

        <div className="vitals-command-grid">
          <VitalCard
            label="Heart Rate"
            value={v.heart_rate}
            unit="BPM"
            icon={Heart}
            status={v.heart_rate > 120 || v.heart_rate < 45 ? 'CRITICAL' : v.heart_rate > 100 || v.heart_rate < 50 ? 'WARNING' : 'NORMAL'}
            baseline={`Resting ref: ${astronaut?.resting_hr ?? 62} BPM`}
            ariaLabel={`Heart rate ${v.heart_rate} beats per minute`}
          />

          <VitalCard
            label="Blood Oxygen Saturation"
            value={v.spo2}
            unit="% SpO2"
            icon={Wind}
            status={v.spo2 < 90 ? 'CRITICAL' : v.spo2 < 95 ? 'WARNING' : 'NORMAL'}
            baseline={`Baseline ref: ${astronaut?.baseline_spo2 ?? 98.8}%`}
            ariaLabel={`Blood oxygen ${v.spo2} percent`}
          />

          <VitalCard
            label="Core Body Temperature"
            value={v.core_temp}
            unit="°C"
            icon={Thermometer}
            status={v.core_temp > 37.8 ? 'WARNING' : 'NORMAL'}
            baseline="Normal: 36.5 - 37.5 °C"
            ariaLabel={`Body temperature ${v.core_temp} Celsius`}
          />

          <VitalCard
            label="Respiration Rate"
            value={v.respiration_rate ?? 14}
            unit="breaths/min"
            icon={Wind}
            status="NORMAL"
            baseline="Normal: 12 - 18 /min"
            ariaLabel={`Respiration rate ${v.respiration_rate ?? 14} breaths per minute`}
          />

          <VitalCard
            label="Heart Rate Variability (HRV)"
            value={v.hrv}
            unit="ms"
            icon={Waves}
            status={v.hrv < 30 ? 'WARNING' : 'NORMAL'}
            baseline="Target: > 45 ms"
            ariaLabel={`Heart rate variability ${v.hrv} milliseconds`}
          />

          <VitalCard
            label="Arterial Blood Pressure"
            value={v.systolic_bp !== undefined && v.diastolic_bp !== undefined ? `${v.systolic_bp}/${v.diastolic_bp}` : '118/76'}
            unit="mmHg"
            icon={Activity}
            status="NORMAL"
            baseline="Nominal: 120/80 mmHg"
            ariaLabel="Arterial blood pressure 118 over 76 mmHg"
          />
        </div>
      </section>

      {/* 4. HEALTH ALERTS & REVIEW CENTER */}
      <section className="panel bio-dashboard-panel review-center-panel">
        <div className="section-heading">
          <div className="panel-title-group">
            <span className="panel-eyebrow">CLINICAL TRIAGE SUPPORT</span>
            <h2>
              <ShieldCheck size={18} className="text-cyan" />
              Health Alerts & Review Center
            </h2>
          </div>
          <span className={`pill ${pendingAlerts.length ? 'pill-warning' : 'pill-nominal'}`}>
            {pendingAlerts.length} PENDING REVIEW
          </span>
        </div>

        <AlertBanner alerts={observations} onAcknowledge={t.acknowledge} />

        <div className="alerts-meta-footer">
          <p className="helper">
            {t.gateway
              ? 'Telemetry anomaly detection engine evaluates vitals against NASA-STD-3001 spaceflight clinical thresholds.'
              : 'Standalone edge diagnostic mode active. Historical notifications are cached in client IndexedDB.'}
          </p>
          <a href="#analytics" className="text-link">
            See past notifications and logs <ArrowRight size={15} />
          </a>
        </div>
      </section>

      {/* 5. CARDIOVASCULAR MONITORING & ECG (FULLY VISIBLE, EXPANDED) */}
      <CardiovascularSection vitals={v} activeId={t.activeId} />

      {/* 6. PHYSIOLOGICAL TRENDS WITH RANGE SELECTOR */}
      <PhysiologicalTrendsSection records={wellness.records} baselineHeartRate={astronaut?.resting_hr} />

      {/* 7. TWO-COLUMN SPLIT: DAILY CREW ACTIVITIES & ASTRODOC AI */}
      <div className="dashboard-split-two-col">
        {/* Left: Daily Crew Activities */}
        <section className="panel bio-dashboard-panel daily-activities-expanded-panel">
          <div className="section-heading">
            <div className="panel-title-group">
              <span className="panel-eyebrow">COUNTERMEASURE PROTOCOLS</span>
              <h2>
                <Orbit size={18} className="text-cyan" />
                Daily Crew Activities & Progress
              </h2>
            </div>
            <span className="pill pill-cyan">
              {completed.length} of {missionCatalog.length} Completed
            </span>
          </div>

          <p className="section-description">
            Physical exercise, sleep scheduling, and psychological resilience tasks designed to counter deep-space microgravity hazards.
          </p>

          <MissionProgress completed={completed.length} total={missionCatalog.length} />

          <div className="activities-list-grid">
            {missionCatalog.slice(0, 6).map(mission => {
              const isDone = completed.some(item => item.missionId === mission.id);
              return (
                <button
                  key={mission.id}
                  onClick={() => void toggleMission(mission.id)}
                  disabled={wellness.loading || wellness.activitySaving}
                  aria-pressed={isDone}
                  className={`activity-item-card ${isDone ? 'completed' : ''}`}
                >
                  <div className="activity-item-icon">
                    {isDone ? <Check size={18} className="text-emerald" /> : <Circle size={18} className="text-muted" />}
                  </div>
                  <div className="activity-item-details">
                    <span className="activity-cat">{mission.category}</span>
                    <strong className="activity-title">{mission.title}</strong>
                    <span className="activity-kind">{mission.kind}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="activities-footer-bar">
            <a href="#missions" className="button secondary btn-compact">
              <span>View All 9 Activities</span>
              <ArrowRight size={15} />
            </a>
          </div>
        </section>

        {/* Right: AstroDoc AI Assistant Quick Access */}
        <AIAssistantCard />
      </div>

      {/* 8. SPACE ENVIRONMENT & EXPOSURE (FULLY EXPANDED) */}
      <SpaceEnvironmentSection
        context={environment.context}
        settings={environment.settings}
        settingsError={environment.error}
        records={wellness.records}
        onSave={environment.save}
        radiationRate={v.radiation_rate}
      />

      {/* 9. MISSION OPERATIONS & INTERPLANETARY SIMULATION (FULLY EXPANDED) */}
      <MissionOperationsSection
        astronaut={astronaut}
        activeId={t.activeId}
        gateway={t.gateway}
        offline={t.offline}
        los={t.los}
        toggleLos={() => t.setLos(!t.los)}
        pendingCount={t.pending}
        syncing={t.syncing}
        sync={t.sync}
        lastUpdated={new Date(v.timestamp).toLocaleTimeString()}
        currentAnomaly={t.anomaly}
        onTriggerAnomaly={t.setAnomaly}
        onRunDiagnostics={t.diagnose}
        isDiagnosing={t.diagnosing}
      />
    </div>
  );
};

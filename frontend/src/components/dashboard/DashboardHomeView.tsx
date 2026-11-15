import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Award,
  CalendarDays,
  Check,
  Circle,
  Flame,
  Orbit,
  Radio,
  ShieldCheck,
  Waves,
} from 'lucide-react';
import { MissionProgress, PageHeading } from '../AppShell';
import { ECGMonitor } from '../ECGMonitor';
import { MultiMetricChart } from '../MultiMetricChart';
import { BodyHealthMap } from '../BodyHealthMap';
import { SelfExamCapture } from '../SelfExamCapture';
import { AlertBanner } from '../AlertBanner';
import { AnomalyDemoBar } from '../AnomalyDemoBar';
import { SpaceEnvironmentPanel } from '../SpaceEnvironment';
import { evaluateMissionRoutines } from '../../services/missionRoutines';
import { localDate } from '../../services/missions';
import { resolveSimulationKp } from '../../services/simulationConfig';
import type { useTelemetry } from '../../hooks/useTelemetry';
import type { useWellness } from '../../hooks/useWellness';
import type { useEnvironment } from '../../hooks/useEnvironment';
import type { useSpaceWeather } from '../../hooks/useSpaceWeather';
import type { ImageAssessmentRecord, SelfExamType, AlertItem } from '../../types/telemetry';

type Telemetry = ReturnType<typeof useTelemetry>;
type WellnessHook = ReturnType<typeof useWellness>;
type EnvironmentHook = ReturnType<typeof useEnvironment>;
type SpaceWeatherHook = ReturnType<typeof useSpaceWeather>;

interface DashboardHomeViewProps {
  telemetry: Telemetry;
  wellness: WellnessHook;
  environment: EnvironmentHook;
  spaceWeather: SpaceWeatherHook;
  assessments: ImageAssessmentRecord[];
  onAssessmentSaved: (record: ImageAssessmentRecord) => void;
  onOpenSelfExam: (exam: SelfExamType) => void;
  onAskAi: (focus: string, query: string) => void;
}

export const DashboardHomeView: React.FC<DashboardHomeViewProps> = ({
  telemetry: t,
  wellness,
  environment,
  spaceWeather: sw,
  assessments,
  onAssessmentSaved,
  onOpenSelfExam: externalOpenSelfExam,
  onAskAi,
}) => {
  const astronaut = t.crew.find(member => member.id === t.activeId);
  const today = localDate();
  const v = t.vitals;
  const observations = t.alerts.filter((alert: AlertItem) => alert.astronaut_id === t.activeId);
  const unacknowledged = observations.filter(a => !a.acknowledged);
  const latest = [...wellness.records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const todayRecord = [...wellness.records]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .find(record => localDate(new Date(record.createdAt)) === today);

  const [showSelfExam, setShowSelfExam] = useState(false);
  const [activeExamType, setActiveExamType] = useState<SelfExamType>('dermal_radiation');

  function openSelfExam(examType: SelfExamType) {
    setActiveExamType(examType);
    setShowSelfExam(true);
    externalOpenSelfExam?.(examType);
  }

  const parsedDatumKp = (() => {
    const m = sw.datum?.value?.match(/Kp\s*([\d.]+)/i);
    return m ? Number(m[1]) : undefined;
  })();

  const kpIndex = resolveSimulationKp(t.simConfig, sw.snapshot?.kp_current ?? parsedDatumKp ?? 2.3);

  const readiness = useMemo(
    () =>
      evaluateMissionRoutines({
        vitals: v,
        records: wellness.records,
        completions: wellness.completions,
        assessments,
        kpIndex,
      }),
    [v, wellness.records, wellness.completions, assessments, kpIndex],
  );

  async function toggleMission(id: string) {
    try {
      await wellness.toggleActivity(id, today);
    } catch {
      /* Shared activity state handles error presentation */
    }
  }

  function handleRoutinePrompt() {
    const prompt = readiness.nextPrompt;
    if (prompt.targetExam) {
      openSelfExam(prompt.targetExam);
      return;
    }
    window.location.hash = prompt.targetPage;
  }

  const isBleMeasured = v.telemetry_source === 'measured';
  const wbc = v.wbc_k_ul ?? 6.2;
  const showAlertsPanel = unacknowledged.length > 0;

  return (
    <>
      <PageHeading
        eyebrow="YOUR DAY AT A GLANCE"
        title={`Hi, ${astronaut?.name.replace('Dr. ', '').split(' ')[0] ?? 'explorer'}.`}
        description="Monitor mission vitals, inspect body systems, and log daily countermeasures."
        action={
          <span className="date-label">
            <CalendarDays size={17} />
            {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        }
      />

      {showAlertsPanel && (
        <section className="panel observation-panel dashboard-alert-top">
          <div className="section-heading compact">
            <h2>
              <ShieldCheck size={17} />
              Things to review
            </h2>
            <span className="pill">{unacknowledged.length} active</span>
          </div>
          <AlertBanner
            alerts={observations}
            onAcknowledge={t.acknowledge}
            onAcknowledgeAll={() => void t.acknowledgeAll()}
          />
        </section>
      )}

      {/* RENCE'S DUAL HERO ROW: 3D ANATOMICAL BODY MAP + LIVE WAVEFORM & MULTIMETRIC TRENDS */}
      <div className="dashboard-top-row">
        <BodyHealthMap
          vitals={v}
          latestCheckIn={todayRecord ?? latest}
          completions={wellness.completions}
          kpIndex={kpIndex}
          onOpenSelfExam={openSelfExam}
          onAskAi={system => {
            onAskAi?.(
              system.label,
              `Review my ${system.label.toLowerCase()} status (${system.primaryMetric}) under current mission conditions and list countermeasures.`,
            );
            window.location.hash = 'ai';
          }}
        />

        <section className="panel dashboard-hero-telemetry" aria-labelledby="telemetry-trends-heading">
          <div className="section-heading compact">
            <div>
              <h2 id="telemetry-trends-heading">Live waveform &amp; vital trends</h2>
              <span className="muted" style={{ fontSize: 12 }}>
                {isBleMeasured ? 'BLE R-R' : '100 Hz Lead-II'} illustrative rhythm · Multi-vital rolling trends
              </span>
            </div>
            <span className="pill">{t.telemetryHistory.length} pts · Live</span>
          </div>
          <div className="hero-combined-telemetry">
            <ECGMonitor
              key={t.activeId}
              ecgSamples={v.ecg_samples}
              heartRate={v.heart_rate}
              telemetrySource={v.telemetry_source}
              sampleRateHz={v.ecg_sample_rate_hz}
              orbitalPhase={v.orbital_phase}
              compact
            />
            <MultiMetricChart samples={t.telemetryHistory} compact extended />
          </div>
          <a href="#analytics" className="text-link">
            Full health analytics &amp; history
            <ArrowRight size={16} />
          </a>
        </section>
      </div>

      {showSelfExam && (
        <SelfExamCapture
          astronautId={t.activeId}
          vitals={v}
          kpIndex={kpIndex}
          offline={t.offline}
          examType={activeExamType}
          onExamTypeChange={setActiveExamType}
          assessments={assessments}
          onAssessmentSaved={record => {
            onAssessmentSaved(record);
          }}
          onClose={() => setShowSelfExam(false)}
        />
      )}

      {/* SECONDARY SUIT & AUTONOMIC METRICS STRIP */}
      <section className="secondary-metrics-strip" aria-labelledby="secondary-metrics-heading">
        <div className="section-heading compact">
          <h2 id="secondary-metrics-heading">Secondary suit &amp; autonomic metrics</h2>
          <span className="pill">{isBleMeasured ? 'Measured BLE + NASA sim' : 'NASA-calibrated simulation'}</span>
        </div>
        <div className="secondary-vitals">
          <div>
            <Activity size={19} />
            <span>
              Blood pressure &amp; resp
              <strong>
                {v.systolic_bp !== undefined && v.diastolic_bp !== undefined
                  ? `${v.systolic_bp}/${v.diastolic_bp}`
                  : '—'}{' '}
                <small>mmHg · {v.respiration_rate ?? '—'} rpm</small>
              </strong>
            </span>
          </div>
          <div>
            <Waves size={19} />
            <span>
              HRV (autonomic)
              <strong>
                {v.hrv} <small>ms</small>
              </strong>
            </span>
          </div>
          <div>
            <Activity size={19} />
            <span>
              Immune leukocyte
              <strong>
                {wbc} <small>K/uL</small>
              </strong>
              {wbc < 3.8 && <small className="warning-text">Suppressed (OSD-575)</small>}
            </span>
          </div>
          <div>
            <Radio size={19} />
            <span>
              Suit &amp; comms link
              <strong>
                {v.battery_level ?? '—'}%{' '}
                <small>
                  bat ·{' '}
                  {v.comms_latency_sec !== undefined
                    ? v.comms_latency_sec < 1
                      ? `${Math.round(v.comms_latency_sec * 1000)} ms`
                      : v.comms_latency_sec < 60
                        ? `${v.comms_latency_sec.toFixed(1)} s`
                        : `${(v.comms_latency_sec / 60).toFixed(1)} min`
                    : '—'}{' '}
                  lag
                </small>
              </strong>
            </span>
          </div>
        </div>
      </section>

      {/* READINESS & ROUTINE PROTOCOL PANEL */}
      <section className="panel daily-panel" aria-labelledby="readiness-heading">
        <div className="daily-panel-grid">
          <div className="daily-panel-overview">
            <div className="section-heading">
              <h2 id="readiness-heading">
                <Orbit size={20} />
                Readiness &amp; Routine
              </h2>
              <span className="pill">{readiness.readinessScore}% Ready</span>
            </div>
            <div className="readiness-dashboard-meta">
              <span>
                <Flame size={14} aria-hidden="true" /> {readiness.streakDays}d streak
              </span>
              <span>
                <Award size={14} aria-hidden="true" /> {readiness.compliancePct}% compliance ·{' '}
                {readiness.badges.filter(b => b.earned).length}/{readiness.badges.length} badges
              </span>
            </div>
            <div className="readiness-breakdown" aria-label="Readiness score breakdown">
              <span>Telemetry {readiness.readinessBreakdown.telemetry}</span>
              <span>Check-In {readiness.readinessBreakdown.checkIn}</span>
              <span>Protocols {readiness.readinessBreakdown.countermeasures}</span>
              <span>Ocular {readiness.readinessBreakdown.ocularExam}</span>
            </div>
            <div className={`routine-prompt-card priority-${readiness.nextPrompt.priority}`}>
              <strong>{readiness.nextPrompt.title}</strong>
              <p>{readiness.nextPrompt.detail}</p>
              <button type="button" className="button secondary compact-btn" onClick={handleRoutinePrompt}>
                {readiness.nextPrompt.actionLabel}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
          <div className="daily-panel-tasks">
            {wellness.loading ? (
              <p role="status">Loading saved protocol progress…</p>
            ) : wellness.activitiesError ? (
              <p className="helper">Saved protocol progress is unavailable. Please retry loading.</p>
            ) : (
              <MissionProgress completed={readiness.verifiedCount} total={readiness.totalProtocols} />
            )}
            <div className="mini-missions">
              {readiness.topProtocols.map(item => {
                const isBusy = wellness.loading || wellness.activitySaving || !!wellness.activitiesError;
                const isAuto = item.status === 'auto-verified';
                return (
                  <button
                    key={item.mission.id}
                    type="button"
                    onClick={() => {
                      if (item.canManualToggle) {
                        void toggleMission(item.mission.id);
                      } else if (item.targetExam) {
                        openSelfExam(item.targetExam);
                      } else {
                        window.location.hash = item.targetPage ?? 'checkin';
                      }
                    }}
                    disabled={item.canManualToggle && isBusy}
                    aria-pressed={item.canManualToggle ? item.completed : undefined}
                  >
                    {item.completed ? <Check size={19} className="success-text" /> : <Circle size={19} />}
                    <span>{item.mission.title}</span>
                    <small className="protocol-verified-pill">
                      {isAuto ? 'Auto' : item.completed ? 'Confirmed' : item.actionLabel ?? 'Confirm'}
                    </small>
                  </button>
                );
              })}
            </div>
            <a href="#missions" className="text-link">
              All countermeasures &amp; compliance
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      {/* SPACE ENVIRONMENT, LIVE WEATHER & SIMULATION DISCLOSURE */}
      <details className="panel disclosure">
        <summary className="unified-controls-summary">
          <span>Space Environment, Live Weather &amp; Simulation Controls</span>
          <span className="pill">
            {t.simConfig.missionZone.replace('_', ' ')} · Kp {kpIndex.toFixed(1)}
            {t.anomaly !== 'NONE' ? ` · ${t.anomaly}` : ''}
          </span>
        </summary>
        <div className="disclosure-content stack">
          <SpaceEnvironmentPanel
            context={environment.context}
            records={wellness.records}
            vitals={v}
            spaceWeatherSnapshot={sw.snapshot}
            issFeed={sw.issFeed}
            spaceWeatherLoading={sw.loading}
            realtimeConnected={sw.realtimeConnected}
            offline={t.offline}
            onRefreshSpaceWeather={() => void sw.refresh()}
            onRefreshIss={() => void sw.refreshIss()}
            hideScenarioControls={true}
          />
          <section className="panel" aria-labelledby="mission-sim-heading">
            <div className="section-heading">
              <h2 id="mission-sim-heading">Mission Simulation &amp; NASA Diagnostic Engine</h2>
              <span className="pill">{v.orbital_phase?.replace('_', ' ').toUpperCase() ?? 'ORBITAL'}</span>
            </div>
            <p className="helper">
              {astronaut?.role} · {t.activeId} · Source:{' '}
              {t.gateway ? 'NASA-calibrated API server' : 'local simulation'} · Updated{' '}
              {new Date(v.timestamp).toLocaleTimeString()}
            </p>
            <AnomalyDemoBar
              currentAnomaly={t.anomaly}
              simConfig={t.simConfig}
              vitals={v}
              onTrigger={t.setAnomaly}
              onUpdateSimConfig={t.setSimConfig}
              onRunDiagnostics={t.diagnose}
              isDiagnosing={t.diagnosing}
            />
          </section>
        </div>
      </details>
    </>
  );
};

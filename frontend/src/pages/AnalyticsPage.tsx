import { useState } from 'react';
import { Activity, ArrowRight, Radio, ShieldCheck } from 'lucide-react';
import type { AlertItem, Astronaut, ImageAssessmentRecord, VitalSigns } from '../types/telemetry';
import type { CheckIn, TimeRange } from '../types/wellness';
import type { SimulationConfig } from '../services/simulationConfig';
import { average, recordsInRange } from '../services/analytics';
import { SELF_EXAM_GUIDES } from '../services/selfExams';
import { EmptyState, PageHeading } from '../components/AppShell';
import { MultiMetricChart } from '../components/MultiMetricChart';
import { TrendChart } from '../components/TrendChart';
import { SpaceWellnessTrends, SpaceRecordDetails } from '../components/SpaceWellnessTrends';

type AnalyticsSection = 'all' | 'live' | 'checkins' | 'exams';

export function AnalyticsPage({
  records,
  astronaut,
  alerts,
  assessments = [],
  vitals,
  telemetryHistory = [],
  simConfig,
  kpIndex = 2.3,
  recordsLoading = false,
  recordsError = '',
}: {
  records: CheckIn[];
  astronaut?: Astronaut;
  alerts: AlertItem[];
  assessments?: ImageAssessmentRecord[];
  vitals?: VitalSigns;
  telemetryHistory?: VitalSigns[];
  simConfig?: SimulationConfig;
  kpIndex?: number;
  recordsLoading?: boolean;
  recordsError?: string;
}) {
  const [range, setRange] = useState<TimeRange>('week');
  const [section, setSection] = useState<AnalyticsSection>('all');
  const [showAll, setShowAll] = useState(false);

  const filtered = recordsInRange(records, range);
  const metric = (key: 'sleepHours' | 'fatigue' | 'stress') =>
    filtered.map(record => ({ time: record.createdAt, value: record[key] }));
  const heart = filtered
    .filter(record => record.biometrics)
    .map(record => ({ time: record.createdAt, value: record.biometrics!.heart_rate }));
  const glucosePoints = filtered.flatMap(record => {
    const val = record.metabolic?.bloodGlucoseMgDl ?? record.biometrics?.blood_glucose;
    return val !== undefined ? [{ time: record.createdAt, value: val }] : [];
  });
  const heartAverage = average(heart.map(point => point.value));
  const sleepAverage = average(filtered.map(record => record.sleepHours));
  const latest = filtered[filtered.length - 1];
  const history = [...filtered].reverse();
  const liveSamples = telemetryHistory.length ? telemetryHistory : vitals ? [vitals] : [];
  const liveScore = vitals?.overall_health_score;
  const openAlerts = alerts.filter(a => !a.acknowledged);

  return (
    <>
      <PageHeading
        eyebrow="LONGITUDINAL HEALTH ANALYTICS"
        title="My Health Trends"
        description="Historical check-ins, sleep windows, saved self-exams, and alert history. Switch to Live Telemetry for real-time rolling sparklines."
        action={
          <div className="analytics-toolbar">
            <div className="segmented" role="tablist" aria-label="Health trends sections">
              {(
                [
                  ['all', 'Historical & Exams'],
                  ['live', 'Live Telemetry'],
                  ['checkins', 'Check-Ins Only'],
                  ['exams', 'Exams & Alerts'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={section === id}
                  onClick={() => setSection(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="segmented" role="group" aria-label="History time range">
              {(['day', 'week', 'month'] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setRange(value);
                    setShowAll(false);
                  }}
                  aria-pressed={range === value}
                >
                  {value === 'day' ? 'Today' : value === 'week' ? '7 days' : '30 days'}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {recordsError && (
        <p role="alert" className="warning-box">
          {recordsError}
        </p>
      )}

      {section === 'all' && vitals && (
        <section className="panel live-summary-strip" aria-label="Current mission telemetry summary">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <Activity size={17} aria-hidden="true" />
              <strong>
                Health Index {liveScore !== undefined ? `${liveScore.toFixed(1)} / 100` : '--'}
              </strong>
              {vitals.health_status && (
                <span className={`pill sim-status-${vitals.health_status.toLowerCase()}`}>{vitals.health_status}</span>
              )}
              <span className="muted" style={{ fontSize: 12 }}>
                {simConfig?.missionZone.replace('_', ' ') ?? 'LEO ISS'} · Day {vitals.mission_day ?? simConfig?.missionDay ?? 1} · Kp{' '}
                {kpIndex.toFixed(1)}
              </span>
            </div>
            <button type="button" className="button secondary compact-btn" onClick={() => setSection('live')}>
              Open Live Telemetry stream
              <ArrowRight size={14} />
            </button>
          </div>
        </section>
      )}

      {section === 'live' && vitals && (
        <section className="panel live-trends-panel" aria-label="Live telemetry trends">
          <div className="section-heading">
            <h2>
              <Activity size={19} /> Live Biometric Stream &amp; Rolling Trends
            </h2>
            <span className="pill">
              <Radio size={13} />
              Updated {new Date(vitals.timestamp).toLocaleTimeString()} · {liveSamples.length} pts
            </span>
          </div>
          <div className="analytics-kpis">
            <div className="analytics-kpi-card">
              <span className="eyebrow">HEALTH INDEX</span>
              <strong>
                {liveScore !== undefined ? `${liveScore.toFixed(1)} / 100` : '--'}
                {vitals.health_status && (
                  <span className={`pill sim-status-${vitals.health_status.toLowerCase()}`}>{vitals.health_status}</span>
                )}
              </strong>
              <small className="muted">
                Zone: {simConfig?.missionZone.replace('_', ' ') ?? 'LEO ISS'} · Day{' '}
                {vitals.mission_day ?? simConfig?.missionDay ?? 1}
              </small>
            </div>
            <div className="analytics-kpi-card">
              <span className="eyebrow">CARDIOPULMONARY LIVE</span>
              <strong>
                {vitals.heart_rate} BPM · {vitals.spo2}% SpO2
              </strong>
              <small className="muted">
                HRV {vitals.hrv} ms · Resp {vitals.respiration_rate ?? '--'}/min
              </small>
            </div>
            <div className="analytics-kpi-card">
              <span className="eyebrow">METABOLIC &amp; THERMAL</span>
              <strong>
                {vitals.blood_glucose ?? '--'} mg/dL · {vitals.core_temp} °C
              </strong>
              <small className="muted">
                Hydration {vitals.hydration_pct ?? 92}% · WBC {vitals.wbc_k_ul ?? 6.2} K/uL
              </small>
            </div>
            <div className="analytics-kpi-card">
              <span className="eyebrow">RADIATION &amp; SPACE WEATHER</span>
              <strong>
                {vitals.radiation_rate} μSv/h · Kp {kpIndex.toFixed(1)}
              </strong>
              <small className="muted">
                Cumulative dose{' '}
                {vitals.cumulative_dose_msv !== undefined ? `${vitals.cumulative_dose_msv.toFixed(1)} mSv` : '--'}
              </small>
            </div>
          </div>
          <MultiMetricChart samples={liveSamples} extended />
        </section>
      )}

      {(section === 'all' || section === 'checkins') && (
        <>
          <div className="analytics-summary">
            <section className="panel">
              <span className="eyebrow">CHECK-INS IN THIS PERIOD</span>
              <strong>{recordsLoading ? 'Loading…' : filtered.length}</strong>
              <p>Saved on this device</p>
            </section>
            <section className="panel">
              <span className="eyebrow">AVERAGE SLEEP REPORTED</span>
              <strong>{sleepAverage === null ? 'No entries' : `${sleepAverage.toFixed(1)} hours`}</strong>
              <p>Based on your own sleep records</p>
            </section>
            <section className="panel">
              <span className="eyebrow">LATEST MOOD &amp; RESTING HR</span>
              <strong>{latest?.mood ?? 'No entry'}</strong>
              <p>
                {astronaut ? `Ref HR ${astronaut.resting_hr} BPM` : 'No crew reference'}
                {heartAverage !== null ? ` · Avg check-in HR ${heartAverage.toFixed(1)} BPM` : ''}
              </p>
            </section>
          </div>

          {filtered.length > 0 ? (
            <div className="chart-grid-layout">
              <TrendChart
                title="Sleep duration"
                unit="hours"
                points={metric('sleepHours')}
                color="var(--success)"
                help="How long you said you slept. An average describes your entries; it is not a recommended sleep target."
              />
              <TrendChart
                title="Check-in heart rate"
                unit="beats/min"
                points={heart}
                baseline={astronaut?.resting_hr}
                help="Heart rate measurements attached to saved check-ins against crew baseline."
              />
              <TrendChart
                title="Tiredness (fatigue)"
                unit="1–5"
                points={metric('fatigue')}
                domain={[1, 5]}
                color="var(--warning)"
                help="How tired you reported feeling, from 1 (not tired) to 5 (very tired)."
              />
              <TrendChart title="Stress" unit="1–5" points={metric('stress')} domain={[1, 5]} color="var(--purple)" />
              {glucosePoints.length > 0 && (
                <TrendChart
                  title="Check-in blood sugar"
                  unit="mg/dL"
                  points={glucosePoints}
                  color="#fbbf24"
                  baseline={93}
                  help="Fasting flight baseline reference (~70-140 mg/dL, NASA OSDR OSD-575)."
                />
              )}
            </div>
          ) : null}

          <section className="panel checkin-history">
            <div className="section-heading">
              <h2>Past check-ins</h2>
              <a href="#checkin" className="text-link">
                Add a check-in
                <ArrowRight size={16} />
              </a>
            </div>
            {history.length ? (
              <div className="checkin-history-grid">
                {(showAll ? history : history.slice(0, 6)).map(record => (
                  <article key={record.id} className="history-entry-card">
                    <div className="section-heading compact">
                      <strong>{new Date(record.createdAt).toLocaleString()}</strong>
                      <span className="pill">
                        {record.mood} · {record.sleepHours}h sleep
                      </span>
                    </div>
                    <dl className="review-grid">
                      <div>
                        <dt>Sleep quality</dt>
                        <dd>{record.sleepQuality}/5</dd>
                      </div>
                      <div>
                        <dt>Tiredness / Stress</dt>
                        <dd>
                          {record.fatigue}/5 · {record.stress}/5
                        </dd>
                      </div>
                      <div>
                        <dt>Exercise</dt>
                        <dd>{record.exerciseMinutes} min</dd>
                      </div>
                      {record.metabolic?.bloodGlucoseMgDl !== undefined && (
                        <div>
                          <dt>Blood sugar</dt>
                          <dd>{record.metabolic.bloodGlucoseMgDl} mg/dL</dd>
                        </div>
                      )}
                      {record.metabolic?.hydrationMl !== undefined && (
                        <div>
                          <dt>Fluids</dt>
                          <dd>{record.metabolic.hydrationMl} mL</dd>
                        </div>
                      )}
                    </dl>
                    {(record.symptoms || record.notes) && (
                      <p className="helper">
                        {record.symptoms ? `Symptoms: ${record.symptoms}. ` : ''}
                        {record.notes ? `Notes: ${record.notes}` : ''}
                      </p>
                    )}
                    <SpaceRecordDetails record={record} />
                    <small className="muted">
                      {record.biometrics
                        ? `Attached snapshot: HR ${record.biometrics.heart_rate} BPM, SpO2 ${record.biometrics.spo2}%, Temp ${record.biometrics.core_temp} °C`
                        : 'Saved locally without attached telemetry.'}
                    </small>
                  </article>
                ))}
                {history.length > 6 && (
                  <button type="button" className="button secondary" onClick={() => setShowAll(!showAll)}>
                    {showAll ? 'Show fewer check-ins' : `Show all ${history.length} check-ins`}
                  </button>
                )}
              </div>
            ) : (
              <EmptyState title="No check-ins in this period">
                Choose a longer period or add a check-in to start your history.
              </EmptyState>
            )}
          </section>

          <SpaceWellnessTrends records={filtered} astronautId={astronaut?.id ?? ''} />
        </>
      )}

      {(section === 'all' || section === 'exams') && (
        <div className="two-column" style={{ marginTop: 20 }}>
          <section className="panel">
            <div className="section-heading">
              <h2>Saved camera &amp; ultrasound exams</h2>
              <span className="pill">{assessments.length} saved</span>
            </div>
            {assessments.length > 0 ? (
              <ul className="observation-list">
                {assessments.map(exam => (
                  <li key={exam.id}>
                    <span className="pill">
                      {exam.severity} · {SELF_EXAM_GUIDES[exam.examType]?.label ?? exam.examType}
                    </span>
                    <p>{exam.findings}</p>
                    <small>
                      {new Date(exam.recordedAt).toLocaleString()} · {exam.imageQuality}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No self-exams saved">
                Run an ocular ultrasound, skin, or glucometer exam from the Human Body Map to log findings.
              </EmptyState>
            )}
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>
                <ShieldCheck size={18} /> Live &amp; recent notifications
              </h2>
              <span className="pill">{openAlerts.length} active</span>
            </div>
            {alerts.length ? (
              <ul className="observation-list">
                {alerts.map(alert => (
                  <li key={alert.id}>
                    <span className="pill">
                      {alert.severity} · {alert.acknowledged ? 'Marked as seen' : 'Active'}
                    </span>
                    <p>{alert.message}</p>
                    <small>{new Date(alert.timestamp).toLocaleString()}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No active notifications">
                All monitored telemetry and radiation parameters are currently nominal.
              </EmptyState>
            )}
          </section>
        </div>
      )}
    </>
  );
}

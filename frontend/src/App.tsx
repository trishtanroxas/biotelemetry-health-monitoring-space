import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowRight, ArrowUpRight, ClipboardCheck, Heart, Wind, Thermometer, Radio, Waves, Sparkles, Orbit, Check, Circle, CalendarDays, ShieldCheck } from 'lucide-react';
import { AppShell, EmptyState, MissionProgress, PageHeading, navigation } from './components/AppShell';
import { Disclosure } from './components/WellnessUI';
import { VitalCard } from './components/VitalCard';
import { ECGMonitor } from './components/ECGMonitor';
import { AlertBanner } from './components/AlertBanner';
import { AnomalyDemoBar } from './components/AnomalyDemoBar';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { CheckInPage } from './pages/CheckInPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { MissionsPage } from './pages/MissionsPage';
import { AIPage } from './pages/AIPage';
import { useTelemetry } from './hooks/useTelemetry';
import { useWellness } from './hooks/useWellness';
import { useEnvironment } from './hooks/useEnvironment';
import { SpaceEnvironmentPanel } from './components/SpaceEnvironment';
import { buildAssistantContext } from './services/ai';
import { localDate, missionCatalog } from './services/missions';
import type { Page } from './types/wellness';

type Telemetry = ReturnType<typeof useTelemetry>;
function getPage(): Page {
  const hash = window.location.hash.slice(1);
  return ['dashboard', 'checkin', 'analytics', 'missions', 'ai'].includes(hash) ? hash as Page : 'dashboard';
}
function Workspace({ telemetry: t, page }: { telemetry: Telemetry; page: Page }) {
  const wellness = useWellness(t.activeId);
  const environment = useEnvironment(t.activeId, t.vitals);
  const astronaut = t.crew.find(member => member.id === t.activeId);
  const today = localDate();
  const observations = t.alerts.filter(alert => alert.astronaut_id === t.activeId);
  const completed = wellness.completions.filter(item => item.date === today);
  const latest = [...wellness.records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  async function toggleMission(id: string) {
    try { await wellness.toggleActivity(id, today); }
    catch { /* The shared activity state exposes the failure and retry action. */ }
  }
  const v = t.vitals;
  const todayRecord = [...wellness.records].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find(record => localDate(new Date(record.createdAt)) === today);
  return <>
    {wellness.error && <div className="error-box" role="alert">{wellness.error}<button onClick={() => void wellness.reload()}>Retry local records</button></div>}
    {wellness.loading && <div className="loading-line" role="status">Loading local wellness records…</div>}
    {page === 'dashboard' && <>
      <PageHeading eyebrow="YOUR DAY AT A GLANCE" title={`Hi, ${astronaut?.name.replace('Dr. ', '').split(' ')[0] ?? 'explorer'}.`} description="Start with how you feel. Explore more whenever you need to." action={<span className="date-label"><CalendarDays size={17} />{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>} />
      <section className="panel today-checkin"><span className="section-icon"><ClipboardCheck size={23} /></span><div><h2>{wellness.loading ? 'Checking today’s record…' : todayRecord ? 'You’ve checked in today.' : 'How are you feeling today?'}</h2><p>{todayRecord ? `You recorded your mood as ${todayRecord.mood.toLowerCase()}. Saved on this device at ${new Date(todayRecord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : 'Record your sleep, mood and activity in three short steps.'}</p>{todayRecord && <small className="muted">Not yet sent to the server.</small>}{!todayRecord && latest && <small className="muted">Last check-in: {new Date(latest.createdAt).toLocaleDateString()}</small>}</div><a href="#checkin" className="button primary">Record Today’s Health<ArrowRight size={17} /></a></section>
      <div className="dashboard-grid"><div className="dashboard-primary"><div className="section-heading"><h2>Health measurements</h2><span className="pill">Demo measurements</span></div><p className="section-description">These readings are simulated. They don’t tell us whether you are medically well.</p>
        <div className="vitals-grid"><VitalCard label="Heart Rate" value={v.heart_rate} unit="beats/min" icon={Heart} status={v.heart_rate > 120 || v.heart_rate < 45 ? 'CRITICAL' : v.heart_rate > 100 || v.heart_rate < 50 ? 'WARNING' : 'NORMAL'} baseline="Simulated pulse" ariaLabel={`Simulated heart rate ${v.heart_rate} beats per minute`} /><VitalCard label="Blood Oxygen" value={v.spo2} unit="%" icon={Wind} status={v.spo2 < 90 ? 'CRITICAL' : v.spo2 < 95 ? 'WARNING' : 'NORMAL'} baseline="Simulated oxygen level" ariaLabel={`Simulated blood oxygen ${v.spo2} percent`} /><VitalCard label="Body Temperature" value={v.core_temp} unit="°C" icon={Thermometer} status={v.core_temp > 37.8 ? 'WARNING' : 'NORMAL'} baseline="Simulated temperature" ariaLabel={`Simulated temperature ${v.core_temp} Celsius`} /><VitalCard label="Breathing Rate" value={v.respiration_rate ?? '—'} unit="breaths/min" icon={Wind} status="NORMAL" baseline="Simulated breathing" ariaLabel={`Simulated breathing rate ${v.respiration_rate ?? 'unavailable'} breaths per minute`} /></div>
        <section className="panel observation-panel"><div className="section-heading"><h2><ShieldCheck size={19} />Things to review</h2><span className="pill">{observations.filter(a => !a.acknowledged).length} to review</span></div><AlertBanner alerts={observations} onAcknowledge={t.acknowledge} /><p className="helper">{t.gateway ? 'Demo notifications show readings the system flagged for review. They are not a diagnosis.' : 'The notification connection is unavailable. This demo cannot check for new notifications.'}</p><a href="#analytics" className="text-link">See past notifications and trends<ArrowRight size={16} /></a></section>
        <Disclosure title="More measurements and heart waveform"><p className="helper">The ECG is a picture of the heart’s electrical activity. This demo waveform is illustrative, not a medical test.</p><ECGMonitor key={t.activeId} ecgSamples={v.ecg_samples} heartRate={v.heart_rate} /><div className="advanced-vitals"><VitalCard label="Heart rate variability (HRV)" value={v.hrv} unit="ms" icon={Waves} status="NORMAL" baseline="Simulated HRV" ariaLabel={`Simulated HRV ${v.hrv} milliseconds`} /><p className="helper">HRV describes variation in the time between heartbeats. It cannot establish health status on its own.</p></div><div className="secondary-vitals"><div><Radio size={19} /><span>Environmental radiation<strong>{v.radiation_rate} <small>μSv/h</small></strong>{v.radiation_rate >= 30 && <small className="warning-text">{v.radiation_rate >= 60 ? 'Critical' : 'Warning'} simulation range</small>}</span></div><div><Activity size={19} /><span>Blood pressure<strong>{v.systolic_bp !== undefined && v.diastolic_bp !== undefined ? `${v.systolic_bp}/${v.diastolic_bp}` : '—'} <small>mmHg</small></strong></span></div><div><Activity size={19} /><span>Suit battery<strong>{v.battery_level ?? '—'} <small>%</small></strong></span></div></div><a href="#analytics" className="text-link">View My Health Trends<ArrowRight size={16} /></a></Disclosure>
      </div><aside className="dashboard-aside stack"><section className="panel daily-panel"><div className="section-heading"><h2><Orbit size={20} />Daily Activities</h2></div>{wellness.loading ? <p role="status">Loading saved activity progress…</p> : wellness.activitiesError ? <p className="helper">Saved activity progress is unavailable. Please retry loading.</p> : <MissionProgress completed={completed.length} />}<div className="mini-missions">{[missionCatalog[0], missionCatalog[3], missionCatalog[6]].map(mission => { const done = completed.some(item => item.missionId === mission.id); return <button key={mission.id} onClick={() => void toggleMission(mission.id)} disabled={wellness.loading || wellness.activitySaving || !!wellness.activitiesError} aria-pressed={done}>{done ? <Check size={19} className="success-text" /> : <Circle size={19} />}<span>{mission.title}</span></button>; })}</div><a href="#missions" className="text-link">See all activities<ArrowRight size={16} /></a></section><a href="#ai" className="panel quick-action ai-action"><span className="section-icon"><Sparkles size={22} /></span><ArrowUpRight size={19} /><h3>Have a question?</h3><p>Ask about your saved records or today’s activities.</p><span className="text-link">Open AI Assistant<ArrowRight size={16} /></span></a></aside></div>
      <SpaceEnvironmentPanel context={environment.context} settings={environment.settings} settingsError={environment.error} records={wellness.records} onSave={environment.save} />
      <Disclosure title="Mission details and simulation tools"><p className="helper">{astronaut?.role} · {t.activeId} · Demo mission · Mission day is not supplied by the server</p><p className="helper">Measurement source: {t.gateway ? 'connected simulation server' : 'local demo'}. Updated {new Date(v.timestamp).toLocaleTimeString()}. Diagnostic reports are unvalidated demo output.</p><AnomalyDemoBar currentAnomaly={t.anomaly} onTrigger={t.setAnomaly} onRunDiagnostics={t.diagnose} isDiagnosing={t.diagnosing} /></Disclosure>
    </>}
    <div hidden={page !== 'checkin'}><CheckInPage astronautId={t.activeId} vitals={v} records={wellness.records} offline={t.offline} gateway={t.gateway} onSaved={wellness.acceptCheckIn} historyLoading={wellness.loading} historyError={wellness.recordsError} environment={environment.context} /></div>
    {page === 'analytics' && !wellness.loading && !wellness.recordsError && <AnalyticsPage records={wellness.records} astronaut={astronaut} alerts={observations} />}
    {page === 'missions' && <MissionsPage checkedIn={!!todayRecord} astronautId={t.activeId} completions={wellness.completions} onToggle={wellness.toggleActivity} loading={wellness.loading} loadError={wellness.activitiesError} activitySaving={wellness.activitySaving} />}
    <div hidden={page !== 'ai'}><AIPage context={buildAssistantContext(t.activeId, wellness.records, observations, wellness.completions, environment.context)} offline={t.offline} recordsLoading={wellness.loading || wellness.activitySaving} recordsError={wellness.error} /></div>
    {!astronaut && <EmptyState title="No astronaut selected">Choose a crew member from the header.</EmptyState>}
  </>;
}
export function App() {
  const telemetry = useTelemetry();
  const [page, setPage] = useState<Page>(getPage);
  const [contrast, setContrast] = useState(false);
  const closeDiagnostic = useCallback(() => telemetry.setDiagnostic(null), [telemetry.setDiagnostic]);
  useEffect(() => {
    const navigate = () => { setPage(getPage()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', navigate); return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => { document.title = `BioTelemetry · ${navigation.find(item => item.id === page)?.label}`; }, [page]);
  return <AppShell page={page} crew={telemetry.crew} activeId={telemetry.activeId} selectCrew={telemetry.setActiveId} crewDemo={telemetry.crewDemo} offline={telemetry.offline} gateway={telemetry.gateway} los={telemetry.los} toggleLos={() => telemetry.setLos(!telemetry.los)} pending={telemetry.pending} syncing={telemetry.syncing} sync={telemetry.sync} sound={telemetry.sound} toggleSound={() => telemetry.setSound(!telemetry.sound)} contrast={contrast} toggleContrast={() => setContrast(!contrast)}>
    {telemetry.error && <div role="alert" className="error-box global-message">{telemetry.error}<button onClick={() => telemetry.setError('')} aria-label="Dismiss error">Dismiss</button></div>}
    {telemetry.notice && <div role="status" className="warning-box">{telemetry.notice}</div>}
    <Workspace key={telemetry.activeId} telemetry={telemetry} page={page} />
    <DiagnosticsModal result={telemetry.diagnostic} onClose={closeDiagnostic} />
  </AppShell>;
}
export default App;








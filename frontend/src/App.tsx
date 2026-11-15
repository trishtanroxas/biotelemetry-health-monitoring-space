import { useCallback, useEffect, useState } from 'react';
import { AppShell, EmptyState, navigation } from './components/AppShell';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { CheckInPage } from './pages/CheckInPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { MissionsPage } from './pages/MissionsPage';
import { AIPage } from './pages/AIPage';
import { useTelemetry } from './hooks/useTelemetry';
import { useWellness } from './hooks/useWellness';
import { useEnvironment } from './hooks/useEnvironment';
import { buildAssistantContext } from './services/ai';
import { localDate } from './services/missions';
import { LandingPage } from './pages/LandingPage';
import { DashboardTransitionLoader } from './components/DashboardTransitionLoader';
import { DashboardSkeleton } from './components/DashboardSkeleton';
import { DashboardHomeView } from './components/dashboard/DashboardHomeView';
import type { Page } from './types/wellness';

type ExtendedPage = Page | 'landing';

type Telemetry = ReturnType<typeof useTelemetry>;
function getPage(): ExtendedPage {
  const hash = window.location.hash.slice(1);
  if (hash === '' || hash === 'landing') return 'landing';
  return ['dashboard', 'checkin', 'analytics', 'missions', 'ai'].includes(hash) ? hash as Page : 'dashboard';
}
function Workspace({ telemetry: t, page }: { telemetry: Telemetry; page: Page }) {
  const wellness = useWellness(t.activeId);
  const environment = useEnvironment(t.activeId, t.vitals);
  const astronaut = t.crew.find(member => member.id === t.activeId);
  const today = localDate();
  const observations = t.alerts.filter(alert => alert.astronaut_id === t.activeId);
  const v = t.vitals;
  const todayRecord = [...wellness.records].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find(record => localDate(new Date(record.createdAt)) === today);

  // If initial crew or vitals are still assembling, render DashboardSkeleton
  if (t.crew.length === 0) {
    return <DashboardSkeleton />;
  }

  return <>
    {wellness.error && <div className="error-box" role="alert">{wellness.error}<button onClick={() => void wellness.reload()}>Retry local records</button></div>}
    {wellness.loading && <div className="loading-line" role="status">Loading local wellness records…</div>}
    {page === 'dashboard' && (
      <DashboardHomeView
        telemetry={t}
        wellness={wellness}
        environment={environment}
      />
    )}
    <div hidden={page !== 'checkin'}><CheckInPage astronautId={t.activeId} vitals={v} records={wellness.records} offline={t.offline} gateway={t.gateway} onSaved={wellness.acceptCheckIn} historyLoading={wellness.loading} historyError={wellness.recordsError} environment={environment.context} /></div>
    {page === 'analytics' && !wellness.loading && !wellness.recordsError && <AnalyticsPage records={wellness.records} astronaut={astronaut} alerts={observations} />}
    {page === 'missions' && <MissionsPage checkedIn={!!todayRecord} astronautId={t.activeId} completions={wellness.completions} onToggle={wellness.toggleActivity} loading={wellness.loading} loadError={wellness.activitiesError} activitySaving={wellness.activitySaving} />}
    <div hidden={page !== 'ai'}><AIPage context={buildAssistantContext(t.activeId, wellness.records, observations, wellness.completions, environment.context)} offline={t.offline} recordsLoading={wellness.loading || wellness.activitySaving} recordsError={wellness.error} /></div>
    {!astronaut && <EmptyState title="No astronaut selected">Choose a crew member from the header.</EmptyState>}
  </>;
}
export function App() {
  const telemetry = useTelemetry();
  const [page, setPage] = useState<ExtendedPage>(getPage);
  const [contrast, setContrast] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const closeDiagnostic = useCallback(() => telemetry.setDiagnostic(null), [telemetry.setDiagnostic]);

  const handleLaunchDashboard = useCallback(() => {
    setIsTransitioning(true);
  }, []);

  useEffect(() => {
    const navigate = () => { setPage(getPage()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', navigate); return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => { 
    if (page === 'landing') {
      document.title = 'BioTelemetry · Deep Space Health Gateway';
    } else {
      document.title = `BioTelemetry · ${navigation.find(item => item.id === page)?.label ?? 'Dashboard'}`;
    }
  }, [page]);

  if (page === 'landing') {
    return <>
      <LandingPage onEnterApp={handleLaunchDashboard} />
      {isTransitioning && (
        <DashboardTransitionLoader 
          onComplete={() => {
            setIsTransitioning(false);
            window.location.hash = '#dashboard';
          }} 
        />
      )}
    </>;
  }

  return <AppShell page={page} crew={telemetry.crew} activeId={telemetry.activeId} selectCrew={telemetry.setActiveId} crewDemo={telemetry.crewDemo} offline={telemetry.offline} gateway={telemetry.gateway} los={telemetry.los} toggleLos={() => telemetry.setLos(!telemetry.los)} pending={telemetry.pending} syncing={telemetry.syncing} sync={telemetry.sync} sound={telemetry.sound} toggleSound={() => telemetry.setSound(!telemetry.sound)} contrast={contrast} toggleContrast={() => setContrast(!contrast)}>
    {telemetry.error && <div role="alert" className="error-box global-message">{telemetry.error}<button onClick={() => telemetry.setError('')} aria-label="Dismiss error">Dismiss</button></div>}
    {telemetry.notice && <div role="status" className="warning-box">{telemetry.notice}</div>}
    <Workspace key={telemetry.activeId} telemetry={telemetry} page={page} />
    <DiagnosticsModal result={telemetry.diagnostic} onClose={closeDiagnostic} />
  </AppShell>;
}
export default App;








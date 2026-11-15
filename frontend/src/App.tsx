import { useCallback, useEffect, useState, useRef } from 'react';
import { AppShell, EmptyState, navigation } from './components/AppShell';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { CheckInPage } from './pages/CheckInPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { MissionsPage } from './pages/MissionsPage';
import { AIPage } from './pages/AIPage';
import { useTelemetry } from './hooks/useTelemetry';
import { useWellness } from './hooks/useWellness';
import { useEnvironment } from './hooks/useEnvironment';
import { useSpaceWeather } from './hooks/useSpaceWeather';
import { buildAssistantContext } from './services/ai';
import { localDate } from './services/missions';
import { listImageAssessments } from './services/selfExams';
import { LandingPage } from './pages/LandingPage';
import { DashboardTransitionLoader } from './components/DashboardTransitionLoader';
import { DashboardSkeleton } from './components/DashboardSkeleton';
import { DashboardHomeView } from './components/dashboard/DashboardHomeView';
import { NotificationProvider, useNotificationCenter } from './context/NotificationContext';
import { soundService } from './services/sound';
import type { Page } from './types/wellness';
import type { ImageAssessmentRecord } from './types/telemetry';

type ExtendedPage = Page | 'landing';

type Telemetry = ReturnType<typeof useTelemetry>;
type SpaceWeatherState = ReturnType<typeof useSpaceWeather>;
const LANDING_SECTIONS = new Set(['overview', 'problem', 'autonomy', 'capabilities', 'architecture', 'science', 'team']);

function getPage(): ExtendedPage {
  const hash = window.location.hash.slice(1);
  if (hash === '' || hash === 'landing' || LANDING_SECTIONS.has(hash)) return 'landing';
  return ['dashboard', 'checkin', 'analytics', 'missions', 'ai'].includes(hash) ? hash as Page : 'dashboard';
}

function Workspace({
  telemetry: t,
  spaceWeather: sw,
  page,
}: {
  telemetry: Telemetry;
  spaceWeather: SpaceWeatherState;
  page: Page;
}) {
  const wellness = useWellness(t.activeId);
  const environment = useEnvironment(t.activeId, t.vitals, sw.datum);
  const astronaut = t.crew.find(member => member.id === t.activeId);
  const today = localDate();
  const observations = t.alerts.filter(alert => alert.astronaut_id === t.activeId);
  const v = t.vitals;
  const todayRecord = [...wellness.records]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .find(record => localDate(new Date(record.createdAt)) === today);

  const [assessments, setAssessments] = useState<ImageAssessmentRecord[]>([]);

  useEffect(() => {
    let alive = true;
    void listImageAssessments(t.activeId)
      .then(items => {
        if (alive) setAssessments(items);
      })
      .catch(() => {
        if (alive) setAssessments([]);
      });
    return () => {
      alive = false;
    };
  }, [t.activeId]);

  // If initial crew or vitals are still assembling, render DashboardSkeleton
  if (t.crew.length === 0) {
    return <DashboardSkeleton />;
  }

  return (
    <>
      {wellness.error && (
        <div className="error-box" role="alert">
          {wellness.error}
          <button onClick={() => void wellness.reload()}>Retry local records</button>
        </div>
      )}
      {wellness.loading && <div className="loading-line" role="status">Loading local wellness records…</div>}

      {page === 'dashboard' && (
        <DashboardHomeView
          telemetry={t}
          wellness={wellness}
          environment={environment}
          spaceWeather={sw}
          assessments={assessments}
          onAssessmentSaved={rec => setAssessments(prev => [rec, ...prev])}
          onOpenSelfExam={() => {}}
          onAskAi={(_focus, _query) => {
            window.location.hash = 'ai';
          }}
        />
      )}

      <div hidden={page !== 'checkin'}>
        <CheckInPage
          astronautId={t.activeId}
          vitals={v}
          records={wellness.records}
          offline={t.offline}
          gateway={t.gateway}
          onSaved={wellness.acceptCheckIn}
          historyLoading={wellness.loading}
          historyError={wellness.recordsError}
          environment={environment.context}
        />
      </div>

      {page === 'analytics' && !wellness.loading && !wellness.recordsError && (
        <AnalyticsPage
          records={wellness.records}
          astronaut={astronaut}
          alerts={observations}
          assessments={assessments}
          vitals={v}
          telemetryHistory={t.telemetryHistory}
          simConfig={t.simConfig}
          recordsLoading={wellness.loading}
          recordsError={wellness.recordsError}
        />
      )}

      {page === 'missions' && (
        <MissionsPage
          checkedIn={!!todayRecord}
          astronautId={t.activeId}
          completions={wellness.completions}
          onToggle={wellness.toggleActivity}
          loading={wellness.loading}
          loadError={wellness.activitiesError}
          activitySaving={wellness.activitySaving}
        />
      )}

      <div hidden={page !== 'ai'}>
        <AIPage
          context={buildAssistantContext(
            t.activeId,
            wellness.records,
            observations,
            wellness.completions,
            environment.context,
            v,
            assessments,
          )}
          offline={t.offline}
          recordsLoading={wellness.loading || wellness.activitySaving}
          recordsError={wellness.error}
        />
      </div>

      {!astronaut && <EmptyState title="No astronaut selected">Choose a crew member from the header.</EmptyState>}
    </>
  );
}

function AppContent() {
  const telemetry = useTelemetry();
  const spaceWeather = useSpaceWeather(telemetry.offline);
  const [page, setPage] = useState<ExtendedPage>(getPage);
  const [contrast, setContrast] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const closeDiagnostic = useCallback(() => telemetry.setDiagnostic(null), [telemetry.setDiagnostic]);
  const { addNotification } = useNotificationCenter();
  const activeEpisodesRef = useRef<Map<string, { id: string; severity: string; acknowledged: boolean }>>(new Map());

  // Link space weather current Kp to telemetry state
  useEffect(() => {
    telemetry.setLiveKp(spaceWeather.snapshot?.kp_current);
  }, [spaceWeather.snapshot?.kp_current, telemetry.setLiveKp]);

  // Automatically wire incoming telemetry alerts to notification center with deduplication & lifecycle
  useEffect(() => {
    if (page === 'landing') return; // Do not process or fire notifications on landing page
    if (!telemetry.alerts) return;

    // Only process unacknowledged/active alerts for live toasts and notification entries
    const unacknowledgedAlerts = telemetry.alerts.filter(alert => !alert.acknowledged);
    const currentAlertTypes = new Set<string>();

    unacknowledgedAlerts.forEach(alert => {
      // Stable episode fingerprint: one active episode per astronaut + alert_type
      const episodeKey = `${alert.astronaut_id}:${alert.alert_type}`;
      currentAlertTypes.add(episodeKey);

      const existing = activeEpisodesRef.current.get(episodeKey);
      const isCritical = alert.severity === 'CRITICAL';
      const isEscalation = existing && existing.severity !== 'CRITICAL' && isCritical;
      const isNewEpisode = !existing;

      // Only notify when it is a brand-new episode OR when an existing alert escalates to CRITICAL
      if (isNewEpisode || isEscalation) {
        activeEpisodesRef.current.set(episodeKey, {
          id: alert.id,
          severity: alert.severity,
          acknowledged: alert.acknowledged,
        });

        const astronaut = telemetry.crew.find(c => c.id === alert.astronaut_id);
        addNotification({
          title: isCritical ? 'Critical Telemetry Alert' : 'Physiological Warning',
          description: `${astronaut ? `${astronaut.name}: ` : ''}${alert.message}`,
          severity: isCritical ? 'CRITICAL' : 'WARNING',
          astronautId: alert.astronaut_id,
          category: 'telemetry',
          actionLabel: 'Review Alert',
          actionRoute: '#analytics',
        });
      } else if (existing) {
        existing.acknowledged = alert.acknowledged;
        existing.severity = alert.severity;
      }
    });

    for (const key of Array.from(activeEpisodesRef.current.keys())) {
      if (!currentAlertTypes.has(key)) {
        activeEpisodesRef.current.delete(key);
      }
    }
  }, [telemetry.alerts, telemetry.crew, addNotification, page]);

  const handleLaunchDashboard = useCallback(() => {
    setIsTransitioning(true);
  }, []);

  useEffect(() => {
    const navigate = () => {
      const nextPage = getPage();
      setPage(nextPage);
      const hash = window.location.hash.slice(1);
      if (LANDING_SECTIONS.has(hash)) {
        const targetElement = document.getElementById(hash);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth' });
          return;
        }
      }
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);

  useEffect(() => {
    soundService.setRoute(page);
    if (page === 'landing') {
      document.title = 'BioTelemetry · Deep Space Health Gateway';
    } else {
      document.title = `BioTelemetry · ${navigation.find(item => item.id === page)?.label ?? 'Dashboard'}`;
    }
  }, [page]);

  if (page === 'landing') {
    return (
      <>
        <LandingPage onEnterApp={handleLaunchDashboard} />
        {isTransitioning && (
          <DashboardTransitionLoader
            onComplete={() => {
              setIsTransitioning(false);
              window.location.hash = '#dashboard';
            }}
          />
        )}
      </>
    );
  }

  return (
    <AppShell
      page={page}
      crew={telemetry.crew}
      activeId={telemetry.activeId}
      selectCrew={telemetry.setActiveId}
      crewDemo={telemetry.crewDemo}
      offline={telemetry.offline}
      gateway={telemetry.gateway}
      los={telemetry.los}
      toggleLos={() => telemetry.setLos(!telemetry.los)}
      pending={telemetry.pending}
      syncing={telemetry.syncing}
      sync={telemetry.sync}
      sound={telemetry.sound}
      toggleSound={() => telemetry.setSound(!telemetry.sound)}
      contrast={contrast}
      toggleContrast={() => setContrast(!contrast)}
    >
      {telemetry.error && (
        <div role="alert" className="error-box global-message">
          {telemetry.error}
          <button onClick={() => telemetry.setError('')} aria-label="Dismiss error">
            Dismiss
          </button>
        </div>
      )}
      {telemetry.notice && <div role="status" className="warning-box">{telemetry.notice}</div>}
      <Workspace key={telemetry.activeId} telemetry={telemetry} spaceWeather={spaceWeather} page={page} />
      <DiagnosticsModal result={telemetry.diagnostic} onClose={closeDiagnostic} />
    </AppShell>
  );
}

export function App() {
  return (
    <NotificationProvider>
      <AppContent />
    </NotificationProvider>
  );
}
export default App;








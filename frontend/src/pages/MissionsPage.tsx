import { useState } from 'react';
import { ArrowRight, Award, Check, CircleDot, Clock, Flame, RotateCcw, ShieldCheck } from 'lucide-react';
import { localDate, missionCatalog, normalizeMissionId } from '../services/missions';
import type { ProtocolStatus, ReadinessSummary } from '../services/missionRoutines';
import type { SelfExamType } from '../types/telemetry';
import type { Mission, MissionCompletion, Page } from '../types/wellness';
import { MissionProgress, PageHeading } from '../components/AppShell';

export function recommendedActivities(
  completions: MissionCompletion[],
  date: string,
  checkedIn: boolean,
): Mission[] {
  // If legacy IDs are present in missionCatalog, support legacy test contract;
  // otherwise default to NASA challenge protocol recommendations.
  const hasLegacySleep = missionCatalog.some(item => item.id === 'sleep');
  const ids = hasLegacySleep
    ? (checkedIn ? ['patterns', 'recovery', 'reflection'] : ['sleep', 'mood', 'exercise'])
    : (checkedIn ? ['physical-ared', 'hydration-target', 'sans-ultrasound'] : ['daily-checkin', 'physical-ared', 'hydration-target']);

  const doneSet = new Set(
    completions
      .filter(item => item.date === date)
      .flatMap(item => [item.missionId, normalizeMissionId(item.missionId)]),
  );
  return ids
    .flatMap(id => {
      const activity = missionCatalog.find(item => item.id === id);
      return activity && !doneSet.has(id) ? [activity] : [];
    })
    .slice(0, 3);
}

export function MissionCard({
  mission,
  completed,
  busy,
  saving = false,
  statusInfo,
  onToggle,
  onOpenExam,
  onNavigate,
}: {
  mission: Mission;
  completed: boolean;
  busy: boolean;
  saving?: boolean;
  statusInfo?: ProtocolStatus;
  onToggle(): void;
  onOpenExam?(exam: SelfExamType): void;
  onNavigate?(page: Page): void;
}) {
  const isAutoVerified = statusInfo?.status === 'auto-verified';
  const canToggle = statusInfo ? statusInfo.canManualToggle : true;
  const badgeText = statusInfo?.evidenceText ?? (completed ? 'Confirmed · saved on this device' : 'Not completed yet');

  return (
    <article className={`panel mission-card ${completed ? 'completed protocol-done' : 'protocol-pending'}`}>
      <div className="mission-card-meta">
        <span className="activity-category">{mission.category}</span>
        <div className="mission-card-pills">
          <span className={`pill protocol-status-pill ${completed ? 'done' : 'pending'}`}>
            {completed ? <Check size={12} aria-hidden="true" /> : <CircleDot size={12} aria-hidden="true" />}
            {completed ? 'Done' : 'To be completed'}
          </span>
          <span className="pill">
            <Clock size={12} aria-hidden="true" />
            ~{mission.estimatedMinutes} min
          </span>
        </div>
      </div>
      <h3>{mission.title}</h3>
      <p>{mission.description}</p>
      <div className="activity-action">
        <span className={completed ? 'success-text' : 'muted'}>{badgeText}</span>
        <div className="activity-action-buttons">
          {statusInfo?.targetExam && onOpenExam && !completed && (
            <button
              type="button"
              className="button primary compact-btn"
              onClick={() => onOpenExam(statusInfo.targetExam!)}
            >
              {statusInfo.actionLabel ?? 'Open Exam'}
              <ArrowRight size={14} />
            </button>
          )}
          {!statusInfo?.targetExam && statusInfo?.targetPage && onNavigate && !completed && (
            <button
              type="button"
              className="button primary compact-btn"
              onClick={() => onNavigate(statusInfo.targetPage!)}
            >
              {statusInfo.actionLabel ?? 'Open Check-In'}
              <ArrowRight size={14} />
            </button>
          )}
          {canToggle ? (
            <button
              type="button"
              className={`button ${completed ? 'secondary' : statusInfo?.targetPage || statusInfo?.targetExam ? 'secondary' : 'primary'}`}
              aria-label={`${completed ? 'Undo confirmation' : 'Confirm done'}: ${mission.title}`}
              aria-pressed={completed}
              disabled={busy}
              onClick={onToggle}
            >
              {completed ? <RotateCcw size={16} /> : <Check size={16} />}
              {saving ? 'Saving…' : completed ? 'Undo' : 'Confirm done'}
            </button>
          ) : isAutoVerified ? (
            <span className="pill protocol-verified-pill">
              <ShieldCheck size={13} aria-hidden="true" />
              Auto-verified
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function MissionsPage({
  astronautId,
  completions,
  onToggle,
  loading = false,
  loadError = '',
  activitySaving = false,
  readiness,
  onOpenSelfExam,
  onNavigate,
}: {
  astronautId: string;
  completions: MissionCompletion[];
  onToggle(id: string, date: string): Promise<void>;
  loading?: boolean;
  loadError?: string;
  activitySaving?: boolean;
  checkedIn?: boolean;
  readiness?: ReadinessSummary;
  onOpenSelfExam?(exam: SelfExamType): void;
  onNavigate?(page: Page): void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const today = localDate();
  const scoped = completions.filter(item => item.astronautId === astronautId);
  const doneManualIds = new Set(scoped.filter(item => item.date === today).map(item => normalizeMissionId(item.missionId)));

  const statusMap = new Map(readiness?.protocolStatuses.map(s => [s.mission.id, s]) ?? []);
  const verifiedCount = readiness ? readiness.verifiedCount : doneManualIds.size;
  const pendingCount = Math.max(0, missionCatalog.length - verifiedCount);
  const compliancePct = readiness ? readiness.compliancePct : Math.round((doneManualIds.size / missionCatalog.length) * 100);

  async function toggle(id: string) {
    if (busy || loading || activitySaving || loadError) return;
    setBusy(id);
    setError('');
    try {
      await onToggle(id, today);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not confirm saved progress. Please retry loading local records.');
    } finally {
      setBusy(null);
    }
  }

  function handlePromptAction() {
    if (!readiness) return;
    const prompt = readiness.nextPrompt;
    if (prompt.targetExam && onOpenSelfExam) {
      onOpenSelfExam(prompt.targetExam);
      return;
    }
    if (onNavigate) {
      onNavigate(prompt.targetPage);
    } else if (typeof window !== 'undefined') {
      window.location.hash = prompt.targetPage;
    }
  }

  function navigateFallback(page: Page) {
    if (onNavigate) onNavigate(page);
    else if (typeof window !== 'undefined') window.location.hash = page;
  }

  function card(mission: Mission) {
    const statusInfo = statusMap.get(mission.id);
    const completed = statusInfo ? statusInfo.completed : doneManualIds.has(mission.id);
    return (
      <MissionCard
        key={mission.id}
        mission={mission}
        statusInfo={statusInfo}
        busy={busy !== null || activitySaving}
        saving={busy === mission.id}
        completed={completed}
        onToggle={() => void toggle(mission.id)}
        onOpenExam={onOpenSelfExam}
        onNavigate={navigateFallback}
      />
    );
  }

  if (loading || loadError) {
    return (
      <>
        <PageHeading
          eyebrow="CREW PROTOCOL SCHEDULE"
          title="Countermeasures"
          description="Your saved protocol compliance stays separate for each astronaut."
        />
        <p role="status" className="helper">
          {loading
            ? 'Loading saved countermeasure progress…'
            : 'Saved progress could not be loaded. Use Retry local records above before making changes.'}
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="CREW PROTOCOL SCHEDULE"
        title="Countermeasures"
        description="Operational spaceflight protocols synced automatically with Check-In logs and Guided Self-Exams."
      />
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <section className="mission-category" aria-labelledby="all-protocols-heading">
        <div className="section-heading">
          <h2 id="all-protocols-heading">All Spaceflight Protocols</h2>
          <div className="protocol-legend" aria-label="Protocol status counts">
            <span className="pill protocol-status-pill done">
              <Check size={12} aria-hidden="true" />
              {verifiedCount} done
            </span>
            <span className="pill protocol-status-pill pending">
              <CircleDot size={12} aria-hidden="true" />
              {pendingCount} to be completed
            </span>
          </div>
        </div>
        <div className="missions-grid">{missionCatalog.map(card)}</div>
      </section>

      <section className="panel activity-progress" aria-label="Protocol compliance summary">
        <MissionProgress completed={verifiedCount} total={missionCatalog.length} />
        {readiness ? (
          <div className="readiness-gamification" aria-label="Mission readiness and protocol compliance">
            <div className="readiness-stats">
              <span className="pill">
                <Flame size={13} aria-hidden="true" /> {readiness.streakDays}d Check-In Streak
              </span>
              <span className="pill">
                Readiness {readiness.readinessScore}% · {compliancePct}% Today Compliance · {readiness.sevenDayCompliancePct}% 7d Compliance
              </span>
            </div>
            <div className={`routine-prompt-card priority-${readiness.nextPrompt.priority}`} style={{ marginBottom: 0 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <strong>Live recommendation: {readiness.nextPrompt.title}</strong>
                  <p>{readiness.nextPrompt.detail}</p>
                </div>
                <button type="button" className="button secondary compact-btn" onClick={handlePromptAction}>
                  {readiness.nextPrompt.actionLabel}
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
            <div className="badge-row">
              {readiness.badges.map(b => (
                <span key={b.id} className={`badge-chip ${b.earned ? 'earned' : ''}`} title={b.requirement}>
                  <Award size={12} aria-hidden="true" />
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      <p className="activity-guidance">
        Save your <a href="#checkin">Check-In</a> to auto-verify sleep, hydration, glucose, and exercise protocols, or review longitudinal charts in{' '}
        <a href="#analytics">My Health Trends</a>.
      </p>
    </>
  );
}

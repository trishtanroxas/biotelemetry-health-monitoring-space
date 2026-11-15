import { useMemo } from 'react';
import { CheckCircle2, AlertTriangle, BellRing, CheckCheck, ShieldAlert } from 'lucide-react';
import type { AlertItem } from '../types/telemetry';
import { ALERT_LABELS as labels } from '../services/alertSpeech';

const severityOrder: Record<AlertItem['severity'], number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

export function AlertBanner({
  alerts,
  onAcknowledge,
  onAcknowledgeAll,
}: {
  alerts: AlertItem[];
  onAcknowledge(id: string): void;
  onAcknowledgeAll?: () => void;
}) {
  // Collapse repeated alerts of the same alert_type so changing live values update one card instead of stacking duplicates
  const dedupedOpen = useMemo(() => {
    const sorted = [...alerts.filter(alert => !alert.acknowledged)].sort(
      (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3) || b.timestamp.localeCompare(a.timestamp),
    );
    const byType = new Map<string, { alert: AlertItem; collapsedCount: number }>();
    for (const alert of sorted) {
      const existing = byType.get(alert.alert_type);
      if (!existing) {
        byType.set(alert.alert_type, { alert, collapsedCount: 1 });
      } else {
        existing.collapsedCount += 1;
        if (alert.timestamp > existing.alert.timestamp) {
          existing.alert = alert;
        }
      }
    }
    return [...byType.values()];
  }, [alerts]);

  if (!dedupedOpen.length) {
    return (
      <div className="observation-empty compact">
        <CheckCircle2 size={16} />
        <span>No active alerts waiting for review.</span>
      </div>
    );
  }

  const criticalCount = dedupedOpen.filter(i => i.alert.severity === 'CRITICAL').length;
  const warningCount = dedupedOpen.filter(i => i.alert.severity === 'WARNING').length;
  const infoCount = dedupedOpen.filter(i => i.alert.severity === 'INFO').length;

  return (
    <div className="alert-triage-stack compact" role="region" aria-label="Active health risk notifications">
      {(dedupedOpen.length > 1 || criticalCount > 0 || warningCount > 0 || infoCount > 0) && (
        <div className="alert-triage-bar">
          <div className="viz-actions">
            {criticalCount > 0 && <span className="pill alert-pill-critical">{criticalCount} Critical</span>}
            {warningCount > 0 && <span className="pill alert-pill-warning">{warningCount} Warning</span>}
            {infoCount > 0 && <span className="pill">{infoCount} Advisory</span>}
          </div>
          {onAcknowledgeAll && dedupedOpen.length > 1 && (
            <button type="button" onClick={onAcknowledgeAll} className="button secondary compact-btn">
              <CheckCheck size={14} />
              Mark all {dedupedOpen.length} seen
            </button>
          )}
        </div>
      )}

      <div className="alert-compact-list">
        {dedupedOpen.map(({ alert, collapsedCount }) => (
          <div
            key={alert.alert_type}
            role="alert"
            className={`observation-alert compact ${alert.severity === 'CRITICAL' ? 'critical' : alert.severity === 'INFO' ? 'info' : ''}`}
          >
            <div className="alert-card-body">
              <div className="alert-card-meta">
                <span className="pill">
                  {alert.severity === 'CRITICAL' ? <ShieldAlert size={12} /> : <AlertTriangle size={12} />}
                  {alert.severity} · {labels[alert.alert_type] ?? alert.alert_type}
                </span>
                {alert.trigger_metric && <span className="pill">{alert.trigger_metric}</span>}
                {collapsedCount > 1 && <span className="pill">Latest of {collapsedCount} updates</span>}
              </div>
              <p className="alert-compact-msg">{alert.message}</p>
              {alert.recommended_action && (
                <p className="alert-action-guide">
                  <strong>Recommended action:</strong> {alert.recommended_action}
                </p>
              )}
            </div>
            <div className="alert-compact-actions">
              <button type="button" onClick={() => onAcknowledge(alert.id)} className="button secondary compact-btn">
                <BellRing size={14} />
                Mark as seen
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

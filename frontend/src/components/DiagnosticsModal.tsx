import { useEffect, useRef } from 'react';
import { Activity, X } from 'lucide-react';
import type { DiagnosticResult } from '../types/telemetry';

export function DiagnosticsModal({ result, onClose }: { result: DiagnosticResult | null; onClose(): void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!result) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; close.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button, a, [tabindex="0"]') ?? []);
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, [result, onClose]);
  if (!result) return null;
  const summary = result.metrics_summary ?? {};
  return (
    <div className="modal-overlay">
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="diagnostic-title" className="panel diagnostic-modal">
        <div className="section-heading">
          <h2 id="diagnostic-title"><Activity size={19} />Simulation diagnostics</h2>
          <button ref={close} aria-label="Close diagnostics" onClick={onClose} className="button secondary"><X size={19} /></button>
        </div>
        <p className="warning-box">
          Prototype simulation output (not clinically validated). This report is not a medical diagnosis. Review any medical decision with your flight surgeon or mission medical team.
        </p>
        <p className="helper">
          Astronaut: {result.astronaut_id}
          {summary.mission_zone ? ` · ${String(summary.mission_zone).replace(/_/g, ' ')} (Day ${summary.mission_day ?? 14})` : ''}.
        </p>
        <dl className="detail-list">
          <div><dt>Simulated overall health index</dt><dd>{result.overall_health_score.toFixed(1)} / 100</dd></div>
          <div><dt>Cardiovascular status</dt><dd>{result.cardiovascular_status}</dd></div>
          <div><dt>Hypoxia risk</dt><dd>{result.hypoxia_risk}</dd></div>
          <div><dt>Radiation risk</dt><dd>{result.radiation_risk}</dd></div>
          {summary.cumulative_dose_msv !== undefined && (
            <div><dt>Simulated cumulative dose</dt><dd>{Number(summary.cumulative_dose_msv).toFixed(1)} mSv</dd></div>
          )}
          {summary.orbital_phase && (
            <div>
              <dt>Orbital / mission risk zone</dt>
              <dd>
                {String(summary.orbital_phase).replace(/_/g, ' ').toUpperCase()}
                {summary.iss_latitude !== undefined && summary.iss_longitude !== undefined
                  ? ` (${Number(summary.iss_latitude).toFixed(2)}, ${Number(summary.iss_longitude).toFixed(2)})`
                  : ''}
              </dd>
            </div>
          )}
        </dl>
        <h3 className="mt-6">Server-generated recommendations</h3>
        <ul>{result.recommendations.map((recommendation, i) => <li key={i}>{recommendation}</li>)}</ul>
        {result.environment_risks && result.environment_risks.length > 0 && (
          <>
            <h3 className="mt-6">Space-environment hazard breakdown</h3>
            <ul className="diag-risk-list">
              {result.environment_risks.map(risk => (
                <li key={risk.domain}>
                  <strong>{risk.domain} ({risk.risk_level}):</strong> {risk.summary}
                </li>
              ))}
            </ul>
          </>
        )}
        <button className="button primary" onClick={onClose}>Close report</button>
      </div>
    </div>
  );
}

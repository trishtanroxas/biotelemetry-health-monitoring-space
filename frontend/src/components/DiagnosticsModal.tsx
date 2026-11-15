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
  return <div className="modal-overlay"><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="diagnostic-title" className="panel diagnostic-modal"><div className="section-heading"><h2 id="diagnostic-title"><Activity size={19} />Autonomous Flight Diagnostics</h2><button ref={close} aria-label="Close diagnostics" onClick={onClose} className="button secondary"><X size={19} /></button></div><p className="warning-box">Telemetry triage grounded in NASA OSDR spaceflight curves and HRP biomedical limits. Follow flight protocols before executing countermeasures.</p>
  <div className="diagnostic-score-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--surface-alt)', borderRadius: '8px', margin: '12px 0' }}>
    <div>
      <span className="eyebrow">ASTRONAUT READINESS</span>
      <strong style={{ fontSize: '1.6rem', display: 'block' }}>{result.astronaut_id}</strong>
    </div>
    <div style={{ textAlign: 'right' }}>
      <span className="eyebrow">OVERALL SCORE</span>
      <strong style={{ fontSize: '1.8rem', color: result.overall_health_score >= 80 ? 'var(--success)' : result.overall_health_score >= 50 ? 'var(--warning)' : 'var(--error)' }}>
        {Math.round(result.overall_health_score)} <small style={{ fontSize: '1rem', color: 'var(--muted)' }}>/ 100</small>
      </strong>
    </div>
  </div>
  <dl className="detail-list"><div><dt>Cardiovascular status</dt><dd className={result.cardiovascular_status === 'NOMINAL' ? 'success-text' : 'warning-text'}>{result.cardiovascular_status}</dd></div><div><dt>Hypoxia risk</dt><dd className={result.hypoxia_risk === 'LOW' ? 'success-text' : 'warning-text'}>{result.hypoxia_risk}</dd></div><div><dt>Radiation risk</dt><dd className={result.radiation_risk === 'SAFE' ? 'success-text' : 'warning-text'}>{result.radiation_risk}</dd></div></dl>
  {result.recommendations && result.recommendations.length > 0 && (
    <>
      <h3 className="mt-6" style={{ marginTop: 16 }}>Clinical Action Countermeasures</h3>
      <ul style={{ paddingLeft: 20 }}>{result.recommendations.map((rec, i) => <li key={i} style={{ marginBottom: 4 }}>{rec}</li>)}</ul>
    </>
  )}
  {result.environment_risks && result.environment_risks.length > 0 && (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ marginBottom: 10 }}>NASA Spaceflight Hazard Evaluations</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {result.environment_risks.map((risk, i) => (
          <div key={i} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <strong>{risk.domain}</strong>
              <span className={`pill ${risk.risk_level === 'LOW' ? 'pill-success' : risk.risk_level === 'MODERATE' ? 'pill-warning' : 'pill-critical'}`}>
                {risk.risk_level}
              </span>
            </div>
            <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>{risk.summary}</p>
            <p style={{ margin: '4px 0', fontSize: '0.85rem', color: 'var(--accent)' }}>
              <strong>Countermeasure:</strong> {risk.countermeasure}
            </p>
            <small className="muted" style={{ display: 'block', marginTop: 4 }}>Basis: {risk.evidence_basis}</small>
          </div>
        ))}
      </div>
    </div>
  )}
  <div style={{ marginTop: 20 }}><button className="button primary" onClick={onClose}>Close Diagnostic Report</button></div></div></div>;
}

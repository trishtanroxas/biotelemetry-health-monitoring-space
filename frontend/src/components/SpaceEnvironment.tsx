import { useState, type FormEvent } from 'react';
import type { CheckIn } from '../types/wellness';
import type { EnvironmentDatum, EnvironmentSettings, SpaceEnvironment } from '../types/spaceWellness';
import { durationLabel, sourceLabels } from '../services/environment';
import { Disclosure, FormField } from './WellnessUI';
import { useSpaceWeather } from '../hooks/useSpaceWeather';

export function EnvironmentValue({ label, datum, unit = '', duration = false }: { label: string; datum: EnvironmentDatum<number | string>; unit?: string; duration?: boolean }) {
  return <div className="environment-reading"><dt>{label}</dt><dd>{datum.value === null ? 'Not available' : duration && typeof datum.value === 'number' ? durationLabel(datum.value) : `${datum.value}${unit ? ` ${unit}` : ''}`}<span className={`pill source-${datum.source}`}>{sourceLabels[datum.source]}</span></dd><p>{datum.detail}</p></div>;
}
export function EnvironmentReadings({ context }: { context: SpaceEnvironment }) {
  return <dl className="environment-readings"><EnvironmentValue label="Cabin oxygen" datum={context.cabinOxygen} unit="%" /><EnvironmentValue label="Environmental radiation rate" datum={context.radiationRate} unit="μSv/h" /><EnvironmentValue label="Mission duration" datum={context.missionDurationHours} duration /><EnvironmentValue label="Gravity / mission type" datum={context.gravity} /><EnvironmentValue label="Time in microgravity (scenario)" datum={context.microgravityHours} duration /><EnvironmentValue label="Space weather" datum={context.spaceWeather} /></dl>;
}
export function SpaceEnvironmentPanel({ context, settings, records, onSave, settingsError }: { context: SpaceEnvironment; settings: EnvironmentSettings; records: CheckIn[]; onSave(settings: EnvironmentSettings): void; settingsError: string }) {
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const { weather, weatherLoading, weatherError } = useSpaceWeather(true);
  function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setSaved(false);
    try { onSave(draft); setSaved(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save observations.'); }
  }
  const scoped = records.filter(record => record.astronautId === context.astronautId);
  return <Disclosure title="Space Environment"><p className="helper">Mission environmental context. Live space weather from NASA DONKI feed when connected.</p>
    {weather && (
      <div style={{ padding: '12px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <strong>NASA DONKI Live Space Weather</strong>
          <span className="pill pill-success">{weather.source_mode === 'live_donki' ? 'Live CCMC' : 'Calibrated Historical Prior'}</span>
        </div>
        <p style={{ margin: '4px 0', fontSize: '0.88rem' }}>{weather.summary}</p>
        <div style={{ display: 'flex', gap: 12, fontSize: '0.8rem', marginTop: 6, color: 'var(--muted)' }}>
          <span>Kp Index: <strong>{weather.kp_current.toFixed(1)}</strong></span>
          <span>Geomagnetic: <strong>{weather.storm_level}</strong></span>
          <span>Solar Flare: <strong>{weather.latest_flare_class ?? 'Quiet'}</strong></span>
        </div>
      </div>
    )}
    {weatherLoading && <p className="helper">Connecting to NASA DONKI space weather feed…</p>}
    <EnvironmentReadings context={context} />
    <p className="helper">An environmental radiation rate is not an astronaut’s personal accumulated dose. No safety level or personal exposure is inferred.</p>
    <details className="environment-settings"><summary>Scenario and manual observations (optional)</summary><form onSubmit={submit}><div className="form-grid"><FormField label="Demo mission type"><select value={draft.scenario} onChange={e => { setDraft({ ...draft, scenario: e.target.value as EnvironmentSettings['scenario'] }); setSaved(false); }}><option value="unconfigured">Not configured</option><option value="orbital-demo">Orbital microgravity demo</option><option value="surface-demo">Partial-gravity surface demo</option><option value="ground-demo">Earth ground-training demo</option></select></FormField><FormField label="Mission start date and time (UTC)" hint="Manually entered. Mission time is not provided by the server."><input type="datetime-local" step="60" value={draft.missionStartUtc} onChange={e => { setDraft({ ...draft, missionStartUtc: e.target.value }); setSaved(false); }} /></FormField><FormField label="Cabin oxygen observation (%)" hint="Optional manual observation. This is not blood oxygen."><input type="number" min="0" max="100" step="any" value={draft.cabinOxygenPercent} onChange={e => { setDraft({ ...draft, cabinOxygenPercent: e.target.value }); setSaved(false); }} /></FormField></div>{(error || settingsError) && <p role="alert" className="error-box">{error || settingsError}</p>}<button className="button secondary" type="submit" disabled={!!settingsError && settingsError.includes('restored')}>Save local context</button>{saved && <p className="helper" role="status">Scenario and observations saved on this device for this astronaut.</p>}</form></details>
    <details><summary>Why exercise and monitoring matter</summary><p className="helper">In microgravity, muscles and bones experience different loading than on Earth. Exercise and health monitoring help mission teams support crew function over time. Follow your approved routine; this prototype does not estimate muscle or bone loss.</p><p className="helper">{scoped.length ? `Your ${scoped.length} saved check-in(s) record ${scoped.reduce((sum, record) => sum + record.exerciseMinutes, 0)} total completed exercise minutes. These records do not establish a medical outcome.` : 'No exercise check-ins are saved for this astronaut yet.'}</p><a className="text-link" href="#missions">Review Daily Activities</a><a className="text-link source-link" href="https://www.nasa.gov/directorates/esdmd/hhp/exercise-physiology-and-countermeasures/" target="_blank" rel="noreferrer">NASA: exercise and monitoring</a></details>
  </Disclosure>;
}

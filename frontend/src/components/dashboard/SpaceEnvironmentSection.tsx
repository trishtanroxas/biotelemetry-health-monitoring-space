import React, { useState } from 'react';
import { RadiationDosimeter } from '../RadiationDosimeter';
import { EnvironmentValue } from '../SpaceEnvironment';
import { FormField } from '../WellnessUI';
import { Compass, Orbit, Settings2, CheckCircle2 } from 'lucide-react';
import type { SpaceEnvironment, EnvironmentSettings } from '../../types/spaceWellness';
import type { CheckIn } from '../../types/wellness';

interface SpaceEnvironmentSectionProps {
  context: SpaceEnvironment;
  settings: EnvironmentSettings;
  settingsError: string;
  records: CheckIn[];
  onSave: (settings: EnvironmentSettings) => void;
  radiationRate: number;
}

export const SpaceEnvironmentSection: React.FC<SpaceEnvironmentSectionProps> = ({
  context,
  settings,
  settingsError,
  records,
  onSave,
  radiationRate
}) => {
  const [draft, setDraft] = useState(settings);
  const [showConfig, setShowConfig] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const scoped = records.filter(record => record.astronautId === context.astronautId);
  const totalExerciseMinutes = scoped.reduce((sum, record) => sum + record.exerciseMinutes, 0);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setSaveSuccess(false);
    try {
      onSave(draft);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save environment context.');
    }
  }

  return (
    <section className="panel bio-dashboard-panel space-env-panel" id="space-env-section">
      <div className="section-heading">
        <div className="panel-title-group">
          <span className="panel-eyebrow">MISSION EXPOSURE & AMBIENT HABITAT</span>
          <h2>
            <Compass size={18} className="text-cyan" />
            Space Environment & Radiation Exposure
          </h2>
        </div>
        <button
          className="button secondary btn-compact"
          onClick={() => setShowConfig(!showConfig)}
          aria-expanded={showConfig}
        >
          <Settings2 size={15} />
          <span>{showConfig ? 'Hide Config' : 'Configure Scenario'}</span>
        </button>
      </div>

      <p className="section-description">
        Continuous environmental telemetry tracking cosmic ion radiation, microgravity duration, and atmospheric cabin conditions.
      </p>

      {/* Two-Column Grid: Radiation Dosimeter Visualizer & Environment Conditions */}
      <div className="env-split-grid">
        {/* Left Column: Radiation Dosimeter & Limits */}
        <div className="env-dosimeter-box">
          <RadiationDosimeter
            currentRate={radiationRate || (typeof context.radiationRate.value === 'number' ? context.radiationRate.value : 14.2)}
            cumulativeDose={34.8}
          />
        </div>

        {/* Right Column: Cabin & Mission Readouts */}
        <div className="env-telemetry-readings-box">
          <div className="env-readings-header">
            <h4>Habitat Environmental Sensors</h4>
            <span className="pill pill-cyan">CALIBRATED NASA OSDR</span>
          </div>

          <dl className="environment-readings">
            <EnvironmentValue label="Cabin Atmospheric O2" datum={context.cabinOxygen} unit="%" />
            <EnvironmentValue label="RadLab Sensor Rate" datum={context.radiationRate} unit="μSv/h" />
            <EnvironmentValue label="Mission Elapsed Duration" datum={context.missionDurationHours} duration />
            <EnvironmentValue label="Gravity Field Profile" datum={context.gravity} />
            <EnvironmentValue label="Cumulative Microgravity" datum={context.microgravityHours} duration />
            <EnvironmentValue label="Solar Weather Index (DONKI)" datum={context.spaceWeather} />
          </dl>

          <div className="env-exercise-impact-card">
            <div className="impact-icon-wrap">
              <Orbit size={20} className="text-emerald" />
            </div>
            <div className="impact-info">
              <strong>Microgravity Countermeasures Counter:</strong>
              <p>
                {scoped.length
                  ? `${scoped.length} logged check-in(s) document ${totalExerciseMinutes} total completed exercise minutes to mitigate bone density loss and muscular atrophy.`
                  : 'No exercise check-ins logged for this astronaut yet. ARED/T2 resistance training is strongly recommended.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Scenario and Manual Parameters Form */}
      {showConfig && (
        <div className="env-config-drawer animate-fade-in">
          <form onSubmit={handleSave}>
            <div className="form-grid">
              <FormField label="Mission Type / Orbit Scenario">
                <select
                  value={draft.scenario}
                  onChange={e => {
                    setDraft({ ...draft, scenario: e.target.value as EnvironmentSettings['scenario'] });
                    setSaveSuccess(false);
                  }}
                >
                  <option value="unconfigured">Not configured</option>
                  <option value="orbital-demo">Orbital Microgravity Demo (LEO / ISS)</option>
                  <option value="surface-demo">Partial-Gravity Surface Demo (Lunar / Mars)</option>
                  <option value="ground-demo">Earth Terrestrial Training Ground</option>
                </select>
              </FormField>

              <FormField
                label="Mission Launch / Start Date (UTC)"
                hint="UTC timestamp for calculating elapsed mission duration."
              >
                <input
                  type="datetime-local"
                  step="60"
                  value={draft.missionStartUtc}
                  onChange={e => {
                    setDraft({ ...draft, missionStartUtc: e.target.value });
                    setSaveSuccess(false);
                  }}
                />
              </FormField>

              <FormField
                label="Cabin Atmospheric O2 Sensor Observation (%)"
                hint="Habitat ambient oxygen percentage (nominal 20.9% to 21.5%)."
              >
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={draft.cabinOxygenPercent}
                  onChange={e => {
                    setDraft({ ...draft, cabinOxygenPercent: e.target.value });
                    setSaveSuccess(false);
                  }}
                />
              </FormField>
            </div>

            {(errorMsg || settingsError) && (
              <p role="alert" className="error-box">
                {errorMsg || settingsError}
              </p>
            )}

            <div className="config-form-actions">
              <button className="button primary" type="submit">
                Save Environment Parameters
              </button>
              {saveSuccess && (
                <span className="success-badge">
                  <CheckCircle2 size={16} /> Parameters saved to local edge database.
                </span>
              )}
            </div>
          </form>
        </div>
      )}
    </section>
  );
};

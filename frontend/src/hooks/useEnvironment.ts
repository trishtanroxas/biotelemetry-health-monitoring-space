import { useState } from 'react';
import type { EnvironmentDatum, EnvironmentSettings, EnvironmentTelemetry } from '../types/spaceWellness';
import { buildEnvironment, defaultEnvironmentSettings, environmentKey, loadEnvironmentSettings, validateEnvironmentSettings } from '../services/environment';

export function useEnvironment(
  astronautId: string,
  vitals: EnvironmentTelemetry,
  spaceWeather?: EnvironmentDatum<string>,
) {
  const [initial] = useState(() => {
    try { return { settings: typeof window === 'undefined' ? defaultEnvironmentSettings() : loadEnvironmentSettings(astronautId, window.localStorage), error: '' }; }
    catch { return { settings: defaultEnvironmentSettings(), error: 'Environment settings could not be restored. Existing saved data has been retained.' }; }
  });
  const [settings, setSettings] = useState(initial.settings);
  const [error, setError] = useState(initial.error);

  function save(next: EnvironmentSettings) {
    if (initial.error) throw new Error(initial.error);
    const problem = validateEnvironmentSettings(next);
    if (problem) throw new Error(problem);
    try { window.localStorage.setItem(environmentKey(astronautId), JSON.stringify(next)); setSettings(next); setError(''); }
    catch { setError('Could not save environment observations. Previous settings are unchanged.'); throw new Error('Could not save environment observations. Please retry.'); }
  }

  return { settings, error, save, context: buildEnvironment(astronautId, settings, vitals, new Date(), spaceWeather) };
}

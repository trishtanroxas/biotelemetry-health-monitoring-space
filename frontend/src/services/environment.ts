import type { EnvironmentDatum, EnvironmentSettings, EnvironmentTelemetry, SpaceEnvironment } from '../types/spaceWellness';
import { parseUtcInput } from './sleepTiming';

export const sourceLabels = { measured: 'Measured · sensor', simulated: 'Simulated reading', manual: 'Manually entered', unavailable: 'Unavailable' } as const;
export const defaultEnvironmentSettings = (): EnvironmentSettings => ({ version: 1, scenario: 'unconfigured', missionStartUtc: '', cabinOxygenPercent: '' });
export const environmentKey = (id: string) => `biotelemetry:environment:v1:${encodeURIComponent(id)}`;

export function validateEnvironmentSettings(settings: EnvironmentSettings, now = new Date()): string | null {
  if (settings.version !== 1 || !['unconfigured', 'orbital-demo', 'surface-demo', 'ground-demo'].includes(settings.scenario)) return 'Choose an available demo scenario.';
  if (settings.missionStartUtc && (parseUtcInput(settings.missionStartUtc) === null || parseUtcInput(settings.missionStartUtc)! > now.getTime())) return 'Enter a mission start in UTC that is not in the future.';
  if (settings.cabinOxygenPercent !== '' && (!Number.isFinite(Number(settings.cabinOxygenPercent)) || Number(settings.cabinOxygenPercent) < 0 || Number(settings.cabinOxygenPercent) > 100)) return 'Cabin oxygen must be a percentage from 0 to 100, or left blank. This is not a safety range.';
  return null;
}

export function loadEnvironmentSettings(id: string, storage: Pick<Storage, 'getItem'>): EnvironmentSettings {
  const raw = storage.getItem(environmentKey(id));
  if (raw === null) return defaultEnvironmentSettings();
  const value = JSON.parse(raw) as EnvironmentSettings;
  if (!value || typeof value.missionStartUtc !== 'string' || typeof value.cabinOxygenPercent !== 'string' || value.version !== 1 || !['unconfigured', 'orbital-demo', 'surface-demo', 'ground-demo'].includes(value.scenario)) throw new Error('Environment settings could not be restored. Existing data was retained.');
  if (value.missionStartUtc && parseUtcInput(value.missionStartUtc) === null) throw new Error('Invalid saved mission start.');
  return value;
}

const unavailable = <T>(detail: string): EnvironmentDatum<T> => ({ value: null, source: 'unavailable', detail });

export function buildEnvironment(
  astronautId: string,
  settings: EnvironmentSettings,
  vitals?: EnvironmentTelemetry,
  now = new Date(),
  spaceWeather?: EnvironmentDatum<string>,
): SpaceEnvironment {
  const started = settings.missionStartUtc ? parseUtcInput(settings.missionStartUtc) : null;
  const hours = started !== null && started <= now.getTime() && settings.scenario !== 'unconfigured' ? (now.getTime() - started) / 3600000 : null;
  const missionDurationHours: EnvironmentDatum<number> = hours === null ? unavailable('Mission start/scenario has not been configured.') : { value: hours, source: 'manual', detail: `Elapsed from manually entered UTC start ${settings.missionStartUtc}.` };
  const gravityNames = { unconfigured: '', 'orbital-demo': 'Microgravity · orbital demo', 'surface-demo': 'Partial gravity · surface demo', 'ground-demo': 'Earth gravity · ground demo' };
  const oxygen = settings.cabinOxygenPercent.trim();
  return {
    version: 1,
    astronautId,
    capturedAt: now.toISOString(),
    scenario: settings.scenario,
    cabinOxygen: oxygen !== '' && Number.isFinite(Number(oxygen)) && Number(oxygen) >= 0 && Number(oxygen) <= 100 ? { value: Number(oxygen), source: 'manual', detail: 'Cabin oxygen observation entered by the user; not a connected sensor.' } : unavailable('No cabin oxygen sensor information is connected. Blood oxygen is a different measurement.'),
    radiationRate: vitals?.astronaut_id === astronautId && Number.isFinite(vitals.radiation_rate) && vitals.radiation_rate >= 0 ? { value: vitals.radiation_rate, source: 'simulated', detail: 'Existing telemetry simulation: environmental rate, not a personal dose.', recordedAt: vitals.timestamp } : unavailable('No environmental radiation reading is available for this astronaut.'),
    missionDurationHours,
    gravity: settings.scenario === 'unconfigured' ? unavailable('Choose a demo scenario to add context.') : { value: gravityNames[settings.scenario], source: 'simulated', detail: 'User-selected demo scenario, not measured gravity.' },
    microgravityHours: settings.scenario === 'orbital-demo' && hours !== null ? { value: hours, source: 'manual', detail: 'Scenario assumption: continuous microgravity since the entered start; not measured exposure time.' } : unavailable(settings.scenario === 'orbital-demo' ? 'Enter an orbital-demo start time to show assumed time in microgravity.' : 'Microgravity duration is not supported by the selected scenario.'),
    spaceWeather: spaceWeather ?? unavailable('No live space-weather feed is connected.'),
  };
}

export function durationLabel(hours: number): string {
  return `${Math.floor(hours / 24)} days ${Math.floor(hours % 24)} hours`;
}

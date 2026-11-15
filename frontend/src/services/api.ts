import { Astronaut, VitalSigns, AlertItem, DiagnosticResult } from '../types/telemetry';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (typeof window === 'undefined' && API_BASE.startsWith('/')) {
    throw new Error('Relative API requests require a browser origin.');
  }
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Request failed (${response.status}). Please try again.`);
    return await response.json() as T;
  } finally { globalThis.clearTimeout(timeout); }
}

const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const demoCrew: Astronaut[] = [
  { id: 'ASTRO-01', name: 'Dr. Sarah Chen', role: 'Commander / EVA Lead', age: 38, resting_hr: 62, baseline_spo2: 98.8, status: 'NOMINAL', suit_id: 'EMU-X4' },
  { id: 'ASTRO-02', name: 'Marcus Vance', role: 'Flight Engineer', age: 34, resting_hr: 65, baseline_spo2: 99.1, status: 'NOMINAL', suit_id: 'EMU-X2' },
  { id: 'ASTRO-03', name: 'Elena Rostova', role: 'Science Specialist', age: 41, resting_hr: 58, baseline_spo2: 98.4, status: 'NOMINAL', suit_id: 'EMU-X7' },
];

export const fetchAstronauts = () => request<Astronaut[]>('/astronauts');

export const fetchLatestTelemetry = (
  astronautId: string,
  anomaly = 'NONE',
  missionZone = 'LEO_ISS',
  missionDay = 14,
) => {
  const params = new URLSearchParams({
    astronaut_id: astronautId,
    anomaly,
    mission_zone: missionZone,
    mission_day: String(missionDay),
  });
  return request<VitalSigns>(`/telemetry/latest?${params.toString()}`);
};

export const fetchTelemetryHistory = (astronautId: string, limit = 30) =>
  request<VitalSigns[]>(`/telemetry/history?astronaut_id=${encodeURIComponent(astronautId)}&limit=${limit}`);

export const fetchAlerts = () => request<AlertItem[]>('/alerts');

export async function acknowledgeAlert(alertId: string): Promise<void> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${API_BASE}/alerts/${encodeURIComponent(alertId)}/ack`, {
      ...post({ acknowledged_by: 'CREW_PWA_USER' }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Request failed (${response.status}). Please try again.`);
    }
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function acknowledgeAllAlerts(astronautId: string): Promise<void> {
  await request(`/alerts/ack-all?astronaut_id=${encodeURIComponent(astronautId)}`, post({}));
}

export interface SyncReceipt { status: string; astronaut_id: string; synced_count: number; persisted?: boolean }
export const syncOfflineBatch = (astronautId: string, records: VitalSigns[]) =>
  request<SyncReceipt>('/telemetry/sync-batch', post({ astronaut_id: astronautId, records }));

export const runDiagnostics = (
  astronautId: string,
  missionZone = 'LEO_ISS',
  missionDay = 14,
  anomaly = 'NONE',
) =>
  request<DiagnosticResult>(
    '/diagnostics/analyze',
    post({
      astronaut_id: astronautId,
      duration_seconds: 60,
      mission_zone: missionZone,
      mission_day: missionDay,
      solar_storm: 'LIVE_DONKI',
      anomaly,
    }),
  );

// Space Weather
export interface SpaceWeatherSnapshot {
  kp_current: number;
  storm_level: string;
  radiation_storm: string;
  latest_flare_class: string | null;
  latest_flare_location: string | null;
  latest_flare_time: string | null;
  active_sep: boolean;
  earth_impact_eta: string | null;
  summary: string;
  source_mode: string;
  fetched_at: string;
  events: Array<{
    event_id: string;
    event_type: string;
    event_time: string;
    severity: string;
    summary: string;
    kp_index?: number;
    flare_class?: string;
    cme_speed_kms?: number;
  }>;
}

export const fetchSpaceWeather = (refresh = false) =>
  request<SpaceWeatherSnapshot>(`/space-weather/live${refresh ? '?refresh=true' : ''}`);

// ISS Live Feed
export interface IssLiveFeed {
  current: {
    latitude: number;
    longitude: number;
    altitude_km: number;
    velocity_kms: number;
    visibility: string;
    orbital_phase: string;
    coord_source: string;
    timestamp: string;
  };
  recent_track: Array<{ latitude: number; longitude: number; altitude_km: number; velocity_kms: number; visibility: string; orbital_phase: string; coord_source: string; timestamp: string }>;
  predicted_track: Array<{ latitude: number; longitude: number; offset_minutes: number }>;
}

export const fetchIssPosition = (refresh = false) =>
  request<IssLiveFeed>(`/space-weather/iss${refresh ? '?refresh=true' : ''}`);

// Flight Surgeon AI Assistant
export interface AssistantApiResponse {
  summary: string;
  actions: string[];
  escalate_when: string;
  nasa_reference: string;
  source: string;
  model: string;
}

export const askFlightAssistantApi = (question: string, context: Record<string, unknown>) =>
  request<AssistantApiResponse>('/assistant/ask', post({ question, context }));

// Wellness Check-in Sync
export const syncCheckInRemote = (payload: Record<string, unknown>) =>
  request<{ persisted: boolean; client_id: string }>('/wellness/checkins', post(payload));

// Telemetry history for diagnostics / trend charts
export const fetchWellnessCheckIns = (astronautId: string, limit = 30) =>
  request<{ records: Record<string, unknown>[] }>(`/wellness/checkins/${encodeURIComponent(astronautId)}?limit=${limit}`);

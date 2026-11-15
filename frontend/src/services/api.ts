import { Astronaut, VitalSigns, AlertItem, DiagnosticResult } from '../types/telemetry';
import type { SimulationConfig } from './simulationConfig';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  if (typeof window === 'undefined' && API_BASE.startsWith('/')) {
    throw new Error('Relative API requests require a browser origin.');
  }
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
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
  simOrZone?: Partial<SimulationConfig> | string,
  missionDay = 14,
) => {
  const params = new URLSearchParams({ astronaut_id: astronautId, anomaly });
  if (typeof simOrZone === 'object' && simOrZone !== null) {
    if (simOrZone.missionZone) params.set('mission_zone', simOrZone.missionZone);
    if (simOrZone.missionDay !== undefined) params.set('mission_day', String(simOrZone.missionDay));
    if (simOrZone.evaActive !== undefined && simOrZone.evaActive !== null) params.set('eva_active', String(simOrZone.evaActive));
    if (simOrZone.shielding) params.set('shielding', simOrZone.shielding);
    if (simOrZone.solarStorm) params.set('solar_storm', simOrZone.solarStorm);
  } else if (typeof simOrZone === 'string') {
    params.set('mission_zone', simOrZone);
    params.set('mission_day', String(missionDay));
  }
  return request<VitalSigns>(`/telemetry/latest?${params.toString()}`);
};

export const fetchTelemetryHistory = (astronautId: string, limit = 30) =>
  request<VitalSigns[]>(`/telemetry/history?astronaut_id=${encodeURIComponent(astronautId)}&limit=${limit}`);

export const fetchAlerts = () => request<AlertItem[]>('/alerts');

export async function acknowledgeAlert(
  alertId: string,
  meta?: { astronaut_id?: string; alert_type?: string },
): Promise<void> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${API_BASE}/alerts/${encodeURIComponent(alertId)}/ack`, {
      ...post({ acknowledged_by: 'CREW_PWA_USER', ...meta }),
      signal: controller.signal,
      cache: 'no-store',
    });
    // 404 means the server cleared that hazard/session already; treat as acknowledged cleanly.
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
  simOrZone?: Partial<SimulationConfig> | string,
  missionDay = 14,
  anomaly = 'NONE',
) => {
  let payload: Record<string, unknown> = {
    astronaut_id: astronautId,
    duration_seconds: 60,
  };
  if (typeof simOrZone === 'object' && simOrZone !== null) {
    payload = {
      ...payload,
      mission_zone: simOrZone.missionZone ?? 'LEO_ISS',
      mission_day: simOrZone.missionDay ?? 14,
      eva_active: simOrZone.evaActive ?? null,
      shielding: simOrZone.shielding ?? 'NOMINAL',
      solar_storm: simOrZone.solarStorm ?? 'LIVE_DONKI',
      anomaly: simOrZone.anomaly ?? 'NONE',
    };
  } else {
    payload = {
      ...payload,
      mission_zone: simOrZone ?? 'LEO_ISS',
      mission_day: missionDay,
      solar_storm: 'LIVE_DONKI',
      anomaly,
    };
  }
  return request<DiagnosticResult>('/diagnostics/analyze', post(payload));
};

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

export interface AssistantApiAction {
  label: string;
  target_page: string;
  target_exam?: string | null;
  protocol_id?: string | null;
}

export interface AssistantApiResponse {
  summary: string;
  actions: string[];
  escalate_when: string;
  nasa_reference: string;
  source: string;
  model: string;
  suggested_actions?: AssistantApiAction[];
  sbar_text?: string | null;
}

export const askFlightAssistantApi = (
  question: string,
  context: Record<string, unknown>,
  options?: { history?: { role: string; content?: string; text?: string }[]; mode?: string } | Array<{ role: string; text?: string; content?: string }>,
) => {
  let hist: Array<{ role: string; content: string }> | undefined;
  let mode = 'chat';
  if (Array.isArray(options)) {
    hist = options.map(h => ({ role: h.role, content: h.text || h.content || '' }));
  } else if (options && typeof options === 'object') {
    if (options.history) {
      hist = options.history.map(h => ({ role: h.role, content: h.text || h.content || '' }));
    }
    if (options.mode) {
      mode = options.mode;
    }
  }
  return request<AssistantApiResponse>(
    '/assistant/ask',
    post({ question, context, history: hist, mode }),
    12000,
  );
};

export interface AudioTranscribeResponse {
  transcript: string;
  source: string;
  model: string;
}

export const transcribeAudioApi = (audioBase64: string, mimeType: string = 'audio/webm') =>
  request<AudioTranscribeResponse>(
    '/assistant/transcribe',
    post({ audio_base64: audioBase64, mime_type: mimeType }),
  );

export interface PublicGuideResponse {
  reply: string;
  source: string;
  model: string;
}

export const askPublicMissionGuideApi = (
  question: string,
  history?: Array<{ role: string; content?: string; text?: string }>,
) =>
  request<PublicGuideResponse>(
    '/public/assistant/chat',
    post({
      question,
      history: history?.map(h => ({
        role: h.role,
        content: h.content || h.text || '',
      })),
    }),
  );

async function fetchWithSignal(
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
  timeoutMs = 12000,
): Promise<Response> {
  if (typeof window === 'undefined' && API_BASE.startsWith('/')) {
    throw new Error('Relative API requests require a browser origin.');
  }
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (cause) {
    if (timedOut && !signal?.aborted) {
      throw new Error('Request timed out before audio synthesis completed.');
    }
    throw cause;
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function synthesizeAssistantSpeechApi(
  text: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await fetchWithSignal('/assistant/tts', post({ text }), signal, 25000);
  if (!response.ok) {
    throw new Error(`Speech synthesis failed (${response.status}).`);
  }
  return await response.blob();
}

export async function transcribeSpeechAudioApi(
  audioBase64: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<{ transcript: string; source: string; model: string }> {
  const response = await fetchWithSignal(
    '/assistant/transcribe',
    post({ audio_base64: audioBase64, mime_type: mimeType }),
    signal,
  );
  if (!response.ok) {
    throw new Error(`Speech transcription failed (${response.status}).`);
  }
  return await response.json() as { transcript: string; source: string; model: string };
}

export interface ImageAnalysisApiResponse {
  exam_type: string;
  severity: 'nominal' | 'warning' | 'critical' | string;
  findings: string;
  recommended_actions: string[];
  ground_consult_required: boolean;
  analysis_source: string;
  image_quality: string;
}

export const analyzeSelfExamImageApi = (payload: Record<string, unknown>) =>
  request<ImageAnalysisApiResponse>('/diagnostics/analyze-image', post(payload), 12000);

export const syncCheckInRemote = (payload: Record<string, unknown>) =>
  request<{ persisted: boolean; client_id: string }>('/wellness/checkins', post(payload));

export const syncAssessmentRemote = (payload: Record<string, unknown>) =>
  request<{ persisted: boolean; client_id: string }>('/wellness/assessments', post(payload));

export interface RemoteCheckInRow {
  id?: string;
  client_id?: string | null;
  astronaut_id: string;
  recorded_at: string;
  mood?: number | null;
  energy?: number | null;
  stress?: number | null;
  sleep_hours?: number | null;
  pain_level?: number | null;
  blood_glucose_mg_dl?: number | null;
  hydration_ml?: number | null;
  nutrition_quality?: string | null;
  immune_symptoms?: string[] | null;
  metrics?: Record<string, unknown> | null;
}

export interface RemoteAssessmentRow {
  id?: string;
  client_id?: string | null;
  astronaut_id: string;
  exam_type: string;
  recorded_at: string;
  severity: string;
  findings: string;
  recommended_actions?: string[] | null;
  ground_consult_required?: boolean | null;
  analysis_source?: string | null;
  thumbnail_data_url?: string | null;
}

export function isOnlineHttpBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const origin = window.location?.origin;
  if (typeof origin !== 'string' || !/^https?:/.test(origin)) return false;
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export const fetchCheckInsRemote = (astronautId: string, limit = 60) =>
  request<{ records: RemoteCheckInRow[] }>(`/wellness/checkins/${encodeURIComponent(astronautId)}?limit=${limit}`);

export const fetchAssessmentsRemote = (astronautId: string, limit = 40) =>
  request<{ records: RemoteAssessmentRow[] }>(`/wellness/assessments/${encodeURIComponent(astronautId)}?limit=${limit}`);

export const fetchWellnessCheckIns = (astronautId: string, limit = 30) =>
  request<{ records: Record<string, unknown>[] }>(`/wellness/checkins/${encodeURIComponent(astronautId)}?limit=${limit}`);

import type { EnvironmentDatum } from '../types/spaceWellness';
import type { IssLiveFeed, IssPredictedPoint, IssTrackPoint, SpaceWeatherEvent, SpaceWeatherSnapshot } from '../types/spaceWeather';

export const SPACE_WEATHER_CACHE_KEY = 'biotelemetry:space-weather:v1';
const ISS_DIRECT_URL = 'https://api.wheretheiss.at/v1/satellites/25544?units=kilometers';
const NOAA_ENLIL_FRAMES_URL = 'https://services.swpc.noaa.gov/products/animations/enlil.json';

export interface NoaaEnlilFrame {
  url: string;
  label: string;
}

export function parseEnlilFrameLabel(url: string): string {
  const match = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(url);
  if (!match) return 'Forecast frame';
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]} UTC`;
}

export async function fetchNoaaEnlilFrames(): Promise<NoaaEnlilFrame[]> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(NOAA_ENLIL_FRAMES_URL, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return [];
    const raw = (await response.json()) as Array<{ url?: string }>;
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const valid = raw.filter(item => typeof item?.url === 'string' && item.url.endsWith('.jpg'));
    if (!valid.length) return [];
    // Subsample evenly to ~48 frames across the multi-day forecast for smooth playback
    const step = Math.max(1, Math.floor(valid.length / 48));
    const sampled = valid.filter((_, idx) => idx % step === 0 || idx === valid.length - 1);
    return sampled.map(item => {
      const path = item.url!;
      const fullUrl = path.startsWith('http') ? path : `https://services.swpc.noaa.gov${path}`;
      return { url: fullUrl, label: parseEnlilFrameLabel(fullUrl) };
    });
  } catch {
    return [];
  } finally {
    window.clearTimeout(timeout);
  }
}

export const SAA_PEAK_LAT = -25.0;
export const SAA_PEAK_LON = -48.0;
const SAA_TILT_RAD = (18 * Math.PI) / 180;
const SAA_SEMI_MAJOR_DEG = 43.0;
const SAA_SEMI_MINOR_DEG = 17.0;

export type SaaFluxTier = 'CORE' | 'INNER' | 'MID' | 'OUTER' | 'NONE';

export interface SaaFluxProfile {
  inSaa: boolean;
  normalizedDist: number;
  intensity: number;
  fluxPcm2s: number;
  tier: SaaFluxTier;
}

export interface SaaSamplePoint {
  lat: number;
  lon: number;
  x: number;
  y: number;
  intensity: number;
  fluxPcm2s: number;
  tier: SaaFluxTier;
}

function saaShapeFactor(phi: number): number {
  // Asymmetric kidney factor matching LEO AP8 trapped-proton SE Atlantic drift
  return 1 + 0.08 * Math.cos(phi - 0.35) + 0.06 * Math.sin(2 * phi);
}

/** Normalized geomagnetic-offset distance (<= 1.0 inside ~10 p/cm^2/s AP8 420 km SAA contour). */
export function saaNormalizedDistance(lat: number, lon: number): number {
  const dx = (((lon - SAA_PEAK_LON + 180) % 360) + 360) % 360 - 180;
  const dy = SAA_PEAK_LAT - lat;
  const cosT = Math.cos(SAA_TILT_RAD);
  const sinT = Math.sin(SAA_TILT_RAD);
  const ux = (dx * cosT + dy * sinT) / SAA_SEMI_MAJOR_DEG;
  const vy = (-dx * sinT + dy * cosT) / SAA_SEMI_MINOR_DEG;
  const r0 = Math.hypot(ux, vy);
  if (r0 === 0) return 0;
  return r0 / saaShapeFactor(Math.atan2(vy, ux));
}

export function saaFluxProfile(lat: number, lon: number): SaaFluxProfile {
  const d = saaNormalizedDistance(lat, lon);
  if (d > 1.0) {
    return { inSaa: false, normalizedDist: d, intensity: 0, fluxPcm2s: 0, tier: 'NONE' };
  }
  const intensity = Math.exp(-2.9 * d * d);
  const fluxPcm2s = Math.round(185 * intensity);
  const tier: SaaFluxTier = d <= 0.22 ? 'CORE' : d <= 0.45 ? 'INNER' : d <= 0.72 ? 'MID' : 'OUTER';
  return { inSaa: true, normalizedDist: d, intensity, fluxPcm2s, tier };
}

export function isInSaa(lat: number, lon: number): boolean {
  return saaNormalizedDistance(lat, lon) <= 1.0;
}

/** Generate closed SVG equirectangular contour path matching saaNormalizedDistance === levelD. */
export function buildSaaContourPath(levelD: number, steps = 56): string {
  const cosT = Math.cos(SAA_TILT_RAD);
  const sinT = Math.sin(SAA_TILT_RAD);
  const cx = 180 + SAA_PEAK_LON;
  const cy = 90 - SAA_PEAK_LAT;
  const cmds: string[] = [];
  for (let i = 0; i < steps; i++) {
    const phi = (2 * Math.PI * i) / steps;
    const r = levelD * saaShapeFactor(phi);
    const u = SAA_SEMI_MAJOR_DEG * r * Math.cos(phi);
    const v = SAA_SEMI_MINOR_DEG * r * Math.sin(phi);
    const x = cx + u * cosT - v * sinT;
    const y = cy + u * sinT + v * cosT;
    cmds.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`);
  }
  cmds.push('Z');
  return cmds.join(' ');
}

/** Generate staggered geophysical proton-flux sample nodes inside the SAA boundary. */
export function generateSaaSamplePoints(latStep = 5.5, lonStep = 8.0): SaaSamplePoint[] {
  const points: SaaSamplePoint[] = [];
  let rowIdx = 0;
  for (let lat = -49; lat <= -3; lat += latStep) {
    const lonOffset = (rowIdx % 2) * (lonStep / 2);
    rowIdx += 1;
    for (let lon = -92 + lonOffset; lon <= 2; lon += lonStep) {
      const profile = saaFluxProfile(lat, lon);
      if (profile.inSaa && profile.normalizedDist <= 0.96) {
        points.push({
          lat: Number(lat.toFixed(1)),
          lon: Number(lon.toFixed(1)),
          x: Number((lon + 180).toFixed(1)),
          y: Number((90 - lat).toFixed(1)),
          intensity: profile.intensity,
          fluxPcm2s: profile.fluxPcm2s,
          tier: profile.tier,
        });
      }
    }
  }
  return points;
}

export function classifyOrbitalPhase(lat: number, lon: number, visibility: string): string {
  if (isInSaa(lat, lon)) return 'saa_transit';
  if (Math.abs(lat) > 50) return 'high_latitude';
  if (visibility === 'eclipsed') return 'eclipsed';
  return 'daylight';
}

export function predictIssGroundTrack(lat: number, lon: number, ascending = true): IssPredictedPoint[] {
  const inclination = 51.6;
  const incRad = (inclination * Math.PI) / 180;
  const sinU = Math.max(-1, Math.min(1, lat / inclination));
  let uNow = Math.asin(sinU);
  if (!ascending) uNow = Math.PI - uNow;
  const orbitPeriodMin = 92.68;
  const earthRotDegPerMin = 0.250684;
  const lonOffset = lon - (Math.atan2(Math.cos(incRad) * Math.sin(uNow), Math.cos(uNow)) * 180) / Math.PI;

  const points: IssPredictedPoint[] = [];
  for (let offsetMin = -45; offsetMin <= 45; offsetMin += 3) {
    const u = uNow + (2 * Math.PI * offsetMin) / orbitPeriodMin;
    const pLat = (Math.asin(Math.sin(incRad) * Math.sin(u)) * 180) / Math.PI;
    const raanLon = (Math.atan2(Math.cos(incRad) * Math.sin(u), Math.cos(u)) * 180) / Math.PI;
    const pLon = (((lonOffset + raanLon - earthRotDegPerMin * offsetMin + 180) % 360) + 360) % 360 - 180;
    points.push({
      latitude: Number(pLat.toFixed(3)),
      longitude: Number(pLon.toFixed(3)),
      offset_minutes: offsetMin,
    });
  }
  return points;
}

export function buildPropagatedIssFeed(now = new Date(), previousTrack: IssTrackPoint[] = []): IssLiveFeed {
  const nowSec = now.getTime() / 1000;
  const orbitFrac = (nowSec % 5560) / 5560;
  const lat = Number((51.6 * Math.sin(2 * Math.PI * orbitFrac)).toFixed(4));
  const lon = Number(((((orbitFrac * 360 + 180) % 360) + 360) % 360 - 180).toFixed(4));
  const visibility = orbitFrac >= 0.625 ? 'eclipsed' : 'daylight';
  const current: IssTrackPoint = {
    latitude: lat,
    longitude: lon,
    altitude_km: 418.4,
    velocity_kms: 7.66,
    visibility,
    orbital_phase: classifyOrbitalPhase(lat, lon, visibility),
    coord_source: 'nasa_orbital_profile',
    timestamp: now.toISOString(),
  };
  const recent = [...previousTrack, current].slice(-30);
  const ascending = recent.length < 2 || recent[recent.length - 1].latitude >= recent[recent.length - 2].latitude;
  return {
    current,
    recent_track: recent,
    predicted_track: predictIssGroundTrack(lat, lon, ascending),
  };
}

export async function fetchLiveIssFeed(
  refresh = false,
  apiBase = '/api/v1',
  previousTrack: IssTrackPoint[] = [],
): Promise<IssLiveFeed> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4500);
  try {
    const query = refresh ? '?refresh=true' : '';
    const response = await fetch(`${apiBase}/space-weather/iss${query}`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (response.ok) {
      return (await response.json()) as IssLiveFeed;
    }
  } catch {
    // Fall back to direct public ephemeris when gateway is offline
  } finally {
    window.clearTimeout(timeout);
  }

  const directController = new AbortController();
  const directTimeout = window.setTimeout(() => directController.abort(), 3500);
  try {
    const directRes = await fetch(ISS_DIRECT_URL, { signal: directController.signal, cache: 'no-store' });
    if (directRes.ok) {
      const data = await directRes.json();
      const lat = Number(Number(data.latitude).toFixed(4));
      const lon = Number(Number(data.longitude).toFixed(4));
      const visibility = String(data.visibility || 'daylight');
      const current: IssTrackPoint = {
        latitude: lat,
        longitude: lon,
        altitude_km: Number(Number(data.altitude || 420).toFixed(2)),
        velocity_kms: Number((Number(data.velocity || 27576) / 3600).toFixed(2)),
        visibility,
        orbital_phase: classifyOrbitalPhase(lat, lon, visibility),
        coord_source: 'live_iss',
        timestamp: new Date().toISOString(),
      };
      const recent = [...previousTrack, current].slice(-30);
      const ascending = recent.length < 2 || recent[recent.length - 1].latitude >= recent[recent.length - 2].latitude;
      return {
        current,
        recent_track: recent,
        predicted_track: predictIssGroundTrack(lat, lon, ascending),
      };
    }
  } catch {
    // Use orbital propagation if network is unavailable
  } finally {
    window.clearTimeout(directTimeout);
  }

  return buildPropagatedIssFeed(new Date(), previousTrack);
}

export async function fetchLiveSpaceWeather(
  refresh = false,
  apiBase = '/api/v1',
): Promise<SpaceWeatherSnapshot> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const query = refresh ? '?refresh=true' : '';
    const response = await fetch(`${apiBase}/space-weather/live${query}`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`Space weather request failed (${response.status}).`);
    }
    return (await response.json()) as SpaceWeatherSnapshot;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function saveSpaceWeatherCache(
  snapshot: SpaceWeatherSnapshot,
  storage: Pick<Storage, 'setItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined,
): void {
  if (!storage) return;
  try {
    storage.setItem(SPACE_WEATHER_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadSpaceWeatherCache(
  storage: Pick<Storage, 'getItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined,
): SpaceWeatherSnapshot | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SPACE_WEATHER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SpaceWeatherSnapshot;
    if (!parsed || typeof parsed.summary !== 'string' || !Array.isArray(parsed.events)) return null;
    return { ...parsed, source_mode: 'local_cache' };
  } catch {
    return null;
  }
}

export function toSpaceWeatherDatum(
  snapshot: SpaceWeatherSnapshot | null,
  offline: boolean,
): EnvironmentDatum<string> {
  if (!snapshot) {
    return {
      value: null,
      source: 'unavailable',
      detail: offline ? 'Offline with no cached DONKI snapshot.' : 'No live space-weather feed is connected.',
    };
  }
  if (snapshot.source_mode === 'historical_fallback') {
    return {
      value: snapshot.summary,
      source: 'simulated',
      detail: 'Fallback to pre-fetched NASA DONKI 2020-2026 baseline while live CCMC feed is unreachable.',
      recordedAt: snapshot.fetched_at,
    };
  }
  return {
    value: snapshot.summary,
    source: 'measured',
    detail:
      offline || snapshot.source_mode === 'local_cache'
        ? `Cached NASA DONKI observation from ${new Date(snapshot.fetched_at).toLocaleString()}.`
        : 'Live NASA CCMC DONKI observations synced via FastAPI and Supabase Realtime.',
    recordedAt: snapshot.fetched_at,
  };
}

// Maps heliographic coordinates (e.g. N32E90, S22W40) onto a normalized solar disk [-1, 1]
export function parseSolarLocation(location?: string | null): { x: number; y: number; label: string } | null {
  if (!location) return null;
  const match = /^([NS])(\d{1,2})([EW])(\d{1,3})$/i.exec(location.trim());
  if (!match) return null;
  const latDeg = Math.min(90, Number(match[2])) * (match[1].toUpperCase() === 'N' ? -1 : 1);
  const lonDeg = Math.min(90, Number(match[4])) * (match[3].toUpperCase() === 'E' ? -1 : 1);
  const latRad = (latDeg * Math.PI) / 180;
  const lonRad = (lonDeg * Math.PI) / 180;
  const x = Math.cos(latRad) * Math.sin(lonRad);
  const y = Math.sin(latRad);
  return { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)), label: location.trim().toUpperCase() };
}

export function mergeRealtimeSpaceWeatherEvent(
  snapshot: SpaceWeatherSnapshot | null,
  event: SpaceWeatherEvent,
): SpaceWeatherSnapshot | null {
  if (!snapshot) return null;
  const deduped = [event, ...snapshot.events.filter(item => item.event_id !== event.event_id)].slice(0, 40);
  return { ...snapshot, events: deduped };
}

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Radio, Sun, Compass, Orbit, ExternalLink, MapPin, Play, Pause } from 'lucide-react';
import type { IssLiveFeed, IssPredictedPoint, SpaceWeatherEvent, SpaceWeatherSnapshot } from '../types/spaceWeather';
import type { VitalSigns } from '../types/telemetry';
import {
  SAA_PEAK_LAT,
  SAA_PEAK_LON,
  buildPropagatedIssFeed,
  buildSaaContourPath,
  fetchNoaaEnlilFrames,
  generateSaaSamplePoints,
  isInSaa,
  parseSolarLocation,
  saaFluxProfile,
  type NoaaEnlilFrame,
} from '../services/spaceWeather';

const SAA_PEAK_X = 180 + SAA_PEAK_LON;
const SAA_PEAK_Y = 90 - SAA_PEAK_LAT;
const SAA_CONTOUR_LEVELS = [
  { level: 1.0, stroke: '#fb7185', fill: '#ef4444', fillOpacity: 0.08, strokeOpacity: 0.62, dash: '3 2', width: 0.75 },
  { level: 0.72, stroke: '#f43f5e', fill: '#f43f5e', fillOpacity: 0.12, strokeOpacity: 0.76, dash: 'none', width: 0.85 },
  { level: 0.45, stroke: '#fb923c', fill: '#fb7185', fillOpacity: 0.16, strokeOpacity: 0.84, dash: 'none', width: 0.95 },
  { level: 0.22, stroke: '#fda4af', fill: '#ef4444', fillOpacity: 0.24, strokeOpacity: 0.94, dash: 'none', width: 1.05 },
].map(layer => ({ ...layer, d: buildSaaContourPath(layer.level) }));
const SAA_SAMPLE_POINTS = generateSaaSamplePoints(5.5, 8.0);

const NOAA_ENLIL_LATEST_URL = 'https://services.swpc.noaa.gov/images/animations/enlil/latest.jpg';

const CONTINENT_PATHS = [
  'M 12,24 L 48,18 L 78,24 L 96,42 L 74,56 L 68,68 L 54,66 L 44,54 L 22,42 Z',
  'M 94,68 L 114,68 L 128,84 L 124,112 L 106,142 L 96,138 L 92,108 L 86,84 Z',
  'M 166,22 L 194,18 L 208,32 L 194,46 L 172,48 L 164,36 Z',
  'M 162,54 L 198,54 L 218,74 L 214,104 L 198,128 L 182,126 L 172,96 L 156,78 Z',
  'M 204,22 L 268,18 L 328,28 L 336,52 L 304,68 L 282,86 L 254,82 L 234,68 L 208,54 Z',
  'M 294,104 L 328,104 L 336,124 L 316,136 L 292,126 Z',
  'M 122,8 L 154,8 L 146,24 L 124,22 Z',
];

interface PlacedFlare {
  flare: SpaceWeatherEvent;
  cx: number;
  cy: number;
  lx: number;
  ly: number;
  color: string;
  radius: number;
  label: string;
  coordLabel: string;
}

export function formatEtaCountdown(etaIso?: string | null, now = new Date()): string {
  if (!etaIso) return 'No active Earth shock predicted';
  const target = new Date(etaIso).getTime();
  if (!Number.isFinite(target)) return 'ETA unavailable';
  const diffMin = Math.round((target - now.getTime()) / 60000);
  if (diffMin <= 0) return `Shock window passed (${new Date(target).toUTCString()})`;
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return `T-${hours}h ${mins}m (${new Date(target).toISOString().slice(11, 16)} UTC)`;
}

// Separates nearby flare callouts with short radial offsets so labels stay readable
function placeSolarLabels(flares: SpaceWeatherEvent[]): PlacedFlare[] {
  const placed: PlacedFlare[] = [];
  for (const flare of flares.slice(0, 12)) {
    const pt = parseSolarLocation(flare.source_location);
    if (!pt) continue;
    const cx = 160 + pt.x * 84;
    const cy = 115 + pt.y * 84;
    const cls = (flare.flare_class || '').toUpperCase();
    const color = cls.startsWith('X')
      ? 'var(--critical)'
      : cls.startsWith('M')
        ? 'var(--warning)'
        : 'var(--accent)';
    const radius = cls.startsWith('X') ? 7.5 : cls.startsWith('M') ? 5.5 : 4;
    const label = flare.flare_class || pt.label;

    let lx = cx + (cx >= 160 ? 14 : -38);
    let ly = cy + (cy >= 115 ? 12 : -10);
    for (let step = 0; step < 10; step++) {
      const collides = placed.some(other => Math.abs(other.lx - lx) < 34 && Math.abs(other.ly - ly) < 13);
      if (!collides) break;
      const angle = (step * 0.95) + (cx >= 160 ? -0.4 : 2.7);
      const dist = 16 + Math.floor(step / 2) * 10;
      lx = Math.max(24, Math.min(276, cx + Math.cos(angle) * dist));
      ly = Math.max(20, Math.min(212, cy + Math.sin(angle) * dist));
    }

    placed.push({ flare, cx, cy, lx, ly, color, radius, label, coordLabel: pt.label });
  }
  return placed;
}

function splitTrackSegments(points: IssPredictedPoint[]): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const x = points[i].longitude + 180;
    const y = 90 - points[i].latitude;
    if (i > 0 && Math.abs(points[i].longitude - points[i - 1].longitude) > 180) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
    }
    current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  if (current.length > 1) segments.push(current.join(' '));
  return segments;
}

// Computes approximate UTC night-hemisphere terminator curve for world map overlay
function computeNightTerminatorPolygon(now = new Date()): string {
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 1);
  const dayOfYear = (now.getTime() - startOfYear) / 86400000;
  const declRad = (-23.44 * Math.PI / 180) * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365.25);
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  const subsolarLon = ((12 - utcHours) * 15 + 540) % 360 - 180;

  const tanDecl = Math.tan(declRad);
  const safeTan = Math.abs(tanDecl) < 0.01 ? (tanDecl >= 0 ? 0.01 : -0.01) : tanDecl;
  const pts: string[] = [];
  for (let lon = -180; lon <= 180; lon += 10) {
    const ha = ((lon - subsolarLon) * Math.PI) / 180;
    const latRad = Math.atan(-Math.cos(ha) / safeTan);
    const lat = (latRad * 180) / Math.PI;
    pts.push(`${(lon + 180).toFixed(1)},${(90 - lat).toFixed(1)}`);
  }
  const nightPoleY = declRad >= 0 ? 180 : 0;
  pts.push(`360,${nightPoleY}`, `0,${nightPoleY}`);
  return pts.join(' ');
}

export function SpaceWeatherVisualizer({
  snapshot,
  vitals,
  issFeed,
  offline,
  realtimeConnected,
  loading,
  onRefresh,
  onRefreshIss,
}: {
  snapshot: SpaceWeatherSnapshot | null;
  vitals?: Pick<VitalSigns, 'iss_latitude' | 'iss_longitude' | 'iss_altitude_km' | 'orbital_phase' | 'iss_coord_source' | 'radiation_rate' | 'iss_velocity_kms'>;
  issFeed?: IssLiveFeed | null;
  offline: boolean;
  realtimeConnected: boolean;
  loading: boolean;
  onRefresh?: () => void;
  onRefreshIss?: () => void;
  initialTab?: 'solar' | 'enlil' | 'kp';
}) {
  const [noaaError, setNoaaError] = useState(false);
  const [noaaBump, setNoaaBump] = useState(0);
  const [enlilFrames, setEnlilFrames] = useState<NoaaEnlilFrame[]>([]);
  const [enlilIdx, setEnlilIdx] = useState(0);
  const [enlilPlaying, setEnlilPlaying] = useState(true);
  const [selectedFlareId, setSelectedFlareId] = useState<string | null>(null);

  useEffect(() => {
    if (offline) return;
    let alive = true;
    void fetchNoaaEnlilFrames().then(frames => {
      if (alive && frames.length) {
        setEnlilFrames(frames);
        setEnlilIdx(0);
      }
    });
    return () => { alive = false; };
  }, [offline, noaaBump]);

  useEffect(() => {
    if (offline || !enlilPlaying || enlilFrames.length < 2) return;
    const timer = window.setInterval(() => {
      setEnlilIdx(prev => (prev + 1) % enlilFrames.length);
    }, 420);
    return () => window.clearInterval(timer);
  }, [offline, enlilPlaying, enlilFrames.length]);

  useEffect(() => {
    if (offline || enlilFrames.length < 2 || typeof Image === 'undefined') return;
    for (let offset = 1; offset <= 3; offset++) {
      const next = enlilFrames[(enlilIdx + offset) % enlilFrames.length];
      if (next) {
        const preloader = new Image();
        preloader.src = next.url;
      }
    }
  }, [offline, enlilIdx, enlilFrames]);

  const flares = (snapshot?.events ?? []).filter(ev => ev.event_type === 'FLR');
  const placedFlares = useMemo(() => placeSolarLabels(flares), [flares]);
  const selectedFlare = placedFlares.find(f => f.flare.event_id === selectedFlareId) ?? placedFlares[0] ?? null;

  const cmes = (snapshot?.events ?? []).filter(ev => ev.event_type === 'CME');
  const latestCme = cmes[0];
  const kp = snapshot?.kp_current ?? 0;

  const fallbackIss = useMemo(() => buildPropagatedIssFeed(), []);
  const activeIss = issFeed ?? fallbackIss;
  const issLat = vitals?.iss_latitude ?? activeIss.current.latitude;
  const issLon = vitals?.iss_longitude ?? activeIss.current.longitude;
  const issAlt = vitals?.iss_altitude_km ?? activeIss.current.altitude_km;
  const issVel = vitals?.iss_velocity_kms ?? activeIss.current.velocity_kms;
  const issSource = vitals?.iss_coord_source ?? activeIss.current.coord_source;
  const orbitalPhase = vitals?.orbital_phase ?? activeIss.current.orbital_phase ?? 'daylight';
  const hasExplicitVitalsCoords = vitals?.iss_latitude !== undefined && vitals?.iss_longitude !== undefined;

  const orbitalRiskLabel =
    orbitalPhase === 'saa_transit'
      ? 'SAA TRANSIT · ELEVATED PROTON FLUX'
      : orbitalPhase === 'high_latitude'
        ? kp >= 4
          ? 'HIGH LATITUDE + KP WATCH'
          : 'HIGH LATITUDE CUTOFF'
        : orbitalPhase.toUpperCase();

  const predictedSegments = useMemo(
    () => splitTrackSegments(activeIss.predicted_track),
    [activeIss.predicted_track],
  );
  const nightPolygon = useMemo(() => computeNightTerminatorPolygon(), []);

  const cmeEarthDirected = latestCme
    ? Math.abs(latestCme.cme_longitude ?? 0) <= Math.max(15, (latestCme.cme_half_angle ?? 25) + 8)
    : false;
  const issMapX = Math.max(0, Math.min(360, issLon + 180));
  const issMapY = Math.max(0, Math.min(180, 90 - issLat));
  const saaNow = saaFluxProfile(issLat, issLon);
  const upcomingSaaPoint = activeIss.predicted_track.find(pt => pt.offset_minutes > 0 && isInSaa(pt.latitude, pt.longitude));
  const predictedSaaNodes = activeIss.predicted_track.filter(pt => isInSaa(pt.latitude, pt.longitude));
  const predictedHighLatNodes = activeIss.predicted_track.filter(pt => Math.abs(pt.latitude) > 50);
  const issInSaaZone = saaNow.inSaa || orbitalPhase === 'saa_transit';
  const issInHighLat = !issInSaaZone && (Math.abs(issLat) > 50 || orbitalPhase === 'high_latitude');
  const issMarkerFill = issInSaaZone ? 'var(--critical)' : issInHighLat ? 'var(--warning)' : 'var(--accent)';

  return (
    <div className="space-weather-viz">
      <div className="viz-toolbar">
        <div className="viz-actions">
          <span className="pill">
            <span className={`status-dot ${offline ? 'offline-dot' : ''}`} />
            {offline ? 'Offline cache' : realtimeConnected ? 'Supabase Realtime' : 'DONKI HTTP'}
          </span>
          <span className="pill">{(snapshot?.storm_level ?? 'G0_QUIET').replace('_', ' ')}</span>
          <span className="pill">{(snapshot?.radiation_storm ?? 'S0_NONE').replace('_', ' ')}</span>
        </div>

        <div className="viz-actions">
          {onRefreshIss && (
            <button type="button" className="button secondary" disabled={loading} onClick={onRefreshIss}>
              <MapPin size={14} />
              Sync ISS Feed
            </button>
          )}
          {onRefresh && (
            <button
              type="button"
              className="button secondary"
              disabled={offline || loading}
              onClick={() => {
                setNoaaError(false);
                setNoaaBump(n => n + 1);
                onRefresh();
              }}
            >
              <RefreshCw size={14} />
              {loading ? 'Syncing…' : 'Sync DONKI & NOAA'}
            </button>
          )}
        </div>
      </div>

      <div className="viz-grid">
        <div className="viz-card">
          <div className="row">
            <h4><Sun size={15} /> Solar disk flares (DONKI FLR)</h4>
            <span className="pill">{placedFlares.length} mapped</span>
          </div>
          <svg
            viewBox="0 0 320 230"
            className="viz-svg"
            role="img"
            aria-label={`Solar disk flare map showing ${flares.length} recent DONKI flare events`}
          >
            <title>Solar disk flare locations from NASA DONKI</title>
            <defs>
              <radialGradient id="solarDiskGrad" cx="46%" cy="44%" r="54%">
                <stop offset="0%" stopColor="#264762" />
                <stop offset="72%" stopColor="#142b40" />
                <stop offset="100%" stopColor="#0d1e2e" />
              </radialGradient>
              <radialGradient id="solarCoronaGlow" cx="50%" cy="50%" r="50%">
                <stop offset="76%" stopColor="var(--warning)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--warning)" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect x="0" y="0" width="320" height="230" rx="10" fill="var(--canvas-bg)" />
            <circle cx="160" cy="115" r="102" fill="url(#solarCoronaGlow)" />
            <circle cx="160" cy="115" r="88" fill="url(#solarDiskGrad)" stroke="var(--warning)" strokeOpacity="0.45" strokeWidth="1.5" />
            {/* Stonyhurst heliographic latitude parallels and longitude meridians */}
            <line x1="72" y1="115" x2="248" y2="115" stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <line x1="160" y1="27" x2="160" y2="203" stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <ellipse cx="160" cy="115" rx="34" ry="88" fill="none" stroke="var(--chart-grid)" strokeWidth="0.9" />
            <ellipse cx="160" cy="115" rx="64" ry="88" fill="none" stroke="var(--chart-grid)" strokeWidth="0.9" />
            <line x1="84" y1="71" x2="236" y2="71" stroke="var(--chart-grid)" strokeWidth="0.8" />
            <line x1="84" y1="159" x2="236" y2="159" stroke="var(--chart-grid)" strokeWidth="0.8" />
            <line x1="116" y1="39" x2="204" y2="39" stroke="var(--chart-grid)" strokeWidth="0.8" />
            <line x1="116" y1="191" x2="204" y2="191" stroke="var(--chart-grid)" strokeWidth="0.8" />
            <text x="156" y="18" fill="var(--muted)" fontSize="10">N</text>
            <text x="156" y="220" fill="var(--muted)" fontSize="10">S</text>
            <text x="54" y="118" fill="var(--muted)" fontSize="10">E</text>
            <text x="256" y="118" fill="var(--muted)" fontSize="10">W</text>
            {placedFlares.map(item => {
              const isSelected = selectedFlare?.flare.event_id === item.flare.event_id;
              return (
                <g
                  key={item.flare.event_id}
                  onClick={() => setSelectedFlareId(item.flare.event_id)}
                  style={{ cursor: 'pointer' }}
                >
                  <line
                    x1={item.cx}
                    y1={item.cy}
                    x2={item.lx + 10}
                    y2={item.ly - 3}
                    stroke={item.color}
                    strokeOpacity="0.65"
                    strokeWidth="0.9"
                  />
                  <circle cx={item.cx} cy={item.cy} r={item.radius + (isSelected ? 7 : 4)} fill={item.color} opacity={isSelected ? '0.36' : '0.2'} />
                  <circle
                    cx={item.cx}
                    cy={item.cy}
                    r={item.radius}
                    fill={item.color}
                    stroke={isSelected ? 'var(--text)' : 'none'}
                    strokeWidth={isSelected ? '1.5' : '0'}
                  />
                  <rect
                    x={item.lx - 3}
                    y={item.ly - 9}
                    width={Math.max(26, item.label.length * 5.8 + 6)}
                    height="12"
                    rx="3"
                    fill="var(--canvas-bg)"
                    fillOpacity="0.88"
                    stroke={isSelected ? item.color : 'var(--border)'}
                    strokeWidth="0.7"
                  />
                  <text x={item.lx} y={item.ly} fill="var(--text)" fontSize="8.5" fontWeight={isSelected ? '700' : '500'}>
                    {item.label}
                  </text>
                </g>
              );
            })}
          </svg>
          {placedFlares.length > 0 && (
            <div className="flare-chip-row" role="group" aria-label="Select solar flare event">
              {placedFlares.slice(0, 6).map(item => {
                const active = selectedFlare?.flare.event_id === item.flare.event_id;
                return (
                  <button
                    key={item.flare.event_id}
                    type="button"
                    className={`flare-chip ${active ? 'active' : ''}`}
                    aria-pressed={active}
                    onClick={() => setSelectedFlareId(item.flare.event_id)}
                  >
                    <span>{item.label}</span>
                    <small>{item.coordLabel}</small>
                  </button>
                );
              })}
            </div>
          )}
          {selectedFlare && (
            <div className="viz-detail-line">
              <span>
                Selected: <strong>{selectedFlare.label}</strong> at {selectedFlare.coordLabel}
                {selectedFlare.flare.active_region_num ? ` (AR ${selectedFlare.flare.active_region_num})` : ''}
                {' · '}
                {new Date(selectedFlare.flare.event_time).toISOString().slice(0, 16).replace('T', ' ')} UTC
              </span>
              {selectedFlare.flare.source_url && (
                <a className="text-link" href={selectedFlare.flare.source_url} target="_blank" rel="noreferrer">
                  DONKI <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}
          <p className="helper">
            {flares.length
              ? `Showing ${Math.min(12, flares.length)} recent DONKI flare event(s). Latest: ${snapshot?.latest_flare_class ?? 'Unclassified'} at ${snapshot?.latest_flare_location ?? 'unknown region'}.`
              : 'No solar flare events with heliographic coordinates in the active DONKI window.'}
          </p>
        </div>

        <div className="viz-card">
          <div className="row">
            <h4><Compass size={15} /> CME &amp; WSA-ENLIL geometry</h4>
            <span className="pill">
              {latestCme ? (cmeEarthDirected ? 'EARTH-DIRECTED CONE' : 'OFF-AXIS / GLANCING') : 'QUIET HELIOSPHERE'}
            </span>
          </div>
          <svg
            viewBox="0 0 360 210"
            className="viz-svg"
            role="img"
            aria-label="Sun-to-Earth CME and WSA-ENLIL propagation diagram"
          >
            <title>Sun-to-Earth CME propagation cone</title>
            <rect x="0" y="0" width="360" height="210" rx="10" fill="var(--canvas-bg)" />
            {/* Radial AU distance guides centered on the Sun */}
            {[55, 110, 165, 220].map((r, idx) => (
              <g key={r}>
                <circle cx="66" cy="105" r={r} fill="none" stroke="var(--chart-grid)" strokeDasharray={idx === 3 ? 'none' : '3 3'} strokeOpacity={idx === 3 ? '0.85' : '0.65'} />
                <text x={66 + r - 12} y="200" fill="var(--muted)" fontSize="8">
                  {((idx + 1) * 0.25).toFixed(2)} AU
                </text>
              </g>
            ))}
            {/* Parker spiral interplanetary magnetic field curves */}
            {[-40, 0, 40, 140, 220].map(deg => {
              const rad = (deg * Math.PI) / 180;
              const x1 = 66 + Math.cos(rad) * 20;
              const y1 = 105 + Math.sin(rad) * 20;
              const cx1 = 66 + Math.cos(rad - 0.35) * 120;
              const cy1 = 105 + Math.sin(rad - 0.35) * 120;
              const x2 = 66 + Math.cos(rad - 0.72) * 225;
              const y2 = 105 + Math.sin(rad - 0.72) * 225;
              return (
                <path
                  key={deg}
                  d={`M ${x1.toFixed(1)},${y1.toFixed(1)} Q ${cx1.toFixed(1)},${cy1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`}
                  fill="none"
                  stroke="var(--chart-grid)"
                  strokeWidth="0.9"
                  strokeDasharray="2 3"
                />
              );
            })}
            <line x1="66" y1="105" x2="286" y2="105" stroke="var(--accent)" strokeOpacity="0.28" strokeDasharray="4 4" />

            {latestCme && (() => {
              const half = Math.max(12, Math.min(60, latestCme.cme_half_angle ?? 28));
              const lon = Math.max(-65, Math.min(65, -(latestCme.cme_longitude ?? 0)));
              const radA = ((lon - half) * Math.PI) / 180;
              const radB = ((lon + half) * Math.PI) / 180;
              const reach = 212;
              const x1 = 66 + Math.cos(radA) * reach;
              const y1 = 105 + Math.sin(radA) * reach;
              const x2 = 66 + Math.cos(radB) * reach;
              const y2 = 105 + Math.sin(radB) * reach;
              const midRad = (lon * Math.PI) / 180;
              const shockR = 164;
              const sx1 = 66 + Math.cos(radA) * shockR;
              const sy1 = 105 + Math.sin(radA) * shockR;
              const sx2 = 66 + Math.cos(radB) * shockR;
              const sy2 = 105 + Math.sin(radB) * shockR;
              const coneColor = cmeEarthDirected ? 'var(--warning)' : 'var(--accent)';
              return (
                <g>
                  <path
                    d={`M 66,105 L ${x1.toFixed(1)},${y1.toFixed(1)} A ${reach},${reach} 0 0,1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`}
                    fill={coneColor}
                    opacity="0.18"
                    stroke={coneColor}
                    strokeWidth="1.4"
                  />
                  <path
                    d={`M ${sx1.toFixed(1)},${sy1.toFixed(1)} A ${shockR},${shockR} 0 0,1 ${sx2.toFixed(1)},${sy2.toFixed(1)}`}
                    fill="none"
                    stroke={coneColor}
                    strokeWidth="2"
                    strokeDasharray="4 2"
                  />
                  <line
                    x1="66"
                    y1="105"
                    x2={(66 + Math.cos(midRad) * shockR).toFixed(1)}
                    y2={(105 + Math.sin(midRad) * shockR).toFixed(1)}
                    stroke={coneColor}
                    strokeWidth="1.2"
                  />
                </g>
              );
            })()}

            <circle cx="66" cy="105" r="24" fill="var(--warning)" opacity="0.22" />
            <circle cx="66" cy="105" r="15" fill="var(--warning)" opacity="0.92" />
            <text x="56" y="136" fill="var(--muted)" fontSize="9.5">Sun</text>

            <circle cx="272" cy="105" r="2.5" fill="var(--muted)" />
            <text x="266" y="96" fill="var(--muted)" fontSize="8">L1</text>

            {/* Earth magnetosphere bow shock */}
            <path d="M 278,84 Q 266,105 278,126" fill="none" stroke="var(--success)" strokeWidth="1.4" />
            <circle cx="286" cy="105" r="8.5" fill="var(--accent)" />
            <text x="262" y="142" fill="var(--muted)" fontSize="9.5">Earth (1 AU)</text>
          </svg>
          <p className="helper">
            {latestCme
              ? `Latest CME: ${latestCme.cme_speed_kms ? `${Math.round(latestCme.cme_speed_kms)} km/s` : 'speed pending'}, half-angle ${latestCme.cme_half_angle ?? '--'} deg, lon ${latestCme.cme_longitude ?? 0} deg. `
              : 'No active CME events in window. '}
            WSA-ENLIL Earth ETA: {formatEtaCountdown(snapshot?.earth_impact_eta)}.
          </p>
        </div>

        <div className="viz-card viz-card-wide">
          <div className="row">
            <h4><Radio size={15} /> Live NOAA SWPC WSA-ENLIL feed (Video prediction &amp; static image)</h4>
            <a className="text-link" href="https://www.swpc.noaa.gov/products/wsa-enlil-solar-wind-prediction" target="_blank" rel="noreferrer">
              NOAA SWPC <ExternalLink size={12} />
            </a>
          </div>
          {offline ? (
            <p className="helper">
              Offline mode active: live NOAA SWPC imagery is suppressed while offline. Showing cached DONKI telemetry geometry.
            </p>
          ) : noaaError ? (
            <div className="viz-detail-line">
              <p className="helper">
                NOAA SWPC live image is currently unreachable. Showing DONKI telemetry geometry above.
              </p>
              <button type="button" className="button secondary compact-btn" onClick={() => { setNoaaError(false); setNoaaBump(n => n + 1); }}>
                Retry feed
              </button>
            </div>
          ) : (
            <div className="noaa-dual-grid">
              <figure className="noaa-figure noaa-pane">
                <div className="row">
                  <span className="eyebrow">VIDEO PREDICTION LOOP</span>
                  <span className="pill">
                    {enlilFrames.length > 0
                      ? `${enlilFrames[enlilIdx]?.label ?? 'Forecast'} (${enlilIdx + 1}/${enlilFrames.length})`
                      : 'Loading forecast sequence…'}
                  </span>
                </div>
                <img
                  src={enlilFrames[enlilIdx]?.url ?? `${NOAA_ENLIL_LATEST_URL}?t=${Math.floor(Date.now() / 300000) + noaaBump}`}
                  alt="NOAA SWPC WSA-ENLIL animated solar wind forecast prediction"
                  onError={() => setNoaaError(true)}
                />
                <div className="noaa-player-controls">
                  <button
                    type="button"
                    className="button secondary compact-btn"
                    aria-label={enlilPlaying ? 'Pause prediction video' : 'Play prediction video'}
                    disabled={enlilFrames.length < 2}
                    onClick={() => setEnlilPlaying(p => !p)}
                  >
                    {enlilPlaying ? <Pause size={13} /> : <Play size={13} />}
                    {enlilPlaying ? 'Pause' : 'Play'}
                  </button>
                </div>
                <figcaption className="helper">
                  Animated multi-day NOAA WSA-ENLIL forecast loop showing predicted CME shock propagation toward Earth.
                </figcaption>
              </figure>

              <figure className="noaa-figure noaa-pane">
                <div className="row">
                  <span className="eyebrow">STATIC LATEST SNAPSHOT</span>
                  <span className="pill">Operational latest.jpg</span>
                </div>
                <img
                  src={`${NOAA_ENLIL_LATEST_URL}?t=${Math.floor(Date.now() / 300000) + noaaBump}`}
                  alt="NOAA Space Weather Prediction Center live WSA-ENLIL solar wind model"
                  onError={() => setNoaaError(true)}
                />
                <figcaption className="helper">
                  Static operational WSA-ENLIL solar wind model frame from NOAA SWPC (plasma density and radial speed ecliptic slices).
                </figcaption>
              </figure>
            </div>
          )}
        </div>

        <div className="viz-card viz-card-wide">
          <div className="row">
            <h4><Orbit size={15} /> Kp index, ISS coordinates &amp; orbital risk</h4>
            <span className="pill">
              <span className={`status-dot ${issSource === 'live_iss' ? '' : 'offline-dot'}`} />
              {issSource === 'live_iss' ? 'LIVE EPHEMERIS · WHERETHEISS' : 'NASA 48H ORBITAL MODEL'}
            </span>
          </div>

          <div className="kp-summary-grid">
            <div className="kp-meter">
              <span className="eyebrow">GEOMAGNETIC INDEX</span>
              <strong>Kp {kp.toFixed(1)}</strong>
              <p className="helper">{(snapshot?.storm_level ?? 'G0_QUIET').replace('_', ' ')} · {(snapshot?.radiation_storm ?? 'S0_NONE').replace('_', ' ')}</p>
              <div className="kp-segments" role="meter" aria-label="Planetary Kp index" aria-valuemin={0} aria-valuemax={9} aria-valuenow={kp}>
                {Array.from({ length: 9 }, (_, i) => {
                  const active = kp > i;
                  const tier = i >= 6 ? 'severe' : i >= 4 ? 'warn' : 'nominal';
                  return <span key={i} className={`kp-seg ${active ? `active ${tier}` : ''}`} />;
                })}
              </div>
              <div className="kp-scale-labels"><span>G0 Quiet (0-4)</span><span>G1-G2 (5-6)</span><span>G3-G5 (7-9)</span></div>
            </div>

            <div className="kp-meter">
              <span className="eyebrow">ISS LOCATION &amp; RISK ZONE</span>
              <strong>{orbitalRiskLabel}</strong>
              <p className="helper">
                {hasExplicitVitalsCoords || issFeed
                  ? `Lat ${issLat.toFixed(2)} deg, Lon ${issLon.toFixed(2)} deg, Alt ${issAlt.toFixed(1)} km (${issSource === 'live_iss' ? 'live ephemeris' : 'NASA 48h orbital model'}).`
                  : 'ISS baseline: 5.9% orbit time in South Atlantic Anomaly, 14.2% at high latitudes (>50 deg).'}
              </p>
              <p className="helper">
                Velocity {issVel.toFixed(2)} km/s · {snapshot?.active_sep ? 'SEP WATCH ACTIVE · ' : 'SEP: NOMINAL · '}
                Ambient rate {vitals?.radiation_rate ?? '--'} μSv/h (included in radiation risk &amp; diagnostic score).
              </p>
            </div>
          </div>

          <div className="iss-map-grid">
            <div>
              <svg
                viewBox="0 0 360 180"
                className="viz-svg iss-world-svg"
                role="img"
                aria-label={`Live ISS ground track map at latitude ${issLat.toFixed(2)}, longitude ${issLon.toFixed(2)}`}
              >
                <title>Live ISS orbital ground track, solar terminator, and AP8 South Atlantic Anomaly contours</title>
                <defs>
                  <radialGradient id="saa-flux-grad" cx="50%" cy="50%" r="55%">
                    <stop offset="0%" stopColor="#ff4d6d" stopOpacity="0.48" />
                    <stop offset="38%" stopColor="#f43f5e" stopOpacity="0.28" />
                    <stop offset="72%" stopColor="#fb7185" stopOpacity="0.14" />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <rect x="0" y="0" width="360" height="180" rx="8" fill="var(--canvas-bg)" />
                {/* High-latitude proton cutoff bands (>50 deg N/S) */}
                <rect x="0" y="0" width="360" height="40" fill="var(--warning)" opacity="0.08" />
                <rect x="0" y="140" width="360" height="40" fill="var(--warning)" opacity="0.08" />
                {/* 30-degree latitude/longitude graticule */}
                {[30, 60, 90, 120, 150].map(y => (
                  <line key={`lat-${y}`} x1="0" y1={y} x2="360" y2={y} stroke="var(--chart-grid)" strokeWidth={y === 90 ? '1' : '0.6'} strokeDasharray={y === 90 ? 'none' : '2 3'} />
                ))}
                {[60, 120, 180, 240, 300].map(x => (
                  <line key={`lon-${x}`} x1={x} y1="0" x2={x} y2="180" stroke="var(--chart-grid)" strokeWidth="0.6" strokeDasharray="2 3" />
                ))}
                {/* Simplified continent silhouettes */}
                {CONTINENT_PATHS.map((d, idx) => (
                  <path key={idx} d={d} fill="#18344a" stroke="#294e68" strokeWidth="0.7" />
                ))}
                {/* Realistic AP8/IGRF-13 South Atlantic Anomaly proton-flux distribution */}
                <ellipse
                  cx={SAA_PEAK_X}
                  cy={SAA_PEAK_Y}
                  rx="48"
                  ry="20"
                  transform={`rotate(18 ${SAA_PEAK_X} ${SAA_PEAK_Y})`}
                  fill="url(#saa-flux-grad)"
                />
                {SAA_CONTOUR_LEVELS.map(layer => (
                  <path
                    key={`saa-contour-${layer.level}`}
                    d={layer.d}
                    fill={layer.fill}
                    fillOpacity={layer.fillOpacity}
                    stroke={layer.stroke}
                    strokeOpacity={layer.strokeOpacity}
                    strokeWidth={layer.width}
                    strokeDasharray={layer.dash}
                  />
                ))}
                {/* Geophysical SAA proton-flux sample lattice weighted by core proximity */}
                {SAA_SAMPLE_POINTS.map((pt, idx) => {
                  const color = pt.tier === 'CORE' ? '#ffe4e6' : pt.tier === 'INNER' ? '#fda4af' : pt.tier === 'MID' ? '#fb923c' : '#fb7185';
                  return (
                    <circle
                      key={`saa-pt-${idx}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={0.85 + pt.intensity * 1.1}
                      fill={color}
                      fillOpacity={0.38 + pt.intensity * 0.56}
                    >
                      <title>{`SAA ${Math.abs(pt.lat)}°S, ${Math.abs(pt.lon)}°W · ~${pt.fluxPcm2s} p/cm2/s (${pt.tier})`}</title>
                    </circle>
                  );
                })}
                {/* SAA core peak locator crosshair and isoline tags */}
                <circle cx={SAA_PEAK_X} cy={SAA_PEAK_Y} r="2.2" fill="#ffe4e6" stroke="#f43f5e" strokeWidth="0.8" />
                <text x={SAA_PEAK_X + 4} y={SAA_PEAK_Y - 2} fill="#ffe4e6" fontSize="6.4" fontWeight="700">SAA PEAK</text>
                <text x={SAA_PEAK_X + 26} y={SAA_PEAK_Y + 21} fill="#fda4af" fillOpacity="0.85" fontSize="5.8">10+ p/cm2/s</text>
                {/* Live UTC solar terminator (eclipsed night side) */}
                <polygon points={nightPolygon} fill="#040b12" fillOpacity="0.42" />
                {/* Predicted 93-minute ground track + SAA/High-Lat intersection nodes */}
                {predictedSegments.map((pts, idx) => (
                  <polyline key={idx} points={pts} fill="none" stroke="var(--accent)" strokeOpacity="0.55" strokeWidth="1.3" strokeDasharray="4 3" />
                ))}
                {predictedHighLatNodes.map((pt, idx) => (
                  <circle
                    key={`pred-hl-${idx}`}
                    cx={pt.longitude + 180}
                    cy={90 - pt.latitude}
                    r="1.4"
                    fill="var(--warning)"
                    fillOpacity="0.65"
                  />
                ))}
                {predictedSaaNodes.map((pt, idx) => (
                  <circle
                    key={`pred-saa-${idx}`}
                    cx={pt.longitude + 180}
                    cy={90 - pt.latitude}
                    r="2.1"
                    fill="var(--critical)"
                    fillOpacity="0.72"
                    stroke="#ffe4e6"
                    strokeWidth="0.55"
                  >
                    <title>{`Predicted SAA crossing (${pt.offset_minutes >= 0 ? `+${pt.offset_minutes}` : pt.offset_minutes}m) at ${pt.latitude.toFixed(1)}°, ${pt.longitude.toFixed(1)}°`}</title>
                  </circle>
                ))}
                {/* Recent observed coordinate breadcrumbs color-coded by orbital zone */}
                {activeIss.recent_track.map((pt, idx) => {
                  const ptInSaa = pt.orbital_phase === 'saa_transit' || isInSaa(pt.latitude, pt.longitude);
                  const ptHighLat = !ptInSaa && (pt.orbital_phase === 'high_latitude' || Math.abs(pt.latitude) > 50);
                  const crumbColor = ptInSaa ? 'var(--critical)' : ptHighLat ? 'var(--warning)' : 'var(--success)';
                  return (
                    <circle
                      key={`${pt.timestamp}-${idx}`}
                      cx={pt.longitude + 180}
                      cy={90 - pt.latitude}
                      r={ptInSaa ? '2.0' : '1.6'}
                      fill={crumbColor}
                      opacity={0.4 + (idx / Math.max(1, activeIss.recent_track.length)) * 0.6}
                    />
                  );
                })}
                {/* Live ISS marker */}
                <circle cx={issMapX} cy={issMapY} r="10" fill={issMarkerFill} opacity="0.24" />
                <circle cx={issMapX} cy={issMapY} r="4.5" fill={issMarkerFill} stroke="var(--text)" strokeWidth="1.2" />
                <line x1={issMapX - 8} y1={issMapY} x2={issMapX + 8} y2={issMapY} stroke="var(--text)" strokeOpacity="0.6" strokeWidth="0.8" />
                <line x1={issMapX} y1={issMapY - 8} x2={issMapX} y2={issMapY + 8} stroke="var(--text)" strokeOpacity="0.6" strokeWidth="0.8" />
                <text x="8" y="13" fill="var(--warning)" fontSize="7.5">HIGH-LAT (&gt;50N)</text>
                <text x="8" y="174" fill="var(--warning)" fontSize="7.5">HIGH-LAT (&gt;50S)</text>
              </svg>
              <div className="iss-map-legend" aria-label="Orbital radiation map legend">
                <div className="iss-legend-items">
                  <span className="iss-legend-item">
                    <span className="iss-swatch" style={{ background: '#ffe4e6', border: '1px solid #f43f5e' }} />
                    SAA Peak (&gt;160 p/cm2/s)
                  </span>
                  <span className="iss-legend-item">
                    <span className="iss-swatch" style={{ background: '#fb7185' }} />
                    SAA Outer (10+ p/cm2/s)
                  </span>
                  <span className="iss-legend-item">
                    <span className="iss-swatch" style={{ background: 'var(--warning)' }} />
                    High-Lat (&gt;50 deg)
                  </span>
                  <span className="iss-legend-item">
                    <span className="iss-swatch" style={{ background: 'var(--accent)' }} />
                    93m Orbit Track
                  </span>
                </div>
                <span className="iss-legend-status">
                  {saaNow.inSaa
                    ? `Inside SAA ${saaNow.tier}: ~${saaNow.fluxPcm2s} p/cm2/s`
                    : upcomingSaaPoint
                      ? `Next SAA pass +${upcomingSaaPoint.offset_minutes}m (${upcomingSaaPoint.latitude.toFixed(0)}°, ${upcomingSaaPoint.longitude.toFixed(0)}°)`
                      : 'SAA Peak 25°S, 48°W · Next 45m clear'}
                </span>
              </div>
            </div>

            <div className="iss-feed-panel">
              <div className="row">
                <span className="eyebrow">LIVE ISS LOCATION FEED</span>
                <small className="muted">51.6 deg · 92.7m orbit</small>
              </div>
              <ul className="iss-feed-list" aria-label="Live ISS coordinate stream">
                {[...activeIss.recent_track].reverse().slice(0, 6).map((pt, idx) => (
                  <li key={`${pt.timestamp}-${idx}`}>
                    <span>{new Date(pt.timestamp).toISOString().slice(11, 19)}Z</span>
                    <strong>{pt.latitude.toFixed(2)}°, {pt.longitude.toFixed(2)}°</strong>
                    <small>{pt.altitude_km.toFixed(1)} km · {pt.orbital_phase.replace('_', ' ')}</small>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

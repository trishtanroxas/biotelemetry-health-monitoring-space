import type { VitalSigns } from '../types/telemetry';

interface SeriesSpec {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  targetBand: string;
  color: string;
  extract: (v: VitalSigns) => number;
}

const SERIES: SeriesSpec[] = [
  {
    id: 'hr',
    label: 'Heart Rate',
    unit: 'BPM',
    min: 40,
    max: 160,
    targetBand: '50-100',
    color: 'var(--accent)',
    extract: v => v.heart_rate,
  },
  {
    id: 'spo2',
    label: 'Oxygen (SpO2)',
    unit: '%',
    min: 84,
    max: 100,
    targetBand: '95-100',
    color: 'var(--success)',
    extract: v => v.spo2,
  },
  {
    id: 'temp',
    label: 'Body Temperature',
    unit: '°C',
    min: 34.5,
    max: 40,
    targetBand: '36.2-37.6',
    color: '#f97316',
    extract: v => v.core_temp,
  },
  {
    id: 'glucose',
    label: 'Blood Sugar',
    unit: 'mg/dL',
    min: 45,
    max: 240,
    targetBand: '70-140',
    color: '#fbbf24',
    extract: v => v.blood_glucose ?? 92,
  },
  {
    id: 'rad',
    label: 'Radiation Rate',
    unit: 'uSv/h',
    min: 0,
    max: 120,
    targetBand: '<30',
    color: 'var(--purple)',
    extract: v => v.radiation_rate,
  },
  {
    id: 'hydration',
    label: 'Hydration Level',
    unit: '%',
    min: 60,
    max: 100,
    targetBand: '>=82',
    color: '#38bdf8',
    extract: v => v.hydration_pct ?? 92,
  },
];

function MiniTrendCard({ spec, samples, compact = false }: { spec: SeriesSpec; samples: VitalSigns[]; compact?: boolean }) {
  const values = samples.map(spec.extract);
  const latest = values[values.length - 1] ?? 0;
  const width = 280;
  const height = compact ? 46 : 74;
  const pad = compact ? 4 : 6;
  const points = values.map((val, idx) => {
    const x = values.length === 1 ? width / 2 : pad + (idx / (values.length - 1)) * (width - pad * 2);
    const clamped = Math.max(spec.min, Math.min(spec.max, val));
    const y = height - pad - ((clamped - spec.min) / (spec.max - spec.min)) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const formattedLatest = spec.id === 'temp'
    ? latest.toFixed(2)
    : (spec.id === 'spo2' || spec.id === 'rad')
      ? latest.toFixed(1)
      : Math.round(latest);

  return (
    <div className={`mini-trend-card ${compact ? 'compact' : ''}`}>
      <div className="row">
        <span className="muted">{spec.label}</span>
        <strong>
          {formattedLatest} <small>{spec.unit}</small>
        </strong>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mini-trend-svg" role="img" aria-label={`${spec.label} trend: latest ${latest.toFixed(1)} ${spec.unit}`}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="var(--chart-grid)" strokeDasharray="3 3" />
        {values.length > 1 ? (
          <polyline
            fill="none"
            stroke={spec.color}
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points.join(' ')}
          />
        ) : (
          <circle cx={width / 2} cy={height / 2} r="3.5" fill={spec.color} />
        )}
      </svg>
      <div className="row mini-trend-foot">
        <small>Target {spec.targetBand} {spec.unit}</small>
        <small>{samples.length} pts</small>
      </div>
    </div>
  );
}

export function MultiMetricChart({ samples, extended = false, compact = false }: { samples: VitalSigns[]; extended?: boolean; compact?: boolean }) {
  const activeSamples = samples.slice(-30);
  const visibleSeries = extended ? SERIES : SERIES.slice(0, 4);
  return (
    <div className={`multi-trend-grid ${extended ? 'extended' : ''} ${compact ? 'compact' : ''}`}>
      {visibleSeries.map(spec => (
        <MiniTrendCard key={spec.id} spec={spec} samples={activeSamples} compact={compact} />
      ))}
    </div>
  );
}

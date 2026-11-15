import React, { useState } from 'react';
import { TrendChart } from '../TrendChart';
import type { CheckIn, TimeRange } from '../../types/wellness';
import { recordsInRange } from '../../services/analytics';
import { Activity, Heart, Wind, Thermometer, Waves } from 'lucide-react';

interface PhysiologicalTrendsSectionProps {
  records: CheckIn[];
  baselineHeartRate?: number;
}

export const PhysiologicalTrendsSection: React.FC<PhysiologicalTrendsSectionProps> = ({
  records,
  baselineHeartRate
}) => {
  const [range, setRange] = useState<TimeRange>('week');
  const [activeTab, setActiveTab] = useState<'HR' | 'SPO2' | 'TEMP' | 'HRV'>('HR');

  const filtered = recordsInRange(records, range);

  // Extract biometric time series from saved check-ins
  const hrPoints = filtered
    .filter(r => r.biometrics?.heart_rate !== undefined)
    .map(r => ({ time: r.createdAt, value: r.biometrics!.heart_rate }));

  const spo2Points = filtered
    .filter(r => r.biometrics?.spo2 !== undefined)
    .map(r => ({ time: r.createdAt, value: r.biometrics!.spo2 }));

  const tempPoints = filtered
    .filter(r => r.biometrics?.core_temp !== undefined)
    .map(r => ({ time: r.createdAt, value: r.biometrics!.core_temp }));

  const hrvPoints = filtered
    .filter(r => r.biometrics?.hrv !== undefined)
    .map(r => ({ time: r.createdAt, value: r.biometrics!.hrv }));

  return (
    <section className="panel bio-dashboard-panel trends-command-panel" id="trends-section">
      <div className="section-heading">
        <div className="panel-title-group">
          <span className="panel-eyebrow">LONGITUDINAL TELEMETRY</span>
          <h2>
            <Activity size={18} className="text-cyan" />
            Physiological Trends
          </h2>
        </div>
        <div className="segmented" role="group" aria-label="Trends time range">
          {(['day', 'week', 'month'] as const).map(value => (
            <button
              key={value}
              onClick={() => setRange(value)}
              aria-pressed={range === value}
            >
              {value === 'day' ? '24 Hours' : value === 'week' ? '7 Days' : '30 Days'}
            </button>
          ))}
        </div>
      </div>

      <div className="trends-tabs-nav" role="tablist" aria-label="Metric Trend Categories">
        <button
          role="tab"
          aria-selected={activeTab === 'HR'}
          className={`trend-tab-btn ${activeTab === 'HR' ? 'active' : ''}`}
          onClick={() => setActiveTab('HR')}
        >
          <Heart size={15} />
          <span>Heart Rate (BPM)</span>
          <span className="tab-count">{hrPoints.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'SPO2'}
          className={`trend-tab-btn ${activeTab === 'SPO2' ? 'active' : ''}`}
          onClick={() => setActiveTab('SPO2')}
        >
          <Wind size={15} />
          <span>Blood Oxygen (% SpO2)</span>
          <span className="tab-count">{spo2Points.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'TEMP'}
          className={`trend-tab-btn ${activeTab === 'TEMP' ? 'active' : ''}`}
          onClick={() => setActiveTab('TEMP')}
        >
          <Thermometer size={15} />
          <span>Body Temp (°C)</span>
          <span className="tab-count">{tempPoints.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'HRV'}
          className={`trend-tab-btn ${activeTab === 'HRV' ? 'active' : ''}`}
          onClick={() => setActiveTab('HRV')}
        >
          <Waves size={15} />
          <span>Heart Rate Variability (ms)</span>
          <span className="tab-count">{hrvPoints.length}</span>
        </button>
      </div>

      <div className="trends-chart-wrapper">
        {activeTab === 'HR' && (
          <TrendChart
            title="Heart Rate History"
            unit="beats/min"
            points={hrPoints}
            baseline={baselineHeartRate}
            color="#00d9ff"
            help="Displays resting and active heart rate recordings captured across your daily health records."
          />
        )}
        {activeTab === 'SPO2' && (
          <TrendChart
            title="Pulse Oximetry (SpO2) History"
            unit="%"
            points={spo2Points}
            domain={[85, 100]}
            color="#00e5b0"
            help="Blood oxygen saturation trend over time. Evaluates hypoxic risk in pressurized cabin habitats."
          />
        )}
        {activeTab === 'TEMP' && (
          <TrendChart
            title="Core Body Temperature History"
            unit="°C"
            points={tempPoints}
            domain={[35.5, 39.0]}
            color="#f59e0b"
            help="Thermoregulation and inflammatory status trend recorded across crew check-ins."
          />
        )}
        {activeTab === 'HRV' && (
          <TrendChart
            title="Heart Rate Variability (HRV) History"
            unit="ms"
            points={hrvPoints}
            color="#a855f7"
            help="Autonomic nervous system recovery and physiological stress response index."
          />
        )}
      </div>

      <div className="trends-footer-bar">
        <span className="source-note">
          DATA SOURCE: Locally indexed physiological telemetry logs ({filtered.length} total records in selected window)
        </span>
        <a href="#analytics" className="text-link">
          Open In-Depth Analytics Engine →
        </a>
      </div>
    </section>
  );
};

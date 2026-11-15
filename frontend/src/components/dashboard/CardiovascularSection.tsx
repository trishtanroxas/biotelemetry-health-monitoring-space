import React from 'react';
import { ECGMonitor } from '../ECGMonitor';
import { VitalCard } from '../VitalCard';
import { Activity, Waves, Heart, Radio, ShieldCheck } from 'lucide-react';
import type { VitalSigns } from '../../types/telemetry';

interface CardiovascularSectionProps {
  vitals: VitalSigns;
  activeId: string;
}

export const CardiovascularSection: React.FC<CardiovascularSectionProps> = ({ vitals, activeId }) => {
  return (
    <section className="panel bio-dashboard-panel cardiovascular-panel" id="cardio-section">
      <div className="section-heading">
        <div className="panel-title-group">
          <span className="panel-eyebrow">CONTINUOUS BIOELECTRICITY</span>
          <h2>
            <Activity size={18} className="text-cyan" />
            Cardiovascular Monitoring & Waveform
          </h2>
        </div>
        <div className="telemetry-badges-row">
          <span className="pill pill-cyan">
            <span className="status-dot" /> LEAD II (60 FPS)
          </span>
          <span className="pill">
            SIGNAL: {vitals.ecg_samples?.length ? 'TELEMETRY STREAM' : 'SYNTHESIZED HARMONIC'}
          </span>
        </div>
      </div>

      <p className="section-description">
        Real-time single-lead electrocardiogram tracing paired with autonomic recovery and pulse wave velocity metrics.
      </p>

      {/* Primary ECG Waveform Renderer */}
      <div className="cardio-ecg-canvas-container">
        <ECGMonitor key={activeId} ecgSamples={vitals.ecg_samples} heartRate={vitals.heart_rate} />
      </div>

      {/* Metrics Row: HRV, Blood Pressure, Suit Battery */}
      <div className="cardio-metrics-grid">
        <VitalCard
          label="Heart Rate Variability (HRV)"
          value={vitals.hrv}
          unit="ms"
          icon={Waves}
          status={vitals.hrv < 30 ? 'WARNING' : 'NORMAL'}
          baseline="Autonomic Resilience"
          ariaLabel={`Heart rate variability ${vitals.hrv} milliseconds`}
        />

        <div className="cardio-telemetry-item">
          <div className="telemetry-item-header">
            <Heart size={16} className="text-pink" />
            <span className="item-label">Blood Pressure</span>
          </div>
          <div className="item-value">
            {vitals.systolic_bp !== undefined && vitals.diastolic_bp !== undefined
              ? `${vitals.systolic_bp}/${vitals.diastolic_bp}`
              : '118/76'}
            <small>mmHg</small>
          </div>
          <div className="item-meta">
            <span className="metric-tag tag-nominal">MAP: 90 mmHg (Optimal)</span>
          </div>
        </div>

        <div className="cardio-telemetry-item">
          <div className="telemetry-item-header">
            <Radio size={16} className="text-purple" />
            <span className="item-label">RadLab Ambient Dose</span>
          </div>
          <div className="item-value">
            {vitals.radiation_rate}
            <small>μSv/h</small>
          </div>
          <div className="item-meta">
            <span className={`metric-tag ${vitals.radiation_rate >= 30 ? 'tag-warning' : 'tag-nominal'}`}>
              {vitals.radiation_rate >= 30 ? 'SPE Shielding Engaged' : 'LEO/Galactic Nominal'}
            </span>
          </div>
        </div>

        <div className="cardio-telemetry-item">
          <div className="telemetry-item-header">
            <ShieldCheck size={16} className="text-emerald" />
            <span className="item-label">Bio-Sensor Battery</span>
          </div>
          <div className="item-value">
            {vitals.battery_level ?? '98.5'}
            <small>%</small>
          </div>
          <div className="item-meta">
            <span className="metric-tag tag-nominal">Inductive Suit Link Active</span>
          </div>
        </div>
      </div>
    </section>
  );
};

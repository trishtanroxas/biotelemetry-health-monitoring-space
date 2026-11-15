import React, { useState } from 'react';
import { AnomalyDemoBar } from '../AnomalyDemoBar';
import { Radio, Wifi, WifiOff, Satellite, RefreshCw, Cpu, Database } from 'lucide-react';
import type { Astronaut } from '../../types/telemetry';

interface MissionOperationsSectionProps {
  astronaut?: Astronaut;
  activeId: string;
  gateway: boolean;
  offline: boolean;
  los: boolean;
  toggleLos: () => void;
  pendingCount: number;
  syncing: boolean;
  sync: () => void;
  lastUpdated: string;
  currentAnomaly: string;
  onTriggerAnomaly: (anomaly: string) => void;
  onRunDiagnostics: () => void;
  isDiagnosing: boolean;
}

export const MissionOperationsSection: React.FC<MissionOperationsSectionProps> = ({
  astronaut,
  activeId,
  gateway,
  offline,
  los,
  toggleLos,
  pendingCount,
  syncing,
  sync,
  lastUpdated,
  currentAnomaly,
  onTriggerAnomaly,
  onRunDiagnostics,
  isDiagnosing
}) => {
  const [targetDestination, setTargetDestination] = useState<'LEO' | 'MOON' | 'MARS'>('MARS');

  const destinationPresets = {
    LEO: {
      name: 'Low Earth Orbit (ISS)',
      distance: '408 km',
      latency: '< 50 ms',
      mode: 'GROUND ASSISTED'
    },
    MOON: {
      name: 'Lunar Gateway / Artemis Base',
      distance: '384,400 km',
      latency: '~1.3 sec round-trip',
      mode: 'HYBRID CO-PILOT'
    },
    MARS: {
      name: 'Mars Transit / Deep Space',
      distance: '225,000,000 km',
      latency: '14 to 22 min one-way',
      mode: 'AUTONOMOUS EDGE (IndexedDB)'
    }
  };

  const currentProfile = destinationPresets[targetDestination];

  return (
    <section className="panel bio-dashboard-panel mission-ops-panel" id="mission-ops-section">
      <div className="section-heading">
        <div className="panel-title-group">
          <span className="panel-eyebrow">COMMAND & INTERFACE CONTROL</span>
          <h2>
            <Radio size={18} className="text-cyan" />
            Mission Operations & Interplanetary Simulation
          </h2>
        </div>
        <div className="segmented" role="group" aria-label="Simulated Mission Destination">
          {(['LEO', 'MOON', 'MARS'] as const).map(dest => (
            <button
              key={dest}
              onClick={() => setTargetDestination(dest)}
              aria-pressed={targetDestination === dest}
            >
              {dest}
            </button>
          ))}
        </div>
      </div>

      <p className="section-description">
        Tactical telemetry link management, deep-space communication delay modeling, and offline-first edge fallback orchestration.
      </p>

      {/* Grid: Mission Profile & Link Status */}
      <div className="ops-profile-grid">
        <div className="ops-detail-card">
          <div className="ops-card-header">
            <Satellite size={16} className="text-cyan" />
            <span>Operational Profile</span>
          </div>
          <div className="ops-card-body">
            <div className="ops-field">
              <span className="ops-label">TARGET DESTINATION</span>
              <strong className="ops-val">{currentProfile.name}</strong>
            </div>
            <div className="ops-field">
              <span className="ops-label">ASSIGNED CREW MEMBER</span>
              <strong className="ops-val">{astronaut?.name ?? 'Dr. Sarah Chen'} ({activeId})</strong>
            </div>
            <div className="ops-field">
              <span className="ops-label">FLIGHT ROLE / SUIT ID</span>
              <strong className="ops-val">{astronaut?.role ?? 'Commander'} • {astronaut?.suit_id ?? 'EMU-X4'}</strong>
            </div>
            <div className="ops-field">
              <span className="ops-label">CALCULATED LIGHT-TIME DELAY</span>
              <strong className="ops-val text-cyan">{currentProfile.latency}</strong>
            </div>
          </div>
        </div>

        <div className="ops-detail-card">
          <div className="ops-card-header">
            <Cpu size={16} className="text-emerald" />
            <span>Link Architecture & Edge Sync</span>
          </div>
          <div className="ops-card-body">
            <div className="ops-field">
              <span className="ops-label">CURRENT TELEMETRY GATEWAY</span>
              <strong className="ops-val">
                {gateway ? 'Connected FastAPI Simulation Engine' : 'Autonomous Edge Node (Client-Side)'}
              </strong>
            </div>
            <div className="ops-field">
              <span className="ops-label">LOSS OF SIGNAL (LOS) STATUS</span>
              <div className="ops-row-action">
                <span className={`status-badge ${los ? 'badge-warning' : 'badge-nominal'}`}>
                  {los ? 'LOSS OF SIGNAL ACTIVE (LOS)' : 'LINK NOMINAL (AOS)'}
                </span>
                <button className="button secondary btn-compact" onClick={toggleLos}>
                  {los ? <Wifi size={14} /> : <WifiOff size={14} />}
                  <span>{los ? 'Restore Link (AOS)' : 'Simulate Blackout (LOS)'}</span>
                </button>
              </div>
            </div>
            <div className="ops-field">
              <span className="ops-label">OFFLINE QUEUE BUFFER</span>
              <div className="ops-row-action">
                <span className="queue-count-badge">
                  <Database size={13} /> {pendingCount} readings buffered locally
                </span>
                <button
                  className="button secondary btn-compact"
                  disabled={offline || syncing || pendingCount === 0}
                  onClick={sync}
                >
                  <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                  <span>{syncing ? 'Syncing...' : 'Flush to Supabase'}</span>
                </button>
              </div>
            </div>
            <div className="ops-field">
              <span className="ops-label">LAST LOCAL SAMPLE TIMESTAMP</span>
              <strong className="ops-val font-mono">{lastUpdated}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Mission Diagnostics & Clinical Stress Simulation Controls */}
      <div className="ops-simulation-section">
        <AnomalyDemoBar
          currentAnomaly={currentAnomaly}
          onTrigger={onTriggerAnomaly}
          onRunDiagnostics={onRunDiagnostics}
          isDiagnosing={isDiagnosing}
        />
      </div>
    </section>
  );
};

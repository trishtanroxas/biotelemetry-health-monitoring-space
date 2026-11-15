import React, { useState, useEffect, useCallback } from 'react';
import { 
  Heart, 
  Wind, 
  Thermometer, 
  Radio, 
  Activity, 
  Waves,
  ClipboardList
} from 'lucide-react';

import { Navbar, MissionDestination } from './components/Navbar';
import { VitalCard } from './components/VitalCard';
import { ECGMonitor } from './components/ECGMonitor';
import { AlertBanner } from './components/AlertBanner';
import { CrewSelector } from './components/CrewSelector';
import { AnomalyDemoBar } from './components/AnomalyDemoBar';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { SymptomLoggerModal } from './components/SymptomLoggerModal';
import { RadiationDosimeter } from './components/RadiationDosimeter';

import { 
  fetchAstronauts, 
  fetchLatestTelemetry, 
  fetchAlerts, 
  acknowledgeAlert, 
  syncOfflineBatch, 
  runDiagnostics 
} from './services/api';
import { soundService } from './services/sound';
import { localDb } from './db/localDb';
import { Astronaut, VitalSigns, AlertItem, DiagnosticResult } from './types/telemetry';

export const App: React.FC = () => {
  // Crew & active astronaut
  const [crew, setCrew] = useState<Astronaut[]>([]);
  const [activeAstronautId, setActiveAstronautId] = useState<string>('ASTRO-01');

  // Mission Destination (Comms Latency Simulator)
  const [missionDestination, setMissionDestination] = useState<MissionDestination>('ISS');

  // Cumulative Radiation Counter (mSv)
  const [cumulativeDose, setCumulativeDose] = useState<number>(14.25);

  // Telemetry stream state
  const [vitals, setVitals] = useState<VitalSigns>({
    astronaut_id: 'ASTRO-01',
    timestamp: new Date().toISOString(),
    heart_rate: 68.0,
    spo2: 98.4,
    core_temp: 36.8,
    radiation_rate: 14.5,
    hrv: 52.0,
    respiration_rate: 14.0,
    battery_level: 96.5,
    ecg_samples: []
  });

  // Alerts
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  // Simulation controls
  const [anomalyMode, setAnomalyMode] = useState<string>('NONE');
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Modals
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState<boolean>(false);
  const [isSymptomModalOpen, setIsSymptomModalOpen] = useState<boolean>(false);

  // Accessibility settings
  const [highContrast, setHighContrast] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Load initial crew
  useEffect(() => {
    fetchAstronauts().then((data) => {
      setCrew(data);
      if (data.length > 0) setActiveAstronautId(data[0].id);
    });
  }, []);

  // Update pending offline sync count from IndexedDB
  const updateOfflineCount = useCallback(async () => {
    try {
      const count = await localDb.vitalsQueue.where('syncedToCloud').equals(0).count();
      setPendingSyncCount(count);
    } catch {
      // Local DB fallback
    }
  }, []);

  useEffect(() => {
    updateOfflineCount();
  }, [updateOfflineCount]);

  // Main Telemetry Loop
  useEffect(() => {
    const interval = setInterval(async () => {
      // Small cumulative dose accumulation
      setCumulativeDose((prev) => prev + (vitals.radiation_rate / (3600 * 1000)));

      // If simulated Mars or Offline, run autonomous edge mode
      const isAutonomousMode = isOfflineMode || missionDestination === 'MARS';

      if (isAutonomousMode && isOfflineMode) {
        // Space communication blackout / Loss of Signal:
        const simulatedOfflineVitals: VitalSigns = {
          astronaut_id: activeAstronautId,
          timestamp: new Date().toISOString(),
          heart_rate: Math.round(65 + Math.random() * 8),
          spo2: 98.2,
          core_temp: 36.8,
          radiation_rate: Math.round((13 + Math.random() * 2) * 10) / 10,
          hrv: 54.0,
          respiration_rate: 14.0,
          battery_level: 95.0,
          ecg_samples: []
        };
        setVitals(simulatedOfflineVitals);
        await localDb.vitalsQueue.add({
          ...simulatedOfflineVitals,
          syncedToCloud: false
        });
        updateOfflineCount();
        return;
      }

      try {
        const latest = await fetchLatestTelemetry(activeAstronautId, anomalyMode);
        setVitals(latest);
        soundService.playBlip();

        // Check alerts
        const currentAlerts = await fetchAlerts();
        setAlerts(currentAlerts);

        const hasCritical = currentAlerts.some((a) => a.severity === 'CRITICAL' && !a.acknowledged);
        if (hasCritical) {
          soundService.playEmergencyAlarm();
        }
      } catch (err) {
        // Network timeout / offline fallback
      }
    }, 1200);

    return () => clearInterval(interval);
  }, [activeAstronautId, anomalyMode, isOfflineMode, missionDestination, vitals.radiation_rate, updateOfflineCount]);

  // Handle Offline Reconnection & Batch Sync
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const unSynced = await localDb.vitalsQueue.where('syncedToCloud').equals(0).toArray();
      if (unSynced.length > 0) {
        await syncOfflineBatch(activeAstronautId, unSynced);
        await localDb.vitalsQueue.clear();
        setPendingSyncCount(0);
      }
    } catch (e) {
      console.error('Batch sync failed', e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Keyboard Accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === ' ' && alerts.some((a) => !a.acknowledged)) {
        e.preventDefault();
        const unacked = alerts.find((a) => !a.acknowledged);
        if (unacked) handleAcknowledgeAlert(unacked.id);
      } else if (e.key === '1' && crew[0]) {
        setActiveAstronautId(crew[0].id);
      } else if (e.key === '2' && crew[1]) {
        setActiveAstronautId(crew[1].id);
      } else if (e.key === '3' && crew[2]) {
        setActiveAstronautId(crew[2].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [alerts, crew]);

  const handleAcknowledgeAlert = async (id: string) => {
    await acknowledgeAlert(id);
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  };

  const handleRunDiagnostics = async () => {
    setIsDiagnosing(true);
    try {
      const res = await runDiagnostics(activeAstronautId);
      setDiagnosticResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDiagnosing(false);
    }
  };

  const getHrStatus = () => {
    if (vitals.heart_rate > 120 || vitals.heart_rate < 45) return 'CRITICAL';
    if (vitals.heart_rate > 100 || vitals.heart_rate < 50) return 'WARNING';
    return 'NORMAL';
  };

  const getSpo2Status = () => {
    if (vitals.spo2 < 90) return 'CRITICAL';
    if (vitals.spo2 < 95) return 'WARNING';
    return 'NORMAL';
  };

  const getRadStatus = () => {
    if (vitals.radiation_rate >= 60) return 'CRITICAL';
    if (vitals.radiation_rate >= 30) return 'WARNING';
    return 'NORMAL';
  };

  return (
    <div className={`min-h-screen bg-[#030712] text-slate-100 flex flex-col ${highContrast ? 'high-contrast' : ''}`}>
      {/* Top Navigation with Latency Simulator */}
      <Navbar
        isOfflineMode={isOfflineMode}
        onToggleOffline={() => setIsOfflineMode((prev) => !prev)}
        pendingSyncCount={pendingSyncCount}
        onManualSync={handleSync}
        isSyncing={isSyncing}
        highContrast={highContrast}
        onToggleHighContrast={() => setHighContrast((prev) => !prev)}
        soundEnabled={soundEnabled}
        onToggleSound={() => {
          soundService.enabled = !soundEnabled;
          setSoundEnabled((prev) => !prev);
        }}
        missionDestination={missionDestination}
        onChangeDestination={(dest) => setMissionDestination(dest)}
      />

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-4">
        {/* Emergency Alert Banner */}
        <AlertBanner alerts={alerts} onAcknowledge={handleAcknowledgeAlert} />

        {/* Top Controls: Crew Selector & SANS Symptom Logger Button */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3">
            <CrewSelector
              crew={crew}
              activeId={activeAstronautId}
              onSelect={(id) => setActiveAstronautId(id)}
              suitBattery={vitals.battery_level}
            />
          </div>
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur shadow-lg flex flex-col justify-between">
            <div>
              <div className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">
                Self-Evaluation Check
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Log vision changes (SANS), cephalic pressure, and space motion sickness.
              </p>
            </div>
            <button
              onClick={() => setIsSymptomModalOpen(true)}
              className="mt-3 w-full py-2 px-3 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/50 text-cyan-200 text-xs font-mono font-bold uppercase transition flex items-center justify-center gap-1.5"
            >
              <ClipboardList className="h-4 w-4 text-cyan-300" />
              Log Symptoms (SANS)
            </button>
          </div>
        </div>

        {/* Live Continuous ECG Waveform */}
        <ECGMonitor ecgSamples={vitals.ecg_samples} heartRate={vitals.heart_rate} />

        {/* Primary Biometrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <VitalCard
            label="Heart Rate"
            value={vitals.heart_rate}
            unit="BPM"
            icon={Heart}
            status={getHrStatus()}
            baseline="60 - 100 BPM"
            ariaLabel={`Heart rate is ${vitals.heart_rate} beats per minute. Status: ${getHrStatus()}`}
          />
          <VitalCard
            label="Blood Oxygen (SpO2)"
            value={`${vitals.spo2}%`}
            unit="O2 Sat"
            icon={Wind}
            status={getSpo2Status()}
            baseline="95 - 100%"
            ariaLabel={`Blood oxygen is ${vitals.spo2} percent. Status: ${getSpo2Status()}`}
          />
          <VitalCard
            label="Core Temperature"
            value={vitals.core_temp}
            unit="°C"
            icon={Thermometer}
            status={vitals.core_temp > 37.8 ? 'WARNING' : 'NORMAL'}
            baseline="36.5 - 37.3 °C"
            ariaLabel={`Core temperature is ${vitals.core_temp} degrees Celsius`}
          />
          <VitalCard
            label="Ambient Radiation"
            value={vitals.radiation_rate}
            unit="μSv/h"
            icon={Radio}
            status={getRadStatus()}
            baseline="< 25 μSv/h"
            ariaLabel={`Radiation rate is ${vitals.radiation_rate} micro Sieverts per hour`}
          />
        </div>

        {/* Cumulative Radiation Dosimeter vs NASA Limits */}
        <RadiationDosimeter
          currentRate={vitals.radiation_rate}
          cumulativeDose={cumulativeDose}
        />

        {/* Secondary Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl bg-slate-900/40 border border-slate-800 text-xs font-mono text-slate-300">
          <div className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-cyan-400" />
            <span>HRV: <strong className="text-white">{vitals.hrv} ms</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-400" />
            <span>Resp: <strong className="text-white">{vitals.respiration_rate} rpm</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">BP:</span>
            <span><strong className="text-white">{vitals.systolic_bp}/{vitals.diastolic_bp}</strong> mmHg</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Comms Mode:</span>
            <span className="text-cyan-400 font-bold">
              {missionDestination === 'MARS' || isOfflineMode ? 'AUTONOMOUS EDGE' : 'GROUND ASSISTED'}
            </span>
          </div>
        </div>

        {/* Simulation Controls Bar */}
        <AnomalyDemoBar
          currentAnomaly={anomalyMode}
          onTrigger={(mode) => setAnomalyMode(mode)}
          onRunDiagnostics={handleRunDiagnostics}
          isDiagnosing={isDiagnosing}
        />
      </main>

      {/* Diagnostics Report Modal */}
      <DiagnosticsModal
        result={diagnosticResult}
        onClose={() => setDiagnosticResult(null)}
      />

      {/* SANS Self-Evaluation Symptom Logger Modal */}
      <SymptomLoggerModal
        isOpen={isSymptomModalOpen}
        onClose={() => setIsSymptomModalOpen(false)}
        astronautId={activeAstronautId}
      />

      {/* Footer */}
      <footer className="border-t border-slate-800/80 p-4 text-center text-xs font-mono text-slate-500">
        NASA International Space Apps Challenge • Astronaut Biotelemetry PWA • Powered by React, Vite, FastAPI & Supabase
      </footer>
    </div>
  );
};

export default App;

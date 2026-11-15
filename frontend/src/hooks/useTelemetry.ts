import { useCallback, useEffect, useRef, useState } from 'react';
import { acknowledgeAlert, demoCrew, fetchAlerts, fetchAstronauts, fetchLatestTelemetry, runDiagnostics, syncOfflineBatch } from '../services/api';
import { localDb } from '../db/localDb';
import { soundService } from '../services/sound';
import { sendQueuedTelemetry } from '../services/telemetryQueue';
import type { AlertItem, Astronaut, DiagnosticResult, VitalSigns } from '../types/telemetry';

export function simulatedVitals(id: string, anomaly = 'NONE'): VitalSigns {
  return { astronaut_id: id, timestamp: new Date().toISOString(), heart_rate: anomaly === 'TACHYCARDIA' ? 132 : Math.round(65 + Math.random() * 8), spo2: anomaly === 'HYPOXIA' ? 87 : 98.4, core_temp: 36.8, radiation_rate: anomaly === 'RADIATION_SPIKE' ? 65 : 14.5, hrv: 52, respiration_rate: 14, battery_level: 96.5, ecg_samples: [] };
}
export function useTelemetry() {
  const [crew, setCrew] = useState<Astronaut[]>(demoCrew);
  const [crewDemo, setCrewDemo] = useState(true);
  const [activeId, setActiveId] = useState('ASTRO-01');
  const [vitals, setVitals] = useState<VitalSigns>(() => simulatedVitals('ASTRO-01'));
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const lastActiveCriticalRef = useRef<Set<string>>(new Set());
  const [anomaly, setAnomaly] = useState('NONE');
  const [los, setLos] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [gateway, setGateway] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sound, setSound] = useState(false);
  const syncingRef = useRef(false);
  const offline = los || !online;
  useEffect(() => { soundService.enabled = sound; }, [sound]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => {
    let alive = true;
    fetchAstronauts().then(data => { if (alive && data.length) { setCrew(data); setCrewDemo(false); setActiveId(data[0].id); } }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const updatePending = useCallback(async () => {
    // IndexedDB does not index booleans. Filter legacy records without changing schema.
    try { setPending(await localDb.vitalsQueue.filter(item => !item.syncedToCloud).count()); }
    catch { setError('Local storage is unavailable. Telemetry cannot be buffered.'); }
  }, []);
  useEffect(() => { void updatePending(); }, [updatePending]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    setVitals(simulatedVitals(activeId, anomaly)); setAlerts([]); setGateway(false);
    const savedObservations = localDb.alertsStore.where('astronaut_id').equals(activeId).toArray().catch(() => [] as AlertItem[]);
    async function tick() {
      try {
        if (offline) {
          const record = simulatedVitals(activeId, anomaly);
          if (!alive) return;
          setVitals(record); setGateway(false);
          await localDb.vitalsQueue.add({ ...record, syncedToCloud: false });
          if (alive) await updatePending();
        } else {
          try {
            const record = await fetchLatestTelemetry(activeId, anomaly);
            if (!alive) return;
            setVitals(record); setGateway(true);
            try {
              const observations = await fetchAlerts();
              if (!alive) return;
              setAlerts(previous => [...new Map([...previous, ...observations.filter(a => a.astronaut_id === activeId)].map(a => [a.id, a])).values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
              void localDb.alertsStore.bulkPut(observations).catch(() => { if (alive) setError('Observations received, but local observation history could not be saved.'); });
              
              // Only trigger emergency alarm when an unacknowledged CRITICAL alert is newly discovered
              const currentUnackedCriticals = observations
                .filter(a => a.astronaut_id === activeId && a.severity === 'CRITICAL' && !a.acknowledged)
                .map(a => `${a.id}-${a.alert_type}`);
              const hasNewCritical = currentUnackedCriticals.some(k => !lastActiveCriticalRef.current.has(k));
              if (hasNewCritical) {
                soundService.playEmergencyAlarm();
              }
              lastActiveCriticalRef.current = new Set(currentUnackedCriticals);
            } catch { if (alive) setError('Observation feed is unavailable. Previously received observations are retained.'); }
          } catch {
            if (!alive) return;
            setGateway(false); setVitals(simulatedVitals(activeId, anomaly));
          }
        }
      } catch { if (alive) setError('Local telemetry buffering failed. Check browser storage availability.'); }
      finally { if (alive) timer = setTimeout(tick, 1200); }
    }
    void savedObservations.then(saved => { if (alive) { setAlerts(saved); void tick(); } });
    return () => { alive = false; clearTimeout(timer); };
  }, [activeId, anomaly, offline, updatePending]);
  const acknowledge = useCallback(async (id: string) => {
    try {
      await acknowledgeAlert(id);
      setAlerts(items => items.map(a => a.id === id ? { ...a, acknowledged: true } : a));
      await localDb.alertsStore.update(id, { acknowledged: true }).catch(() => setError('The server acknowledged this observation, but the local history could not be updated.'));
    }
    catch { setError('The server did not confirm acknowledgement. Please retry when connected.'); }
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input,textarea,select,button,a,[contenteditable]')) return;
      const member = crew[Number(event.key) - 1];
      if (member) setActiveId(member.id);
      if (event.key === ' ') { const alert = alerts.find(a => !a.acknowledged); if (alert) { event.preventDefault(); void acknowledge(alert.id); } }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [alerts, crew, acknowledge]);
  async function sync() {
    if (syncingRef.current || offline) return;
    syncingRef.current = true; setSyncing(true); setNotice('');
    try {
      setNotice(await sendQueuedTelemetry(activeId, syncOfflineBatch));
      await updatePending();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sync failed. Local records were retained.'); }
    finally { syncingRef.current = false; setSyncing(false); }
  }
  async function diagnose() {
    setDiagnosing(true);
    try { setDiagnostic(await runDiagnostics(activeId)); }
    catch { setError('Diagnostics require the FastAPI connection. Please retry when the gateway is available.'); }
    finally { setDiagnosing(false); }
  }
  return { crew, crewDemo, activeId, setActiveId, vitals, alerts, anomaly, setAnomaly, los, setLos, online, offline, gateway, pending, syncing, sync, diagnosing, diagnose, diagnostic, setDiagnostic, acknowledge, error, setError, notice, sound, setSound };
}

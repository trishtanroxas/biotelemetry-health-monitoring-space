import React from 'react';
import { Radio, Wifi, WifiOff, Volume2, VolumeX, Eye, RefreshCw, Satellite } from 'lucide-react';

export type MissionDestination = 'ISS' | 'MOON' | 'MARS';

interface NavbarProps {
  isOfflineMode: boolean;
  onToggleOffline: () => void;
  pendingSyncCount: number;
  onManualSync: () => void;
  isSyncing: boolean;
  highContrast: boolean;
  onToggleHighContrast: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  missionDestination: MissionDestination;
  onChangeDestination: (dest: MissionDestination) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  isOfflineMode,
  onToggleOffline,
  pendingSyncCount,
  onManualSync,
  isSyncing,
  highContrast,
  onToggleHighContrast,
  soundEnabled,
  onToggleSound,
  missionDestination,
  onChangeDestination
}) => {
  const getLatencyLabel = () => {
    switch (missionDestination) {
      case 'ISS':
        return { label: 'LEO / ISS', delay: '50 ms (Real-time Earth Doctor)', badge: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' };
      case 'MOON':
        return { label: 'Artemis / Moon', delay: '1.3 sec delay', badge: 'border-cyan-500/40 text-cyan-400 bg-cyan-500/10' };
      case 'MARS':
        return { label: 'Mars Transit', delay: '14 min delay (Autonomous Edge Active)', badge: 'border-purple-500/40 text-purple-400 bg-purple-500/10' };
    }
  };

  const latencyInfo = getLatencyLabel();

  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur px-4 py-3 sticky top-0 z-40 shadow-xl">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Brand / Mission Header */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Radio className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base md:text-lg tracking-wider text-slate-100 uppercase">
                AstroTelemetry
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                PWA v1.2
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              NASA International Space Apps Challenge • Mission Health Gateway
            </p>
          </div>
        </div>

        {/* Deep Space Latency Simulator Selector */}
        <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <div className="flex items-center gap-1 px-2 text-[11px] font-mono text-slate-400">
            <Satellite className="h-3.5 w-3.5 text-cyan-400" />
            <span className="hidden md:inline">Mission Link:</span>
          </div>
          {(['ISS', 'MOON', 'MARS'] as MissionDestination[]).map((dest) => (
            <button
              key={dest}
              onClick={() => onChangeDestination(dest)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all ${
                missionDestination === dest
                  ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-300 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {dest}
            </button>
          ))}
          <span className={`hidden lg:inline text-[10px] font-mono px-2 py-0.5 rounded border ml-1 ${latencyInfo.badge}`}>
            {latencyInfo.delay}
          </span>
        </div>

        {/* Status Indicators & Accessibility Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Signal Link Status (Online / LOS) */}
          <button
            onClick={onToggleOffline}
            aria-label={isOfflineMode ? "Telemetry Link in Loss of Signal mode. Click to restore link" : "Telemetry link Online. Click to simulate Loss of Signal"}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all ${
              isOfflineMode
                ? 'bg-rose-500/10 border-rose-500/40 text-rose-300 hover:bg-rose-500/20'
                : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20'
            }`}
          >
            {isOfflineMode ? (
              <>
                <WifiOff className="h-4 w-4 text-rose-400" />
                <span>LOS (OFFLINE BUFFER)</span>
              </>
            ) : (
              <>
                <Wifi className="h-4 w-4 text-emerald-400 animate-pulse" />
                <span>LINK ACTIVE</span>
              </>
            )}
          </button>

          {/* Offline Sync Queue Counter */}
          {pendingSyncCount > 0 && (
            <button
              onClick={onManualSync}
              disabled={isSyncing || isOfflineMode}
              title={isOfflineMode ? "Reconnect link to sync queued records" : "Click to push cached records to Supabase"}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{pendingSyncCount} QUEUED</span>
            </button>
          )}

          {/* Sound / Audio Accessibility Toggle */}
          <button
            onClick={onToggleSound}
            aria-label={soundEnabled ? "Mute audio alarms" : "Enable audio alarms"}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-400 hover:border-slate-700 transition"
            title={soundEnabled ? "Audio Alarms Enabled" : "Audio Alarms Muted"}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4 text-cyan-400" /> : <VolumeX className="h-4 w-4 text-slate-500" />}
          </button>

          {/* Visor High Contrast Toggle */}
          <button
            onClick={onToggleHighContrast}
            aria-label="Toggle High-Contrast Visor Mode"
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-400 hover:border-slate-700 transition"
            title="Toggle High-Contrast Visor Mode"
          >
            <Eye className={`h-4 w-4 ${highContrast ? 'text-amber-400' : 'text-slate-400'}`} />
          </button>
        </div>
      </div>
    </header>
  );
};

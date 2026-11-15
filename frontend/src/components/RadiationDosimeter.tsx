import React from 'react';
import { Radiation } from 'lucide-react';

interface RadiationDosimeterProps {
  currentRate: number; // in uSv/h
  cumulativeDose: number; // in mSv
}

// NASA-STD-3001 Career exposure benchmark is ~600 mSv lifetime limit
const NASA_CAREER_LIMIT_MSV = 600.0;

export const RadiationDosimeter: React.FC<RadiationDosimeterProps> = ({
  currentRate,
  cumulativeDose
}) => {
  const percentageOfLimit = Math.min(100, (cumulativeDose / NASA_CAREER_LIMIT_MSV) * 100);

  const getDoseStatus = () => {
    if (currentRate >= 60.0 || cumulativeDose > 250.0) {
      return { label: 'SPE WARNING', color: 'text-rose-400', barColor: 'bg-rose-500' };
    }
    if (currentRate >= 30.0 || cumulativeDose > 100.0) {
      return { label: 'ELEVATED GCR', color: 'text-amber-400', barColor: 'bg-amber-500' };
    }
    return { label: 'NOMINAL EXPOSURE', color: 'text-emerald-400', barColor: 'bg-cyan-500' };
  };

  const status = getDoseStatus();

  return (
    <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radiation className="h-5 w-5 text-purple-400" />
          <span className="text-xs font-semibold text-slate-300 tracking-wider uppercase">
            Cosmic Radiation Dosimeter (NASA-STD-3001)
          </span>
        </div>
        <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border border-slate-700 bg-slate-950/70 ${status.color}`}>
          {status.label}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-2">
        {/* Real-time Rate */}
        <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/80">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Live Flux Rate:</div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl md:text-3xl font-mono font-bold text-purple-300">
              {currentRate.toFixed(1)}
            </span>
            <span className="text-xs font-mono text-slate-400">μSv / h</span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">RadLab ISS baseline: 12-25 μSv/h</div>
        </div>

        {/* Cumulative Dose */}
        <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/80">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Mission Cumulative:</div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl md:text-3xl font-mono font-bold text-cyan-300">
              {cumulativeDose.toFixed(2)}
            </span>
            <span className="text-xs font-mono text-slate-400">mSv</span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">Career Max: 600.0 mSv</div>
        </div>
      </div>

      {/* Progress Bar against NASA Career Limit */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
          <span>Career Dose Accumulated:</span>
          <span>{percentageOfLimit.toFixed(2)}% of NASA Limit</span>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${status.barColor}`}
            style={{ width: `${Math.max(2, percentageOfLimit)}%` }}
          />
        </div>
      </div>
    </div>
  );
};

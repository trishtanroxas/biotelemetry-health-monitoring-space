import React, { useState } from 'react';
import { Eye, CheckCircle2 } from 'lucide-react';

interface SymptomLog {
  visionBlur: 'NONE' | 'MILD' | 'SEVERE';
  headacheSeverity: 'NONE' | 'MODERATE' | 'SEVERE';
  motionSickness: 'NONE' | 'NAUSEA' | 'SEVERE_DISORIENTATION';
  timestamp: string;
}

interface SymptomLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  astronautId: string;
}

export const SymptomLoggerModal: React.FC<SymptomLoggerModalProps> = ({
  isOpen,
  onClose,
  astronautId
}) => {
  const [visionBlur, setVisionBlur] = useState<'NONE' | 'MILD' | 'SEVERE'>('NONE');
  const [headache, setHeadache] = useState<'NONE' | 'MODERATE' | 'SEVERE'>('NONE');
  const [motionSickness, setMotionSickness] = useState<'NONE' | 'NAUSEA' | 'SEVERE_DISORIENTATION'>('NONE');
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const log: SymptomLog = {
      visionBlur,
      headacheSeverity: headache,
      motionSickness,
      timestamp: new Date().toISOString()
    };
    
    // Store in localStorage / IndexedDB for offline evaluation
    const existing = JSON.parse(localStorage.getItem(`symptoms_${astronautId}`) || '[]');
    existing.push(log);
    localStorage.setItem(`symptoms_${astronautId}`, JSON.stringify(existing));

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-cyan-500/50 rounded-2xl p-6 shadow-2xl text-slate-100">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
          <Eye className="h-5 w-5 text-cyan-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider">
            SANS & Space Adaptation Assessment • {astronautId}
          </h2>
        </div>

        <p className="text-xs text-slate-400 mb-4">
          Microgravity fluid shift can cause increased intraocular pressure (SANS) and vestibular adaptation disorientation.
        </p>

        {savedSuccess ? (
          <div className="p-6 text-center space-y-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
            <div className="font-mono text-sm font-bold text-emerald-300">ASSESSMENT RECORDED</div>
            <div className="text-xs text-slate-400">Integrated into onboard clinical risk profile.</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 1. Vision Disturbance (SANS) */}
            <div>
              <label className="block text-xs font-mono uppercase text-slate-300 mb-1.5">
                Visual Acuity / Papilledema (Blurring):
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                {(['NONE', 'MILD', 'SEVERE'] as const).map((lvl) => (
                  <button
                    type="button"
                    key={lvl}
                    onClick={() => setVisionBlur(lvl)}
                    className={`py-2 px-1 rounded-lg border text-center transition ${
                      visionBlur === lvl
                        ? 'border-cyan-400 bg-cyan-950/50 text-cyan-200 font-bold'
                        : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-white'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Cephalic Congestion / Headache */}
            <div>
              <label className="block text-xs font-mono uppercase text-slate-300 mb-1.5">
                Cephalic Pressure / Headache:
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                {(['NONE', 'MODERATE', 'SEVERE'] as const).map((lvl) => (
                  <button
                    type="button"
                    key={lvl}
                    onClick={() => setHeadache(lvl)}
                    className={`py-2 px-1 rounded-lg border text-center transition ${
                      headache === lvl
                        ? 'border-amber-400 bg-amber-950/50 text-amber-200 font-bold'
                        : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-white'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Space Motion Sickness (SMS) */}
            <div>
              <label className="block text-xs font-mono uppercase text-slate-300 mb-1.5">
                Vestibular / Space Motion Sickness:
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                {(['NONE', 'NAUSEA', 'SEVERE_DISORIENTATION'] as const).map((lvl) => (
                  <button
                    type="button"
                    key={lvl}
                    onClick={() => setMotionSickness(lvl)}
                    className={`py-2 px-1 rounded-lg border text-center truncate transition ${
                      motionSickness === lvl
                        ? 'border-rose-400 bg-rose-950/50 text-rose-200 font-bold'
                        : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-white'
                    }`}
                  >
                    {lvl.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-1/2 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono uppercase transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-1/2 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold uppercase transition"
              >
                Save Evaluation
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

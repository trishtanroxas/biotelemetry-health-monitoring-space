import React, { useEffect, useState } from 'react';

interface LoadingScreenProps {
  onComplete?: () => void;
  minDuration?: number;
}

const STAGES = [
  'Establishing onboard interface…',
  'Initializing mission environment…',
  'Preparing crew workspace…',
  'Synchronizing local edge database…',
  'Readying telemetry channels…'
];

export const DashboardTransitionLoader: React.FC<LoadingScreenProps> = ({
  onComplete,
  minDuration = 1100
}) => {
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(15);
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    // Stage rotation interval
    const stageTimer = setInterval(() => {
      setStageIndex((prev) => (prev + 1) % STAGES.length);
    }, 280);

    // Progress bar animation
    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return 98;
        return prev + Math.floor(Math.random() * 18) + 8;
      });
    }, 120);

    // Completion timeout
    const exitTimer = setTimeout(() => {
      setProgress(100);
      setFadingOut(true);
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 250);
    }, minDuration);

    return () => {
      clearInterval(stageTimer);
      clearInterval(progressTimer);
      clearTimeout(exitTimer);
    };
  }, [minDuration, onComplete]);

  return (
    <div 
      className={`dashboard-loader-overlay ${fadingOut ? 'loader-fade-out' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Initializing mission dashboard"
    >
      <div className="loader-backdrop-stars" />
      <div className="loader-cyan-glow" />

      <div className="loader-content-box">
        {/* Orbital Scanning Ring with Official Logo */}
        <div className="loader-logo-orbital">
          <div className="orbital-ring ring-outer" />
          <div className="orbital-ring ring-inner" />
          <img 
            src="/branding/biotelemetry-logo.png" 
            alt="BioTelemetry" 
            className="loader-logo-image"
          />
        </div>

        {/* Technical Title & Rotating Status */}
        <div className="loader-typography">
          <div className="loader-brand-title">INITIALIZING MISSION INTERFACE</div>
          <div className="loader-stage-msg">{STAGES[stageIndex]}</div>
        </div>

        {/* Shimmering Progress Bar */}
        <div className="loader-progress-track">
          <div 
            className="loader-progress-fill" 
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>

        <div className="loader-meta-foot">
          <span>CREW WORKSPACE: AUTONOMOUS</span>
          <span>LINK: LOCAL EDGE</span>
        </div>
      </div>
    </div>
  );
};

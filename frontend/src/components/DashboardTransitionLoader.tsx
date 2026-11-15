import React, { useEffect, useState } from 'react';
import biotelemetryMark from '../assets/biotelemetry-mark.png';

interface LoadingScreenProps {
  onComplete?: () => void;
  minDuration?: number;
}

export const DashboardTransitionLoader: React.FC<LoadingScreenProps> = ({
  onComplete,
  minDuration = 800
}) => {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => {
      setFadingOut(true);
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 250);
    }, minDuration);

    return () => clearTimeout(exitTimer);
  }, [minDuration, onComplete]);

  return (
    <div 
      className={`dashboard-loader-overlay ${fadingOut ? 'loader-fade-out' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Initializing mission interface"
    >
      <div className="loader-minimal-content">
        {/* Official BioTelemetry Logo (Icon + Wordmark) */}
        <div className="brand-lockup loader-brand-lockup">
          <div className="brand-mark">
            <img 
              src={biotelemetryMark} 
              alt="BioTelemetry Icon" 
              className="nav-icon-img"
              draggable={false}
            />
          </div>
          <div className="brand-text">
            <strong className="brand-title">Bio<span>Telemetry</span></strong>
            <small className="brand-tagline">HUMAN HEALTH. BEYOND EARTH.</small>
          </div>
        </div>

        {/* Short loading message */}
        <p className="loader-simple-message">Initializing mission interface...</p>

        {/* Small animated cyan loading spinner */}
        <div className="loader-cyan-spinner" aria-hidden="true" />
      </div>
    </div>
  );
};

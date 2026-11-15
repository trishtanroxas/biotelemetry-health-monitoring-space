import React from 'react';
import { 
  Orbit, 
  Activity, 
  ShieldCheck, 
  Radio, 
  Satellite, 
  ArrowRight, 
  Sparkles, 
  Database, 
  WifiOff, 
  HeartPulse, 
  Compass, 
  ExternalLink 
} from 'lucide-react';

interface LandingPageProps {
  onEnterApp: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {
  return (
    <div className="landing-container">
      {/* Dynamic Background Stars and Glows */}
      <div className="landing-stars" />
      <div className="landing-glow glow-1" />
      <div className="landing-glow glow-2" />

      {/* Navigation Header */}
      <header className="landing-header">
        <div className="landing-brand">
          <div className="landing-logo-ring">
            <Orbit className="h-6 w-6 text-cyan-400 animate-spin-slow" />
          </div>
          <div>
            <div className="landing-title">BIOTELEMETRY</div>
            <div className="landing-subtitle">HUMAN HEALTH • BEYOND EARTH</div>
          </div>
        </div>

        <div className="landing-nav-actions">
          <span className="landing-badge">NASA SPACE APPS 2026</span>
          <button onClick={onEnterApp} className="landing-btn-primary">
            Launch Dashboard <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="landing-hero">
        <div className="hero-content">
          <div className="hero-pill animate-fade-in">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <span>Autonomous Crew Bio-Resilience Architecture</span>
          </div>

          <h1 className="hero-title animate-slide-up">
            Monitoring Human Health in <span className="gradient-text">Deep Space</span>
          </h1>

          <p className="hero-description animate-slide-up-delayed">
            An offline-first, edge-native Progressive Web App designed to monitor, evaluate, and triage astronaut vitals during high-latency lunar and interplanetary missions.
          </p>

          <div className="hero-cta-group animate-slide-up-delayed">
            <button onClick={onEnterApp} className="landing-btn-large">
              <span>Open Mission Workspace</span>
              <ArrowRight className="h-5 w-5" />
            </button>
            <a
              href="https://github.com/trishtanroxas/biotelemetry-health-monitoring-space"
              target="_blank"
              rel="noreferrer"
              className="landing-btn-secondary"
            >
              <ExternalLink className="h-4 w-4" />
              <span>View GitHub Source</span>
            </a>
          </div>

          {/* Real-time Simulated Telemetry Pill Bar */}
          <div className="telemetry-pill-strip animate-fade-in">
            <div className="pill-item">
              <span className="dot dot-green" />
              <HeartPulse className="h-4 w-4 text-emerald-400" />
              <span>ECG Lead II: <strong>60 FPS Live</strong></span>
            </div>
            <div className="pill-divider" />
            <div className="pill-item">
              <span className="dot dot-cyan" />
              <Satellite className="h-4 w-4 text-cyan-400" />
              <span>Comms Link: <strong>LOS Edge-Buffered</strong></span>
            </div>
            <div className="pill-divider" />
            <div className="pill-item">
              <span className="dot dot-purple" />
              <Radio className="h-4 w-4 text-purple-400" />
              <span>RadLab: <strong>14.2 μSv/h Nominal</strong></span>
            </div>
          </div>
        </div>
      </main>

      {/* Feature Showcase Grid */}
      <section className="landing-features">
        <div className="feature-card">
          <div className="feature-icon-wrapper bg-cyan-500/10 border-cyan-500/30 text-cyan-400">
            <WifiOff className="h-6 w-6" />
          </div>
          <h3>Zero-Ground Autonomy</h3>
          <p>
            When communications lag by up to 22 minutes on Mars transit, the onboard edge engine detects hypoxia, arrhythmia, and radiation spikes instantly.
          </p>
          <div className="feature-tag">Offline-First PWA</div>
        </div>

        <div className="feature-card">
          <div className="feature-icon-wrapper bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
            <Activity className="h-6 w-6" />
          </div>
          <h3>NASA Baseline Calibration</h3>
          <p>
            Calibrated using real data from the NASA Open Science Data Repository (OSDR) and historical flight telemetry from Apollo, Skylab, and ISS.
          </p>
          <div className="feature-tag">NASA OSDR & RadLab</div>
        </div>

        <div className="feature-card">
          <div className="feature-icon-wrapper bg-purple-500/10 border-purple-500/30 text-purple-400">
            <Database className="h-6 w-6" />
          </div>
          <h3>IndexedDB to Supabase Sync</h3>
          <p>
            Vitals recorded during orbital signal blackouts are cached locally on-device and batch-synchronized automatically when links restore.
          </p>
          <div className="feature-tag">PostgreSQL Cloud Sync</div>
        </div>

        <div className="feature-card">
          <div className="feature-icon-wrapper bg-amber-500/10 border-amber-500/30 text-amber-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h3>Mission Spaceflight Ergonomics</h3>
          <p>
            Built for extreme conditions with high-contrast visor filtering, synthesized Web Audio sonification alarms, and glove-accessible controls.
          </p>
          <div className="feature-tag">WCAG 2.1 AA Compliant</div>
        </div>
      </section>

      {/* Bottom Footer */}
      <footer className="landing-footer">
        <div className="footer-left">
          <Compass className="h-4 w-4 text-cyan-400" />
          <span>NASA International Space Apps Challenge 2026 • Health Monitoring Software</span>
        </div>
        <div className="footer-right">
          <span>Developed by Team BioTelemetry</span>
        </div>
      </footer>
    </div>
  );
};

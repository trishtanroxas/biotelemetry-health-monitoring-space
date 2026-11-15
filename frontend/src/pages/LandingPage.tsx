import React from 'react';
import { 
  Activity, 
  ShieldCheck, 
  ArrowRight, 
  Sparkles, 
  Database, 
  WifiOff, 
  Layers,
  Code2,
  Users,
  Compass, 
  ExternalLink 
} from 'lucide-react';

interface LandingPageProps {
  onEnterApp: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {
  return (
    <div className="landing-container">
      {/* Background Starfield and Ambient Glows */}
      <div className="landing-stars" />
      <div className="landing-glow glow-1" />
      <div className="landing-glow glow-2" />

      {/* Navigation Header */}
      <header className="landing-header">
        <div className="landing-brand">
          <img 
            src="/branding/actual-logo.png" 
            alt="BioTelemetry Logo" 
            className="h-10 object-contain"
          />
        </div>

        <div className="landing-nav-actions">
          <span className="landing-badge">TEAM BIOTELEMETRY • NASA 2026</span>
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
            Developed by <strong>Team BioTelemetry</strong> for the NASA International Space Apps Challenge. 
            An edge-native, offline-first Progressive Web App designed to monitor, evaluate, and triage astronaut 
            vitals during high-latency lunar and interplanetary missions.
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
        </div>
      </main>

      {/* Technical Architecture & Framework Stack Section */}
      <section className="tech-stack-section animate-fade-in">
        <div className="section-title-wrap">
          <Layers className="h-5 w-5 text-cyan-400" />
          <h2>Engineered Architecture & Frameworks</h2>
          <p>Built with modern, high-performance web standards engineered for extreme mission reliability.</p>
        </div>

        <div className="tech-stack-grid">
          <div className="tech-card">
            <div className="tech-header">
              <Code2 className="h-5 w-5 text-cyan-400" />
              <span className="tech-name">React + Vite PWA</span>
            </div>
            <p>Component-driven frontend utilizing TypeScript and Workbox Service Workers for sub-second offline booting.</p>
            <span className="tech-role">Frontend & Offline Caching</span>
          </div>

          <div className="tech-card">
            <div className="tech-header">
              <Database className="h-5 w-5 text-emerald-400" />
              <span className="tech-name">IndexedDB (Dexie)</span>
            </div>
            <p>Client-side high-throughput database buffering biometric logs during orbital Loss of Signal (LOS).</p>
            <span className="tech-role">Edge-Native Persistence</span>
          </div>

          <div className="tech-card">
            <div className="tech-header">
              <Activity className="h-5 w-5 text-purple-400" />
              <span className="tech-name">FastAPI & Python</span>
            </div>
            <p>Async ASGI serverless backend handling REST ingestion, telemetry simulation, and automated clinical triage.</p>
            <span className="tech-role">Serverless Backend API</span>
          </div>

          <div className="tech-card">
            <div className="tech-header">
              <Sparkles className="h-5 w-5 text-amber-400" />
              <span className="tech-name">Supabase PostgreSQL</span>
            </div>
            <p>Managed cloud storage with Realtime Change Data Capture (CDC) for crew baselines and telemetry logs.</p>
            <span className="tech-role">Mission Cloud Reconciler</span>
          </div>
        </div>
      </section>

      {/* Core Mission Features Showcase */}
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
          <h3>Spaceflight Ergonomics</h3>
          <p>
            Built for extreme conditions with high-contrast visor filtering, synthesized Web Audio sonification alarms, and glove-accessible controls.
          </p>
          <div className="feature-tag">WCAG 2.1 AA Compliant</div>
        </div>
      </section>

      {/* Team BioTelemetry Section */}
      <section className="team-section animate-fade-in">
        <div className="section-title-wrap">
          <Users className="h-5 w-5 text-cyan-400" />
          <h2>Meet Team BioTelemetry</h2>
          <p>Collaborators united for the NASA International Space Apps Challenge 2026.</p>
        </div>

        <div className="team-grid">
          <div className="team-member-card">
            <div className="avatar-placeholder ring-cyan">JM</div>
            <div className="member-name">John Matthew Perez</div>
            <div className="member-handle">@jmprz</div>
            <div className="member-role">Team Owner</div>
          </div>

          <div className="team-member-card">
            <div className="avatar-placeholder ring-purple">TR</div>
            <div className="member-name">Trishtan Alexis Roxas</div>
            <div className="member-handle">@alexthetan1925</div>
            <div className="member-role">Core Developer</div>
          </div>

          <div className="team-member-card">
            <div className="avatar-placeholder ring-emerald">JB</div>
            <div className="member-name">Joem Manuel M. Balaguer</div>
            <div className="member-handle">@jomudesu</div>
            <div className="member-role">Collaborator</div>
          </div>

          <div className="team-member-card">
            <div className="avatar-placeholder ring-blue">CL</div>
            <div className="member-name">clarence librando</div>
            <div className="member-handle">@clarencelibrando</div>
            <div className="member-role">Collaborator</div>
          </div>

          <div className="team-member-card">
            <div className="avatar-placeholder ring-amber">RR</div>
            <div className="member-name">Renejule Regero</div>
            <div className="member-handle">@rjregero03</div>
            <div className="member-role">Collaborator</div>
          </div>
        </div>
      </section>

      {/* Bottom Footer */}
      <footer className="landing-footer">
        <div className="footer-left">
          <Compass className="h-4 w-4 text-cyan-400" />
          <span>NASA International Space Apps Challenge 2026 • Health Monitoring Software</span>
        </div>
        <div className="footer-right">
          <span>Developed by Team <strong>BioTelemetry</strong></span>
        </div>
      </footer>
    </div>
  );
};

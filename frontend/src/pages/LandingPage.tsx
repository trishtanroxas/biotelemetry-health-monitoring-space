import React from 'react';
import biotelemetryMark from '../assets/biotelemetry-mark.png';
import { PublicMissionGuideModal } from '../components/PublicMissionGuideModal';
import { 
  ArrowRight, 
  ExternalLink,
  Satellite,
  Radio,
  Layers,
  Database,
  Code2,
  Compass,
  CheckCircle2,
  Sparkles,
  ShieldAlert,
  Cpu,
  Workflow
} from 'lucide-react';

interface LandingPageProps {
  onEnterApp: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {

  return (
    <div className="landing-master">
      {/* Background Starfield and Fluid Space Lighting */}
      <div className="landing-space-backdrop" />
      <div className="landing-glow glow-cyan" />
      <div className="landing-glow glow-blue" />

      {/* SECTION 1: Natural Document Flow Navigation Header */}
      <header className="landing-nav">
        <div className="nav-inner">
          {/* Logo is Clickable -> Navigates to Dashboard */}
          <button 
            onClick={onEnterApp} 
            className="nav-brand-button"
            title="Launch BioTelemetry Dashboard"
            aria-label="BioTelemetry Home - Launch Dashboard"
          >
            <div className="brand-lockup">
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
          </button>

          <nav className="nav-links hidden lg:flex" aria-label="Landing page sections">
            <a href="#overview">Overview</a>
            <a href="#problem">The Mission</a>
            <a href="#autonomy">Autonomous Edge</a>
            <a href="#capabilities">Capabilities</a>
            <a href="#architecture">Architecture</a>
            <a href="#science">NASA Science</a>
            <a href="#team">Team</a>
          </nav>

          <div className="nav-cta-wrap">
            <button onClick={onEnterApp} className="btn-launch-primary">
              <span>Launch Dashboard</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* SECTION 1B: Cohesive Cinematic Hero Viewport */}
      <section id="overview" className="hero-section">
        <div className="hero-content-group">
          {/* 1. Live Mission Status Telemetry Ticker */}
          <div className="hero-status-strip animate-fade-in">
            <div className="status-item">
              <span className="live-dot" />
              <span>MISSION STATUS: <strong>ACTIVE</strong></span>
            </div>
            <span className="strip-divider" />
            <div className="status-item">
              <Satellite className="h-3.5 w-3.5 text-cyan-400" />
              <span>OPERATIONAL MODE: <strong>AUTONOMOUS</strong></span>
            </div>
            <span className="strip-divider" />
            <div className="status-item">
              <Radio className="h-3.5 w-3.5 text-blue-400" />
              <span>EARTH LINK: <strong>SIMULATED</strong></span>
            </div>
            <span className="strip-divider" />
            <div className="status-item">
              <span className="text-emerald-400 font-bold">SYSTEM: ONLINE</span>
            </div>
          </div>

          {/* 2. NASA International Space Apps Challenge 2026 Label */}
          <div className="hero-eyebrow animate-slide-up">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <span>NASA INTERNATIONAL SPACE APPS CHALLENGE 2026</span>
          </div>

          {/* 3. Main Headline */}
          <h1 className="hero-headline animate-slide-up">
            HEALTH MONITORING<br />
            <span className="blue-electric-text">DEEP SPACE.</span>
          </h1>

          {/* 4. Supporting Description */}
          <p className="hero-subhead animate-slide-up-delayed">
            An autonomous crew health monitoring architecture engineered to protect human life 
            across the final frontier — even when Earth is millions of miles away.
          </p>

          {/* 5. Explore the Platform and View GitHub Source Buttons */}
          <div className="hero-actions animate-slide-up-delayed">
            <button onClick={onEnterApp} className="hero-btn-main">
              <span>Explore the Platform</span>
              <ArrowRight className="h-5 w-5" />
            </button>
            <a 
              href="https://github.com/trishtanroxas/biotelemetry-health-monitoring-space" 
              target="_blank" 
              rel="noreferrer"
              className="hero-btn-ghost"
            >
              <ExternalLink className="h-4 w-4" />
              <span>View GitHub Source</span>
            </a>
          </div>
        </div>
      </section>

      {/* SECTION 2: The Problem (Editorial Layout) */}
      <section id="problem" className="editorial-problem-section">
        <div className="section-meta">
          <span className="section-number">01</span>
          <span className="section-tag">THE MISSION HAZARDS</span>
        </div>

        <div className="editorial-header">
          <h2 className="editorial-title">
            WHEN EARTH IS<br />
            <span className="blue-electric-text">TOO FAR AWAY.</span>
          </h2>
          <p className="editorial-lead">
            Human spaceflight beyond low Earth orbit removes the ultimate safety net: 
            immediate contact with terrestrial doctors and instant medical evacuation.
          </p>
        </div>

        {/* 4 Hazards Asymmetric Grid */}
        <div className="hazards-editorial-grid">
          <div className="hazard-entry">
            <div className="hazard-stat">22 MIN</div>
            <h3>1. Communication Latency</h3>
            <p>
              Light-speed signal travel introduces up to 22 minutes of one-way delay between Earth and Mars. 
              In acute cardiovascular collapse or sudden decompression, waiting for Houston is fatal.
            </p>
            <span className="hazard-annotation">NASA HRP RISK 01</span>
          </div>

          <div className="hazard-entry">
            <div className="hazard-stat">0 Mbps</div>
            <h3>2. Loss of Signal (LOS)</h3>
            <p>
              Celestial bodies and planetary occultations cause complete radio blackouts. 
              Crew biometrics must buffer locally on-device without crashing the application.
            </p>
            <span className="hazard-annotation">ORBITAL OCCULTATION</span>
          </div>

          <div className="hazard-entry">
            <div className="hazard-stat">SANS</div>
            <h3>3. Microgravity Adaptation</h3>
            <p>
              Cephalic fluid redistribution increases intracranial and intraocular pressure, 
              inducing Spaceflight-Associated Neuro-ocular Syndrome and cardiovascular deconditioning.
            </p>
            <span className="hazard-annotation">PHYSIOLOGICAL ADAPTATION</span>
          </div>

          <div className="hazard-entry">
            <div className="hazard-stat">600 mSv</div>
            <h3>4. Space Radiation</h3>
            <p>
              Galactic Cosmic Rays (GCR) and Solar Particle Events (SPE) damage cellular DNA. 
              Astronauts must actively monitor real-time rate alongside cumulative career limits.
            </p>
            <span className="hazard-annotation">NASA-STD-3001 BENCHMARK</span>
          </div>
        </div>
      </section>

      {/* SECTION 3: Autonomous Edge Bio-Resilience */}
      <section id="autonomy" className="autonomy-interactive-section">
        <div className="section-meta">
          <span className="section-number">02</span>
          <span className="section-tag">CORE INNOVATION</span>
        </div>

        <div className="editorial-header">
          <h2 className="editorial-title">
            INDEPENDENCE IS NOT OPTIONAL<br />
            <span className="blue-electric-text">IN DEEP SPACE.</span>
          </h2>
          <p className="editorial-lead">
            BioTelemetry brings critical health assessment directly onboard, enabling astronauts to monitor 
            physiological conditions, evaluate potential risks, and access actionable guidance without depending 
            on continuous communication with Earth.
          </p>
        </div>

        {/* Comparison: Earth vs Edge */}
        <div className="architecture-comparison-row">
          <div className="comp-col earth-comp">
            <h3>Earth-Assisted Mode (Near-Earth)</h3>
            <ul>
              <li><CheckCircle2 className="h-4 w-4 text-slate-500" /> Connected communication with ground network</li>
              <li><CheckCircle2 className="h-4 w-4 text-slate-500" /> Ground-assisted medical triage consultation</li>
              <li><CheckCircle2 className="h-4 w-4 text-slate-500" /> Continuous cloud telemetry synchronization</li>
              <li><CheckCircle2 className="h-4 w-4 text-slate-500" /> Remote physician monitoring dependence</li>
            </ul>
          </div>

          <div className="comp-col edge-comp">
            <div className="comp-badge">PRIMARY MISSION GOAL</div>
            <h3>Autonomous Edge Mode (Deep Space)</h3>
            <ul>
              <li><CheckCircle2 className="h-4 w-4 text-cyan-400" /> Local physiological assessment & triage engine</li>
              <li><CheckCircle2 className="h-4 w-4 text-cyan-400" /> Offline telemetry buffering in browser IndexedDB</li>
              <li><CheckCircle2 className="h-4 w-4 text-cyan-400" /> Immediate onboard audio and visual emergency alarms</li>
              <li><CheckCircle2 className="h-4 w-4 text-cyan-400" /> Automatic batch synchronization upon re-establishing link</li>
            </ul>
          </div>
        </div>
      </section>

      {/* SECTION 4: Platform Capabilities (Conceptual Architecture) */}
      <section id="capabilities" className="capabilities-editorial-section">
        <div className="section-meta">
          <span className="section-number">03</span>
          <span className="section-tag">CAPABILITIES</span>
        </div>

        <div className="editorial-header">
          <h2 className="editorial-title">
            PLATFORM CAPABILITIES &<br />
            <span className="blue-electric-text">CHALLENGE PILLARS.</span>
          </h2>
          <p className="editorial-lead">
            Engineered to fulfill NASA's challenge prompt across three foundational aerospace health pillars.
          </p>
        </div>

        <div className="three-features-columns">
          <div className="feature-col">
            <div className="col-num">01</div>
            <div className="col-icon text-cyan-400"><Satellite className="h-6 w-6" /></div>
            <h3>Deep Space Comms Latency Switcher</h3>
            <p>
              Simulates real interplanetary radio latency across ISS (50ms), Moon (1.3s), and Mars (14-22m), 
              demonstrating how the software seamlessly toggles between ground-assisted and autonomous edge operation.
            </p>
            <div className="feature-col-tag">Autonomous State Engine</div>
          </div>

          <div className="feature-col">
            <div className="col-num">02</div>
            <div className="col-icon text-emerald-400"><Cpu className="h-6 w-6" /></div>
            <h3>SANS & Microgravity Symptom Logger</h3>
            <p>
              Provides a lightweight, 3-step self-evaluation workflow enabling astronauts to log visual blurriness, 
              cephalic headaches, and space motion sickness directly into local persistent storage.
            </p>
            <div className="feature-col-tag">Crew Self-Evaluation</div>
          </div>

          <div className="feature-col">
            <div className="col-num">03</div>
            <div className="col-icon text-purple-400"><ShieldAlert className="h-6 w-6" /></div>
            <h3>Cumulative Radiation Tracker</h3>
            <p>
              Integrates real-time dosimeter flux with historical mission accumulation, mapped against official 
              NASA-STD-3001 600 mSv career exposure limits to safeguard crew long-term viability.
            </p>
            <div className="feature-col-tag">NASA-STD-3001 Benchmark</div>
          </div>
        </div>
      </section>

      {/* SECTION 5: Engineered Architecture & Frameworks */}
      <section id="architecture" className="architecture-editorial-section">
        <div className="section-meta">
          <span className="section-number">04</span>
          <span className="section-tag">ARCHITECTURE</span>
        </div>

        <div className="editorial-header">
          <h2 className="editorial-title">
            ENGINEERED ARCHITECTURE<br />
            <span className="blue-electric-text">& FRAMEWORKS.</span>
          </h2>
          <p className="editorial-lead">
            Built with modern, high-performance web standards engineered for extreme mission reliability.
          </p>
        </div>

        {/* Horizontal Interconnected Architecture Pipeline */}
        <div className="system-flow-strip">
          <div className="flow-step">
            <Code2 className="h-5 w-5 text-cyan-400" />
            <div className="flow-text">
              <strong>FRONTEND</strong>
              <span>React + Vite PWA</span>
            </div>
          </div>
          <div className="flow-arrow">➔</div>

          <div className="flow-step">
            <Database className="h-5 w-5 text-emerald-400" />
            <div className="flow-text">
              <strong>OFFLINE STORAGE</strong>
              <span>IndexedDB (Dexie)</span>
            </div>
          </div>
          <div className="flow-arrow">➔</div>

          <div className="flow-step">
            <Workflow className="h-5 w-5 text-purple-400" />
            <div className="flow-text">
              <strong>BACKEND API</strong>
              <span>FastAPI (Python)</span>
            </div>
          </div>
          <div className="flow-arrow">➔</div>

          <div className="flow-step">
            <Layers className="h-5 w-5 text-amber-400" />
            <div className="flow-text">
              <strong>CLOUD DATABASE</strong>
              <span>Supabase PostgreSQL</span>
            </div>
          </div>
        </div>

        {/* 4 Engineering Principles */}
        <div className="pillars-grid">
          <div className="pillar-block">
            <h4>1. Zero-Ground Autonomy</h4>
            <p>Client-side diagnostics continue functioning with 100% feature parity during telemetry dropouts.</p>
          </div>
          <div className="pillar-block">
            <h4>2. NASA Baseline Calibration</h4>
            <p>Calibrated using spaceflight data from the NASA Open Science Data Repository (OSDR).</p>
          </div>
          <div className="pillar-block">
            <h4>3. IndexedDB to Supabase Synchronization</h4>
            <p>Automatic batch synchronization resolves offline telemetry logs once signal links restore.</p>
          </div>
          <div className="pillar-block">
            <h4>4. Spaceflight Ergonomics</h4>
            <p>Glove-friendly controls, high-contrast helmet visor filtering, and synthesized audio alarms.</p>
          </div>
        </div>
      </section>

      {/* SECTION 6: NASA Scientific Foundation */}
      <section id="science" className="science-section">
        <div className="section-meta">
          <span className="section-number">05</span>
          <span className="section-tag">OPEN SCIENCE</span>
        </div>

        <div className="editorial-header">
          <h2 className="editorial-title">
            ENGINEERED WITH SCIENCE.<br />
            <span className="blue-electric-text">INSPIRED BY SPACE.</span>
          </h2>
          <p className="editorial-lead">
            Grounded in open science data repositories, flight surgeon operational standards, and clinical baselines.
          </p>
        </div>

        <div className="research-badges-flow">
          <div className="research-badge">
            <span className="badge-abbr">OSDR</span>
            <div>
              <strong>NASA Open Science Data Repository</strong>
              <p>Spaceflight biological omics & physiological adaptation datasets</p>
            </div>
          </div>

          <div className="research-badge">
            <span className="badge-abbr">RadLab</span>
            <div>
              <strong>NASA RadLab Dosimetry</strong>
              <p>ISS and deep-space radiation environment telemetry measurements</p>
            </div>
          </div>

          <div className="research-badge">
            <span className="badge-abbr">STD-3001</span>
            <div>
              <strong>NASA-STD-3001</strong>
              <p>NASA Space Flight Human-System Medical Standard criteria</p>
            </div>
          </div>

          <div className="research-badge">
            <span className="badge-abbr">HRP</span>
            <div>
              <strong>NASA Human Research Program</strong>
              <p>Hazards of Human Spaceflight risk framework & countermeasure guidelines</p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7: Team BioTelemetry */}
      <section id="team" className="team-editorial-section">
        <div className="section-meta">
          <span className="section-number">06</span>
          <span className="section-tag">THE COLLABORATORS</span>
        </div>

        <div className="editorial-header">
          <h2 className="editorial-title">
            THE PEOPLE BEHIND<br />
            <span className="blue-electric-text">THE MISSION.</span>
          </h2>
          <p className="editorial-lead">
            Team <strong>BioTelemetry</strong> united to engineer a more autonomous future for astronaut health monitoring.
          </p>
        </div>

        <div className="team-profiles-row">
          <div className="profile-card">
            <div className="profile-avatar-wrap ring-cyan">
              <img src="/team/perez.jpg" alt="John Matthew Perez" className="profile-avatar-img" />
            </div>
            <div className="profile-name">John Matthew Perez</div>
            <div className="profile-handle">@jmprz</div>
            <div className="profile-role">Frontend Developer & UI/UX Dev</div>
          </div>

          <div className="profile-card">
            <div className="profile-avatar-wrap ring-purple">
              <img src="/team/roxas.jpg" alt="Trishtan Alexis Roxas" className="profile-avatar-img" />
            </div>
            <div className="profile-name">Trishtan Alexis Roxas</div>
            <div className="profile-handle">@alexthetan1925</div>
            <div className="profile-role">Full-Stack Developer & Creative Technologist</div>
          </div>

          <div className="profile-card">
            <div className="profile-avatar-wrap ring-emerald">
              <img src="/team/balaguer.jpg" alt="Joem Manuel M. Balaguer" className="profile-avatar-img" />
            </div>
            <div className="profile-name">Joem Manuel M. Balaguer</div>
            <div className="profile-handle">@jomudesu</div>
            <div className="profile-role">Full-Stack Developer</div>
          </div>

          <div className="profile-card">
            <div className="profile-avatar-wrap ring-blue">
              <img src="/team/librando.jpg" alt="Clarence Librando" className="profile-avatar-img" />
            </div>
            <div className="profile-name">Clarence Librando</div>
            <div className="profile-handle">@clarencelibrando</div>
            <div className="profile-role">Backend Developer & CI/CD Automation</div>
          </div>

          <div className="profile-card">
            <div className="profile-avatar-wrap ring-amber">
              <img src="/team/regero.jpg" alt="Renejule Regero" className="profile-avatar-img" />
            </div>
            <div className="profile-name">Renejule Regero</div>
            <div className="profile-handle">@rjregero03</div>
            <div className="profile-role">Full-Stack Developer</div>
          </div>
        </div>
      </section>

      {/* SECTION 8: Final Call to Action */}
      <section className="final-cta-section">
        <div className="final-cta-inner">
          <div className="cta-icon-wrap">
            <Compass className="h-8 w-8 text-cyan-400 animate-spin-slow" />
          </div>
          <h2 className="cta-title">
            THE FUTURE OF SPACE HEALTH<br />
            <span className="blue-electric-text">IS AUTONOMOUS.</span>
          </h2>
          <p className="cta-text">
            Because when humanity ventures farther into space, the ability to protect human life must travel with us.
          </p>
          <div className="cta-buttons">
            <button onClick={onEnterApp} className="btn-launch-large">
              <span>Launch Mission Dashboard</span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 9: Master Footer */}
      <footer className="master-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <button 
              onClick={onEnterApp} 
              className="footer-logo-btn"
              title="Launch Dashboard"
            >
              <div className="brand-lockup">
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
            </button>
          </div>

          <div className="footer-links">
            <a href="#overview">Overview</a>
            <a href="#problem">Challenges</a>
            <a href="#autonomy">Autonomous Edge</a>
            <a href="#capabilities">Capabilities</a>
            <a href="#architecture">Architecture</a>
            <a href="#team">Team</a>
          </div>

          <div className="footer-meta">
            <span>NASA Space Apps Challenge 2026</span>
            <span>Developed by Team <strong>BioTelemetry</strong></span>
          </div>
        </div>
      </footer>

      {/* Floating Public AI Mission Guide */}
      <PublicMissionGuideModal />
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowRight, 
  ExternalLink,
  Satellite,
  Radio,
  HeartPulse,
  Activity,
  Layers,
  Database,
  Code2,
  Compass,
  CheckCircle2,
  Eye,
  Radiation,
  Flame,
  Clock,
  Sparkles
} from 'lucide-react';

interface LandingPageProps {
  onEnterApp: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {
  // Navigation scroll state for glass opacity transition
  const [scrolled, setScrolled] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<'ISS' | 'MOON' | 'MARS'>('MARS');

  // Real-time canvas ECG ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 60 FPS Canvas Waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let cursorX = 0;
    const speed = 2.5;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;

      ctx.fillStyle = 'rgba(7, 20, 38, 0.2)';
      ctx.fillRect(0, 0, w, h);

      // Erase bar ahead
      const nextX = (cursorX + speed) % w;
      ctx.fillStyle = '#071426';
      ctx.fillRect(nextX, 0, 16, h);

      // Synthesize pulse
      const t = performance.now() / 1000;
      const hz = 1.15; // ~69 BPM
      const phase = (t * hz) % 1.0;
      let val = 0;
      if (phase > 0.38 && phase < 0.44) {
        val = 1.35 * Math.sin(((phase - 0.38) / 0.06) * Math.PI);
      }

      ctx.strokeStyle = '#00d9ff';
      ctx.shadowColor = '#00d9ff';
      ctx.shadowBlur = 6;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(cursorX, mid);
      ctx.lineTo(nextX, mid - val * 38);
      ctx.stroke();
      ctx.shadowBlur = 0;

      cursorX = nextX;
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  const scenarioDetails = {
    ISS: {
      distance: '408 km',
      latency: '50 ms (Real-time)',
      mode: 'GROUND ASSISTED',
      status: 'Live Earth Telemedicine Active',
      color: 'text-emerald-400',
      badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
      description: 'Continuous low-orbit communication with Houston Mission Control flight surgeons.'
    },
    MOON: {
      distance: '384,400 km',
      latency: '1.3 sec delay',
      mode: 'HYBRID CO-PILOT',
      status: 'Lunar Gateway Telemetry Link',
      color: 'text-cyan-400',
      badge: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400',
      description: 'Noticeable round-trip delay. Onboard edge AI pre-screens vitals before Earth uplink.'
    },
    MARS: {
      distance: '225,000,000 km',
      latency: '14 to 22 min one-way',
      mode: 'AUTONOMOUS EDGE ACTIVE',
      status: 'Loss of Signal Resilient (IndexedDB)',
      color: 'text-purple-400',
      badge: 'border-purple-500/40 bg-purple-500/10 text-purple-400',
      description: 'Earth is too far. BioTelemetry performs autonomous clinical triage directly onboard.'
    }
  };

  const curr = scenarioDetails[selectedScenario];

  return (
    <div className="landing-master">
      {/* Background Starfield and Fluid Space Lighting */}
      <div className="landing-space-backdrop" />
      <div className="landing-glow glow-cyan" />
      <div className="landing-glow glow-blue" />

      {/* SECTION 1: Sticky Navigation Header */}
      <header className={`landing-nav ${scrolled ? 'nav-scrolled' : ''}`}>
        <div className="nav-inner">
          <div className="nav-brand">
            <img 
              src="/branding/actual-logo.png" 
              alt="BioTelemetry Logo" 
              className="nav-logo-img"
            />
          </div>

          <nav className="nav-links hidden lg:flex">
            <a href="#overview">Overview</a>
            <a href="#problem">The Mission</a>
            <a href="#autonomy">Autonomous Edge</a>
            <a href="#capabilities">Telemetry</a>
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

      {/* SECTION 1B: Hero Section */}
      <section id="overview" className="hero-section">
        {/* Live Mission Status Telemetry Ticker */}
        <div className="hero-status-strip animate-fade-in">
          <div className="status-item">
            <span className="live-dot" />
            <span>MISSION STATUS: <strong>ACTIVE</strong></span>
          </div>
          <span className="strip-divider" />
          <div className="status-item">
            <Satellite className="h-3.5 w-3.5 text-cyan-400" />
            <span>LINK: <strong>AUTONOMOUS EDGE</strong></span>
          </div>
          <span className="strip-divider" />
          <div className="status-item">
            <Radio className="h-3.5 w-3.5 text-blue-400" />
            <span>COMM DELAY: <strong>14 MIN MARS</strong></span>
          </div>
          <span className="strip-divider" />
          <div className="status-item">
            <span className="text-emerald-400 font-bold">SYSTEM: ONLINE</span>
          </div>
        </div>

        {/* Hero Editorial Composition */}
        <div className="hero-editorial">
          <div className="hero-eyebrow">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <span>NASA INTERNATIONAL SPACE APPS CHALLENGE 2026</span>
          </div>

          <h1 className="hero-headline">
            HEALTH MONITORING<br />
            <span className="blue-electric-text">DEEP SPACE.</span>
          </h1>

          <p className="hero-subhead">
            An autonomous crew health monitoring architecture engineered to protect human life 
            across the final frontier — even when Earth is millions of miles away.
          </p>

          <div className="hero-actions">
            <button onClick={onEnterApp} className="hero-btn-main">
              <span>Explore Mission Dashboard</span>
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

        {/* Floating Telemetry HUD Window */}
        <div className="hero-hud-preview animate-slide-up">
          <div className="hud-header">
            <div className="hud-title-wrap">
              <HeartPulse className="h-4 w-4 text-cyan-400 animate-pulse" />
              <span className="hud-title">REAL-TIME BIOTELEMETRY STREAM • LEAD II ECG</span>
            </div>
            <div className="hud-chips">
              <span className="hud-chip">60 FPS CANVAS</span>
              <span className="hud-chip chip-cyan">SIMULATED SENSORS</span>
            </div>
          </div>
          
          <div className="hud-canvas-container">
            <canvas ref={canvasRef} width={820} height={130} className="hud-canvas" />
            <div className="hud-canvas-overlay">
              <div className="overlay-metric">
                <span className="metric-label">PULSE RATE</span>
                <span className="metric-value">69.2 <small>BPM</small></span>
              </div>
              <div className="overlay-metric">
                <span className="metric-label">BLOOD O2 (SPO2)</span>
                <span className="metric-value">98.4 <small>%</small></span>
              </div>
              <div className="overlay-metric">
                <span className="metric-label">DOSIMETER FLUX</span>
                <span className="metric-value">14.2 <small>μSv/h</small></span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: The Problem (Editorial Layout) */}
      <section id="problem" className="editorial-problem-section">
        <div className="section-meta">
          <span className="section-number">01</span>
          <span className="section-tag">THE PROBLEM</span>
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
            <h3>Communication Latency</h3>
            <p>
              Light-speed signal travel introduces up to 22 minutes of one-way delay between Earth and Mars. 
              In acute cardiovascular collapse or sudden decompression, waiting for Houston is fatal.
            </p>
            <span className="hazard-annotation">NASA HRP RISK 01</span>
          </div>

          <div className="hazard-entry">
            <div className="hazard-stat">0 Mbps</div>
            <h3>Loss of Signal (LOS)</h3>
            <p>
              Celestial bodies and planetary occultations cause complete radio blackouts. 
              Crew biometrics must buffer locally on-device without crashing the application.
            </p>
            <span className="hazard-annotation">ORBITAL OCCULTATION</span>
          </div>

          <div className="hazard-entry">
            <div className="hazard-stat">SANS</div>
            <h3>Microgravity Fluid Shift</h3>
            <p>
              Cephalic fluid redistribution increases intracranial and intraocular pressure, 
              inducing Spaceflight-Associated Neuro-ocular Syndrome and cardiovascular deconditioning.
            </p>
            <span className="hazard-annotation">PHYSIOLOGICAL ADAPTATION</span>
          </div>

          <div className="hazard-entry">
            <div className="hazard-stat">600 mSv</div>
            <h3>Deep Space Radiation</h3>
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

        {/* Interactive Mission Link Simulator */}
        <div className="comms-simulator-hud">
          <div className="sim-header">
            <span className="sim-label">INTERACTIVE COMMUNICATION LINK SIMULATOR</span>
            <div className="sim-toggles">
              {(['ISS', 'MOON', 'MARS'] as const).map(dest => (
                <button
                  key={dest}
                  onClick={() => setSelectedScenario(dest)}
                  className={`sim-toggle-btn ${selectedScenario === dest ? 'active' : ''}`}
                >
                  {dest}
                </button>
              ))}
            </div>
          </div>

          <div className="sim-dashboard-body">
            <div className="sim-node earth-node">
              <div className="node-icon">🌍</div>
              <div className="node-info">
                <h4>Earth Mission Control</h4>
                <p>Houston Flight Surgeon Gateway</p>
              </div>
            </div>

            <div className="sim-beam">
              <div className="beam-line" />
              <div className="beam-pulse" />
              <div className="beam-label">
                <Clock className="h-3.5 w-3.5 text-cyan-400" />
                <span>{curr.latency}</span>
              </div>
            </div>

            <div className="sim-node spacecraft-node">
              <div className="node-icon">🚀</div>
              <div className="node-info">
                <h4>Crew Spacecraft Hub</h4>
                <span className={`node-mode-badge ${curr.badge}`}>{curr.mode}</span>
              </div>
            </div>
          </div>

          <div className="sim-footer">
            <div className="sim-status-text">
              <span className={`sim-state-dot ${selectedScenario === 'MARS' ? 'dot-purple' : 'dot-cyan'}`} />
              <span>{curr.status}</span>
            </div>
            <p className="sim-desc">{curr.description}</p>
          </div>
        </div>

        {/* Comparison: Earth vs Edge */}
        <div className="architecture-comparison-row">
          <div className="comp-col earth-comp">
            <h3>Earth-Assisted Mode (Near-Earth)</h3>
            <ul>
              <li><CheckCircle2 className="h-4 w-4 text-slate-500" /> Continuous ground server communication</li>
              <li><CheckCircle2 className="h-4 w-4 text-slate-500" /> Telemedicine consultation with Earth doctors</li>
              <li><CheckCircle2 className="h-4 w-4 text-slate-500" /> Remote analysis of raw ECG signals</li>
              <li><CheckCircle2 className="h-4 w-4 text-slate-500" /> Cloud database dependency</li>
            </ul>
          </div>

          <div className="comp-col edge-comp">
            <div className="comp-badge">PRIMARY FOCUS</div>
            <h3>Autonomous Edge Mode (Deep Space)</h3>
            <ul>
              <li><CheckCircle2 className="h-4 w-4 text-cyan-400" /> Local physiological assessment & triage</li>
              <li><CheckCircle2 className="h-4 w-4 text-cyan-400" /> On-device IndexedDB telemetry buffering during blackouts</li>
              <li><CheckCircle2 className="h-4 w-4 text-cyan-400" /> Immediate onboard audio and visual alerts</li>
              <li><CheckCircle2 className="h-4 w-4 text-cyan-400" /> Automatic cloud batch sync when connection restores</li>
            </ul>
          </div>
        </div>
      </section>

      {/* SECTION 4: Live Capabilities Showcase */}
      <section id="capabilities" className="capabilities-editorial-section">
        <div className="section-meta">
          <span className="section-number">03</span>
          <span className="section-tag">CAPABILITIES</span>
        </div>

        <div className="editorial-header">
          <h2 className="editorial-title">
            EVERY SIGNAL<br />
            <span className="blue-electric-text">MATTERS.</span>
          </h2>
          <p className="editorial-lead">
            High-frequency cardiovascular waveforms, multi-sensor vitals, and cosmic radiation exposure 
            synthesized into a single, high-contrast operational cockpit.
          </p>
        </div>

        <div className="signals-metrics-board">
          <div className="signal-box primary-signal">
            <div className="signal-head">
              <HeartPulse className="h-5 w-5 text-cyan-400" />
              <span>ELECTROCARDIOGRAM (LEAD II)</span>
            </div>
            <div className="signal-numeric">69 <small>BPM</small></div>
            <p>60 FPS Canvas hardware-accelerated P-Q-R-S-T wave rendering without React re-render lag.</p>
          </div>

          <div className="signal-box">
            <div className="signal-head">
              <Activity className="h-4 w-4 text-emerald-400" />
              <span>BLOOD OXYGEN (SPO2)</span>
            </div>
            <div className="signal-numeric">98.4 <small>%</small></div>
            <p>Immediate hypoxia alarm triggered when saturation drops below 94%.</p>
          </div>

          <div className="signal-box">
            <div className="signal-head">
              <Radiation className="h-4 w-4 text-purple-400" />
              <span>RADLAB DOSIMETRY</span>
            </div>
            <div className="signal-numeric">14.2 <small>μSv/h</small></div>
            <p>Live flux rate paired with career limit accumulation counters.</p>
          </div>

          <div className="signal-box">
            <div className="signal-head">
              <Flame className="h-4 w-4 text-amber-400" />
              <span>CORE TEMPERATURE</span>
            </div>
            <div className="signal-numeric">36.8 <small>°C</small></div>
            <p>Monitors circadian rhythm shifts and thermal suit anomalies.</p>
          </div>
        </div>
      </section>

      {/* SECTION 5: Three Core Challenge Features */}
      <section className="three-features-section">
        <div className="section-meta">
          <span className="section-number">04</span>
          <span className="section-tag">CHALLENGE FEATURES</span>
        </div>

        <div className="editorial-header">
          <h2 className="editorial-title">
            ENGINEERED FOR THE<br />
            <span className="blue-electric-text">EXTREME ENVIRONMENT.</span>
          </h2>
        </div>

        <div className="three-features-columns">
          <div className="feature-col">
            <div className="col-num">A</div>
            <div className="col-icon text-cyan-400"><Satellite className="h-6 w-6" /></div>
            <h3>Comms Latency Switcher</h3>
            <p>
              Simulates real interplanetary radio latency across ISS (50ms), Moon (1.3s), and Mars (14-22m), 
              demonstrating automatic transition to Autonomous Onboard Edge Mode.
            </p>
          </div>

          <div className="feature-col">
            <div className="col-num">B</div>
            <div className="col-icon text-emerald-400"><Eye className="h-6 w-6" /></div>
            <h3>SANS & Space Adaptation Logger</h3>
            <p>
              Empowers astronauts to self-evaluate visual disturbances (SANS), cephalic pressure, 
              and space motion sickness, correlating reports with live biometric trends.
            </p>
          </div>

          <div className="feature-col">
            <div className="col-num">C</div>
            <div className="col-icon text-purple-400"><Radiation className="h-6 w-6" /></div>
            <h3>Cumulative Radiation Tracker</h3>
            <p>
              Tracks instantaneous dosimeter flux alongside cumulative mission dosage, mapped directly 
              against NASA-STD-3001 600 mSv career radiation limits.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 6: Engineered Architecture & Frameworks */}
      <section id="architecture" className="architecture-editorial-section">
        <div className="section-meta">
          <span className="section-number">05</span>
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

        {/* Pipeline System Flow */}
        <div className="system-flow-strip">
          <div className="flow-step">
            <Code2 className="h-5 w-5 text-cyan-400" />
            <div className="flow-text">
              <strong>React + Vite PWA</strong>
              <span>Sub-second UI booting</span>
            </div>
          </div>
          <div className="flow-arrow">➔</div>

          <div className="flow-step">
            <Database className="h-5 w-5 text-emerald-400" />
            <div className="flow-text">
              <strong>IndexedDB (Dexie)</strong>
              <span>Zero-latency offline buffer</span>
            </div>
          </div>
          <div className="flow-arrow">➔</div>

          <div className="flow-step">
            <Activity className="h-5 w-5 text-purple-400" />
            <div className="flow-text">
              <strong>FastAPI & Python</strong>
              <span>Serverless triage engine</span>
            </div>
          </div>
          <div className="flow-arrow">➔</div>

          <div className="flow-step">
            <Layers className="h-5 w-5 text-amber-400" />
            <div className="flow-text">
              <strong>Supabase PostgreSQL</strong>
              <span>Realtime cloud sync</span>
            </div>
          </div>
        </div>

        {/* 4 Pillars Editorial Blocks */}
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
            <h4>3. IndexedDB to Cloud Sync</h4>
            <p>Automatic batch synchronization resolves offline telemetry logs once signal links restore.</p>
          </div>
          <div className="pillar-block">
            <h4>4. Spaceflight Ergonomics</h4>
            <p>Glove-friendly controls, high-contrast helmet visor filtering, and synthesized audio alarms.</p>
          </div>
        </div>
      </section>

      {/* SECTION 7: NASA Scientific Foundation */}
      <section id="science" className="science-section">
        <div className="section-meta">
          <span className="section-number">06</span>
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
              <p>Spaceflight biological omics & physiological studies</p>
            </div>
          </div>

          <div className="research-badge">
            <span className="badge-abbr">RadLab</span>
            <div>
              <strong>NASA RadLab Dosimetry</strong>
              <p>ISS and Artemis I radiation environment measurements</p>
            </div>
          </div>

          <div className="research-badge">
            <span className="badge-abbr">STD-3001</span>
            <div>
              <strong>NASA-STD-3001</strong>
              <p>Space Flight Human-System Medical Standard</p>
            </div>
          </div>

          <div className="research-badge">
            <span className="badge-abbr">PhysioNet</span>
            <div>
              <strong>PhysioNet MIT-BIH</strong>
              <p>Clinical benchmark electrocardiogram waveforms</p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 8: Team BioTelemetry */}
      <section id="team" className="team-editorial-section">
        <div className="section-meta">
          <span className="section-number">07</span>
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
            <div className="profile-avatar ring-cyan">JM</div>
            <div className="profile-name">John Matthew Perez</div>
            <div className="profile-handle">@jmprz</div>
            <div className="profile-role">TEAM OWNER</div>
          </div>

          <div className="profile-card">
            <div className="profile-avatar ring-purple">TR</div>
            <div className="profile-name">Trishtan Alexis Roxas</div>
            <div className="profile-handle">@alexthetan1925</div>
            <div className="profile-role">CORE DEVELOPER</div>
          </div>

          <div className="profile-card">
            <div className="profile-avatar ring-emerald">JB</div>
            <div className="profile-name">Joem Manuel M. Balaguer</div>
            <div className="profile-handle">@jomudesu</div>
            <div className="profile-role">COLLABORATOR</div>
          </div>

          <div className="profile-card">
            <div className="profile-avatar ring-blue">CL</div>
            <div className="profile-name">clarence librando</div>
            <div className="profile-handle">@clarencelibrando</div>
            <div className="profile-role">COLLABORATOR</div>
          </div>

          <div className="profile-card">
            <div className="profile-avatar ring-amber">RR</div>
            <div className="profile-name">Renejule Regero</div>
            <div className="profile-handle">@rjregero03</div>
            <div className="profile-role">COLLABORATOR</div>
          </div>
        </div>
      </section>

      {/* SECTION 9: Final Call to Action */}
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

      {/* SECTION 10: Footer */}
      <footer className="master-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <img 
              src="/branding/actual-logo.png" 
              alt="BioTelemetry" 
              className="footer-logo-img"
            />
            <p>Human Health • Beyond Earth</p>
          </div>

          <div className="footer-links">
            <a href="#overview">Overview</a>
            <a href="#problem">Challenges</a>
            <a href="#autonomy">Autonomous Edge</a>
            <a href="#capabilities">Telemetry</a>
            <a href="#architecture">Architecture</a>
            <a href="#team">Team</a>
          </div>

          <div className="footer-meta">
            <span>NASA Space Apps Challenge 2026</span>
            <span>Developed by Team <strong>BioTelemetry</strong></span>
          </div>
        </div>
      </footer>
    </div>
  );
};

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { LayoutDashboard, ClipboardCheck, BarChart3, Orbit, Sparkles, Wifi, WifiOff, ChevronRight, ChevronDown, Volume2, VolumeX, Contrast, RefreshCw, ArrowLeft, Settings } from 'lucide-react';
import type { Astronaut } from '../types/telemetry';
import type { Page } from '../types/wellness';
import { NotificationCenter } from './NotificationCenter';
import { ToastContainer } from './ToastContainer';

export const navigation = [
  { id: 'dashboard' as const, label: 'Home', shortLabel: 'Home', icon: LayoutDashboard },
  { id: 'checkin' as const, label: 'Check-In', shortLabel: 'Check-In', icon: ClipboardCheck },
  { id: 'analytics' as const, label: 'Trends', shortLabel: 'Trends', icon: BarChart3 },
  { id: 'missions' as const, label: 'Daily Activities', shortLabel: 'Activities', icon: Orbit },
  { id: 'ai' as const, label: 'AI Assistant', shortLabel: 'Assistant', icon: Sparkles },
];
export function BrandLogo({ compact = false }: { compact?: boolean }) {
  const [missing, setMissing] = useState(false);
  return <div className="brand"><div className="brand-mark">{missing ? <span role="status">Logo unavailable</span> : <img src="/branding/biotelemetry-logo.png" alt={compact ? "BioTelemetry" : ""} onError={() => setMissing(true)} />}</div>{!compact && <div><strong>Bio<span>Telemetry</span></strong><small>HUMAN HEALTH. BEYOND EARTH.</small></div>}</div>;
}
export function ConnectionStatus({ offline, gateway }: { offline: boolean; gateway: boolean }) {
  return <span role="status" className={`connection ${offline ? 'warning' : gateway ? 'success' : ''}`}>{offline ? <WifiOff size={15} /> : <Wifi size={15} />}{offline ? 'Offline · saved on this device' : gateway ? 'Connected · demo measurements' : 'Demo · server unavailable'}</span>;
}
interface ShellProps {
  children: ReactNode; page: Page; crew: Astronaut[]; activeId: string; selectCrew(id: string): void;
  crewDemo: boolean; offline: boolean; gateway: boolean; los: boolean; toggleLos(): void;
  pending: number; syncing: boolean; sync(): void; sound: boolean; toggleSound(): void;
  contrast: boolean; toggleContrast(): void;
}
export function AppShell(props: ShellProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const current = navigation.find(item => item.id === props.page)!;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSettingsOpen(false);
      }
    }
    if (settingsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [settingsOpen]);

  return <div className={`app-shell ${props.contrast ? 'high-contrast' : ''}`}>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a>
    <aside className="sidebar">
      <a href="#dashboard" className="brand-link" aria-label="BioTelemetry Home"><BrandLogo /></a>
      <div className="workspace-label">CREW WORKSPACE <span>01</span></div>
      <nav aria-label="Main navigation" className="side-nav">
        <a href="#landing" className="nav-back-to-home" title="Return to Landing Page">
          <ArrowLeft size={18} />
          <span>Back to Home</span>
        </a>
        {navigation.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} aria-current={props.page === id ? 'page' : undefined}><Icon size={20} /><span>{label}</span>{props.page === id && <ChevronRight size={16} />}</a>)}
      </nav>
      <div className="sidebar-footer"><span className="status-dot" /> SPACE APPS CHALLENGE 2026<small>Monitoring Human Health Beyond Earth</small></div>
    </aside>
    <div className="main-shell">
      {/* Consolidated Single-Row Sticky Header Container */}
      <header className="unified-sticky-header">
        <div className="header-row-main">
          {/* LEFT SIDE: Back to Home, Mobile Brand, Breadcrumb */}
          <div className="topbar-left-wrap">
            <a href="#landing" className="topbar-back-home" title="Return to Landing Page">
              <ArrowLeft size={16} />
              <span>Back to Home</span>
            </a>
            <a href="#dashboard" className="mobile-brand" aria-label="BioTelemetry Home">
              <BrandLogo compact />
            </a>
            <div className="breadcrumb">
              Crew workspace <ChevronRight size={14} />
              <strong>{current.label}</strong>
              <span className="demo-experience-tag">
                · {props.crewDemo ? 'sample crew' : 'selected crew'}
              </span>
            </div>
          </div>

          {/* RIGHT SIDE: Connection status, Settings & connection, Notification bell, Crew avatar & dropdown */}
          <div className="topbar-right">
            <ConnectionStatus offline={props.offline} gateway={props.gateway} />

            {props.pending > 0 && (
              <button 
                className="button secondary pending-records compact-pending" 
                disabled={props.offline || props.syncing} 
                onClick={props.sync}
                title={`${props.pending} measurements not yet sent`}
              >
                <RefreshCw size={13} />
                <span>{props.syncing ? 'Sending…' : `${props.pending} unsent`}</span>
              </button>
            )}

            <div className="header-settings-dropdown-wrapper" ref={settingsRef}>
              <button
                type="button"
                className={`header-settings-btn ${settingsOpen ? 'active' : ''}`}
                onClick={() => setSettingsOpen(prev => !prev)}
                aria-expanded={settingsOpen}
                aria-haspopup="true"
                aria-label="Settings and connection controls"
                title="Settings & connection"
              >
                <Settings size={15} />
                <span className="header-settings-label">Settings</span>
                <ChevronDown size={13} className={`settings-chevron ${settingsOpen ? 'rotate-180' : ''}`} />
              </button>

              {settingsOpen && (
                <div className="header-settings-popover" role="menu">
                  <div className="header-settings-popover-header">
                    <h4>Settings & Connection</h4>
                    <span className="helper">Offline & system preferences</span>
                  </div>
                  <div className="utility-actions">
                    <button 
                      type="button"
                      onClick={props.toggleSound} 
                      aria-pressed={props.sound}
                      className="settings-action-btn"
                    >
                      {props.sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
                      <span>Sound {props.sound ? 'on' : 'off'}</span>
                    </button>
                    <button 
                      type="button"
                      onClick={props.toggleContrast} 
                      aria-pressed={props.contrast}
                      className="settings-action-btn"
                    >
                      <Contrast size={16} />
                      <span>High contrast {props.contrast ? 'on' : 'off'}</span>
                    </button>
                    <button 
                      type="button"
                      onClick={props.toggleLos} 
                      aria-pressed={props.los}
                      className="settings-action-btn"
                    >
                      <WifiOff size={15} />
                      <span>{props.los ? 'End offline test' : 'Test offline mode'}</span>
                    </button>
                    <p className="helper">
                      The offline test stores simulated measurements on this device. Reconnect to send them. Records stay here until the server confirms they were saved.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <NotificationCenter />

            <div className="crew-select">
              <span className="avatar">
                {props.crew.find(a => a.id === props.activeId)?.name.split(' ').filter(s => s !== 'Dr.').map(s => s[0]).slice(0, 2).join('')}
              </span>
              <label>
                <span className="sr-only">Select astronaut{props.crewDemo ? ' (demo crew)' : ''}</span>
                <select aria-label="Select astronaut" value={props.activeId} onChange={e => props.selectCrew(e.target.value)}>
                  {props.crew.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}
                </select>
              </label>
            </div>
          </div>
        </div>
      </header>

      <ToastContainer />
      <main id="main-content" tabIndex={-1}>{props.children}</main>
      <footer className="page-footer"><span>BioTelemetry <span className="muted">/ Designed for the human side of exploration</span></span><span>SIMULATION ENVIRONMENT</span></footer>
    </div>
    <nav className="bottom-nav" aria-label="Mobile navigation">{navigation.map(({ id, label, shortLabel, icon: Icon }) => <a key={id} href={`#${id}`} aria-label={label} aria-current={props.page === id ? 'page' : undefined}><Icon size={21} /><span>{shortLabel}</span></a>)}</nav>
  </div>;
}
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-state"><BarChart3 size={28} /><h3>{title}</h3><p>{children}</p></div>;
}
export function MissionProgress({ completed, total = 9 }: { completed: number; total?: number }) {
  return <div className="mission-progress"><div className="row"><span>Today’s completion</span><strong>{completed}<span className="muted"> / {total}</span></strong></div><progress aria-label="Daily activities completed" value={completed} max={total} /><small>Activities completed today, not a measure of health.</small></div>;
}
export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}




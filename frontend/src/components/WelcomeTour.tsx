import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ClipboardCheck, Orbit, Play, ShieldCheck, X } from 'lucide-react';
import { Modal } from './Modal';
import { isWelcomeHidden, placeTourCard, saveWelcomePreference, tourSteps, type TourRect } from '../services/onboarding';

function useTourPosition(active: boolean, step: number, card: RefObject<HTMLDivElement>) {
  const [position, setPosition] = useState<{ target: TourRect | null; card: ReturnType<typeof placeTourCard> } | null>(null);
  useEffect(() => {
    if (!active) { setPosition(null); return; }
    let target: HTMLElement | undefined, locateFrame = 0, updateFrame = 0, attempts = 0, stopped = false;
    let observer: ResizeObserver | undefined;
    const update = () => {
      if (stopped) return;
      const width = window.innerWidth, height = window.innerHeight;
      const rect = target?.getBoundingClientRect();
      const visible = rect && rect.bottom > 0 && rect.top < height && rect.right > 0 && rect.left < width;
      const focus = visible ? {
        left: Math.max(8, rect.left - 6), top: Math.max(8, rect.top - 6),
        width: Math.max(1, Math.min(width - 8, rect.right + 6) - Math.max(8, rect.left - 6)),
        height: Math.max(1, Math.min(height - 8, rect.bottom + 6) - Math.max(8, rect.top - 6)),
      } : null;
      const next = { target: focus, card: placeTourCard(focus, { width, height }, card.current?.offsetHeight ?? 310) };
      setPosition(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const queue = () => { cancelAnimationFrame(updateFrame); updateFrame = requestAnimationFrame(update); };
    const locate = () => {
      if (stopped) return;
      observer?.disconnect(); observer = undefined;
      target = Array.from(document.querySelectorAll<HTMLElement>(tourSteps[step].selector))
        .find(element => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0);
      if (!target && attempts++ < 60) { locateFrame = requestAnimationFrame(locate); return; }
      if (target) {
        const rect = target.getBoundingClientRect();
        if (getComputedStyle(target).position !== 'fixed') {
          const cardHeight = card.current?.offsetHeight ?? 310;
          const desiredTop = Math.max(20, (window.innerHeight - rect.height - cardHeight - 28) / 2);
          window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - desiredTop), behavior: 'instant' });
        }
        observer = new ResizeObserver(queue); observer.observe(target);
      }
      if (card.current) { observer ??= new ResizeObserver(queue); observer.observe(card.current); }
      queue();
    };
    setPosition(null); locate();
    window.addEventListener('scroll', queue, true); window.addEventListener('resize', locate);
    return () => { stopped = true; cancelAnimationFrame(locateFrame); cancelAnimationFrame(updateFrame); observer?.disconnect(); window.removeEventListener('scroll', queue, true); window.removeEventListener('resize', locate); };
  }, [active, step, card]);
  return position;
}

export function WelcomeTour({ open, onClose }: { open: boolean; onClose(): void }) {
  const [mode, setMode] = useState<'welcome' | 'tour'>('welcome');
  const [step, setStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [preferenceError, setPreferenceError] = useState('');
  const card = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const position = useTourPosition(open && mode === 'tour', step, card);
  useEffect(() => {
    if (!open) return;
    setMode('welcome'); setStep(0); setPreferenceError('');
    try { setDontShowAgain(isWelcomeHidden(window.localStorage)); }
    catch { setDontShowAgain(false); }
  }, [open]);
  const ready = !!position;
  useEffect(() => { if (open && mode === 'tour' && ready) heading.current?.focus({ preventScroll: true }); }, [open, mode, step, ready]);

  function updatePreference(checked: boolean) {
    try {
      if (!saveWelcomePreference(window.localStorage, checked)) throw new Error('Preference unavailable');
      setDontShowAgain(checked); setPreferenceError('');
    } catch {
      setPreferenceError('Could not save this preference. The welcome may appear again after refresh.');
    }
  }
  function finish(checkIn = false) {
    onClose();
    if (checkIn) window.location.hash = 'checkin';
  }
  function start() {
    window.location.hash = 'dashboard'; setStep(0); setMode('tour');
  }
  const current = tourSteps[step], last = step === tourSteps.length - 1;
  return <Modal open={open} onClose={() => finish()} chrome={mode === 'welcome'} className={mode === 'welcome' ? 'welcome-dialog' : 'tour-dialog'}
    title={mode === 'welcome' ? 'Welcome to BioTelemetry.' : current.title}
    eyebrow={mode === 'welcome' ? 'YOUR SPACE-HEALTH WORKSPACE' : undefined}
    description={mode === 'welcome' ? 'Your daily wellness, with space research in view.' : undefined}
    footer={<><div className="welcome-preference"><label><input type="checkbox" checked={dontShowAgain} onChange={event => updatePreference(event.target.checked)} />Don’t show again</label><span>Applies to this browser. Replay anytime from How it works.</span>{preferenceError && <p role="status">{preferenceError}</p>}</div><button type="button" className="button secondary" onClick={() => finish()}>Explore on my own</button><button type="button" className="button primary" onClick={start}>Show me around<ArrowRight size={17} /></button></>}>
    {mode === 'welcome' ? <div className="welcome-layout">
      <div className="welcome-copy"><span className="welcome-mark"><Orbit size={28} /></span><h3>A small daily log.<br />A connection to the science.</h3><p>Record how you feel, look back at your patterns, and explore the NASA research behind health in space.</p><div className="welcome-steps"><span><ClipboardCheck size={17} />Record your day</span><span><BookOpen size={17} />Understand the context</span><span><Play size={17} />Try a fictional week</span></div><p className="welcome-duration">5 short stops · Go at your own pace</p></div>
      <div className="welcome-preview" aria-label="What you will find in the workspace"><div className="welcome-preview-heading"><span className="status-dot" /><span>A look inside</span><Orbit size={17} /></div><div className="welcome-preview-checkin"><ClipboardCheck size={21} /><div><strong>How was your day?</strong><span>Sleep · Wellbeing · Activity</span></div><Check size={17} /></div><div className="welcome-preview-cards"><div><BookOpen size={20} /><strong>Four focus areas</strong><span>Observations + research</span></div><div><ShieldCheck size={20} /><strong>Your own history</strong><span>Saved on this device</span></div></div><div className="welcome-preview-note"><BookOpen size={16} /><span>Source labels keep personal observations, research and demo values distinct.</span></div></div>
    </div> : <>
      {position?.target && <div className="tour-spotlight" aria-hidden="true" style={{ left: position.target.left, top: position.target.top, width: position.target.width, height: position.target.height }} />}
      {!position?.target && <div className="tour-dim" aria-hidden="true" />}
      <div ref={card} className="tour-card" data-ready={ready || undefined} data-step={current.id} data-placement={position?.card.placement} style={position ? { left: position.card.left, top: position.card.top, width: position.card.width } : undefined}>
        <div className="tour-card-top"><span className="eyebrow">{current.label}</span><button type="button" className="icon-button" aria-label="Close guided tour" onClick={() => finish()}><X size={18} /></button></div>
        <p className="tour-progress" role="status">Step {step + 1} of {tourSteps.length}</p><div className="tour-progress-track" aria-hidden="true">{tourSteps.map((item, index) => <span key={item.id} data-reached={index <= step || undefined} />)}</div>
        <h3 key={current.id} ref={heading} tabIndex={-1}>{current.title}</h3><p className="tour-description">{current.description}</p><div className="tour-hint"><ArrowRight size={16} /><p>{current.hint}</p></div>
        <div className="tour-card-actions"><button type="button" className="button secondary" disabled={step === 0} onClick={() => setStep(value => value - 1)}><ArrowLeft size={16} />Back</button><button type="button" className="button primary" onClick={() => last ? finish(true) : setStep(value => value + 1)}>{last ? 'Start my check-in' : 'Next'}<ArrowRight size={16} /></button></div>
        <button type="button" className="tour-skip" onClick={() => finish()}>{last ? 'Finish on Home' : 'Skip the tour'}</button>
      </div>
    </>}
  </Modal>;
}

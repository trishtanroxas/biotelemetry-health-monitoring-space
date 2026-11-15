import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, ArrowUpRight, Sparkles, WifiOff, User } from 'lucide-react';
import { flightAssistant, type AssistantContext } from '../services/ai';
import type { AssistantReply } from '../types/wellness';
import { PageHeading } from '../components/AppShell';
import { Disclosure } from '../components/WellnessUI';

interface ChatMessage { id: string; role: 'user' | 'assistant'; text?: string; reply?: AssistantReply }
const questions = [
  'How is my health today based on my vitals?',
  'What does my sleep and stress history show?',
  'What countermeasures should I prioritize today?',
];
export function AIMessage({ message }: { message: ChatMessage }) {
  return <article className={`chat-message ${message.role}`}><span className="message-avatar">{message.role === 'assistant' ? <Sparkles size={18} /> : <User size={18} />}</span><div><span className="message-author">{message.role === 'assistant' ? `Flight Surgeon AI · ${message.reply?.sourceLabel ?? 'onboard'}` : 'You'}</span>{message.text && <p>{message.text}</p>}{message.reply && <><div className="reply-section"><strong>From your records</strong><p>{message.reply.facts}</p></div><div className="reply-section"><strong>What this means / Actions</strong><p>{message.reply.explanation}</p></div><div className="reply-section"><strong>What you can do next</strong><p>{message.reply.action}</p>{message.reply.nasaReference && <small className="muted" style={{ display: 'block', marginTop: 6 }}>NASA Reference: {message.reply.nasaReference}</small>}<a className="text-link" href="#missions">See Daily Activities<ArrowUpRight size={15} /></a></div></>}</div></article>;
}
export function AIPage({ context, offline, gateway = false, recordsLoading = false, recordsError = '' }: { context: AssistantContext; offline: boolean; gateway?: boolean; recordsLoading?: boolean; recordsError?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const liveContext = useRef(context);
  const unavailable = offline || recordsLoading || !!recordsError;
  const unavailableRef = useRef(unavailable);
  liveContext.current = context; unavailableRef.current = unavailable;
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => { if (messages.length) bottom.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' }); }, [messages, loading]);
  async function send(question: string) {
    const text = question.trim(); if (!text || loading || unavailable) return;
    const token = ++request.current;
    setMessages(items => [...items, { id: crypto.randomUUID(), role: 'user', text }]); setInput(''); setLoading(true); setError('');
    try {
      await new Promise(resolve => window.setTimeout(resolve, 400));
      if (unavailableRef.current) throw new Error('Saved context is not available right now. Please retry after it loads or reconnects.');
      const reply = await flightAssistant.ask(text, liveContext.current);
      if (token === request.current) setMessages(items => [...items, { id: crypto.randomUUID(), role: 'assistant', reply }]);
    } catch (cause) { if (token === request.current) { setError(cause instanceof Error ? cause.message : 'Could not respond. Please try again.'); setInput(text); } }
    finally { if (token === request.current) setLoading(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(input); }
  const liveVitals = context.vitals;
  const openAlerts = context.alerts.filter(a => !a.acknowledged);

  return <><PageHeading eyebrow="FLIGHT SURGEON ASSISTANT" title="AI Health Assistant" description="Ask questions grounded in live telemetry, NASA OSDR baselines, and your health check-ins." action={<span className="pill">{gateway && !offline ? 'Connected · Server AI' : 'Onboard Demo Mode'}</span>} />
    <div className="assistant-layout assistant-focused"><section className="panel chat-panel"><div className="chat-header"><span className="section-icon"><Sparkles size={20} /></span><div><h2>Medical Consultation</h2><p>{offline ? 'Offline · assistant unavailable' : gateway ? 'Connected · Grounded in live telemetry & NASA OSDR' : 'Onboard clinical rules · connect API for Gemini'}</p></div><span className={`status-dot ${offline ? 'offline-dot' : ''}`} /></div>
      {liveVitals && (
        <div className="ai-live-strip" aria-label="Live telemetry context fed to assistant">
          <span className="pill">HR {liveVitals.heart_rate} BPM</span>
          <span className="pill">SpO2 {liveVitals.spo2}%</span>
          <span className="pill">Temp {liveVitals.core_temp}°C</span>
          {liveVitals.blood_glucose !== undefined && <span className="pill">Glucose {liveVitals.blood_glucose} mg/dL</span>}
          <span className="pill">Rad {liveVitals.radiation_rate} μSv/h</span>
          {openAlerts.length > 0 && <span className="pill alert-pill-warning">{openAlerts.length} open alert{openAlerts.length === 1 ? '' : 's'}</span>}
        </div>
      )}
      {offline && <p className="warning-box" role="status"><WifiOff size={18} />You’re offline. Flight Assistant is unavailable. Your saved check-ins, trends and activities are still here.</p>}
      {recordsLoading && <p className="helper" role="status">Loading saved records and activities for the selected astronaut…</p>}{recordsError && <p className="error-box" role="alert">Saved context could not be loaded. Use Retry local records above before asking a question.</p>}
      <div className="chat-scroll" role="log" aria-live="polite" aria-label="Assistant conversation">
        {!messages.length && <div className="chat-welcome"><h2>What would you like to know?</h2><div className="suggested-questions">{questions.map(question => <button key={question} disabled={unavailable || loading} onClick={() => void send(question)}>{question}<ArrowUpRight size={17} /></button>)}</div></div>}
        {messages.map(message => <AIMessage key={message.id} message={message} />)}{loading && <p className="thinking" role="status"><Sparkles size={16} />Analyzing your telemetry & records…</p>}<div ref={bottom} />
      </div>
      {error && <p className="error-box" role="alert">{error}</p>}
      <form onSubmit={submit} className="chat-composer"><label className="sr-only" htmlFor="ai-input">Ask the AI Health Assistant</label><textarea id="ai-input" rows={2} value={input} maxLength={1000} onChange={e => setInput(e.target.value)} placeholder={offline ? 'Reconnect to ask a question…' : 'Type your question…'} disabled={unavailable} /><button type="submit" className="button primary" aria-label="Send message" disabled={unavailable || loading || !input.trim()}><ArrowUp size={20} /></button></form><p className="chat-disclaimer">This clinical assistant evaluates telemetry trends against NASA baselines. It does not replace your mission medical officer.</p>
    </section></div><Disclosure title="About this assistant and your privacy"><p>This assistant evaluates live telemetry and records saved on this device. When connected to the FastAPI server, it references NASA OSDR (Open Science Data Repository) spaceflight physiological curves and HRP protocols. Symptoms and private notes are excluded from assistant context payloads.</p><p className="helper">Offline mode uses calibrated onboard heuristic rules without network dependency.</p></Disclosure>
  </>;
}



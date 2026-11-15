import { useEffect, useRef, useState, type FormEvent } from 'react';
import { 
  ArrowUp, 
  ArrowUpRight, 
  Sparkles, 
  WifiOff, 
  User, 
  Mic, 
  Square, 
  RotateCcw, 
  Trash2, 
  Check, 
  AlertCircle,
  Loader2 
} from 'lucide-react';
import { flightAssistant, type AssistantContext } from '../services/ai';
import { transcribeAudioApi } from '../services/api';
import type { AssistantReply } from '../types/wellness';
import { PageHeading } from '../components/AppShell';
import { Disclosure } from '../components/WellnessUI';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  reply?: AssistantReply;
  timestamp?: string;
}

const suggestedQuestions = [
  'How is my health today based on my vitals?',
  'What does my sleep and stress history show?',
  'What countermeasures should I prioritize today?',
];

export function AIMessage({ message }: { message: ChatMessage }) {
  const isAssistant = message.role === 'assistant';
  const timeStr = message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <article className={`chat-message ${message.role}`}>
      <span className="message-avatar">
        {isAssistant ? <Sparkles size={18} /> : <User size={18} />}
      </span>
      <div className="message-bubble-content">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="message-author">
            {isAssistant ? `Flight Surgeon AI · ${message.reply?.sourceLabel ?? 'onboard'}` : 'You'}
          </span>
          {timeStr && <span className="text-[10px] text-slate-500 font-mono">{timeStr}</span>}
        </div>

        {message.text && <p className="leading-relaxed">{message.text}</p>}

        {message.reply && (
          <div className="space-y-2.5 mt-2">
            <div className="reply-section">
              <strong>From your records</strong>
              <p>{message.reply.facts}</p>
            </div>
            <div className="reply-section">
              <strong>What this means / Actions</strong>
              <p>{message.reply.explanation}</p>
            </div>
            <div className="reply-section">
              <strong>What you can do next</strong>
              <p>{message.reply.action}</p>
              {message.reply.nasaReference && (
                <small className="muted block mt-1.5 text-[11px]">
                  NASA Reference: {message.reply.nasaReference}
                </small>
              )}
              <a className="text-link mt-2 inline-flex items-center gap-1" href="#missions">
                <span>See Daily Activities</span>
                <ArrowUpRight size={14} />
              </a>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

export function AIPage({ 
  context, 
  offline, 
  gateway = false, 
  recordsLoading = false, 
  recordsError = '' 
}: { 
  context: AssistantContext; 
  offline: boolean; 
  gateway?: boolean; 
  recordsLoading?: boolean; 
  recordsError?: string 
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);

  // Audio / Speech-to-Text States
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'transcribing' | 'ready'>('idle');
  const [recordingTimer, setRecordingTimer] = useState(0);
  const [audioError, setAudioError] = useState('');
  const [recognizedWords, setRecognizedWords] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);

  const bottom = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const liveContext = useRef(context);
  const unavailable = offline || recordsLoading || !!recordsError;
  const unavailableRef = useRef(unavailable);

  liveContext.current = context;
  unavailableRef.current = unavailable;

  useEffect(() => () => { request.current++; }, []);

  useEffect(() => {
    if (messages.length || loading) {
      bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages, loading]);

  // Clean up recording timer on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  async function send(question: string) {
    const text = question.trim();
    if (!text || loading || unavailable) return;
    const token = ++request.current;
    const nowIso = new Date().toISOString();

    const newMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text, timestamp: nowIso };
    const currentHistory = [...messages, newMsg];
    setMessages(currentHistory);
    setInput('');
    setLoading(true);
    setError('');
    setLastFailedQuestion(null);

    try {
      await new Promise(resolve => window.setTimeout(resolve, 300));
      if (unavailableRef.current) {
        throw new Error('Saved context is not available right now. Please retry after it loads or reconnects.');
      }
      
      // Pass conversational history for multi-turn understanding
      const historyPayload = currentHistory.map(m => ({
        role: m.role,
        text: m.text || (m.reply ? `${m.reply.facts} ${m.reply.explanation}` : ''),
      }));

      const reply = await flightAssistant.ask(text, liveContext.current, historyPayload);
      if (token === request.current) {
        setMessages(items => [
          ...items,
          { id: crypto.randomUUID(), role: 'assistant', reply, timestamp: new Date().toISOString() },
        ]);
      }
    } catch (cause) {
      if (token === request.current) {
        const errorMsg = cause instanceof Error ? cause.message : 'Could not respond. Please try again.';
        setError(errorMsg);
        setLastFailedQuestion(text);
      }
    } finally {
      if (token === request.current) setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  function handleClearChat() {
    setMessages([]);
    setError('');
    setLastFailedQuestion(null);
  }

  // ==========================================
  // Audio Recording & Speech-to-Text Handling
  // ==========================================
  async function startRecording() {
    if (unavailable || loading) return;
    setAudioError('');
    setRecognizedWords('');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setAudioError('Audio recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // Determine supported MIME format
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size < 500) {
          setRecordingState('idle');
          setAudioError('Recording was too short or empty. Please speak clearly.');
          return;
        }

        // Convert blob to base64
        setRecordingState('transcribing');
        try {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = reader.result as string;
            try {
              const res = await transcribeAudioApi(base64Audio, mimeType);
              if (res && res.transcript && res.transcript.trim()) {
                setRecognizedWords(res.transcript.trim());
                setRecordingState('ready');
              } else {
                setRecordingState('idle');
                setAudioError('No speech was detected. Please try recording again.');
              }
            } catch (err) {
              setRecordingState('idle');
              setAudioError('Transcription service could not process audio. Please try again.');
            }
          };
        } catch {
          setRecordingState('idle');
          setAudioError('Failed to process recorded audio.');
        }
      };

      recorder.start(250);
      setRecordingState('recording');
      setRecordingTimer(0);
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTimer(t => t + 1);
      }, 1000);
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setAudioError('Microphone permission was denied. Please allow microphone access.');
      } else {
        setAudioError('Could not access microphone: ' + (err.message || 'Unknown error'));
      }
      setRecordingState('idle');
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }

  function cancelRecording() {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.onstop = null; // Do not trigger transcription
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
    }
    setRecordingState('idle');
    setRecognizedWords('');
    setAudioError('');
  }

  function handleSendTranscription() {
    if (!recognizedWords.trim()) return;
    void send(recognizedWords.trim());
    setRecognizedWords('');
    setRecordingState('idle');
  }

  const liveVitals = context.vitals;
  const openAlerts = context.alerts.filter(a => !a.acknowledged);

  return (
    <>
      <PageHeading
        eyebrow="FLIGHT SURGEON ASSISTANT"
        title="AI Health Assistant"
        description="Conversational clinical guidance powered by Groq (openai/gpt-oss-120b) & Whisper Large V3 Turbo."
        action={
          <div className="flex items-center gap-2">
            <span className="pill">
              {gateway && !offline ? 'Connected · Groq AI' : 'Demo mode · simulated answers'}
            </span>
            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="button secondary p-1.5 h-8 text-xs flex items-center gap-1.5 text-slate-400 hover:text-rose-400"
                title="Clear current conversation"
              >
                <Trash2 size={14} />
                <span>Clear Chat</span>
              </button>
            )}
          </div>
        }
      />

      <div className="assistant-layout assistant-focused">
        <section className="panel chat-panel">
          <div className="chat-header">
            <span className="section-icon">
              <Sparkles size={20} />
            </span>
            <div>
              <h2>Medical Consultation</h2>
              <p>
                {offline
                  ? 'Offline · assistant unavailable'
                  : gateway
                  ? 'Connected · Groq GPT-OSS 120B & Whisper STT'
                  : 'Onboard clinical rules · connect API for Groq Cloud'}
              </p>
            </div>
            <span className={`status-dot ${offline ? 'offline-dot' : ''}`} />
          </div>

          {liveVitals && (
            <div className="ai-live-strip" aria-label="Live telemetry context fed to assistant">
              <span className="pill">HR {liveVitals.heart_rate} BPM</span>
              <span className="pill">SpO2 {liveVitals.spo2}%</span>
              <span className="pill">Temp {liveVitals.core_temp}°C</span>
              {liveVitals.blood_glucose !== undefined && (
                <span className="pill">Glucose {liveVitals.blood_glucose} mg/dL</span>
              )}
              <span className="pill">Rad {liveVitals.radiation_rate} μSv/h</span>
              {openAlerts.length > 0 && (
                <span className="pill alert-pill-warning">
                  {openAlerts.length} open alert{openAlerts.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
          )}

          {offline && (
            <p className="warning-box" role="status">
              <WifiOff size={18} />
              You’re offline. Flight Assistant is unavailable. Your saved check-ins, trends and activities are still here.
            </p>
          )}

          {recordsLoading && (
            <p className="helper" role="status">
              Loading saved records and activities for the selected astronaut…
            </p>
          )}
          {recordsError && (
            <p className="error-box" role="alert">
              Saved context could not be loaded. Use Retry local records above before asking a question.
            </p>
          )}

          {/* Chat Messages Log */}
          <div className="chat-scroll" role="log" aria-live="polite" aria-label="Assistant conversation">
            {!messages.length && (
              <div className="chat-welcome">
                <h2>What would you like to know?</h2>
                <div className="suggested-questions">
                  {suggestedQuestions.map(question => (
                    <button
                      key={question}
                      disabled={unavailable || loading}
                      onClick={() => void send(question)}
                    >
                      {question}
                      <ArrowUpRight size={17} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(message => (
              <AIMessage key={message.id} message={message} />
            ))}

            {loading && (
              <p className="thinking" role="status">
                <Sparkles size={16} className="animate-spin-slow text-cyan-400" />
                <span>Evaluating telemetry with Groq AI…</span>
              </p>
            )}
            <div ref={bottom} />
          </div>

          {error && (
            <div className="error-box flex items-center justify-between gap-2" role="alert">
              <span>{error}</span>
              {lastFailedQuestion && (
                <button 
                  onClick={() => void send(lastFailedQuestion)} 
                  className="button secondary text-xs py-1 px-2.5 h-auto"
                >
                  <RotateCcw size={12} />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          {/* Audio Error Alert */}
          {audioError && (
            <div className="warning-box flex items-center justify-between gap-2 text-xs" role="alert">
              <div className="flex items-center gap-1.5">
                <AlertCircle size={15} />
                <span>{audioError}</span>
              </div>
              <button 
                onClick={() => setAudioError('')}
                className="text-slate-400 hover:text-white"
                aria-label="Dismiss audio error"
              >
                ✕
              </button>
            </div>
          )}

          {/* Voice Transcription State Preview */}
          {recordingState === 'ready' && (
            <div className="p-3.5 mx-3 mb-2 rounded-lg border border-cyan-500/40 bg-[#0a1b2a] space-y-2 text-xs animate-in fade-in">
              <div className="flex items-center justify-between text-slate-400">
                <span className="font-semibold text-cyan-300">Speech Recognized (Review / Edit):</span>
                <span className="font-mono text-[10px] text-slate-500">Groq Whisper Large V3</span>
              </div>
              <textarea
                value={recognizedWords}
                onChange={e => setRecognizedWords(e.target.value)}
                className="w-full bg-[#071322] border border-slate-700 rounded p-2 text-slate-100 text-xs focus:outline-none focus:border-cyan-400"
                rows={2}
                placeholder="Review and correct transcription before sending..."
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="button secondary text-xs py-1 px-3 h-8"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleSendTranscription}
                  className="button primary text-xs py-1 px-3.5 h-8 flex items-center gap-1.5"
                >
                  <Check size={14} />
                  <span>Send to Assistant</span>
                </button>
              </div>
            </div>
          )}

          {/* Voice Recording / Transcribing Live Banner */}
          {recordingState === 'recording' && (
            <div className="flex items-center justify-between px-4 py-2.5 mx-3 mb-2 rounded-lg border border-rose-500/50 bg-[#19080c] text-rose-200 text-xs animate-pulse">
              <div className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full bg-rose-500 animate-ping" />
                <span className="font-semibold tracking-wide">Recording Voice...</span>
                <span className="font-mono text-slate-400">
                  {Math.floor(recordingTimer / 60)}:{(recordingTimer % 60).toString().padStart(2, '0')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="p-1 text-slate-400 hover:text-white"
                  title="Cancel Recording"
                >
                  ✕
                </button>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Square size={12} fill="currentColor" />
                  <span>Stop & Transcribe</span>
                </button>
              </div>
            </div>
          )}

          {recordingState === 'transcribing' && (
            <div className="flex items-center justify-center gap-2 px-4 py-2.5 mx-3 mb-2 rounded-lg border border-cyan-500/40 bg-[#081a29] text-cyan-200 text-xs">
              <Loader2 size={16} className="animate-spin text-cyan-400" />
              <span>Transcribing your speech with Groq Whisper...</span>
            </div>
          )}

          {/* Composer Form with Microphone Button */}
          <form onSubmit={submit} className="chat-composer">
            <label className="sr-only" htmlFor="ai-input">
              Ask the AI Health Assistant
            </label>
            <textarea
              id="ai-input"
              rows={2}
              value={input}
              maxLength={1000}
              onChange={e => setInput(e.target.value)}
              placeholder={offline ? 'Reconnect to ask a question…' : 'Type your question or use voice input…'}
              disabled={unavailable || recordingState === 'recording'}
            />

            <div className="flex items-center gap-1.5">
              {/* Voice Input Trigger */}
              <button
                type="button"
                onClick={recordingState === 'recording' ? stopRecording : startRecording}
                className={`button secondary p-2.5 h-11 w-11 flex items-center justify-center rounded-lg transition-colors ${
                  recordingState === 'recording'
                    ? 'bg-rose-600/30 border-rose-500 text-rose-300'
                    : 'text-slate-400 hover:text-cyan-300'
                }`}
                aria-label={recordingState === 'recording' ? 'Stop recording voice' : 'Record voice with microphone'}
                title={recordingState === 'recording' ? 'Stop recording' : 'Speak to AI'}
                disabled={unavailable || loading || recordingState === 'transcribing'}
              >
                {recordingState === 'recording' ? <Square size={18} fill="currentColor" /> : <Mic size={18} />}
              </button>

              <button
                type="submit"
                className="button primary p-2.5 h-11 w-11 flex items-center justify-center rounded-lg"
                aria-label="Send message"
                disabled={unavailable || loading || !input.trim()}
              >
                <ArrowUp size={20} />
              </button>
            </div>
          </form>

          <p className="chat-disclaimer">
            This clinical assistant evaluates telemetry trends against NASA baselines using GroqCloud (openai/gpt-oss-120b). It does not replace your mission medical officer.
          </p>
        </section>
      </div>

      <Disclosure title="About this assistant and your privacy">
        <p>
          This assistant evaluates live telemetry and records saved on this device. When connected to the FastAPI server, it utilizes high-throughput GroqCloud intelligence (openai/gpt-oss-120b) alongside speech transcription via Whisper Large V3 Turbo. Private free-text notes and raw voice recordings are not retained.
        </p>
        <p className="helper">
          Offline mode falls back to calibrated onboard clinical heuristic rules without cloud dependency.
        </p>
      </Disclosure>
    </>
  );
}

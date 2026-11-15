import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  X, 
  Minus, 
  Send, 
  Compass, 
  ArrowUpRight, 
  RotateCcw, 
  User, 
  Loader2 
} from 'lucide-react';
import { askPublicMissionGuideApi } from '../services/api';
import biotelemetryMark from '../assets/biotelemetry-mark.png';

interface GuideMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const SUGGESTED_QUERIES = [
  'What is BioTelemetry?',
  'How does it work without internet?',
  'What problem does this project solve?',
  'What is the technology stack?',
];

export const PublicMissionGuideModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<GuideMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hello! I am the **BioTelemetry AI Mission Guide**. I can explain our autonomous astronaut health architecture, offline edge computing, and NASA Space Apps Challenge submission. What would you like to know?',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasUnread, setHasUnread] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
      setHasUnread(false);
    }
  }, [messages, isOpen, isMinimized]);

  async function handleSend(textToSend?: string) {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: GuideMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    const currentHistory = [...messages, userMsg];
    setMessages(currentHistory);
    setInput('');
    setLoading(true);
    setError('');

    try {
      // Build lightweight payload for the public endpoint
      const historyPayload = currentHistory
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role, content: m.content }));

      const res = await askPublicMissionGuideApi(text, historyPayload);

      const aiMsg: GuideMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: res.reply,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (err: any) {
      setError(err?.message || 'Could not connect to AI Mission Guide. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <aside 
      className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none"
      aria-label="BioTelemetry AI Mission Guide"
    >
      {/* Floating Launcher Button */}
      {!isOpen && (
        <button
          onClick={() => {
            setIsOpen(true);
            setIsMinimized(false);
          }}
          className="pointer-events-auto group relative flex items-center gap-3 px-4 py-3 rounded-full bg-[#071526]/95 border border-cyan-400/50 hover:border-cyan-300 text-white shadow-[0_4px_25px_rgba(0,217,255,0.35)] backdrop-blur-xl transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          title="Ask BioTelemetry AI Mission Guide"
          aria-expanded={false}
          aria-label="Ask BioTelemetry AI Mission Guide"
        >
          <div className="relative w-7 h-7 flex-shrink-0">
            <img 
              src={biotelemetryMark} 
              alt="BioTelemetry Logo" 
              className="w-full h-full object-contain filter drop-shadow-[0_0_8px_rgba(0,217,255,0.6)]" 
            />
            {hasUnread && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            )}
          </div>
          <span className="text-xs font-semibold tracking-wide text-cyan-200 group-hover:text-white transition-colors pr-1">
            Ask BioTelemetry AI
          </span>
          <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
        </button>
      )}

      {/* Floating Chat Window */}
      {isOpen && (
        <div
          className={`pointer-events-auto flex flex-col w-[380px] max-w-[calc(100vw-32px)] rounded-2xl border border-cyan-500/40 bg-[#06111e]/98 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.8),0_0_20px_rgba(0,217,255,0.15)] overflow-hidden transition-all duration-300 ${
            isMinimized ? 'h-14' : 'h-[530px] max-h-[80vh]'
          }`}
          role="dialog"
          aria-labelledby="guide-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#0a192c]/90 border-b border-slate-800 select-none">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 flex-shrink-0">
                <img src={biotelemetryMark} alt="Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <h3 id="guide-title" className="text-xs font-bold text-white flex items-center gap-1.5 leading-none">
                  <span>BioTelemetry AI</span>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Groq Cloud Online" />
                </h3>
                <span className="text-[10px] text-cyan-400 font-mono tracking-wider uppercase">
                  Mission Guide · Groq
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMinimized(prev => !prev)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
                title={isMinimized ? 'Expand' : 'Minimize'}
                aria-label={isMinimized ? 'Expand guide' : 'Minimize guide'}
              >
                <Minus size={14} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800/60 transition-colors"
                title="Close Mission Guide"
                aria-label="Close guide"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Body Content (Hidden when minimized) */}
          {!isMinimized && (
            <>
              {/* Messages Area */}
              <div 
                className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs text-slate-200"
                role="log"
                aria-live="polite"
              >
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-1 ${
                      msg.role === 'user' ? 'flex-row-reverse' : ''
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.role === 'user'
                          ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/50'
                          : 'bg-slate-800 text-cyan-400 border border-slate-700'
                      }`}
                    >
                      {msg.role === 'user' ? <User size={13} /> : <Compass size={13} />}
                    </div>

                    <div
                      className={`p-3 rounded-xl max-w-[82%] leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-cyan-600/25 border border-cyan-500/40 text-cyan-100 rounded-tr-none'
                          : 'bg-[#0a1a2c]/90 border border-slate-800 text-slate-200 rounded-tl-none'
                      }`}
                    >
                      <div className="whitespace-pre-wrap font-sans text-xs">
                        {msg.content}
                      </div>
                      <div className="mt-1 text-[9px] text-slate-500 text-right font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-[#0a1a2c]/60 border border-slate-800 text-cyan-300 text-xs w-fit">
                    <Loader2 size={13} className="animate-spin" />
                    <span>Consulting BioTelemetry architecture...</span>
                  </div>
                )}

                {error && (
                  <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-[11px] flex items-center justify-between gap-2">
                    <span>{error}</span>
                    <button
                      onClick={() => void handleSend()}
                      className="inline-flex items-center gap-1 text-cyan-300 hover:underline"
                    >
                      <RotateCcw size={11} />
                      <span>Retry</span>
                    </button>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Suggested Questions Pills */}
              {messages.length <= 2 && (
                <div className="px-3 pb-2 pt-1 border-t border-slate-800/60 bg-[#071322]/40">
                  <div className="text-[10px] text-slate-400 font-semibold mb-1.5 flex items-center gap-1">
                    <Sparkles size={11} className="text-cyan-400" />
                    <span>Suggested Questions:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTED_QUERIES.map(q => (
                      <button
                        key={q}
                        onClick={() => void handleSend(q)}
                        disabled={loading}
                        className="text-[10px] px-2 py-1 rounded bg-slate-900/80 hover:bg-cyan-950/80 border border-slate-700 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-200 transition-colors inline-flex items-center gap-1 text-left"
                      >
                        <span>{q}</span>
                        <ArrowUpRight size={10} className="flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input Form */}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  void handleSend();
                }}
                className="p-3 bg-[#081525] border-t border-slate-800 flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about BioTelemetry's architecture, offline edge..."
                  disabled={loading}
                  maxLength={500}
                  className="flex-1 bg-[#050e18] border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="p-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-30 disabled:hover:bg-cyan-500 text-slate-950 font-bold transition-all shadow-[0_0_10px_rgba(0,217,255,0.3)] flex-shrink-0"
                  aria-label="Send question to AI Mission Guide"
                >
                  <Send size={14} />
                </button>
              </form>

              {/* Sub-footer */}
              <div className="px-3 py-1.5 bg-[#050c16] text-[9px] text-slate-500 flex items-center justify-between font-mono">
                <span>Powered by Groq · GPT-OSS 120B</span>
                <span>Public Project Knowledge</span>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
};

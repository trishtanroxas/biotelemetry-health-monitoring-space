import React from 'react';
import { MessageSquare, ArrowRight, Bot, ShieldCheck } from 'lucide-react';

export const AIAssistantCard: React.FC = () => {
  const exampleQuestions = [
    '“Summarize my last 3 check-in sleep trends”',
    '“Explain my latest heart rate variability index”',
    '“Are there any environmental radiation warnings?”'
  ];

  return (
    <div className="panel bio-dashboard-panel astrodoc-feature-panel">
      <div className="astrodoc-header">
        <div className="astrodoc-icon-wrap">
          <Bot size={24} className="text-cyan animate-pulse-slow" />
        </div>
        <div className="astrodoc-title-info">
          <span className="panel-eyebrow">MISSION FLIGHT HEALTH ASSISTANT</span>
          <h3>AstroDoc — Onboard Clinical Companion</h3>
        </div>
      </div>

      <p className="astrodoc-desc">
        Explore your locally indexed health records, analyze physiological trends, and obtain preliminary space-medicine countermeasure insights.
      </p>

      <div className="astrodoc-prompts-list">
        <span className="prompts-label">SUGGESTED CREW QUERIES:</span>
        <div className="prompts-chips">
          {exampleQuestions.map((q, idx) => (
            <a key={idx} href="#ai" className="prompt-chip">
              <MessageSquare size={13} />
              <span>{q}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="astrodoc-cta-footer">
        <div className="disclaimer-note">
          <ShieldCheck size={14} className="text-muted" />
          <span>Preliminary decision support • Not a terrestrial medical diagnosis</span>
        </div>
        <a href="#ai" className="button primary btn-astrodoc">
          <span>Open AstroDoc Assistant</span>
          <ArrowRight size={16} />
        </a>
      </div>
    </div>
  );
};

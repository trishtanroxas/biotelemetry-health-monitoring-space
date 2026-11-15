import React from 'react';
import { useNotificationCenter } from '../context/NotificationContext';
import { 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  CheckCircle, 
  X, 
  ArrowRight,
  Layers
} from 'lucide-react';
import { NotificationSeverity } from '../types/notifications';

export const ToastContainer: React.FC = () => {
  const { toasts, pendingToastCount, dismissToast, markAsRead } = useNotificationCenter();

  if (toasts.length === 0 && pendingToastCount === 0) return null;

  const getSeverityIcon = (severity: NotificationSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return <AlertTriangle className="h-4 w-4 text-rose-400 animate-pulse" />;
      case 'WARNING':
        return <AlertCircle className="h-4 w-4 text-amber-400" />;
      case 'SUCCESS':
        return <CheckCircle className="h-4 w-4 text-emerald-400" />;
      case 'INFO':
      default:
        return <Info className="h-4 w-4 text-cyan-400" />;
    }
  };

  const getSeverityBorder = (severity: NotificationSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'border-rose-500/60 bg-[#140609]/95 text-rose-100 shadow-[0_4px_20px_rgba(244,63,94,0.3)]';
      case 'WARNING':
        return 'border-amber-500/60 bg-[#161005]/95 text-amber-100 shadow-[0_4px_20px_rgba(245,158,11,0.25)]';
      case 'SUCCESS':
        return 'border-emerald-500/60 bg-[#06140d]/95 text-emerald-100 shadow-[0_4px_20px_rgba(16,185,129,0.25)]';
      case 'INFO':
      default:
        return 'border-cyan-500/60 bg-[#061320]/95 text-cyan-100 shadow-[0_4px_20px_rgba(0,217,255,0.25)]';
    }
  };

  return (
    <aside 
      className="fixed top-20 right-4 sm:right-6 z-50 flex flex-col gap-2.5 max-w-[360px] w-[calc(100vw-2rem)] pointer-events-none"
      aria-label="Active notification toasts"
      aria-live="polite"
    >
      {/* Maximum 3 visible toast cards */}
      {toasts.slice(0, 3).map(toast => (
        <div
          key={toast.toastId}
          className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border backdrop-blur-xl transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${getSeverityBorder(toast.severity)}`}
          role="alert"
        >
          <div className="mt-0.5 flex-shrink-0">
            {getSeverityIcon(toast.severity)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-xs tracking-wider uppercase truncate">
                {toast.title}
              </span>
              <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">
                {new Date(toast.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <p className="mt-1 text-xs text-slate-300 line-clamp-2 leading-relaxed">
              {toast.description}
            </p>

            {toast.actionLabel && toast.actionRoute && (
              <a
                href={toast.actionRoute}
                onClick={() => {
                  markAsRead(toast.id);
                  dismissToast(toast.toastId);
                }}
                className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-medium text-cyan-300 hover:text-cyan-200 transition-colors"
              >
                <span>{toast.actionLabel}</span>
                <ArrowRight className="h-3 w-3" />
              </a>
            )}
          </div>

          <button
            onClick={() => dismissToast(toast.toastId)}
            className="flex-shrink-0 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-400"
            aria-label="Dismiss toast"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {/* Subtle indicator when additional toasts are queued in the buffer */}
      {pendingToastCount > 0 && (
        <div className="pointer-events-auto self-end flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#071322]/90 border border-slate-700/80 text-[10px] text-slate-400 font-mono shadow-md animate-in fade-in">
          <Layers size={11} className="text-cyan-400" />
          <span>+{pendingToastCount} pending in queue</span>
        </div>
      )}
    </aside>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { useNotificationCenter } from '../context/NotificationContext';
import { 
  Bell, 
  CheckCheck, 
  Trash2, 
  Volume2, 
  VolumeX, 
  X, 
  ExternalLink,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Sliders
} from 'lucide-react';
import { NotificationSeverity } from '../types/notifications';

export const NotificationCenter: React.FC = () => {
  const {
    notifications,
    unreadCount,
    preferences,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearReadNotifications,
    updatePreferences
  } = useNotificationCenter();

  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'CRITICAL' | 'WARNING' | 'INFO'>('all');
  const [showSettings, setShowSettings] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const bellButtonRef = useRef<HTMLButtonElement>(null);

  // Close panel on click outside or Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current && 
        !panelRef.current.contains(e.target as Node) &&
        bellButtonRef.current &&
        !bellButtonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        bellButtonRef.current?.focus();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const filteredNotifications = notifications.filter(item => {
    if (filter === 'unread') return !item.read;
    if (filter === 'CRITICAL' || filter === 'WARNING' || filter === 'INFO') {
      return item.severity === filter;
    }
    return true;
  });

  const getSeverityBadge = (severity: NotificationSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-950/80 text-rose-400 border border-rose-800/60 uppercase tracking-wider">
            <AlertTriangle className="h-3 w-3" /> Critical
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-400 border border-amber-800/60 uppercase tracking-wider">
            <AlertCircle className="h-3 w-3" /> Warning
          </span>
        );
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 uppercase tracking-wider">
            <CheckCircle2 className="h-3 w-3" /> Nominal
          </span>
        );
      case 'INFO':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 uppercase tracking-wider">
            <Info className="h-3 w-3" /> Info
          </span>
        );
    }
  };

  const formatTimestamp = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="relative">
      {/* Bell Trigger Button */}
      <button
        ref={bellButtonRef}
        onClick={() => setIsOpen(prev => !prev)}
        className={`relative flex items-center justify-center w-10 h-10 rounded-lg border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
          isOpen
            ? 'bg-cyan-950/60 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(0,217,255,0.3)]'
            : 'bg-[#0b1726]/80 border-slate-700/80 text-slate-300 hover:border-cyan-500/50 hover:text-white hover:bg-[#0f2136]'
        }`}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        title="Mission Notifications"
      >
        <Bell className="h-4.5 w-4.5" />

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4.5 min-w-[18px] px-1 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow-[0_0_8px_rgba(225,29,72,0.6)] animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 mt-2.5 w-96 max-w-[90vw] rounded-xl border border-slate-700/80 bg-[#06101c]/95 backdrop-blur-xl shadow-2xl z-50 flex flex-col overflow-hidden text-slate-200 transition-all duration-200"
          role="dialog"
          aria-label="Notification center"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0a1829]/70">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wide text-white">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-800/80 text-cyan-300 font-semibold">
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowSettings(prev => !prev)}
                className={`p-1.5 rounded transition-colors ${
                  showSettings
                    ? 'text-cyan-300 bg-cyan-950/70 border border-cyan-800'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
                title="Notification Settings"
                aria-label="Notification settings"
              >
                <Sliders className="h-4 w-4" />
              </button>

              <button
                onClick={markAllAsRead}
                disabled={unreadCount === 0}
                className="p-1.5 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800/60 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                title="Mark all as read"
                aria-label="Mark all as read"
              >
                <CheckCheck className="h-4 w-4" />
              </button>

              <button
                onClick={clearReadNotifications}
                className="p-1.5 rounded text-slate-400 hover:text-rose-300 hover:bg-slate-800/60 transition-colors"
                title="Clear read notifications"
                aria-label="Clear read notifications"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Settings Sub-Panel */}
          {showSettings && (
            <div className="p-3.5 border-b border-slate-800/80 bg-[#081525]/90 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-300">Auditory Alert System</span>
                <button
                  onClick={() => updatePreferences({ soundEnabled: !preferences.soundEnabled })}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                    preferences.soundEnabled
                      ? 'bg-cyan-950/80 border-cyan-700/80 text-cyan-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  {preferences.soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                  <span>{preferences.soundEnabled ? 'Enabled' : 'Muted'}</span>
                </button>
              </div>

              {preferences.soundEnabled && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400 text-[11px]">Sound Volume</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={preferences.volume}
                    onChange={e => updatePreferences({ volume: parseFloat(e.target.value) })}
                    className="w-28 accent-cyan-400 cursor-pointer"
                  />
                </div>
              )}

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>Sound Categories:</span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.critical}
                      onChange={e => updatePreferences({ critical: e.target.checked })}
                      className="accent-rose-500 rounded"
                    />
                    <span>Crit</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.warning}
                      onChange={e => updatePreferences({ warning: e.target.checked })}
                      className="accent-amber-500 rounded"
                    />
                    <span>Warn</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.info}
                      onChange={e => updatePreferences({ info: e.target.checked })}
                      className="accent-cyan-400 rounded"
                    />
                    <span>Info</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-800/60 bg-[#071322]/50 text-xs overflow-x-auto">
            {(['all', 'unread', 'CRITICAL', 'WARNING', 'INFO'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors capitalize ${
                  filter === tab
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                {tab === 'all' ? 'All' : tab === 'unread' ? 'Unread' : tab.toLowerCase()}
              </button>
            ))}
          </div>

          {/* List Content */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/40">
            {filteredNotifications.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                <Bell className="h-6 w-6 mx-auto mb-2 opacity-30" />
                <span>No notifications in this view</span>
              </div>
            ) : (
              filteredNotifications.map(item => (
                <div
                  key={item.id}
                  className={`p-3.5 flex items-start gap-3 transition-colors ${
                    item.read
                      ? 'bg-transparent hover:bg-slate-900/40 opacity-75 hover:opacity-100'
                      : 'bg-cyan-950/20 hover:bg-cyan-950/30'
                  }`}
                >
                  {/* Read dot indicator */}
                  <div className="mt-1 flex-shrink-0">
                    <button
                      onClick={() => markAsRead(item.id)}
                      className={`h-2 w-2 rounded-full transition-transform ${
                        item.read ? 'bg-transparent border border-slate-600' : 'bg-cyan-400 shadow-[0_0_6px_#00d9ff]'
                      }`}
                      title={item.read ? 'Read' : 'Click to mark as read'}
                      aria-label={item.read ? 'Marked as read' : 'Mark as read'}
                    />
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      {getSeverityBadge(item.severity)}
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatTimestamp(item.timestamp)}
                      </span>
                    </div>

                    <h4 className="text-xs font-semibold text-slate-200 leading-snug">
                      {item.title}
                    </h4>

                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>

                    {item.actionLabel && item.actionRoute && (
                      <div className="mt-2">
                        <a
                          href={item.actionRoute}
                          onClick={() => {
                            markAsRead(item.id);
                            setIsOpen(false);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-400 hover:text-cyan-300 hover:underline"
                        >
                          <span>{item.actionLabel}</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Delete individual */}
                  <button
                    onClick={() => deleteNotification(item.id)}
                    className="flex-shrink-0 text-slate-500 hover:text-rose-400 p-1 rounded opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                    title="Dismiss"
                    aria-label="Delete notification"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

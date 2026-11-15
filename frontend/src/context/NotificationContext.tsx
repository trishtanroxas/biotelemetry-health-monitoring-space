import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { NotificationItem, NotificationPreferences, NotificationSeverity } from '../types/notifications';
import { soundService } from '../services/sound';

interface ToastItem extends NotificationItem {
  toastId: string;
}

interface NotificationContextType {
  notifications: NotificationItem[];
  toasts: ToastItem[];
  unreadCount: number;
  preferences: NotificationPreferences;
  addNotification: (item: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAllNotifications: () => void;
  clearReadNotifications: () => void;
  dismissToast: (toastId: string) => void;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => void;
}

const STORAGE_KEY_NOTIFS = 'biotelemetry_notifications_v1';
const STORAGE_KEY_PREFS = 'biotelemetry_notif_prefs_v1';

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  soundEnabled: true,
  volume: 0.5,
  critical: true,
  warning: true,
  info: true
};

const INITIAL_MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'mock-1',
    title: 'Radiation Exposure Warning',
    description: 'Autonomous dosimeter detected an elevated solar particle event (0.68 mSv/h).',
    severity: 'WARNING',
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    read: false,
    category: 'radiation',
    actionLabel: 'View Dosimeter',
    actionRoute: '#analytics'
  },
  {
    id: 'mock-2',
    title: 'Mission Synchronization',
    description: 'Telemetry buffered offline has been synchronized with the mission base.',
    severity: 'INFO',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    read: false,
    category: 'system',
    actionLabel: 'View Details',
    actionRoute: '#telemetry'
  },
  {
    id: 'mock-3',
    title: 'Autonomous Health Assessment',
    description: 'Daily check-in sequence available for crew physiological review.',
    severity: 'SUCCESS',
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    read: true,
    category: 'activity',
    actionLabel: 'Open Check-In',
    actionRoute: '#checkin'
  }
];

const NotificationContext = createContext<NotificationContextType | null>(null);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_NOTIFS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_MOCK_NOTIFICATIONS;
  });

  const [preferences, setPreferences] = useState<NotificationPreferences>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PREFS);
      if (stored) return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    } catch {}
    return DEFAULT_PREFERENCES;
  });

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Keep soundService synced with preferences
  useEffect(() => {
    soundService.enabled = preferences.soundEnabled && preferences.enabled;
    soundService.volume = preferences.volume;
    try {
      localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(preferences));
    } catch {}
  }, [preferences]);

  // Persist notifications
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(notifications));
    } catch {}
  }, [notifications]);

  const playSeveritySound = useCallback((severity: NotificationSeverity) => {
    if (!preferences.enabled || !preferences.soundEnabled) return;
    switch (severity) {
      case 'CRITICAL':
        if (preferences.critical) soundService.playCritical();
        break;
      case 'WARNING':
        if (preferences.warning) soundService.playWarning();
        break;
      case 'INFO':
        if (preferences.info) soundService.playInfo();
        break;
      case 'SUCCESS':
        soundService.playSuccess();
        break;
    }
  }, [preferences]);

  const dismissToast = useCallback((toastId: string) => {
    setToasts(prev => prev.filter(t => t.toastId !== toastId));
  }, []);

  const addNotification = useCallback((item: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newNotif: NotificationItem = {
      ...item,
      id,
      timestamp: new Date().toISOString(),
      read: false
    };

    setNotifications(prev => [newNotif, ...prev.slice(0, 49)]); // keep latest 50

    // Trigger toast
    const toastId = `toast-${Date.now()}`;
    const newToast: ToastItem = { ...newNotif, toastId };
    setToasts(prev => [newToast, ...prev].slice(0, 5));

    // Audio cue
    playSeveritySound(newNotif.severity);

    // Auto-dismiss for non-critical toasts
    if (newNotif.severity !== 'CRITICAL') {
      const timeoutMs = newNotif.severity === 'WARNING' ? 8000 : 5000;
      setTimeout(() => {
        dismissToast(toastId);
      }, timeoutMs);
    }
  }, [playSeveritySound, dismissToast]);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const deleteNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const clearReadNotifications = useCallback(() => {
    setNotifications(prev => prev.filter(n => !n.read));
  }, []);

  const updatePreferences = useCallback((newPrefs: Partial<NotificationPreferences>) => {
    setPreferences(prev => ({ ...prev, ...newPrefs }));
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        toasts,
        unreadCount,
        preferences,
        addNotification,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAllNotifications,
        clearReadNotifications,
        dismissToast,
        updatePreferences
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

const FALLBACK_CONTEXT: NotificationContextType = {
  notifications: INITIAL_MOCK_NOTIFICATIONS,
  toasts: [],
  unreadCount: 2,
  preferences: DEFAULT_PREFERENCES,
  addNotification: () => {},
  markAsRead: () => {},
  markAllAsRead: () => {},
  deleteNotification: () => {},
  clearAllNotifications: () => {},
  clearReadNotifications: () => {},
  dismissToast: () => {},
  updatePreferences: () => {}
};

export const useNotificationCenter = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    return FALLBACK_CONTEXT;
  }
  return context;
};

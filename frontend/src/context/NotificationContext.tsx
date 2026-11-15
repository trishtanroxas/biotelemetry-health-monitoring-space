import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { NotificationItem, NotificationPreferences, NotificationSeverity } from '../types/notifications';
import { soundService } from '../services/sound';

export interface ToastItem extends NotificationItem {
  toastId: string;
}

interface NotificationContextType {
  notifications: NotificationItem[];
  toasts: ToastItem[]; // Active visible toasts (MAX 3)
  pendingToastCount: number; // Queued toast count waiting for slot
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
const MAX_VISIBLE_TOASTS = 3;

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  soundEnabled: true,
  volume: 0.5,
  critical: true,
  warning: true,
  info: true,
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
    actionRoute: '#analytics',
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
    actionRoute: '#telemetry',
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
    actionRoute: '#checkin',
  },
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

  // State for visible toasts (strictly capped at MAX_VISIBLE_TOASTS = 3)
  const [visibleToasts, setVisibleToasts] = useState<ToastItem[]>([]);
  
  // Pending queue of ToastItems waiting to be promoted when a slot opens
  const pendingQueueRef = useRef<ToastItem[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);

  // Auto-dismiss timers indexed by toastId
  const toastTimersRef = useRef<Map<string, number>>(new Map());

  // Keep soundService synced with preferences
  useEffect(() => {
    soundService.enabled = preferences.soundEnabled && preferences.enabled;
    soundService.volume = preferences.volume;
    try {
      localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(preferences));
    } catch {}
  }, [preferences]);

  // Persist notification records
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

  // Schedule auto-dismiss for a visible toast
  const scheduleAutoDismiss = useCallback((toast: ToastItem, dismissFn: (id: string) => void) => {
    if (toast.severity === 'CRITICAL') return; // Critical toasts require user acknowledgment or dismiss
    const duration = toast.severity === 'WARNING' ? 7000 : 4500;
    const timerId = window.setTimeout(() => {
      dismissFn(toast.toastId);
    }, duration);
    toastTimersRef.current.set(toast.toastId, timerId);
  }, []);

  // Dismiss a visible toast and immediately promote next pending toast if available
  const dismissToast = useCallback((toastId: string) => {
    // Clear any pending timer
    if (toastTimersRef.current.has(toastId)) {
      clearTimeout(toastTimersRef.current.get(toastId));
      toastTimersRef.current.delete(toastId);
    }

    setVisibleToasts(currentVisible => {
      const filtered = currentVisible.filter(t => t.toastId !== toastId);
      
      // If we now have room and items are waiting in the pending queue, promote one
      if (filtered.length < MAX_VISIBLE_TOASTS && pendingQueueRef.current.length > 0) {
        const nextToast = pendingQueueRef.current.shift()!;
        setPendingCount(pendingQueueRef.current.length);
        
        // Schedule auto-dismiss for newly promoted toast (without replaying sound)
        scheduleAutoDismiss(nextToast, dismissToast);
        
        return [...filtered, nextToast];
      }
      
      return filtered;
    });
  }, [scheduleAutoDismiss]);

  const addNotification = useCallback((item: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newNotif: NotificationItem = {
      ...item,
      id,
      timestamp: new Date().toISOString(),
      read: false,
    };

    // Store in all notifications history
    setNotifications(prev => [newNotif, ...prev.slice(0, 49)]); // keep latest 50

    // Only play audio on entry if sound is allowed
    playSeveritySound(newNotif.severity);

    // Create toast item
    const toastId = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newToast: ToastItem = { ...newNotif, toastId };

    setVisibleToasts(currentVisible => {
      if (currentVisible.length < MAX_VISIBLE_TOASTS) {
        // We have an available slot: display immediately
        scheduleAutoDismiss(newToast, dismissToast);
        return [...currentVisible, newToast];
      } else {
        // Visible slots full (>= 3): put into pending queue
        // Avoid duplicate IDs in queue
        if (!pendingQueueRef.current.some(t => t.id === newToast.id)) {
          pendingQueueRef.current.push(newToast);
          setPendingCount(pendingQueueRef.current.length);
        }
        return currentVisible;
      }
    });
  }, [playSeveritySound, scheduleAutoDismiss, dismissToast]);

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
        toasts: visibleToasts,
        pendingToastCount: pendingCount,
        unreadCount,
        preferences,
        addNotification,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAllNotifications,
        clearReadNotifications,
        dismissToast,
        updatePreferences,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

const FALLBACK_CONTEXT: NotificationContextType = {
  notifications: INITIAL_MOCK_NOTIFICATIONS,
  toasts: [],
  pendingToastCount: 0,
  unreadCount: 2,
  preferences: DEFAULT_PREFERENCES,
  addNotification: () => {},
  markAsRead: () => {},
  markAllAsRead: () => {},
  deleteNotification: () => {},
  clearAllNotifications: () => {},
  clearReadNotifications: () => {},
  dismissToast: () => {},
  updatePreferences: () => {},
};

export const useNotificationCenter = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    return FALLBACK_CONTEXT;
  }
  return context;
};

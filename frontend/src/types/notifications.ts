export type NotificationSeverity = 'CRITICAL' | 'WARNING' | 'INFO' | 'SUCCESS';

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  severity: NotificationSeverity;
  timestamp: string;
  read: boolean;
  astronautId?: string;
  category?: 'telemetry' | 'system' | 'radiation' | 'activity';
  actionLabel?: string;
  actionRoute?: string;
  sourceMode?: 'live' | 'simulated';
}

export interface NotificationPreferences {
  enabled: boolean;
  soundEnabled: boolean;
  volume: number; // 0 to 1
  critical: boolean;
  warning: boolean;
  info: boolean;
}

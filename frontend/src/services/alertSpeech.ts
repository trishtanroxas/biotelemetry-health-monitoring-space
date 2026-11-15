import type { AlertItem, AlertType } from '../types/telemetry';

export const ALERT_LABELS: Record<AlertType, string> = {
  HYPOXIA: 'Low blood oxygen',
  TACHYCARDIA: 'Fast heart rate',
  BRADYCARDIA: 'Slow heart rate',
  RADIATION_SPIKE: 'Rise in radiation',
  HEAT_STRESS: 'High body temperature',
  HYPOTHERMIA: 'Low body temperature',
  HYPERCAPNIA: 'Elevated CO2 / breathing rate',
  ORTHOSTATIC_HYPOTENSION: 'Low blood pressure / orthostatic',
  AUTONOMIC_FATIGUE: 'Autonomic HRV fatigue',
  SOLAR_STORM_SHELTER: 'Orbital storm / SAA shelter',
  DEEP_SPACE_DOSE: 'Cumulative mission dose',
  HYPOGLYCEMIA: 'Low blood sugar',
  HYPERGLYCEMIA: 'High blood sugar',
  DEHYDRATION: 'Low hydration / fluid loss',
  IMMUNE_SUPPRESSION: 'Reduced immune count (WBC)',
};

export const ALERT_SEVERITY_RANK: Record<AlertItem['severity'], number> = {
  CRITICAL: 3,
  WARNING: 2,
  INFO: 1,
};

const SEVERITY_SPOKEN_LABEL: Record<AlertItem['severity'], string> = {
  CRITICAL: 'Critical alert',
  WARNING: 'Warning alert',
  INFO: 'Advisory',
};

export const ALERT_REANNOUNCE_COOLDOWN_MS = 30_000;
const MAX_ALERT_SPEECH_CHUNK_CHARS = 1200;

export interface AlertEpisodeState {
  severity: AlertItem['severity'];
  acknowledged: boolean;
  lastSeenAt: number;
  announcedAt: number;
}

function ensureSentencePunctuation(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';
  return /[.!?]$/.test(collapsed) ? collapsed : `${collapsed}.`;
}

export interface CrewAlertAnnouncement {
  astronautId: string;
  alertKeys: string[];
  text: string;
}

/**
 * Formats one alert into a concise spoken summary containing only the alert
 * topic (severity + short label) and recommended action, skipping verbose prose.
 */
export function formatSingleAlertSpeech(alert: AlertItem, crewName?: string): string {
  const topic = ALERT_LABELS[alert.alert_type] ?? alert.alert_type.toLowerCase().replace(/_/g, ' ');
  const severity = SEVERITY_SPOKEN_LABEL[alert.severity] ?? 'Alert';
  const spokenName = crewName?.trim();
  const summary = spokenName ? `${severity} for ${spokenName}: ${topic}.` : `${severity}: ${topic}.`;
  const action = alert.recommended_action ? ensureSentencePunctuation(alert.recommended_action) : '';
  return action ? `${summary} Action: ${action}` : summary;
}

function orderActiveUniqueAlerts(alerts: AlertItem[]): AlertItem[] {
  const deduped = new Map<string, AlertItem>();
  for (const alert of alerts) {
    if (alert.acknowledged) continue;
    const key = `${alert.astronaut_id}:${alert.alert_type}`;
    const existing = deduped.get(key);
    if (!existing || ALERT_SEVERITY_RANK[alert.severity] > ALERT_SEVERITY_RANK[existing.severity]) {
      deduped.set(key, alert);
    }
  }

  return [...deduped.values()].sort((a, b) => {
    const rankDiff = ALERT_SEVERITY_RANK[b.severity] - ALERT_SEVERITY_RANK[a.severity];
    if (rankDiff !== 0) return rankDiff;
    return b.timestamp.localeCompare(a.timestamp);
  });
}

/**
 * Formats every active unacknowledged alert into natural spoken sentences,
 * deduplicated per astronaut and alert type and prioritized by severity.
 */
export function buildAlertAnnouncementText(
  alerts: AlertItem[],
  crewNames?: Record<string, string>,
): string {
  const ordered = orderActiveUniqueAlerts(alerts);
  if (!ordered.length) return '';
  return ordered
    .map(alert => formatSingleAlertSpeech(alert, crewNames?.[alert.astronaut_id]))
    .join(' ');
}

/** Filter alerts to the currently selected astronaut so background dictation never reads peer profiles. */
export function selectAlertsForProfile(alerts: AlertItem[], astronautId: string): AlertItem[] {
  if (!astronautId) return [];
  return alerts.filter(alert => alert.astronaut_id === astronautId);
}

/**
 * Splits active unacknowledged alerts per crew profile into TTS-sized sequential
 * utterances with the active profile first and without truncating alert counts.
 */
export function buildAlertAnnouncementsByCrew(
  alerts: AlertItem[],
  crewNames?: Record<string, string>,
  preferredAstronautId?: string,
): CrewAlertAnnouncement[] {
  const grouped = new Map<string, AlertItem[]>();
  for (const alert of alerts) {
    if (alert.acknowledged) continue;
    const list = grouped.get(alert.astronaut_id);
    if (list) list.push(alert);
    else grouped.set(alert.astronaut_id, [alert]);
  }

  const maxRank = (items: AlertItem[]) =>
    items.reduce((best, item) => Math.max(best, ALERT_SEVERITY_RANK[item.severity]), 0);

  const entries = [...grouped.entries()].sort(([idA, itemsA], [idB, itemsB]) => {
    if (idA === preferredAstronautId) return -1;
    if (idB === preferredAstronautId) return 1;
    return maxRank(itemsB) - maxRank(itemsA);
  });

  const announcements: CrewAlertAnnouncement[] = [];
  for (const [astronautId, items] of entries) {
    const ordered = orderActiveUniqueAlerts(items);
    if (!ordered.length) continue;

    let chunkTexts: string[] = [];
    let chunkKeys: string[] = [];
    let chunkLength = 0;

    const flushChunk = () => {
      if (!chunkTexts.length) return;
      announcements.push({
        astronautId,
        alertKeys: chunkKeys,
        text: chunkTexts.join(' '),
      });
      chunkTexts = [];
      chunkKeys = [];
      chunkLength = 0;
    };

    for (const alert of ordered) {
      const sentence = formatSingleAlertSpeech(alert, crewNames?.[alert.astronaut_id]);
      if (!sentence) continue;
      const key = `${alert.astronaut_id}:${alert.alert_type}`;
      const projected = chunkLength === 0 ? sentence.length : chunkLength + 1 + sentence.length;
      if (chunkTexts.length > 0 && projected > MAX_ALERT_SPEECH_CHUNK_CHARS) {
        flushChunk();
      }
      chunkTexts.push(sentence);
      chunkKeys.push(key);
      chunkLength = chunkLength === 0 ? sentence.length : chunkLength + 1 + sentence.length;
    }
    flushChunk();
  }
  return announcements;
}

/**
 * Returns newly triggered or severity-escalated unacknowledged alerts across
 * telemetry ticks so continuous polling does not repeat identical alerts.
 */
export function selectNewlyTriggeredAlerts(
  observations: AlertItem[],
  tracked: Map<string, AlertEpisodeState>,
  nowMs = Date.now(),
  cooldownMs = ALERT_REANNOUNCE_COOLDOWN_MS,
): AlertItem[] {
  const collapsed = new Map<string, AlertItem>();
  for (const alert of observations) {
    const key = `${alert.astronaut_id}:${alert.alert_type}`;
    const existing = collapsed.get(key);
    if (!existing) {
      collapsed.set(key, alert);
      continue;
    }
    const existingUnacked = !existing.acknowledged;
    const candidateUnacked = !alert.acknowledged;
    if (candidateUnacked !== existingUnacked) {
      if (candidateUnacked) collapsed.set(key, alert);
      continue;
    }
    if (ALERT_SEVERITY_RANK[alert.severity] > ALERT_SEVERITY_RANK[existing.severity]) {
      collapsed.set(key, alert);
    }
  }

  for (const [key, entry] of tracked.entries()) {
    if (!collapsed.has(key) && nowMs - entry.lastSeenAt >= cooldownMs) {
      tracked.delete(key);
    }
  }

  const triggered: AlertItem[] = [];
  for (const [key, alert] of collapsed.entries()) {
    const prev = tracked.get(key);
    if (alert.acknowledged) {
      tracked.set(key, {
        severity: alert.severity,
        acknowledged: true,
        lastSeenAt: nowMs,
        announcedAt: prev?.announcedAt ?? nowMs,
      });
      continue;
    }

    const currentRank = ALERT_SEVERITY_RANK[alert.severity];
    const prevRank = prev ? ALERT_SEVERITY_RANK[prev.severity] : 0;
    const shouldAnnounce = !prev || prev.acknowledged || currentRank > prevRank;

    if (shouldAnnounce) {
      tracked.set(key, {
        severity: alert.severity,
        acknowledged: false,
        lastSeenAt: nowMs,
        announcedAt: nowMs,
      });
      triggered.push(alert);
    } else {
      tracked.set(key, {
        severity: currentRank >= prevRank ? alert.severity : prev.severity,
        acknowledged: false,
        lastSeenAt: nowMs,
        announcedAt: prev.announcedAt,
      });
    }
  }

  return triggered.sort((a, b) => ALERT_SEVERITY_RANK[b.severity] - ALERT_SEVERITY_RANK[a.severity]);
}

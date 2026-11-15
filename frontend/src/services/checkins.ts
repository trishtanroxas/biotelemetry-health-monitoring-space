import { localDb } from '../db/localDb';
import type { CheckIn, MetabolicCheckIn } from '../types/wellness';
import type { VitalSigns } from '../types/telemetry';
import type { SpaceWellnessV1 } from '../types/spaceWellness';
import {
  fetchCheckInsRemote,
  isOnlineHttpBrowser,
  syncCheckInRemote,
  type RemoteCheckInRow,
} from './api';
import { notifyWellnessChange } from './wellnessEvents';
import { validateSpaceRecord } from './spaceWellness';

export interface CheckInService {
  list(astronautId: string): Promise<CheckIn[]>;
  save(record: CheckIn): Promise<void>;
}
export function validateCheckIn(record: CheckIn): string | null {
  const ranges: [number, number, number][] = [[record.sleepHours, 0, 24], [record.sleepQuality, 1, 5], [record.fatigue, 1, 5], [record.stress, 1, 5], [record.exerciseMinutes, 0, 1440]];
  if (ranges.some(([value, min, max]) => !Number.isFinite(value) || value < min || value > max)) return 'Please enter values within the indicated ranges.';
  if (!['Very low', 'Low', 'Okay', 'Good', 'Great'].includes(record.mood)) return 'Please choose your mood.';
  if (record.notes.length > 2000 || record.symptoms.length > 500) return 'Please shorten your symptoms or notes.';
  if (record.spaceWellness?.environment && (record.spaceWellness.environment.version !== 1 || record.spaceWellness.environment.astronautId !== record.astronautId)) return 'Environment context must belong to the selected astronaut.';
  return validateSpaceRecord(record.spaceWellness);
}
const MOOD_LABELS = ['Very low', 'Low', 'Okay', 'Good', 'Great'] as const;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function sanitizeSpaceWellness(spaceWellness: SpaceWellnessV1 | undefined): Record<string, unknown> | undefined {
  if (!spaceWellness) return undefined;
  return {
    version: spaceWellness.version,
    mode: spaceWellness.mode,
    // Strip free-text pain.location and pain.notes so only numeric pain intensity leaves the device.
    ...(spaceWellness.pain?.intensity !== undefined ? { pain: { intensity: spaceWellness.pain.intensity } } : {}),
    ...(spaceWellness.mental ? { mental: spaceWellness.mental } : {}),
    ...(spaceWellness.sleep ? { sleep: spaceWellness.sleep } : {}),
    ...(spaceWellness.environment ? { environment: spaceWellness.environment } : {}),
  };
}

export function toRemoteCheckInPayload(record: CheckIn): Record<string, unknown> {
  const moodScore = MOOD_LABELS.indexOf(record.mood as (typeof MOOD_LABELS)[number]) + 1 || undefined;
  const safeSpace = sanitizeSpaceWellness(record.spaceWellness);
  return {
    client_id: record.id,
    astronaut_id: record.astronautId,
    recorded_at: record.createdAt,
    mood: moodScore,
    energy: Math.max(1, 6 - record.fatigue),
    stress: record.stress,
    sleep_hours: record.sleepHours,
    pain_level: record.spaceWellness?.pain?.intensity,
    blood_glucose_mg_dl: record.metabolic?.bloodGlucoseMgDl,
    hydration_ml: record.metabolic?.hydrationMl,
    nutrition_quality: record.metabolic?.nutritionQuality,
    immune_symptoms: record.metabolic?.immuneSymptoms ?? [],
    metrics: {
      sleepQuality: record.sleepQuality,
      fatigue: record.fatigue,
      moodLabel: record.mood,
      exerciseMinutes: record.exerciseMinutes,
      ...(record.biometrics ? { biometrics: record.biometrics } : {}),
      ...(safeSpace ? { spaceWellness: safeSpace } : {}),
    },
  };
}

export function remoteRowToCheckIn(row: RemoteCheckInRow): CheckIn {
  const metrics = (row.metrics && typeof row.metrics === 'object' ? row.metrics : {}) as Record<string, unknown>;
  const moodIdx = clampInt(row.mood, 1, 5, 3) - 1;
  const moodLabel =
    typeof metrics.moodLabel === 'string' && metrics.moodLabel.trim()
      ? metrics.moodLabel.trim()
      : MOOD_LABELS[moodIdx];
  const derivedFatigue = typeof row.energy === 'number' ? clampInt(6 - row.energy, 1, 5, 3) : 3;
  const fatigue = clampInt(metrics.fatigue, 1, 5, derivedFatigue);

  const nutritionRaw = row.nutrition_quality;
  const nutritionQuality: MetabolicCheckIn['nutritionQuality'] =
    nutritionRaw === 'poor' || nutritionRaw === 'adequate' || nutritionRaw === 'optimal'
      ? nutritionRaw
      : undefined;
  const hasMetabolic =
    typeof row.blood_glucose_mg_dl === 'number' ||
    typeof row.hydration_ml === 'number' ||
    nutritionQuality !== undefined ||
    (Array.isArray(row.immune_symptoms) && row.immune_symptoms.length > 0);
  const metabolic: MetabolicCheckIn | undefined = hasMetabolic
    ? {
        ...(typeof row.blood_glucose_mg_dl === 'number' ? { bloodGlucoseMgDl: row.blood_glucose_mg_dl } : {}),
        ...(typeof row.hydration_ml === 'number' ? { hydrationMl: row.hydration_ml } : {}),
        ...(nutritionQuality ? { nutritionQuality } : {}),
        ...(Array.isArray(row.immune_symptoms) && row.immune_symptoms.length > 0
          ? { immuneSymptoms: row.immune_symptoms }
          : {}),
      }
    : undefined;

  const rawBiometrics = metrics.biometrics && typeof metrics.biometrics === 'object'
    ? (metrics.biometrics as Record<string, unknown>)
    : null;
  const normalizedSource =
    rawBiometrics?.telemetry_source === 'measured' || rawBiometrics?.telemetry_source === 'manual'
      ? rawBiometrics.telemetry_source
      : 'simulated';
  const biometrics: VitalSigns | null = rawBiometrics
    ? ({ ...rawBiometrics, telemetry_source: normalizedSource } as unknown as VitalSigns)
    : null;

  const rawSpace = metrics.spaceWellness && typeof metrics.spaceWellness === 'object'
    ? (metrics.spaceWellness as SpaceWellnessV1)
    : typeof row.pain_level === 'number'
      ? ({ version: 1, mode: 'local-demo', pain: { intensity: row.pain_level } } as SpaceWellnessV1)
      : undefined;
  const validSpace = rawSpace && validateSpaceRecord(rawSpace) === null ? rawSpace : undefined;

  return {
    id: row.client_id || row.id || `remote-checkin-${row.astronaut_id}-${row.recorded_at}`,
    astronautId: row.astronaut_id,
    createdAt: row.recorded_at,
    sleepHours:
      typeof row.sleep_hours === 'number' && Number.isFinite(row.sleep_hours)
        ? Math.max(0, Math.min(24, row.sleep_hours))
        : 7,
    sleepQuality: clampInt(metrics.sleepQuality, 1, 5, 3),
    fatigue,
    stress: clampInt(row.stress, 1, 5, 3),
    mood: moodLabel,
    exerciseMinutes: clampInt(metrics.exerciseMinutes, 0, 1440, 0),
    symptoms: '',
    notes: '',
    biometrics,
    syncStatus: 'synced',
    ...(metabolic ? { metabolic } : {}),
    ...(validSpace ? { spaceWellness: validSpace } : {}),
  };
}

export const checkins: CheckInService = {
  async list(astronautId) {
    const localItems = await localDb.checkins.where('astronautId').equals(astronautId).reverse().sortBy('createdAt');
    if (!isOnlineHttpBrowser()) return localItems;
    try {
      const { records } = await fetchCheckInsRemote(astronautId, 60);
      if (!Array.isArray(records) || records.length === 0) return localItems;
      const merged = new Map<string, CheckIn>();
      for (const item of localItems) merged.set(item.id, item);
      const toCache: CheckIn[] = [];
      for (const row of records) {
        const mapped = remoteRowToCheckIn(row);
        const existing = merged.get(mapped.id);
        if (existing) {
          // Preserve local private free-text notes/symptoms while reflecting remote sync state.
          const updated: CheckIn = existing.syncStatus === 'synced' ? existing : { ...existing, syncStatus: 'synced' };
          merged.set(mapped.id, updated);
          if (existing.syncStatus !== 'synced') toCache.push(updated);
        } else {
          merged.set(mapped.id, mapped);
          toCache.push(mapped);
        }
      }
      if (toCache.length > 0) {
        await localDb.checkins.bulkPut(toCache).catch(() => {});
      }
      return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return localItems;
    }
  },
  async save(record) {
    const error = validateCheckIn(record);
    if (error) throw new Error(error);
    await localDb.checkins.add(record);
    // Sync privacy-safe numeric/categorical fields; free-text notes remain local.
    const payload = toRemoteCheckInPayload(record);
    if (isOnlineHttpBrowser()) {
      try {
        const res = await syncCheckInRemote(payload);
        if (res?.persisted) {
          await localDb.checkins.bulkPut([{ ...record, syncStatus: 'synced' }]).catch(() => {});
        }
      } catch {
        // Keep local pending record when backend is unreachable.
      }
    } else {
      void syncCheckInRemote(payload).catch(() => {});
    }
  },
};

// A persisted draft keeps its record ID until its answers change. Replaying a
// submission after a reload must not add the same record twice.
export async function saveCheckInOnce(record: CheckIn): Promise<CheckIn> {
  const existing = await localDb.checkins.get(record.id);
  if (existing) {
    if (existing.astronautId !== record.astronautId) throw new Error('This record belongs to a different astronaut. Your draft was retained.');
    notifyWellnessChange({ kind: 'checkin', record: existing });
    return existing;
  }
  try { await checkins.save(record); }
  catch (cause) {
    const committed = await localDb.checkins.get(record.id);
    if (committed?.astronautId === record.astronautId) {
      notifyWellnessChange({ kind: 'checkin', record: committed });
      return committed;
    }
    throw cause;
  }
  notifyWellnessChange({ kind: 'checkin', record });
  return record;
}

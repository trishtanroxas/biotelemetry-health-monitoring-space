import { localDb } from '../db/localDb';
import type { CheckIn } from '../types/wellness';
import { syncCheckInRemote } from './api';
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
// Explicit local adapter: records remain pending until a server contract is agreed.
export const checkins: CheckInService = {
  list: (astronautId) => localDb.checkins.where('astronautId').equals(astronautId).reverse().sortBy('createdAt'),
  async save(record) {
    const error = validateCheckIn(record);
    if (error) throw new Error(error);
    await localDb.checkins.add(record);
    // Background sync to backend — numeric/categorical fields; free-text notes remain local
    void syncCheckInRemote({
      client_id: record.id,
      astronaut_id: record.astronautId,
      recorded_at: record.createdAt,
      mood: ['Very low', 'Low', 'Okay', 'Good', 'Great'].indexOf(record.mood) + 1 || undefined,
      energy: Math.max(1, 6 - record.fatigue),
      stress: record.stress,
      sleep_hours: record.sleepHours,
      pain_level: record.spaceWellness?.pain?.intensity,
      blood_glucose_mg_dl: record.metabolic?.bloodGlucoseMgDl,
      hydration_ml: record.metabolic?.hydrationMl,
      nutrition_quality: record.metabolic?.nutritionQuality,
      immune_symptoms: record.metabolic?.immuneSymptoms ?? [],
      metrics: { sleepQuality: record.sleepQuality, exerciseMinutes: record.exerciseMinutes },
    }).catch(() => { /* Background sync failure should not block offline-first local save */ });
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

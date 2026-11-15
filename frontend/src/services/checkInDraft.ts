import type { CheckIn } from '../types/wellness';
import type { VitalSigns } from '../types/telemetry';
import { emptySpaceDraft, type SpaceDraftFields } from '../types/spaceWellness';
import { extensionFromDraft, validateSpaceDraft } from './spaceWellness';

// UI-only state. The stored CheckIn shape and database version remain unchanged.
export interface CheckInDraft extends SpaceDraftFields {
  sleepHours: string; sleepQuality: number; fatigue: number; stress: number;
  mood: string; exercise: '' | 'yes' | 'no'; exerciseMinutes: string; symptoms: string; notes: string;
  bloodGlucoseMgDl?: string; hydrationMl?: string; nutritionQuality?: '' | 'poor' | 'adequate' | 'optimal'; immuneSymptoms?: string;
}
export const createCheckInDraft = (): CheckInDraft => ({ ...emptySpaceDraft(), sleepHours: '', sleepQuality: 3, fatigue: 3, stress: 3, mood: '', exercise: '', exerciseMinutes: '', symptoms: '', notes: '', bloodGlucoseMgDl: '', hydrationMl: '', nutritionQuality: '', immuneSymptoms: '' });
export function checkInStepError(draft: CheckInDraft, step: number): string | null {
  if (step === 0) {
    if (draft.sleepHours.trim() === '' || !Number.isFinite(Number(draft.sleepHours)) || Number(draft.sleepHours) < 0 || Number(draft.sleepHours) > 24 || Number(draft.sleepHours) % 0.25 !== 0) return 'Enter your sleep duration from 0 to 24 hours, in quarter-hour steps.';
    if ([draft.sleepQuality, draft.fatigue].some(value => !Number.isInteger(value) || value < 1 || value > 5)) return 'Choose sleep quality and tiredness from 1 to 5.';
  }
  if (step === 1) {
    if (!Number.isInteger(draft.stress) || draft.stress < 1 || draft.stress > 5) return 'Choose a stress level from 1 to 5.';
    if (!['Very low', 'Low', 'Okay', 'Good', 'Great'].includes(draft.mood)) return 'Choose the mood that fits how you feel.';
    if (draft.symptoms.length > 500) return 'Keep symptoms to 500 characters or fewer.';
  }
  if (step === 2) {
    if (!['yes', 'no'].includes(draft.exercise)) return 'Tell us whether you exercised today.';
    if (draft.exercise === 'yes' && (draft.exerciseMinutes.trim() === '' || !Number.isInteger(Number(draft.exerciseMinutes)) || Number(draft.exerciseMinutes) < 1 || Number(draft.exerciseMinutes) > 1440)) return 'Enter completed exercise time from 1 to 1,440 minutes.';
    if (draft.notes.length > 2000) return 'Keep personal notes to 2,000 characters or fewer.';
  }
  return validateSpaceDraft(draft, step);
}
export function recordFromDraft(draft: CheckInDraft, astronautId: string, biometrics: VitalSigns | null, id: string = crypto.randomUUID(), now = new Date()): CheckIn {
  const extension = extensionFromDraft(draft);
  const glu = draft.bloodGlucoseMgDl?.trim();
  const hyd = draft.hydrationMl?.trim();
  const nut = draft.nutritionQuality;
  const imm = draft.immuneSymptoms?.trim();
  const hasMetabolic = Boolean(glu || hyd || nut || imm);
  const metabolic = hasMetabolic
    ? {
        ...(glu ? { bloodGlucoseMgDl: Number(glu) } : {}),
        ...(hyd ? { hydrationMl: Number(hyd) } : {}),
        ...(nut ? { nutritionQuality: nut } : {}),
        ...(imm ? { immuneSymptoms: imm.split(',').map(s => s.trim()).filter(Boolean) } : {}),
      }
    : undefined;
  return { id, astronautId, createdAt: now.toISOString(), sleepHours: Number(draft.sleepHours), sleepQuality: draft.sleepQuality, fatigue: draft.fatigue, stress: draft.stress, mood: draft.mood, exerciseMinutes: draft.exercise === 'yes' ? Number(draft.exerciseMinutes) : 0, symptoms: draft.symptoms.trim(), notes: draft.notes.trim(), biometrics, syncStatus: 'pending', ...(extension ? { spaceWellness: extension } : {}), ...(metabolic ? { metabolic } : {}) };
}

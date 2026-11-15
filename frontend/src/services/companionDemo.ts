import type { CheckIn } from '../types/wellness';
import type { VisionObservation } from './companion';
import { localDate } from './missions';

export type CompanionScenario = 'steady' | 'demanding' | 'recovery';
export const companionScenarios = [
  { id: 'steady' as const, title: 'Steady week', description: 'Fictional entries with relatively consistent sleep and activity.' },
  { id: 'demanding' as const, title: 'Demanding week', description: 'Fictional entries show shorter sleep, rising fatigue, less recorded exercise, and a reported vision change. These observations do not establish a common cause.' },
  { id: 'recovery' as const, title: 'Recovery week', description: 'Fictional entries show longer sleep and lower reported fatigue over time. This scenario does not demonstrate treatment effectiveness.' },
];
const profiles = {
  steady: { sleep: [8, 7.5, 8, 7.5, 8, 8, 8], exercise: [35, 40, 30, 40, 35, 0, 40], fatigue: [2, 2, 2, 3, 2, 2, 2], stress: [2, 2, 3, 2, 2, 2, 2], pain: [0, 0, 1, 0, 0, 0, 0] },
  demanding: { sleep: [7.5, 7, 6.5, 6, 5.5, 5.5, 5], exercise: [40, 35, 30, 20, 15, 0, 0], fatigue: [2, 2, 3, 3, 4, 4, 5], stress: [2, 3, 3, 4, 4, 4, 5], pain: [0, 0, 1, 1, 2, 3, 4] },
  recovery: { sleep: [5.5, 6, 6.5, 7, 7.5, 8, 8], exercise: [0, 10, 15, 20, 25, 30, 35], fatigue: [5, 4, 4, 3, 3, 2, 2], stress: [4, 4, 3, 3, 2, 2, 2], pain: [4, 3, 3, 2, 2, 1, 1] },
};

// Presentation-only fixtures. Nothing here writes to IndexedDB, localStorage,
// telemetry, or a server. Scenario values are invented, not NASA estimates.
export function buildCompanionDemo(astronautId: string, scenario: CompanionScenario, day: number, now = new Date()) {
  if (!Object.prototype.hasOwnProperty.call(profiles, scenario)) throw new Error('Unknown demo scenario.');
  if (!Number.isInteger(day) || day < 1 || day > 7 || !Number.isFinite(now.getTime())) throw new Error('Choose a demo day from 1 to 7.');
  const profile = profiles[scenario];
  const records: CheckIn[] = [];
  const vision: VisionObservation[] = [];
  for (let index = 0; index < day; index++) {
    const date = new Date(now); date.setDate(date.getDate() - 6 + index);
    const createdAt = date.toISOString();
    records.push({ id: `demo:${astronautId}:${scenario}:${localDate(date)}`, astronautId, createdAt,
      sleepHours: profile.sleep[index], sleepQuality: profile.fatigue[index] >= 4 ? 2 : 4,
      fatigue: profile.fatigue[index], stress: profile.stress[index], mood: profile.fatigue[index] >= 4 ? 'Low' : 'Good',
      exerciseMinutes: profile.exercise[index], symptoms: '', notes: 'Synthetic presentation entry. Not a real astronaut observation.',
      biometrics: null, syncStatus: 'pending', spaceWellness: { version: 1, mode: 'local-demo', pain: { intensity: profile.pain[index] } },
    });
    vision.unshift({ id: `demo:vision:${astronautId}:${scenario}:${index}`, astronautId, createdAt,
      status: scenario === 'demanding' && index >= 4 ? 'change' : scenario === 'recovery' && index < 2 ? 'unsure' : 'no-change' });
  }
  const first = records[0], latest = records[records.length - 1];
  return { records, vision, first, latest, sleepChangeFromStart: latest.sleepHours - first.sleepHours,
    fatigueChangeFromStart: latest.fatigue - first.fatigue };
}

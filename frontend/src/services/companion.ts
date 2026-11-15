import type { CheckIn } from '../types/wellness';
import { localDate } from './missions';

export interface WeatherDay { date: string; flares: number; mClass: number; xClass: number; sep: number; maxKp: number | null }
export function decodeWeather(rows: (string | number | null)[][]): WeatherDay[] {
  return rows.map(([date, flares, mClass, xClass, sep, maxKp]) => ({ date: String(date), flares: Number(flares), mClass: Number(mClass), xClass: Number(xClass), sep: Number(sep), maxKp: maxKp === null ? null : Number(maxKp) }));
}
export function weatherSummary(day: WeatherDay): string {
  return day.flares || day.sep || day.maxKp !== null ? `${day.flares} flares · ${day.sep} particle entries` : 'No catalog entries';
}

// One latest check-in per local calendar day. Multiple edits/reports on the
// same day must not inflate completed exercise time or seven-day coverage.
export function companionSummary(astronautId: string, records: CheckIn[], now = new Date()) {
  const valid = records.filter(r => r.astronautId === astronautId && Number.isFinite(Date.parse(r.createdAt)) && new Date(r.createdAt) <= now)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6);
  const days = new Map<string, CheckIn>();
  valid.filter(r => new Date(r.createdAt) >= start).forEach(r => { const day = localDate(new Date(r.createdAt)); if (!days.has(day)) days.set(day, r); });
  const week = [...days.values()];
  const latest = valid[0] ?? null, previous = valid[1] ?? null;
  return {
    latest, previous, week, coverage: week.length,
    exerciseMinutes: week.reduce((sum, r) => sum + r.exerciseMinutes, 0),
    exerciseDays: week.filter(r => r.exerciseMinutes > 0).length,
    sleepAverage: week.length ? week.reduce((sum, r) => sum + r.sleepHours, 0) / week.length : null,
    sleepChange: latest && previous ? latest.sleepHours - previous.sleepHours : null,
  };
}

export type VisionStatus = 'no-change' | 'change' | 'unsure';
export interface VisionObservation { id: string; astronautId: string; createdAt: string; status: VisionStatus }
export const visionLabels: Record<VisionStatus, string> = { 'no-change': 'No change noticed', change: 'Change noticed', unsure: 'Not sure' };
const visionKey = (id: string) => `biotelemetry:vision:v1:${encodeURIComponent(id)}`;
type ReadStorage = Pick<Storage, 'getItem'>;
export function loadVisionObservations(astronautId: string, storage: ReadStorage): VisionObservation[] {
  const raw = storage.getItem(visionKey(astronautId));
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.some(r => !r || typeof r.id !== 'string' || r.astronautId !== astronautId || typeof r.createdAt !== 'string' || !Number.isFinite(Date.parse(r.createdAt)) || !Object.prototype.hasOwnProperty.call(visionLabels, r.status))) {
    throw new Error('Saved vision observations could not be restored. Existing data was retained.');
  }
  return (value as VisionObservation[]).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
export function saveVisionObservation(astronautId: string, status: VisionStatus, storage: Pick<Storage, 'getItem' | 'setItem'>, now = new Date()): VisionObservation[] {
  if (!Object.prototype.hasOwnProperty.call(visionLabels, status)) throw new Error('Choose a vision observation.');
  const existing = loadVisionObservations(astronautId, storage);
  const next = [{ id: crypto.randomUUID(), astronautId, createdAt: now.toISOString(), status }, ...existing];
  storage.setItem(visionKey(astronautId), JSON.stringify(next));
  return next;
}

import type { SelfExamType, VitalSigns } from './telemetry';
import type { SpaceWellnessV1 } from './spaceWellness';

export interface MetabolicCheckIn {
  bloodGlucoseMgDl?: number;
  hydrationMl?: number;
  nutritionQuality?: 'poor' | 'adequate' | 'optimal';
  immuneSymptoms?: string[];
}

export interface CheckIn {
  id: string;
  astronautId: string;
  createdAt: string;
  sleepHours: number;
  sleepQuality: number;
  fatigue: number;
  stress: number;
  mood: string;
  exerciseMinutes: number;
  symptoms: string;
  notes: string;
  biometrics: VitalSigns | null;
  syncStatus: 'pending' | 'synced';
  spaceWellness?: SpaceWellnessV1;
  metabolic?: MetabolicCheckIn;
}

export type MissionCategory =
  | 'Physical countermeasures'
  | 'Medical & exams'
  | 'Metabolic & hydration'
  | 'Sleep & behavioral';

export type VerificationMode = 'auto-checkin' | 'auto-exam' | 'auto-or-manual' | 'manual';

export interface Mission {
  id: string;
  category: MissionCategory;
  title: string;
  description: string;
  kind: 'Routine' | 'Recommended';
  verificationMode: VerificationMode;
  estimatedMinutes: number;
  targetPage?: Page;
  targetExam?: SelfExamType;
}

export interface MissionCompletion {
  key: string;
  astronautId: string;
  missionId: string;
  date: string;
  completedAt: string;
}

export type Page = 'dashboard' | 'checkin' | 'analytics' | 'missions' | 'ai';
export type TimeRange = 'day' | 'week' | 'month';

export interface AssistantAction {
  label: string;
  targetPage: Page;
  targetExam?: SelfExamType;
  protocolId?: string;
}

export interface AssistantReply {
  facts: string;
  explanation: string;
  action: string;
  sourceLabel?: string;
  nasaReference?: string;
  escalate?: string;
  suggestedActions?: AssistantAction[];
  sbarText?: string;
}

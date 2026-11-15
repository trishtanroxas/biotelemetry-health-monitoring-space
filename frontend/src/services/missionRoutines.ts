import type { ImageAssessmentRecord, SelfExamType, VitalSigns } from '../types/telemetry';
import type { CheckIn, Mission, MissionCompletion, Page } from '../types/wellness';
import { localDate, missionCatalog, normalizeMissionId } from './missions';

export interface ScheduledPrompt {
  id: string;
  priority: 'high' | 'routine';
  title: string;
  detail: string;
  actionLabel: string;
  targetPage: Page;
  targetExam?: SelfExamType;
}

export interface CrewBadge {
  id: string;
  label: string;
  earned: boolean;
  requirement: string;
}

export type ProtocolStatusKind = 'auto-verified' | 'confirmed' | 'due' | 'priority';

export interface ProtocolStatus {
  mission: Mission;
  completed: boolean;
  status: ProtocolStatusKind;
  evidenceText: string;
  canManualToggle: boolean;
  actionLabel?: string;
  targetPage?: Page;
  targetExam?: SelfExamType;
}

export interface ReadinessBreakdown {
  telemetry: number;
  checkIn: number;
  countermeasures: number;
  ocularExam: number;
}

export interface ReadinessSummary {
  readinessScore: number;
  compliancePct: number;
  sevenDayCompliancePct: number;
  verifiedCount: number;
  totalProtocols: number;
  streakDays: number;
  badges: CrewBadge[];
  nextPrompt: ScheduledPrompt;
  prompts: ScheduledPrompt[];
  protocolStatuses: ProtocolStatus[];
  topProtocols: ProtocolStatus[];
  readinessBreakdown: ReadinessBreakdown;
}

export function computeCheckInStreak(records: CheckIn[], now = new Date()): number {
  if (!records.length) return 0;
  const days = new Set(records.map(r => localDate(new Date(r.createdAt))));
  let streak = 0;
  const cursor = new Date(now);
  // Allow streak starting today OR yesterday so morning check-in before logging doesn't wipe streak.
  if (!days.has(localDate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (days.has(localDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function getAutoVerificationEvidence(
  missionId: string,
  todayRecords: CheckIn[],
  todayExams: ImageAssessmentRecord[],
  recentOcular: ImageAssessmentRecord | undefined,
): string | null {
  const latestToday = [...todayRecords].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const maxExercise = todayRecords.reduce((max, r) => Math.max(max, r.exerciseMinutes || 0), 0);
  const maxHydration = todayRecords.reduce((max, r) => Math.max(max, r.metabolic?.hydrationMl ?? 0), 0);
  const hasGlucoseOrNutrition = todayRecords.some(
    r => r.metabolic?.bloodGlucoseMgDl !== undefined || Boolean(r.metabolic?.nutritionQuality),
  );
  const hasGlucometerExam = todayExams.some(e => e.examType === 'glucometer_nutrition');
  const hasDermalExam = todayExams.some(e => e.examType === 'dermal_radiation');
  const maxSleep = todayRecords.reduce((max, r) => Math.max(max, r.sleepHours || 0), 0);

  switch (missionId) {
    case 'daily-checkin':
      return latestToday ? `Auto-verified from Check-In (${new Date(latestToday.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : null;
    case 'physical-ared':
      return maxExercise >= 30 ? `Auto-verified (${maxExercise} min exercise logged)` : null;
    case 'cardio-aerobic':
      return maxExercise >= 45 ? `Auto-verified (${maxExercise} min exercise logged)` : null;
    case 'hydration-target':
      return maxHydration >= 2200 ? `Auto-verified (${maxHydration} mL logged)` : null;
    case 'glucose-nutrition':
      if (hasGlucometerExam) return 'Auto-verified by Glucometer Self-Exam today';
      if (hasGlucoseOrNutrition) return 'Auto-verified from Check-In metabolic log';
      return null;
    case 'sans-ultrasound':
      return recentOcular ? `Auto-verified (${new Date(recentOcular.recordedAt).toLocaleDateString()})` : null;
    case 'dermal-shielding':
      return hasDermalExam ? 'Auto-verified by Dermal Self-Exam today' : null;
    case 'circadian-sleep':
      return maxSleep >= 7 ? `Auto-verified (${maxSleep}h sleep logged)` : null;
    default:
      return null;
  }
}

export function evaluateMissionRoutines(params: {
  vitals: VitalSigns;
  records: CheckIn[];
  completions: MissionCompletion[];
  assessments: ImageAssessmentRecord[];
  kpIndex: number;
  now?: Date;
}): ReadinessSummary {
  const { vitals, records, completions, assessments, kpIndex, now = new Date() } = params;
  const today = localDate(now);
  const todayRecords = records.filter(r => localDate(new Date(r.createdAt)) === today);
  const hasTodayCheckIn = todayRecords.length > 0;
  const todayManualSet = new Set(
    completions.filter(c => c.date === today).map(c => normalizeMissionId(c.missionId)),
  );
  const todayExams = assessments.filter(a => localDate(new Date(a.recordedAt)) === today);
  const recentOcular = assessments.find(
    a => a.examType === 'ocular_ultrasound' && now.getTime() - new Date(a.recordedAt).getTime() <= 7 * 86400_000,
  );
  const streakDays = computeCheckInStreak(records, now);

  const missionDay = vitals.mission_day ?? 14;
  const glucose = vitals.blood_glucose ?? 92;
  const priorityIds = new Set<string>();
  const prompts: ScheduledPrompt[] = [];

  if (kpIndex >= 5.5 || vitals.radiation_rate >= 30) {
    priorityIds.add('dermal-shielding');
    prompts.push({
      id: 'storm-shelter-check',
      priority: 'high',
      title: 'Solar Event Dermal & Shelter Check',
      detail: `Elevated radiation (${vitals.radiation_rate.toFixed(1)} uSv/h · Kp ${kpIndex.toFixed(1)}). Verify shelter quarters & inspect skin.`,
      actionLabel: 'Open Dermal Exam',
      targetPage: 'dashboard',
      targetExam: 'dermal_radiation',
    });
  }

  if (!hasTodayCheckIn) {
    priorityIds.add('daily-checkin');
    prompts.push({
      id: 'daily-checkin',
      priority: 'high',
      title: 'Daily Health & Blood Sugar Check-In',
      detail: 'Log sleep, fatigue, mood, hydration, and capillary blood glucose for today.',
      actionLabel: 'Begin Check-In',
      targetPage: 'checkin',
    });
  }

  if (missionDay >= 15 && !recentOcular) {
    priorityIds.add('sans-ultrasound');
    prompts.push({
      id: 'sans-ultrasound',
      priority: 'high',
      title: `Day ${missionDay} SANS Ocular Ultrasound Due`,
      detail: 'Capture closed-eyelid optic nerve sheath scan to monitor fluid-shift pressure.',
      actionLabel: 'Start Ocular Exam',
      targetPage: 'dashboard',
      targetExam: 'ocular_ultrasound',
    });
  }

  if (glucose < 70 || glucose > 180) {
    priorityIds.add('glucose-nutrition');
    prompts.push({
      id: 'glucometer-verify',
      priority: 'high',
      title: 'Capillary Glucose Verification',
      detail: `Live glucose ${glucose.toFixed(0)} mg/dL outside 70-180 mg/dL target band.`,
      actionLabel: 'Verify Glucometer',
      targetPage: 'dashboard',
      targetExam: 'glucometer_nutrition',
    });
  }

  const protocolStatuses: ProtocolStatus[] = missionCatalog.map(mission => {
    const autoEvidence = getAutoVerificationEvidence(mission.id, todayRecords, todayExams, recentOcular);
    const manualConfirmed = todayManualSet.has(mission.id);
    const completed = Boolean(autoEvidence) || manualConfirmed;
    const status: ProtocolStatusKind = autoEvidence
      ? 'auto-verified'
      : manualConfirmed
        ? 'confirmed'
        : priorityIds.has(mission.id)
          ? 'priority'
          : 'due';
    const canManualToggle = mission.verificationMode === 'manual' || (mission.verificationMode === 'auto-or-manual' && !autoEvidence);
    const evidenceText = autoEvidence
      ? autoEvidence
      : manualConfirmed
        ? 'Confirmed by crew · saved on this device'
        : mission.verificationMode === 'auto-checkin'
          ? 'Auto-verifies upon Check-In'
          : mission.verificationMode === 'auto-exam'
            ? 'Auto-verifies upon Self-Exam'
            : `~${mission.estimatedMinutes} min · Confirm or log in Check-In`;

    const actionLabel = mission.targetExam
      ? 'Open Exam'
      : mission.targetPage === 'checkin'
        ? 'Open Check-In'
        : undefined;

    return {
      mission,
      completed,
      status,
      evidenceText,
      canManualToggle,
      actionLabel,
      targetPage: mission.targetPage,
      targetExam: mission.targetExam,
    };
  });

  const effectiveSet = new Set(protocolStatuses.filter(p => p.completed).map(p => p.mission.id));

  if ((vitals.gravity_g ?? 0) < 0.5 && !effectiveSet.has('physical-ared')) {
    prompts.push({
      id: 'ared-countermeasure',
      priority: 'routine',
      title: 'ARED Bone & Muscle Loading',
      detail: 'Counteract reduced gravity bone demineralization with daily resistive exercise.',
      actionLabel: 'Open Countermeasures',
      targetPage: 'missions',
    });
  }

  if (!prompts.length) {
    prompts.push({
      id: 'pre-eva-review',
      priority: 'routine',
      title: 'Nominal Preventive Wellness Review',
      detail: 'Daily check-in & key protocols current. Review 7-day biometric & wellness trends.',
      actionLabel: 'View Trends',
      targetPage: 'analytics',
    });
  }

  const verifiedCount = effectiveSet.size;
  const totalProtocols = missionCatalog.length;
  const compliancePct = Math.round((verifiedCount / totalProtocols) * 100);

  let sevenDayDone = 0;
  const sevenDayTotal = 7 * totalProtocols;
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() - offset);
    const key = localDate(d);
    const dayRecords = records.filter(r => localDate(new Date(r.createdAt)) === key);
    const dayManual = new Set(completions.filter(c => c.date === key).map(c => normalizeMissionId(c.missionId)));
    const dayExams = assessments.filter(a => localDate(new Date(a.recordedAt)) === key);
    const dayOcular = assessments.find(a => a.examType === 'ocular_ultrasound' && d.getTime() - new Date(a.recordedAt).getTime() >= 0 && d.getTime() - new Date(a.recordedAt).getTime() <= 7 * 86400_000);
    for (const mission of missionCatalog) {
      if (dayManual.has(mission.id) || getAutoVerificationEvidence(mission.id, dayRecords, dayExams, dayOcular)) {
        sevenDayDone += 1;
      }
    }
  }
  const sevenDayCompliancePct = Math.round((sevenDayDone / sevenDayTotal) * 100);

  const telemetryScore = vitals.overall_health_score ?? 88;
  const telemetryPoints = Math.round(telemetryScore * 0.85);
  const checkInBonus = hasTodayCheckIn ? 6 : 0;
  const countermeasureBonus = Math.min(6, verifiedCount);
  const ocularExamBonus = recentOcular ? 3 : 0;
  const readinessScore = Math.max(0, Math.min(100, telemetryPoints + checkInBonus + countermeasureBonus + ocularExamBonus));

  const badges: CrewBadge[] = [
    { id: 'streak-3', label: 'Orbital Streak', earned: streakDays >= 2, requirement: '2+ consecutive check-in days' },
    { id: 'ared-pro', label: 'Bone Guardian', earned: effectiveSet.has('physical-ared'), requirement: 'Complete ARED workout today' },
    { id: 'sans-watch', label: 'SANS Vigilance', earned: Boolean(recentOcular), requirement: 'Log ocular ultrasound within 7d' },
    { id: 'hydrated', label: 'Metabolic Balance', earned: (effectiveSet.has('hydration-target') || (vitals.hydration_pct ?? 96) >= 88) && glucose >= 70 && glucose <= 160, requirement: 'Maintain euglycemia & hydration' },
  ];

  const topProtocols = [...protocolStatuses]
    .sort((a, b) => {
      const rank = (s: ProtocolStatusKind) => (s === 'priority' ? 0 : s === 'due' ? 1 : 2);
      return rank(a.status) - rank(b.status);
    })
    .slice(0, 3);

  return {
    readinessScore,
    compliancePct,
    sevenDayCompliancePct,
    verifiedCount,
    totalProtocols,
    streakDays,
    badges,
    nextPrompt: prompts[0],
    prompts,
    protocolStatuses,
    topProtocols,
    readinessBreakdown: {
      telemetry: telemetryPoints,
      checkIn: checkInBonus,
      countermeasures: countermeasureBonus,
      ocularExam: ocularExamBonus,
    },
  };
}

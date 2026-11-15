import type { SelfExamType, VitalSigns } from '../types/telemetry';
import type { CheckIn, MissionCompletion } from '../types/wellness';
import { localDate, normalizeMissionId } from './missions';

export type BodySystemId =
  | 'neuro_ocular'
  | 'cardiovascular'
  | 'respiratory'
  | 'metabolic'
  | 'musculoskeletal'
  | 'dermal_immune';

export type OrganStatus = 'nominal' | 'warning' | 'critical';

export interface BodyRegionAssessment {
  id: BodySystemId;
  label: string;
  shortLabel: string;
  status: OrganStatus;
  primaryMetric: string;
  functionSummary: string;
  spaceHazardEffect: string;
  selfExamStep: string;
  countermeasures: string[];
  linkedExam?: SelfExamType;
  cx: number;
  cy: number;
}

export function evaluateBodySystems(params: {
  vitals: VitalSigns;
  latestCheckIn?: CheckIn | null;
  completions: MissionCompletion[];
  kpIndex: number;
}): BodyRegionAssessment[] {
  const { vitals, latestCheckIn, completions, kpIndex } = params;
  const today = localDate();
  const todayCompleted = new Set(completions.filter(c => c.date === today).map(c => normalizeMissionId(c.missionId)));
  const todayCheckInExercise = latestCheckIn && localDate(new Date(latestCheckIn.createdAt)) === today ? latestCheckIn.exerciseMinutes : 0;
  const aredDoneToday = todayCompleted.has('physical-ared') || todayCheckInExercise >= 30;

  const painLoc = (latestCheckIn?.spaceWellness?.pain?.location || latestCheckIn?.symptoms || '').toLowerCase();
  const painLevel = latestCheckIn?.spaceWellness?.pain?.intensity ?? 0;
  const sleepHours = latestCheckIn?.sleepHours ?? 7.0;
  const missionDay = vitals.mission_day ?? 14;
  const gravityG = vitals.gravity_g ?? 0;
  const glucose = latestCheckIn?.metabolic?.bloodGlucoseMgDl ?? vitals.blood_glucose ?? 92;
  const hydrationPct = vitals.hydration_pct ?? 96;
  const wbc = vitals.wbc_k_ul ?? 6.1;

  // 1. Neuro & Ocular (SANS)
  const sansRisk = missionDay >= 45 || /head|eye|vision|migraine/.test(painLoc) || sleepHours < 5.5;
  const neuroStatus: OrganStatus =
    painLevel >= 4 && /head|eye|vision/.test(painLoc) ? 'critical' : sansRisk ? 'warning' : 'nominal';

  // 2. Cardiovascular
  const hr = vitals.heart_rate;
  const sbp = vitals.systolic_bp ?? 118;
  const cardioStatus: OrganStatus =
    hr > 145 || vitals.hrv < 20 ? 'critical' : hr > 125 || hr < 45 || sbp < 90 || vitals.hrv < 28 ? 'warning' : 'nominal';

  // 3. Respiratory & Airway
  const spo2 = vitals.spo2;
  const resp = vitals.respiration_rate ?? 14;
  const respStatus: OrganStatus =
    spo2 < 90 ? 'critical' : spo2 < 94 || resp >= 24 || /chest|cough|breath/.test(painLoc) ? 'warning' : 'nominal';

  // 4. Metabolic, Nutrition & Glycemia
  const metStatus: OrganStatus =
    glucose < 55 || glucose > 240
      ? 'critical'
      : glucose < 70 || glucose > 180 || hydrationPct < 84 || vitals.core_temp >= 38.0 || vitals.core_temp <= 35.4
        ? 'warning'
        : 'nominal';

  // 5. Musculoskeletal (Bones & Muscles)
  const boneRisk = (gravityG < 0.5 && missionDay >= 30 && !aredDoneToday) || (painLevel >= 2 && /back|leg|knee|spine|shoulder|muscle|joint/.test(painLoc));
  const muscStatus: OrganStatus = painLevel >= 4 && /back|spine|joint|knee/.test(painLoc) ? 'critical' : boneRisk ? 'warning' : 'nominal';

  // 6. Dermal & Immune System
  const rad = vitals.radiation_rate;
  const immStatus: OrganStatus =
    rad >= 60 ? 'critical' : rad >= 30 || wbc < 3.8 || kpIndex >= 5.5 || /skin|rash|itch|fever/.test(painLoc) ? 'warning' : 'nominal';

  return [
    {
      id: 'neuro_ocular',
      label: 'Brain & Ocular (SANS)',
      shortLabel: 'Head / Eyes',
      status: neuroStatus,
      primaryMetric: `Sleep ${sleepHours.toFixed(1)}h · Day ${missionDay}`,
      functionSummary: 'Regulates intracranial pressure, visual accommodation, circadian rhythm, and vestibular balance.',
      spaceHazardEffect: 'Microgravity shifts bodily fluids headward, increasing optic nerve sheath pressure (SANS); 90-min orbital light cycles fragment circadian sleep.',
      selfExamStep: 'Run a bilateral closed-eyelid B-mode ocular ultrasound 3 mm behind the globe to verify sheath contour.',
      countermeasures: [
        'Complete scheduled SANS Ocular Ultrasound check.',
        'Protect 7+ hours sleep with dim cabin lighting 1 hour pre-sleep.',
        'Escalate immediately if near vision blurs or brow pressure worsens.',
      ],
      linkedExam: 'ocular_ultrasound',
      cx: 50.0,
      cy: 9.2,
    },
    {
      id: 'cardiovascular',
      label: 'Heart & Vasculature',
      shortLabel: 'Heart / BP',
      status: cardioStatus,
      primaryMetric: `${hr.toFixed(0)} bpm · ${Math.round(sbp)}/${Math.round(vitals.diastolic_bp ?? 76)} mmHg`,
      functionSummary: 'Circulates oxygenated blood, adapts stroke volume, and preserves orthostatic brain perfusion.',
      spaceHazardEffect: 'Altered gravity unloads baroreceptors and reduces plasma volume by ~10-15%, triggering tachycardia or post-EVA orthostatic drops.',
      selfExamStep: 'Capture 30s resting ECG Lead-II alongside seated blood pressure and finger pulse check.',
      countermeasures: [
        'Pre-hydrate with 300-500 mL isotonic electrolytes before suit pressurization.',
        'Perform lower-body isometric leg tensing if lightheaded upon standing in partial gravity.',
        'Review Lead-II ECG trace if resting HR exceeds 120 bpm.',
      ],
      cx: 52.5,
      cy: 27.2,
    },
    {
      id: 'respiratory',
      label: 'Lungs & Cabin Airway',
      shortLabel: 'Lungs / O2',
      status: respStatus,
      primaryMetric: `SpO2 ${spo2.toFixed(1)}% · ${resp.toFixed(1)}/min`,
      functionSummary: 'Exchanges alveolar oxygen and clears CO2 inside closed spacecraft and spacesuit loops.',
      spaceHazardEffect: 'Hostile closed environments risk localized CO2 pooling, regolith dust irritation, and decompression hypoxia during EVA transitions.',
      selfExamStep: 'Inspect pulse oximetry trend, count 30s respiratory cadence, and verify cabin airflow fans.',
      countermeasures: [
        'Confirm suit/cabin CO2 scrubber bed pressure and personal circulation fans.',
        'Use wet-wipe airlock dust mitigation protocol after surface EVA.',
        'Switch to backup O2 regulator immediately if SpO2 falls below 92%.',
      ],
      cx: 44.5,
      cy: 25.8,
    },
    {
      id: 'metabolic',
      label: 'Metabolic & Blood Sugar',
      shortLabel: 'Glucose / Temp',
      status: metStatus,
      primaryMetric: `${glucose.toFixed(0)} mg/dL · ${hydrationPct.toFixed(0)}% Hyd · ${vitals.core_temp.toFixed(1)} C`,
      functionSummary: 'Maintains blood glucose fuel for brain/muscle work, thermoregulation, and renal electrolyte balance.',
      spaceHazardEffect: 'EVA workload depletes glycogen while altered insulin sensitivity (OSDR OSD-575) and low cabin humidity raise kidney stone and hypoglycemia risk.',
      selfExamStep: 'Verify capillary fingerstick blood glucose (70-140 mg/dL fasting target) and daily fluid volume.',
      countermeasures: [
        'Log capillary glucose + fluid intake in Check-In or snap glucometer verification.',
        'Consume 15 g fast carbs immediately if <70 mg/dL before or after EVA.',
        'Target 2,200-2,500 mL daily water intake to guard against dehydration.',
      ],
      linkedExam: 'glucometer_nutrition',
      cx: 51.0,
      cy: 35.8,
    },
    {
      id: 'musculoskeletal',
      label: 'Bones & Muscles',
      shortLabel: 'Bones / ARED',
      status: muscStatus,
      primaryMetric: `${gravityG.toFixed(2)}g load · Pain ${painLevel}/5`,
      functionSummary: 'Supports posture, locomotion, calcium storage, and spinal shock absorption.',
      spaceHazardEffect: 'Weightlessness (0g) and partial gravity accelerate trabecular bone demineralization (1-1.5%/mo, OSDR OSD-351/489) and paraspinal disc elongation.',
      selfExamStep: 'Perform bilateral calf/quad strength check and assess lumbar soreness during morning stretch.',
      countermeasures: [
        'Complete ARED resistive loading & aerobic bike session today.',
        'Maintain prescribed Vitamin D + dietary calcium balance.',
        'Log exact discomfort site cleanly in Check-In if spine/joint ache >2/5.',
      ],
      cx: 42.5,
      cy: 61.5,
    },
    {
      id: 'dermal_immune',
      label: 'Skin, Immune & Radiation',
      shortLabel: 'Immune / Skin',
      status: immStatus,
      primaryMetric: `${rad.toFixed(1)} uSv/h · WBC ${wbc.toFixed(1)} K/uL`,
      functionSummary: 'Protects against cosmic ionizing particles, closed-habitat microbes, and EVA abrasion.',
      spaceHazardEffect: 'Space radiation + stress impair T-cell proliferation (OSD-575 shows ~31% lymphocyte reduction) and delay dermal barrier healing.',
      selfExamStep: 'Photograph skin redness, suit rub zones, or rashes at 20 cm under cabin lighting.',
      countermeasures: [
        'Move to polyethylene-lined storm shelter rack whenever Kp >= 5 or dose >= 30 uSv/h.',
        'Capture Dermal Self-Exam photo if any rash or slow-healing scratch appears.',
        'Maintain cabin HEPA airflow and hand hygiene prior to meals.',
      ],
      linkedExam: 'dermal_radiation',
      cx: 68.5,
      cy: 42.0,
    },
  ];
}

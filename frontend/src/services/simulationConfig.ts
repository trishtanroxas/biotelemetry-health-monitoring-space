import type { AlertItem, SpaceEnvironmentRisk, VitalSigns } from '../types/telemetry';

export type MissionZoneId =
  | 'LEO_ISS'
  | 'LUNAR_ORBIT'
  | 'LUNAR_SURFACE'
  | 'DEEP_SPACE_TRANSIT'
  | 'MARS_TRANSIT'
  | 'MARS_SURFACE'
  | 'PLANETARY_ROVER';

export type ShieldingMode = 'NOMINAL' | 'STORM_SHELTER' | 'UNSHIELDED_EVA';
export type SolarStormMode = 'LIVE_DONKI' | 'M_FLARE_CME' | 'X_CLASS_SPE' | 'EXTREME_G5';

export interface SimulationConfig {
  anomaly: string;
  missionZone: MissionZoneId;
  missionDay: number;
  evaActive: boolean | null;
  shielding: ShieldingMode;
  solarStorm: SolarStormMode;
}

export const defaultSimulationConfig = (): SimulationConfig => ({
  anomaly: 'NONE',
  missionZone: 'LEO_ISS',
  missionDay: 14,
  evaActive: null,
  shielding: 'NOMINAL',
  solarStorm: 'LIVE_DONKI',
});

export function isSimulationConfigEqual(a: SimulationConfig, b: SimulationConfig): boolean {
  return (
    a.anomaly === b.anomaly &&
    a.missionZone === b.missionZone &&
    a.missionDay === b.missionDay &&
    a.evaActive === b.evaActive &&
    a.shielding === b.shielding &&
    a.solarStorm === b.solarStorm
  );
}

export function resolveSimulationKp(config: SimulationConfig, liveKp = 2.3): number {
  const safeLive = Number.isFinite(liveKp) ? Math.max(0, Math.min(9, liveKp)) : 2.3;
  const override = SOLAR_STORM_OPTIONS.find(s => s.id === config.solarStorm)?.kpOverride;
  return override !== null && override !== undefined && override > 0
    ? Math.max(safeLive, override)
    : safeLive;
}

export interface MissionZoneSpec {
  id: MissionZoneId;
  label: string;
  distanceLabel: string;
  distanceKm: number;
  commsLatencySec: number;
  gravityG: number;
  gcrBaselineUsvH: number;
  magnetosphereShielded: boolean;
  phaseLabel: string;
  summary: string;
}

export const MISSION_ZONES: MissionZoneSpec[] = [
  {
    id: 'LEO_ISS',
    label: 'ISS Low Earth Orbit',
    distanceLabel: '420 km',
    distanceKm: 420,
    commsLatencySec: 0.08,
    gravityG: 0,
    gcrBaselineUsvH: 13.5,
    magnetosphereShielded: true,
    phaseLabel: 'leo_orbit',
    summary: 'Geomagnetic shielding; 16 sunrises/day; SAA & polar passes.',
  },
  {
    id: 'LUNAR_ORBIT',
    label: 'Lunar Gateway Orbit',
    distanceLabel: '384,400 km',
    distanceKm: 384400,
    commsLatencySec: 1.28,
    gravityG: 0,
    gcrBaselineUsvH: 54,
    magnetosphereShielded: false,
    phaseLabel: 'lunar_orbit',
    summary: 'Outside magnetosphere; 4x LEO radiation; 1.3s comms lag.',
  },
  {
    id: 'LUNAR_SURFACE',
    label: 'Lunar South Pole Base',
    distanceLabel: '384,400 km · 0.16g',
    distanceKm: 384400,
    commsLatencySec: 1.28,
    gravityG: 0.16,
    gcrBaselineUsvH: 36,
    magnetosphereShielded: false,
    phaseLabel: 'lunar_surface',
    summary: 'Partial 0.16g gravity; regolith shielding & dust EVA load.',
  },
  {
    id: 'DEEP_SPACE_TRANSIT',
    label: 'Deep Space Transit',
    distanceLabel: '74.8M km (0.5 AU)',
    distanceKm: 74800000,
    commsLatencySec: 249.5,
    gravityG: 0,
    gcrBaselineUsvH: 112,
    magnetosphereShielded: false,
    phaseLabel: 'deep_space',
    summary: 'Unshielded GCR flux; 4.2m one-way lag; crew autonomy.',
  },
  {
    id: 'MARS_TRANSIT',
    label: 'Mars Transfer Cruise',
    distanceLabel: '225M km (1.52 AU)',
    distanceKm: 225000000,
    commsLatencySec: 750.5,
    gravityG: 0,
    gcrBaselineUsvH: 128,
    magnetosphereShielded: false,
    phaseLabel: 'mars_transit',
    summary: 'Peak GCR + microgravity SANS & bone loss; 12.5m one-way lag.',
  },
  {
    id: 'MARS_SURFACE',
    label: 'Mars Surface Habitat',
    distanceLabel: '225M km · 0.38g',
    distanceKm: 225000000,
    commsLatencySec: 750.5,
    gravityG: 0.38,
    gcrBaselineUsvH: 44,
    magnetosphereShielded: false,
    phaseLabel: 'mars_surface',
    summary: '0.38g partial gravity mitigation; thin CO2 atmosphere & dust.',
  },
  {
    id: 'PLANETARY_ROVER',
    label: 'Planetary Rover',
    distanceLabel: '225M km · Traverse',
    distanceKm: 225000000,
    commsLatencySec: 750.5,
    gravityG: 0.38,
    gcrBaselineUsvH: 62,
    magnetosphereShielded: false,
    phaseLabel: 'planetary_rover',
    summary: 'Mobile traverse outside habitat shielding; elevated GCR & EVA metabolic load.',
  },
];

export const SHIELDING_OPTIONS: { id: ShieldingMode; label: string; factor: number; detail: string }[] = [
  { id: 'NOMINAL', label: 'Nominal Hull', factor: 1.0, detail: 'Standard module / suit shielding' },
  { id: 'STORM_SHELTER', label: 'Storm Shelter', factor: 0.35, detail: '-65% radiation via water/polyethylene barrier' },
  { id: 'UNSHIELDED_EVA', label: 'Unshielded EVA', factor: 1.28, detail: '+28% exposure + suit metabolic load' },
];

export const SOLAR_STORM_OPTIONS: { id: SolarStormMode; label: string; kpOverride: number | null; radBonus: number }[] = [
  { id: 'LIVE_DONKI', label: 'Live DONKI Feed', kpOverride: null, radBonus: 0 },
  { id: 'M_FLARE_CME', label: 'M-Flare + CME (G2)', kpOverride: 5.5, radBonus: 24 },
  { id: 'X_CLASS_SPE', label: 'X-Class SPE (S3)', kpOverride: 7.0, radBonus: 68 },
  { id: 'EXTREME_G5', label: 'Extreme G5 + SEP', kpOverride: 9.0, radBonus: 115 },
];

export type ScenarioCategory = 'orbital' | 'atmosphere' | 'cardio' | 'radiation' | 'metabolic';

export interface SimulationScenarioSpec {
  mode: string;
  label: string;
  category: ScenarioCategory;
  summary: string;
}

export const SIMULATION_SCENARIOS: SimulationScenarioSpec[] = [
  { mode: 'NONE', label: 'Nominal Cruise', category: 'orbital', summary: 'Baseline calibrated to distance & mission day' },
  { mode: 'EVA_HEAVY', label: 'Heavy EVA Load', category: 'orbital', summary: 'Suit exertion: +34 BPM, +0.65 C, higher resp rate' },
  { mode: 'SAA_TRANSIT', label: 'SAA Proton Pass', category: 'orbital', summary: 'South Atlantic Anomaly trapped-proton flux' },
  { mode: 'HYPOXIA', label: 'Suit / Cabin Hypoxia', category: 'atmosphere', summary: 'O2 regulator drop: SpO2 86-89%, ST depression' },
  { mode: 'HYPERCAPNIA', label: 'CO2 Scrubber Failure', category: 'atmosphere', summary: 'Hypercapnia: resp 24-28/min, BP & HR surge' },
  { mode: 'DCS_RISK', label: 'EVA Decompression', category: 'atmosphere', summary: 'Pre-breathe mismatch: SpO2 91-93%, resp strain' },
  { mode: 'HEAT_STRESS', label: 'Cooling Loop Failure', category: 'atmosphere', summary: 'EVA thermal stress: core temp 38.3-39.1 C' },
  { mode: 'HYPOTHERMIA', label: 'Eclipse Chill', category: 'atmosphere', summary: 'Heater fault: core temp 34.9-35.4 C, bradycardia' },
  { mode: 'DUST_EXPOSURE', label: 'Regolith Dust Strain', category: 'atmosphere', summary: 'Airlock dust inhalation: airway & SpO2 dip' },
  { mode: 'TACHYCARDIA', label: 'Acute Tachycardia', category: 'cardio', summary: 'HR 132-154 BPM, suppressed HRV' },
  { mode: 'BRADYCARDIA', label: 'Vagal Bradycardia', category: 'cardio', summary: 'HR 38-44 BPM, lower arterial pressure' },
  { mode: 'ORTHOSTATIC', label: 'Orthostatic Drop', category: 'cardio', summary: 'Post-G hypotension: SBP <90 mmHg, reflex HR' },
  { mode: 'SLEEP_FATIGUE', label: 'Circadian Deficit', category: 'cardio', summary: '16 sunrises/day fatigue: HRV <26 ms, HR drift' },
  { mode: 'RADIATION_SPIKE', label: 'Solar Particle Event', category: 'radiation', summary: 'Acute SPE flux 65-105 uSv/h' },
  { mode: 'COMPOUND_CRISIS', label: 'Compound Emergency', category: 'radiation', summary: 'Simultaneous SPE + cooling fault + hypoxia' },
  { mode: 'HYPOGLYCEMIA', label: 'EVA Hypoglycemia', category: 'metabolic', summary: 'Glucose <65 mg/dL with adrenergic HR rise' },
  { mode: 'HYPERGLYCEMIA', label: 'Metabolic Hyperglycemia', category: 'metabolic', summary: 'Glucose >190 mg/dL & hydration strain' },
];

export function formatLatency(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

export function getMissionZone(id?: string | null): MissionZoneSpec {
  return MISSION_ZONES.find(z => z.id === id) ?? MISSION_ZONES[0];
}

export function computeOverallHealthScore(
  vitals: Pick<VitalSigns, 'heart_rate' | 'spo2' | 'core_temp' | 'radiation_rate' | 'hrv' | 'systolic_bp' | 'respiration_rate' | 'orbital_phase' | 'cumulative_dose_msv'>,
  config: SimulationConfig,
  kpIndex: number,
): { score: number; status: 'NOMINAL' | 'STRAINED' | 'COMPROMISED' | 'CRITICAL' } {
  const zone = getMissionZone(config.missionZone);
  const sbp = vitals.systolic_bp ?? 118;
  const resp = vitals.respiration_rate ?? 14;
  const phase = vitals.orbital_phase ?? zone.phaseLabel;
  const cumDose = vitals.cumulative_dose_msv ?? 0;

  let score = 100;
  if (vitals.spo2 < 95) score -= (95 - vitals.spo2) * 5;
  if (vitals.heart_rate > 100) score -= (vitals.heart_rate - 100) * 0.75;
  else if (vitals.heart_rate < 48) score -= (48 - vitals.heart_rate) * 1.1;
  if (vitals.core_temp > 37.6) score -= (vitals.core_temp - 37.6) * 14;
  else if (vitals.core_temp < 35.8) score -= (35.8 - vitals.core_temp) * 12;
  if (vitals.radiation_rate > 25) score -= Math.min(28, (vitals.radiation_rate - 25) * 0.42);
  if (vitals.hrv < 38) score -= (38 - vitals.hrv) * 0.55;
  if (sbp < 94) score -= (94 - sbp) * 0.9;
  else if (sbp > 142) score -= (sbp - 142) * 0.55;
  if (resp > 21) score -= (resp - 21) * 1.8;

  if (phase === 'saa_transit') score -= 4;
  else if (phase === 'high_latitude' && kpIndex >= 4) score -= 3.5;

  const gravityPenalty = zone.gravityG === 0 ? 1 : zone.gravityG < 0.5 ? 0.55 : 0.1;
  if (config.missionDay > 30) {
    score -= Math.min(10, ((config.missionDay - 30) / 335) * 10 * gravityPenalty);
  }
  if (!zone.magnetosphereShielded) score -= 2.5;
  if (cumDose > 80) score -= Math.min(12, (cumDose - 80) * 0.04);

  const clamped = Math.max(10, Math.min(100, Math.round(score * 10) / 10));
  const status = clamped >= 82 ? 'NOMINAL' : clamped >= 65 ? 'STRAINED' : clamped >= 45 ? 'COMPROMISED' : 'CRITICAL';
  return { score: clamped, status };
}

export function computeSpaceEnvironmentRisks(
  vitals: Pick<VitalSigns, 'heart_rate' | 'spo2' | 'core_temp' | 'radiation_rate' | 'hrv' | 'systolic_bp' | 'respiration_rate' | 'orbital_phase' | 'cumulative_dose_msv'>,
  config: SimulationConfig,
): SpaceEnvironmentRisk[] {
  const zone = getMissionZone(config.missionZone);
  const sbp = vitals.systolic_bp ?? 118;
  const resp = vitals.respiration_rate ?? 14;
  const phase = vitals.orbital_phase ?? zone.phaseLabel;
  const day = config.missionDay;
  const cumDose = vitals.cumulative_dose_msv ?? Math.round(((zone.gcrBaselineUsvH * 24) / 1000) * day * 10) / 10;

  const radLevel =
    vitals.radiation_rate >= 60 || cumDose >= 300
      ? 'SEVERE'
      : vitals.radiation_rate >= 30 || cumDose >= 150
        ? 'HIGH'
        : phase === 'saa_transit' || phase === 'high_latitude' || !zone.magnetosphereShielded
          ? 'MODERATE'
          : 'LOW';

  const sansScore = Math.min(100, Math.round((1 - Math.min(1, zone.gravityG)) * (Math.min(180, day) / 180) * 78 + (sbp < 95 ? 12 : 0)));
  const sansLevel = sansScore >= 55 ? 'HIGH' : sansScore >= 25 ? 'MODERATE' : 'LOW';

  const boneScore = Math.min(100, Math.round((1 - Math.min(1, zone.gravityG)) * (Math.min(365, day) / 365) * 85));
  const boneLevel = boneScore >= 55 ? 'HIGH' : boneScore >= 25 ? 'MODERATE' : 'LOW';

  const cardioStrain =
    (vitals.heart_rate > 105 ? 12 : 0) +
    (vitals.heart_rate > 125 ? 18 : 0) +
    (vitals.hrv < 35 ? 20 : 0) +
    (sbp < 94 ? 22 : 0) +
    Math.round(Math.min(22, day / 16));
  const cardioLevel = cardioStrain >= 55 ? 'SEVERE' : cardioStrain >= 35 ? 'HIGH' : cardioStrain >= 18 ? 'MODERATE' : 'LOW';

  const atmoLevel =
    vitals.spo2 < 90 || vitals.core_temp >= 38.8
      ? 'SEVERE'
      : vitals.spo2 < 95 || vitals.core_temp >= 37.9 || vitals.core_temp <= 35.5 || resp >= 23
        ? 'HIGH'
        : 'LOW';

  const isoScore = Math.min(
    100,
    Math.round((Math.min(365, day) / 365) * 55 + (zone.commsLatencySec > 60 ? 25 : zone.commsLatencySec > 1 ? 10 : 0) + (vitals.hrv < 35 ? 18 : 0)),
  );
  const isoLevel = isoScore >= 55 ? 'HIGH' : isoScore >= 28 ? 'MODERATE' : 'LOW';

  return [
    {
      domain: 'Radiation & Space Weather',
      hazard: 'GCR, Solar Particle Events, and SAA Trapped Protons',
      risk_level: radLevel,
      summary: `Ambient ${vitals.radiation_rate.toFixed(1)} uSv/h; cumulative ~${cumDose.toFixed(1)} mSv over ${day}d (${zone.magnetosphereShielded ? phase.replace('_', ' ') : 'outside magnetosphere'}).`,
      countermeasure: 'Move to water/polyethylene storm shelter during SPE; defer EVA across SAA and high-Kp polar passes.',
      evidence_basis: 'NASA DONKI 2020-2026 + ISS 48h Orbit + OSDR OSD-479/751',
    },
    {
      domain: 'SANS & Cephalad Fluid Shift',
      hazard: 'Optic nerve sheath distension and elevated intracranial pressure',
      risk_level: sansLevel,
      summary: `${zone.gravityG.toFixed(2)}g field over ${day} days drives headward fluid shift (index ${sansScore}/100).`,
      countermeasure: 'Apply lower-body negative pressure (LBNP), venous thigh cuffs, and scheduled ocular screening.',
      evidence_basis: 'NASA OSDR OSD-583/680/681 optic sheath & ICP curves',
    },
    {
      domain: 'Bone & Muscle Deconditioning',
      hazard: 'Trabecular BMD loss and anti-gravity muscle atrophy',
      risk_level: boneLevel,
      summary: `${zone.gravityG.toFixed(2)}g unloading over ${day} days (load index ${boneScore}/100).`,
      countermeasure: 'Maintain daily ARED resistive loading, aerobic countermeasures, and vitamin D/calcium monitoring.',
      evidence_basis: 'NASA OSDR OSD-351/489/608 partial-gravity bone studies',
    },
    {
      domain: 'Cardiovascular & Orthostatic',
      hazard: 'Plasma volume reduction, resting HR drift, and post-G orthostatic intolerance',
      risk_level: cardioLevel,
      summary: `HR ${vitals.heart_rate.toFixed(0)} BPM, HRV ${vitals.hrv.toFixed(0)} ms, SBP ${sbp.toFixed(0)} mmHg.`,
      countermeasure: 'Fluid/electrolyte loading before G-transitions, aerobic intervals, and autonomic HRV pacing.',
      evidence_basis: 'NASA OSDR OSD-569/575 vascular & hematocrit baselines',
    },
    {
      domain: 'Closed-Loop Atmosphere & Thermal',
      hazard: 'Hypoxia, CO2 hypercapnia, EVA thermal stress, or decompression strain',
      risk_level: atmoLevel,
      summary: `SpO2 ${vitals.spo2.toFixed(1)}%, core temp ${vitals.core_temp.toFixed(2)} C, resp ${resp.toFixed(1)}/min.`,
      countermeasure: 'Verify suit/cabin O2 partial pressure, CO2 scrubber capacity, and liquid cooling garment flow.',
      evidence_basis: 'NASA ECLSS & EVA biomedical limits',
    },
    {
      domain: 'Distance, Latency & Circadian',
      hazard: 'Signal delay autonomy and circadian misalignment (16 sunrises/day in LEO)',
      risk_level: isoLevel,
      summary: `One-way lag ${formatLatency(zone.commsLatencySec)} (${zone.label}); mission day ${day}.`,
      countermeasure: 'Enforce structured 24h lighting/sleep hygiene, onboard autonomous triage, and crew check-ins.',
      evidence_basis: 'ISS 48h daylight/eclipse cycle + HRP deep-space autonomy',
    },
  ];
}

export function evaluateLocalAlerts(vitals: VitalSigns, kpIndex = 0): AlertItem[] {
  const alerts: AlertItem[] = [];
  const now = vitals.timestamp || new Date().toISOString();
  const sbp = vitals.systolic_bp ?? 120;
  const resp = vitals.respiration_rate ?? 14;
  const day = vitals.mission_day ?? 14;
  const cumDose = vitals.cumulative_dose_msv ?? 0;
  const zone = getMissionZone(vitals.mission_zone);

  const push = (
    severity: AlertItem['severity'],
    alert_type: AlertItem['alert_type'],
    message: string,
    trigger_metric: string,
    recommended_action: string,
    hazard_domain: string,
  ) => {
    alerts.push({
      id: `local-${vitals.astronaut_id}-${alert_type}`,
      astronaut_id: vitals.astronaut_id,
      timestamp: now,
      severity,
      alert_type,
      message,
      acknowledged: false,
      trigger_metric,
      recommended_action,
      hazard_domain,
    });
  };

  if (vitals.spo2 < 90) {
    push('CRITICAL', 'HYPOXIA', `Critical blood oxygen saturation drop (${vitals.spo2}%). Immediate suit O2 flush required!`, `SpO2 ${vitals.spo2}%`, 'Switch to secondary O2 supply, verify helmet/cabin seal, and halt exertion.', 'Atmosphere & Suit');
  } else if (vitals.spo2 < 94) {
    push('WARNING', 'HYPOXIA', `Sub-optimal SpO2 (${vitals.spo2}%). Check breathing regulator and cabin O2.`, `SpO2 ${vitals.spo2}%`, 'Inspect suit regulator pressure and monitor SpO2 recovery every 30s.', 'Atmosphere & Suit');
  }

  if (vitals.heart_rate > 145) {
    push('CRITICAL', 'TACHYCARDIA', `Severe sustained tachycardia (${vitals.heart_rate} BPM) under orbital/suit load.`, `HR ${vitals.heart_rate} BPM`, 'Halt EVA tasks immediately, initiate recovery breathing, and review ECG Lead-II.', 'Cardiovascular');
  } else if (vitals.heart_rate > 125) {
    push('WARNING', 'TACHYCARDIA', `Elevated heart rate detected (${vitals.heart_rate} BPM). Heavy strain or stress.`, `HR ${vitals.heart_rate} BPM`, 'Reduce workload intensity, hydrate, and schedule 15-minute rest.', 'Cardiovascular');
  } else if (vitals.heart_rate < 45) {
    push('WARNING', 'BRADYCARDIA', `Low resting pulse (${vitals.heart_rate} BPM). Monitor autonomic response.`, `HR ${vitals.heart_rate} BPM`, 'Confirm sensor contact, check core temperature, and assess for dizziness.', 'Cardiovascular');
  }

  if (vitals.core_temp >= 38.8) {
    push('CRITICAL', 'HEAT_STRESS', `Critical hyperthermia (${vitals.core_temp.toFixed(2)} C). Possible suit cooling loop failure.`, `Core Temp ${vitals.core_temp.toFixed(2)} C`, 'Maximize liquid cooling garment flow, cease EVA exertion, and return to airlock.', 'Thermal & Suit');
  } else if (vitals.core_temp >= 38.0) {
    push('WARNING', 'HEAT_STRESS', `Elevated core temperature (${vitals.core_temp.toFixed(2)} C). Thermal strain developing.`, `Core Temp ${vitals.core_temp.toFixed(2)} C`, 'Increase suit cooling setting and hydrate with electrolytes.', 'Thermal & Suit');
  } else if (vitals.core_temp <= 35.4) {
    push('WARNING', 'HYPOTHERMIA', `Low core temperature (${vitals.core_temp.toFixed(2)} C) during eclipse/thermal loss.`, `Core Temp ${vitals.core_temp.toFixed(2)} C`, 'Engage suit thermal heater and reduce convective cooling flow.', 'Thermal & Suit');
  }

  if (resp >= 24) {
    push('WARNING', 'HYPERCAPNIA', `Elevated respiratory rate (${resp.toFixed(1)} breaths/min) suggesting CO2 buildup.`, `Resp ${resp.toFixed(1)}/min`, 'Verify CO2 scrubber cartridge status and slow breathing cadence.', 'Atmosphere & Suit');
  }
  if (sbp < 90) {
    push('WARNING', 'ORTHOSTATIC_HYPOTENSION', `Low systolic blood pressure (${sbp.toFixed(0)} mmHg). Orthostatic risk.`, `BP ${sbp.toFixed(0)} mmHg`, 'Assume supine/seated posture, hydrate with isotonic fluids, and activate compression.', 'Cardiovascular');
  }
  if (vitals.hrv < 28) {
    push('WARNING', 'AUTONOMIC_FATIGUE', `Depressed HRV (${vitals.hrv.toFixed(1)} ms) indicating autonomic fatigue.`, `HRV ${vitals.hrv.toFixed(1)} ms`, 'Prioritize protected sleep window and defer high-load tasks.', 'Circadian & Autonomic');
  }

  if (vitals.radiation_rate >= 60) {
    const radText = vitals.radiation_rate.toFixed(1);
    push('CRITICAL', 'RADIATION_SPIKE', `Solar Particle Event / High radiation dosage (${radText} uSv/h). Seek storm shelter!`, `Rad ${radText} uSv/h`, 'Relocate crew to water/polyethylene storm shelter rack immediately.', 'Space Radiation');
  } else if (vitals.radiation_rate >= 30) {
    const radText = vitals.radiation_rate.toFixed(1);
    push('WARNING', 'RADIATION_SPIKE', `Elevated ambient radiation (${radText} uSv/h). Limit unshielded EVA duration.`, `Rad ${radText} uSv/h`, 'Defer external EVA and track 15-minute dosimeter accumulation.', 'Space Radiation');
  }

  if ((vitals.orbital_phase === 'saa_transit' && vitals.radiation_rate >= 24) || (vitals.orbital_phase === 'high_latitude' && kpIndex >= 5)) {
    push('WARNING', 'SOLAR_STORM_SHELTER', `Orbital hazard zone (${vitals.orbital_phase.replace('_', ' ').toUpperCase()}) with Kp ${kpIndex.toFixed(1)}.`, `Zone ${vitals.orbital_phase} · Kp ${kpIndex.toFixed(1)}`, 'Remain inside pressurized hull until orbital track exits high-flux zone.', 'Space Radiation');
  }

  if (cumDose >= 150 || (day >= 180 && !zone.magnetosphereShielded)) {
    push('INFO', 'DEEP_SPACE_DOSE', `Long-duration cumulative dose (${cumDose.toFixed(1)} mSv, Day ${day}) elevates SANS, bone, and tissue risk.`, `Dose ${cumDose.toFixed(1)} mSv · Day ${day}`, 'Enforce storm-shelter drills, ARED bone countermeasures, and ocular screening.', 'Long-Duration Flight');
  }

  const glucose = vitals.blood_glucose ?? 92;
  if (glucose < 55) {
    push('CRITICAL', 'HYPOGLYCEMIA', `Severe hypoglycemia (${glucose.toFixed(0)} mg/dL). Cognitive/motor impairment risk.`, `Glucose ${glucose.toFixed(0)} mg/dL`, 'Take 15-20 g fast-acting glucose gel immediately and halt EVA duties.', 'Metabolic & Nutrition');
  } else if (glucose < 70) {
    push('WARNING', 'HYPOGLYCEMIA', `Low blood glucose (${glucose.toFixed(0)} mg/dL). Post-exertion deficit developing.`, `Glucose ${glucose.toFixed(0)} mg/dL`, 'Consume 15 g carbohydrate ration and recheck capillary glucose in 15 min.', 'Metabolic & Nutrition');
  } else if (glucose > 240) {
    push('CRITICAL', 'HYPERGLYCEMIA', `Marked hyperglycemia (${glucose.toFixed(0)} mg/dL). Hydration and metabolic stress risk.`, `Glucose ${glucose.toFixed(0)} mg/dL`, 'Hydrate aggressively with electrolyte solution and notify Flight Surgeon.', 'Metabolic & Nutrition');
  } else if (glucose > 180) {
    push('WARNING', 'HYPERGLYCEMIA', `Elevated blood glucose (${glucose.toFixed(0)} mg/dL) above nominal flight band.`, `Glucose ${glucose.toFixed(0)} mg/dL`, 'Increase water intake and defer sugary rations until fasting recheck.', 'Metabolic & Nutrition');
  }

  const hydration = vitals.hydration_pct ?? 96;
  if (hydration < 84) {
    push('WARNING', 'DEHYDRATION', `Low hydration estimate (${hydration.toFixed(0)}%). Orthostatic & renal calculus risk.`, `Hydration ${hydration.toFixed(0)}%`, 'Drink 400 mL oral rehydration fluids over 30 minutes.', 'Metabolic & Nutrition');
  }

  const wbc = vitals.wbc_k_ul ?? 6.1;
  if (wbc < 3.8) {
    push('WARNING', 'IMMUNE_SUPPRESSION', `Reduced WBC profile (${wbc.toFixed(2)} K/uL, OSD-575 trend). Opportunistic infection risk.`, `WBC ${wbc.toFixed(2)} K/uL`, 'Maintain cabin HEPA disinfection protocols and protect recovery sleep.', 'Immune & Dermal');
  }

  return alerts;
}

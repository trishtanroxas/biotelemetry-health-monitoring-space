export interface Astronaut {
  id: string;
  name: string;
  role: string;
  age: number;
  resting_hr: number;
  baseline_spo2: number;
  status: string;
  suit_id?: string;
}

export interface VitalSigns {
  astronaut_id: string;
  timestamp: string;
  heart_rate: number;
  spo2: number;
  core_temp: number;
  radiation_rate: number;
  hrv: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  respiration_rate?: number;
  battery_level?: number;
  ecg_samples?: number[];
  telemetry_source?: 'simulated' | 'measured' | 'manual';
  ecg_sample_rate_hz?: number;
  orbital_phase?: string;
  calibration_basis?: string;
  iss_latitude?: number;
  iss_longitude?: number;
  iss_altitude_km?: number;
  iss_coord_source?: string;
  iss_velocity_kms?: number;
  mission_zone?: string;
  mission_day?: number;
  distance_km?: number;
  comms_latency_sec?: number;
  gravity_g?: number;
  shielding_mode?: string;
  cumulative_dose_msv?: number;
  overall_health_score?: number;
  health_status?: 'NOMINAL' | 'STRAINED' | 'COMPROMISED' | 'CRITICAL' | string;
  blood_glucose?: number;
  wbc_k_ul?: number;
  hydration_pct?: number;
  synced?: boolean;
}

export type SelfExamType = 'ocular_ultrasound' | 'dermal_radiation' | 'glucometer_nutrition';

export interface ImageAssessmentRecord {
  id: string;
  astronautId: string;
  examType: SelfExamType;
  recordedAt: string;
  severity: 'nominal' | 'warning' | 'critical' | string;
  findings: string;
  recommendedActions: string[];
  groundConsultRequired: boolean;
  analysisSource: string;
  imageQuality: string;
  thumbnailDataUrl?: string;
}

export type AlertType =
  | 'HYPOXIA'
  | 'TACHYCARDIA'
  | 'BRADYCARDIA'
  | 'RADIATION_SPIKE'
  | 'HEAT_STRESS'
  | 'HYPOTHERMIA'
  | 'HYPERCAPNIA'
  | 'ORTHOSTATIC_HYPOTENSION'
  | 'AUTONOMIC_FATIGUE'
  | 'SOLAR_STORM_SHELTER'
  | 'DEEP_SPACE_DOSE'
  | 'HYPOGLYCEMIA'
  | 'HYPERGLYCEMIA'
  | 'DEHYDRATION'
  | 'IMMUNE_SUPPRESSION'
  | string;

export interface AlertItem {
  id: string;
  astronaut_id: string;
  timestamp: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  alert_type: AlertType;
  message: string;
  acknowledged: boolean;
  trigger_metric?: string | null;
  recommended_action?: string | null;
  hazard_domain?: string | null;
}

export interface SpaceEnvironmentRisk {
  domain: string;
  hazard: string;
  risk_level: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' | string;
  summary: string;
  countermeasure: string;
  evidence_basis: string;
}

export interface DiagnosticResult {
  astronaut_id: string;
  overall_health_score: number;
  cardiovascular_status: 'NOMINAL' | 'COMPROMISED' | 'CRITICAL';
  hypoxia_risk: 'LOW' | 'MODERATE' | 'SEVERE';
  radiation_risk: 'SAFE' | 'ELEVATED' | 'DANGEROUS';
  recommendations: string[];
  metrics_summary: Record<string, any>;
  environment_risks?: SpaceEnvironmentRisk[];
}

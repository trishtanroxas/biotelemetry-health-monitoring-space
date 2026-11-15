export type SpaceWeatherSourceMode = 'live_nasa' | 'supabase_cache' | 'historical_fallback' | 'local_cache';

export interface SpaceWeatherEvent {
  event_id: string;
  event_type: 'FLR' | 'SEP' | 'GST' | 'CME' | 'WSA_ENLIL' | 'NOTIFICATION' | string;
  event_time: string;
  severity: 'QUIET' | 'MINOR' | 'MODERATE' | 'SEVERE' | string;
  summary: string;
  kp_index?: number | null;
  flare_class?: string | null;
  source_location?: string | null;
  active_region_num?: number | null;
  cme_speed_kms?: number | null;
  cme_half_angle?: number | null;
  cme_longitude?: number | null;
  cme_latitude?: number | null;
  earth_impact_eta?: string | null;
  source_url?: string | null;
}

export interface SpaceWeatherSnapshot {
  kp_current: number;
  storm_level: string;
  radiation_storm: string;
  latest_flare_class?: string | null;
  latest_flare_location?: string | null;
  latest_flare_time?: string | null;
  active_sep: boolean;
  earth_impact_eta?: string | null;
  summary: string;
  source_mode: SpaceWeatherSourceMode | string;
  fetched_at: string;
  events: SpaceWeatherEvent[];
  historical_priors?: Record<string, number>;
}

export interface IssTrackPoint {
  latitude: number;
  longitude: number;
  altitude_km: number;
  velocity_kms: number;
  visibility: string;
  orbital_phase: string;
  coord_source: string;
  timestamp: string;
}

export interface IssPredictedPoint {
  latitude: number;
  longitude: number;
  offset_minutes: number;
}

export interface IssLiveFeed {
  current: IssTrackPoint;
  recent_track: IssTrackPoint[];
  predicted_track: IssPredictedPoint[];
}

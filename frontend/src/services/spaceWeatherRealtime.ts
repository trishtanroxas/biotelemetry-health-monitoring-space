import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { API_BASE } from './api';
import { fetchLiveSpaceWeather } from './spaceWeather';

let supabaseClient: SupabaseClient | null = null;

export function getRealtimeSupabaseClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseClient;
}

export function fetchSpaceWeatherSnapshot(refresh = false) {
  return fetchLiveSpaceWeather(refresh, API_BASE);
}

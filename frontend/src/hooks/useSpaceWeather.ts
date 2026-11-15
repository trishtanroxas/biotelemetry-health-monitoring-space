import { useCallback, useEffect, useRef, useState } from 'react';
import type { IssLiveFeed, SpaceWeatherEvent, SpaceWeatherSnapshot } from '../types/spaceWeather';
import {
  buildPropagatedIssFeed,
  fetchLiveIssFeed,
  loadSpaceWeatherCache,
  mergeRealtimeSpaceWeatherEvent,
  saveSpaceWeatherCache,
  toSpaceWeatherDatum,
} from '../services/spaceWeather';
import { fetchSpaceWeatherSnapshot, getRealtimeSupabaseClient } from '../services/spaceWeatherRealtime';

export function useSpaceWeather(offline: boolean) {
  const [snapshot, setSnapshot] = useState<SpaceWeatherSnapshot | null>(() => loadSpaceWeatherCache());
  const [issFeed, setIssFeed] = useState<IssLiveFeed>(() => buildPropagatedIssFeed());
  const [issLoading, setIssLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [error, setError] = useState('');
  const offlineRef = useRef(offline);
  const issTrackRef = useRef(issFeed.recent_track);
  useEffect(() => { offlineRef.current = offline; }, [offline]);
  useEffect(() => { issTrackRef.current = issFeed.recent_track; }, [issFeed]);

  const refreshIss = useCallback(async (force = false) => {
    if (offlineRef.current) {
      setIssFeed(prev => buildPropagatedIssFeed(new Date(), prev.recent_track));
      return;
    }
    if (force) setIssLoading(true);
    try {
      const next = await fetchLiveIssFeed(force, '/api/v1', issTrackRef.current);
      setIssFeed(next);
    } finally {
      if (force) setIssLoading(false);
    }
  }, []);

  const refresh = useCallback(async (force = false) => {
    if (offlineRef.current) return;
    setLoading(true);
    setError('');
    try {
      const next = await fetchSpaceWeatherSnapshot(force);
      if (offlineRef.current) return;
      setSnapshot(next);
      saveSpaceWeatherCache(next);
    } catch {
      if (!offlineRef.current) {
        setError('Unable to reach DONKI space-weather feed. Showing latest cached snapshot if available.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const issTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshIss(false);
      }
    }, 5000);
    if (!offline) {
      void refreshIss(false);
    }
    return () => {
      window.clearInterval(issTimer);
    };
  }, [offline, refreshIss]);

  useEffect(() => {
    if (offline) {
      setRealtimeConnected(false);
      return;
    }

    let alive = true;
    void refresh(false);

    const supabase = getRealtimeSupabaseClient();
    const channel = supabase
      ? supabase
          .channel('donki-realtime')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'space_weather_events' },
            payload => {
              if (!alive || offlineRef.current || !payload.new) return;
              const event = payload.new as SpaceWeatherEvent;
              setSnapshot(prev => {
                const base = prev ?? {
                  kp_current: 0,
                  storm_level: 'G0_QUIET',
                  radiation_storm: 'S0_NONE',
                  active_sep: false,
                  summary: event.summary,
                  source_mode: 'live_nasa',
                  fetched_at: new Date().toISOString(),
                  events: [],
                };
                const updated = mergeRealtimeSpaceWeatherEvent(base, event);
                if (updated) saveSpaceWeatherCache(updated);
                return updated;
              });
            },
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'space_weather_status' },
            payload => {
              if (!alive || offlineRef.current || !payload.new) return;
              const row = payload.new as Partial<SpaceWeatherSnapshot>;
              setSnapshot(prev => {
                const base: SpaceWeatherSnapshot = prev ?? {
                  kp_current: 0,
                  storm_level: 'G0_QUIET',
                  radiation_storm: 'S0_NONE',
                  active_sep: false,
                  summary: row.summary ?? 'Live NASA DONKI update',
                  source_mode: 'live_nasa',
                  fetched_at: row.fetched_at ?? new Date().toISOString(),
                  events: [],
                };
                const updated: SpaceWeatherSnapshot = {
                  ...base,
                  kp_current: typeof row.kp_current === 'number' ? row.kp_current : base.kp_current,
                  storm_level: row.storm_level ?? base.storm_level,
                  radiation_storm: row.radiation_storm ?? base.radiation_storm,
                  latest_flare_class: row.latest_flare_class ?? base.latest_flare_class,
                  latest_flare_location: row.latest_flare_location ?? base.latest_flare_location,
                  latest_flare_time: row.latest_flare_time ?? base.latest_flare_time,
                  active_sep: typeof row.active_sep === 'boolean' ? row.active_sep : base.active_sep,
                  earth_impact_eta: row.earth_impact_eta ?? base.earth_impact_eta,
                  summary: row.summary ?? base.summary,
                  source_mode: 'live_nasa',
                  fetched_at: row.fetched_at ?? new Date().toISOString(),
                };
                saveSpaceWeatherCache(updated);
                return updated;
              });
            },
          )
          .subscribe(status => {
            if (alive) setRealtimeConnected(status === 'SUBSCRIBED');
          })
      : null;

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !offlineRef.current) {
        void refresh(false);
      }
    }, 120000);

    return () => {
      alive = false;
      window.clearInterval(interval);
      if (channel && supabase) {
        void supabase.removeChannel(channel);
      }
    };
  }, [offline, refresh]);

  return {
    snapshot,
    datum: toSpaceWeatherDatum(snapshot, offline),
    issFeed,
    issLoading,
    refreshIss: () => refreshIss(true),
    loading,
    realtimeConnected,
    error,
    refresh: () => refresh(true),
  };
}

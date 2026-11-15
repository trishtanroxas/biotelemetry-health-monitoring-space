import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSpaceWeather, type SpaceWeatherSnapshot } from '../services/api';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute TTL matching backend cache

interface SpaceWeatherState {
  data: SpaceWeatherSnapshot | null;
  loading: boolean;
  error: string;
  lastFetched: number | null;
}

export function useSpaceWeather(enabled = true) {
  const [state, setState] = useState<SpaceWeatherState>({
    data: null,
    loading: false,
    error: '',
    lastFetched: null,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (force = false) => {
    if (!enabled) return;
    if (!force && state.lastFetched && Date.now() - state.lastFetched < CACHE_TTL_MS) return;
    setState(prev => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await fetchSpaceWeather(force);
      if (!mountedRef.current) return;
      setState({ data, loading: false, error: '', lastFetched: Date.now() });
    } catch (err) {
      if (!mountedRef.current) return;
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Space weather unavailable.',
      }));
    }
  }, [enabled, state.lastFetched]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      void load();
      timerRef.current = setTimeout(() => void load(true), CACHE_TTL_MS);
    }
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    weather: state.data,
    weatherLoading: state.loading,
    weatherError: state.error,
    refreshWeather: () => void load(true),
  };
}

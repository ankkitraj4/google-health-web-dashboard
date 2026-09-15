import { backendFetch } from './backendFetch';

export interface HeartRateSample {
  time: string;
  bpm: number;
}

export interface HeartRateZones {
  light: number | null;
  moderate: number | null;
  vigorous: number | null;
  peak: number | null;
}

// Backend-served intraday heart rate (plan milestone M6) — session-authenticated,
// no access token needed here.
export async function getDailyHeartRateFromBackend(date: Date = new Date()): Promise<HeartRateSample[]> {
  const dateStr = date.toISOString().split('T')[0];
  const data = await backendFetch<{ samples: HeartRateSample[] }>(`/api/metrics/heart-rate?date=${dateStr}`);
  return data.samples;
}

export async function getHeartRateRangeFromBackend(startIso: string, endIso: string): Promise<HeartRateSample[]> {
  const params = new URLSearchParams({ start: startIso, end: endIso });
  const data = await backendFetch<{ samples: HeartRateSample[] }>(`/api/metrics/heart-rate?${params}`);
  return data.samples;
}

export async function getHeartRateZonesFromBackend(daysBack: number = 7): Promise<HeartRateZones> {
  const data = await backendFetch<{ zones: HeartRateZones }>(`/api/metrics/heart-rate-zones?days=${daysBack}`);
  return data.zones;
}

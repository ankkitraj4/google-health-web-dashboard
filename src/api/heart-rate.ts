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
  const res = await fetch(`/api/metrics/heart-rate?date=${dateStr}`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Heart rate fetch failed (${res.status})`);
  const data = (await res.json()) as { samples: HeartRateSample[] };
  return data.samples;
}

export async function getHeartRateRangeFromBackend(startIso: string, endIso: string): Promise<HeartRateSample[]> {
  const params = new URLSearchParams({ start: startIso, end: endIso });
  const res = await fetch(`/api/metrics/heart-rate?${params}`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Heart rate fetch failed (${res.status})`);
  const data = (await res.json()) as { samples: HeartRateSample[] };
  return data.samples;
}

export async function getHeartRateZonesFromBackend(daysBack: number = 7): Promise<HeartRateZones> {
  const res = await fetch(`/api/metrics/heart-rate-zones?days=${daysBack}`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Heart rate zones fetch failed (${res.status})`);
  const data = (await res.json()) as { zones: HeartRateZones };
  return data.zones;
}

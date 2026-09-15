import { healthFetch } from './client';
import type { ListResponse, SleepDataPoint } from '../types/health';

export interface BackendSleepNight {
  date: string;
  startTime: string;
  endTime: string;
  minutesAsleep: number;
  minutesAwake: number;
  stageMinutes: Record<string, number>;
}

// Backend-served sleep (plan milestone M5) — session-authenticated, no
// access token needed here.
export async function getSleepFromBackend(daysBack: number = 7): Promise<BackendSleepNight[]> {
  const res = await fetch(`/api/metrics/sleep?days=${daysBack}`, { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(`Sleep fetch failed (${res.status})`);
  }
  const data = (await res.json()) as { nights: BackendSleepNight[] };
  return data.nights;
}

// Legacy direct-to-Google path — unused now that SleepCard calls the
// backend, kept only in case other code still references it.
export async function getSleepData(
  accessToken: string,
  daysBack: number = 7
): Promise<SleepDataPoint[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  const filter = `sleep.interval.civil_end_time >= "${startDate.toISOString().split('T')[0]}"`;
  const params = new URLSearchParams({ filter, page_size: '20' });

  const data = await healthFetch<ListResponse<SleepDataPoint>>(
    `/users/me/dataTypes/sleep/dataPoints?${params}`,
    accessToken
  );

  return data.dataPoints || [];
}

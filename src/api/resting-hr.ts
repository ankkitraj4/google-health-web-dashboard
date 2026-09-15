import { healthFetch } from './client';
import type { ListResponse, RestingHrDataPoint } from '../types/health';

export interface BackendDailyPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

// Backend-served resting heart rate (plan milestone M5) — session-authenticated,
// no access token needed here.
export async function getRestingHrFromBackend(daysBack: number = 7): Promise<BackendDailyPoint[]> {
  const res = await fetch(`/api/metrics/resting-heart-rate?days=${daysBack}`, { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(`Resting heart rate fetch failed (${res.status})`);
  }
  const data = (await res.json()) as { points: BackendDailyPoint[] };
  return data.points;
}

// Legacy direct-to-Google path — unused now that RestingHrCard calls the
// backend, kept only in case other code still references it.
export async function getRestingHrData(
  accessToken: string,
  daysBack: number = 7
): Promise<RestingHrDataPoint[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  const filter = `daily_resting_heart_rate.date >= "${startDate.toISOString().split('T')[0]}"`;
  const params = new URLSearchParams({ filter });

  const data = await healthFetch<ListResponse<RestingHrDataPoint>>(
    `/users/me/dataTypes/daily-resting-heart-rate/dataPoints?${params}`,
    accessToken
  );

  return data.dataPoints || [];
}

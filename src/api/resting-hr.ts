import { healthFetch } from './client';
import type { ListResponse, RestingHrDataPoint } from '../types/health';

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

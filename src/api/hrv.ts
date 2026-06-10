import { healthFetch } from './client';
import type { ListResponse, HrvDataPoint } from '../types/health';

export async function getHrvData(
  accessToken: string,
  daysBack: number = 7
): Promise<HrvDataPoint[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  const filter = `daily_heart_rate_variability.date >= "${startDate.toISOString().split('T')[0]}"`;
  const params = new URLSearchParams({ filter });

  const data = await healthFetch<ListResponse<HrvDataPoint>>(
    `/users/me/dataTypes/daily-heart-rate-variability/dataPoints?${params}`,
    accessToken
  );

  return data.dataPoints || [];
}

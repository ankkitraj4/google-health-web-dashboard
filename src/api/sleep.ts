import { healthFetch } from './client';
import type { ListResponse, SleepDataPoint } from '../types/health';

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

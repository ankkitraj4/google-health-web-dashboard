import { healthFetch } from './client';
import type { ListResponse, NutritionDataPoint } from '../types/health';

export async function getNutritionData(
  accessToken: string
): Promise<NutritionDataPoint[]> {
  const data = await healthFetch<ListResponse<NutritionDataPoint>>(
    `/users/me/dataTypes/nutrition-log/dataPoints?page_size=50`,
    accessToken
  );

  const today = new Date().toISOString().split('T')[0];
  const points = data.dataPoints || [];

  const filtered = points.filter((d) => {
    const time = d.nutritionLog?.interval?.startTime;
    return time?.startsWith(today);
  });
  return filtered;
}

export async function getNutritionHistory(
  accessToken: string,
  daysBack: number
): Promise<NutritionDataPoint[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const allPoints: NutritionDataPoint[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ page_size: '200' });
    if (pageToken) params.set('page_token', pageToken);

    const data = await healthFetch<ListResponse<NutritionDataPoint>>(
      `/users/me/dataTypes/nutrition-log/dataPoints?${params}`,
      accessToken
    );

    const points = data.dataPoints || [];
    const filtered = points.filter((d) => {
      const time = d.nutritionLog?.interval?.startTime;
      return time && time >= cutoffStr;
    });
    allPoints.push(...filtered);
    pageToken = data.nextPageToken;

    if (points.some((d) => (d.nutritionLog?.interval?.startTime || '') < cutoffStr)) break;
  } while (pageToken);

  return allPoints;
}

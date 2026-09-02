import { healthFetch } from './client';
import type { ListResponse, NutritionDataPoint } from '../types/health';

function localDateIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function nutritionDateIso(point: NutritionDataPoint): string | null {
  const civilDate = point.nutritionLog?.interval?.civilStartTime?.date;
  if (civilDate) {
    return `${civilDate.year}-${String(civilDate.month).padStart(2, '0')}-${String(civilDate.day).padStart(2, '0')}`;
  }

  const time = point.nutritionLog?.interval?.startTime;
  return time ? localDateIso(new Date(time)) : null;
}

export async function getNutritionData(
  accessToken: string
): Promise<NutritionDataPoint[]> {
  const data = await healthFetch<ListResponse<NutritionDataPoint>>(
    `/users/me/dataTypes/nutrition-log/dataPoints?page_size=50`,
    accessToken
  );

  const today = localDateIso(new Date());
  const points = data.dataPoints || [];

  const filtered = points.filter((d) => {
    return nutritionDateIso(d) === today;
  });
  return filtered;
}

export async function getNutritionHistory(
  accessToken: string,
  daysBack: number
): Promise<NutritionDataPoint[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const cutoffStr = localDateIso(cutoff);

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
      const date = nutritionDateIso(d);
      return date !== null && date >= cutoffStr;
    });
    allPoints.push(...filtered);
    pageToken = data.nextPageToken;

    if (points.some((d) => (nutritionDateIso(d) || '') < cutoffStr)) break;
  } while (pageToken);

  return allPoints;
}

import { backendFetch } from './backendFetch';

export interface BackendDailyPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface DailyMetricResponse {
  points: BackendDailyPoint[];
  latestDate: string | null;
}

// Backend-served steps and calories (plan milestones M4/M5) — call our own
// session-authenticated endpoints instead of Google directly, so no access
// token is needed in the browser.
export function getStepsDailyFromBackend(daysBack: number = 7): Promise<DailyMetricResponse> {
  return backendFetch(`/api/metrics/steps?days=${daysBack}`);
}

export function getCaloriesDailyFromBackend(daysBack: number = 7): Promise<DailyMetricResponse> {
  return backendFetch(`/api/metrics/calories?days=${daysBack}`);
}

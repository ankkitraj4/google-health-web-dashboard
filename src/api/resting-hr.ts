import { backendFetch } from './backendFetch';
import type { DailyMetricResponse } from './activity';

// Backend-served resting heart rate (plan milestone M5) — session-authenticated,
// no access token needed here.
export function getRestingHrFromBackend(daysBack: number = 7): Promise<DailyMetricResponse> {
  return backendFetch(`/api/metrics/resting-heart-rate?days=${daysBack}`);
}

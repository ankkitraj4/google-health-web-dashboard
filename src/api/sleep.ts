import { backendFetch } from './backendFetch';

export interface BackendSleepNight {
  date: string;
  startTime: string;
  endTime: string;
  minutesAsleep: number;
  minutesAwake: number;
  stageMinutes: Record<string, number>;
}

export interface SleepResponse {
  nights: BackendSleepNight[];
  latestDate: string | null;
}

// Backend-served sleep (plan milestone M5) — session-authenticated, no
// access token needed here.
export function getSleepFromBackend(daysBack: number = 7): Promise<SleepResponse> {
  return backendFetch(`/api/metrics/sleep?days=${daysBack}`);
}

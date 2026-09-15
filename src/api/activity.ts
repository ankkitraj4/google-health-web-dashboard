import { healthFetch } from './client';
import type { RollupResponse, StepsRollupDataPoint, CaloriesRollupDataPoint } from '../types/health';

function getDailyRollUpBody(daysBack: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);

  return {
    range: {
      start: {
        date: { year: start.getFullYear(), month: start.getMonth() + 1, day: start.getDate() },
        time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
      },
      end: {
        date: { year: end.getFullYear(), month: end.getMonth() + 1, day: end.getDate() },
        time: { hours: 23, minutes: 59, seconds: 59, nanos: 0 },
      },
    },
    windowSizeDays: 1,
  };
}

export interface BackendDailyPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

// Backend-served steps (plan milestone M4) — calls our own session-authenticated
// endpoint instead of Google directly, so no access token is needed here.
export async function getStepsDailyFromBackend(daysBack: number = 7): Promise<BackendDailyPoint[]> {
  const res = await fetch(`/api/metrics/steps?days=${daysBack}`, { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(`Steps fetch failed (${res.status})`);
  }
  const data = (await res.json()) as { points: BackendDailyPoint[] };
  return data.points;
}

// Legacy direct-to-Google path — still used by getCaloriesDaily/
// getActiveCaloriesDaily until they're wired through the backend in M5.
export async function getStepsDaily(
  accessToken: string,
  daysBack: number = 7
): Promise<StepsRollupDataPoint[]> {
  const data = await healthFetch<RollupResponse<StepsRollupDataPoint>>(
    '/users/me/dataTypes/steps/dataPoints:dailyRollUp',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(getDailyRollUpBody(daysBack)),
    }
  );

  return data.rollupDataPoints || [];
}

export async function getCaloriesDaily(
  accessToken: string,
  daysBack: number = 7
): Promise<CaloriesRollupDataPoint[]> {
  const data = await healthFetch<RollupResponse<CaloriesRollupDataPoint>>(
    '/users/me/dataTypes/total-calories/dataPoints:dailyRollUp',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(getDailyRollUpBody(daysBack)),
    }
  );

  return data.rollupDataPoints || [];
}

export async function getActiveCaloriesDaily(
  accessToken: string,
  daysBack: number = 7
): Promise<CaloriesRollupDataPoint[]> {
  const dataTypes = ['active-energy-burned', 'active-calories-burned', 'calories-expended'];

  for (const dataType of dataTypes) {
    try {
      const data = await healthFetch<RollupResponse<CaloriesRollupDataPoint>>(
        `/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify(getDailyRollUpBody(daysBack)),
        }
      );

      return data.rollupDataPoints || [];
    } catch {
      // Try the next known calorie data type name. Some Health tenants expose different names.
    }
  }

  return [];
}

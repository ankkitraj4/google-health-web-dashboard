import { healthFetch } from './client';
import type { RollupResponse, CaloriesRollupDataPoint } from '../types/health';

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

// Legacy direct-to-Google path, still used by NutritionCard (out of scope
// for M4/M5's declared metric list — steps, sleep, heart rate/resting heart
// rate, exercise, calories, distance, active minutes — so it isn't wired
// through the backend yet and stays non-functional until a future pass,
// same as CardioCard/HeartZonesCard). Kept only so the build compiles.
export async function getCaloriesDaily(
  accessToken: string,
  daysBack: number = 7
): Promise<CaloriesRollupDataPoint[]> {
  const data = await healthFetch<RollupResponse<CaloriesRollupDataPoint>>(
    '/users/me/dataTypes/total-calories/dataPoints:dailyRollUp',
    accessToken,
    { method: 'POST', body: JSON.stringify(getDailyRollUpBody(daysBack)) }
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
        { method: 'POST', body: JSON.stringify(getDailyRollUpBody(daysBack)) }
      );
      return data.rollupDataPoints || [];
    } catch {
      // Try the next known calorie data type name. Some Health tenants expose different names.
    }
  }
  return [];
}

export interface BackendDailyPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

async function getDailyFromBackend(path: string, daysBack: number): Promise<BackendDailyPoint[]> {
  const res = await fetch(`${path}?days=${daysBack}`, { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status})`);
  }
  const data = (await res.json()) as { points: BackendDailyPoint[] };
  return data.points;
}

// Backend-served steps and calories (plan milestones M4/M5) — call our own
// session-authenticated endpoints instead of Google directly, so no access
// token is needed in the browser.
export function getStepsDailyFromBackend(daysBack: number = 7): Promise<BackendDailyPoint[]> {
  return getDailyFromBackend('/api/metrics/steps', daysBack);
}

export function getCaloriesDailyFromBackend(daysBack: number = 7): Promise<BackendDailyPoint[]> {
  return getDailyFromBackend('/api/metrics/calories', daysBack);
}

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

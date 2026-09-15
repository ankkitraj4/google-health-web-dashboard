const BASE_URL = 'https://health.googleapis.com/v4';

// Ported from the fork's src/api/activity.ts request shape, confirmed
// against a real account in plan milestone M2.
function dailyRollUpBody(daysBack: number) {
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

export interface RollupDataPoint {
  civilStartTime?: { date?: { year: number; month: number; day: number } };
  civilEndTime?: { date?: { year: number; month: number; day: number } };
  steps?: { countSum?: string };
}

export async function fetchStepsDailyRollup(accessToken: string, daysBack: number): Promise<RollupDataPoint[]> {
  const res = await fetch(`${BASE_URL}/users/me/dataTypes/steps/dataPoints:dailyRollUp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dailyRollUpBody(daysBack)),
  });
  if (!res.ok) {
    throw new Error(`Google Health API error (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { rollupDataPoints?: RollupDataPoint[] };
  return data.rollupDataPoints ?? [];
}

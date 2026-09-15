export interface BackendDailyPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

// Backend-served resting heart rate (plan milestone M5) — session-authenticated,
// no access token needed here.
export async function getRestingHrFromBackend(daysBack: number = 7): Promise<BackendDailyPoint[]> {
  const res = await fetch(`/api/metrics/resting-heart-rate?days=${daysBack}`, { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(`Resting heart rate fetch failed (${res.status})`);
  }
  const data = (await res.json()) as { points: BackendDailyPoint[] };
  return data.points;
}

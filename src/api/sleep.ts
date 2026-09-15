export interface BackendSleepNight {
  date: string;
  startTime: string;
  endTime: string;
  minutesAsleep: number;
  minutesAwake: number;
  stageMinutes: Record<string, number>;
}

// Backend-served sleep (plan milestone M5) — session-authenticated, no
// access token needed here.
export async function getSleepFromBackend(daysBack: number = 7): Promise<BackendSleepNight[]> {
  const res = await fetch(`/api/metrics/sleep?days=${daysBack}`, { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(`Sleep fetch failed (${res.status})`);
  }
  const data = (await res.json()) as { nights: BackendSleepNight[] };
  return data.nights;
}

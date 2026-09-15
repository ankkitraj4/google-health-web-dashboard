export interface ExerciseSession {
  sourceId: string;
  startTime: string;
  endTime: string;
  exerciseType: string;
  displayName: string | null;
  notes: string | null;
  caloriesKcal: number | null;
  distanceMm: number | null;
  avgHeartRate: number | null;
  steps: number | null;
  avgSpeedMmPerS: number | null;
  avgPaceSPerM: number | null;
  elevationGainMm: number | null;
  activeZoneMinutes: number | null;
  vo2Max: number | null;
  hrZoneSeconds: { light: number | null; moderate: number | null; vigorous: number | null; peak: number | null };
}

// Backend-served exercise sessions (plan milestone M6) — session-authenticated,
// no access token needed here.
export async function getExercisesFromBackend(daysBack: number = 60): Promise<ExerciseSession[]> {
  const res = await fetch(`/api/exercise?days=${daysBack}`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Exercise fetch failed (${res.status})`);
  const data = (await res.json()) as { sessions: ExerciseSession[] };
  return data.sessions;
}

export function exerciseLabel(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

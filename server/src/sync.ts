import {
  fetchStepsDailyRollup,
  fetchActiveMinutesDailyRollup,
  fetchCaloriesDailyRollup,
  fetchDistanceDailyRollup,
  fetchActiveZoneMinutesDailyRollup,
  fetchTimeInHeartRateZoneDailyRollup,
  fetchRestingHrList,
  fetchHrvList,
  fetchOxygenSaturationSamples,
  fetchNutritionLogList,
  fetchSleepList,
  fetchExerciseList,
  type DayRange,
} from './google-health.js';
import {
  upsertStepsRollup,
  upsertActiveMinutesRollup,
  upsertCaloriesRollup,
  upsertDistanceRollup,
  upsertActiveZoneMinutesRollup,
  upsertTimeInHeartRateZoneRollup,
  upsertRestingHr,
  upsertHrv,
  upsertSpo2Daily,
  upsertNutritionLogs,
  normalizeSleep,
  upsertSleepNights,
  upsertExerciseSessions,
} from './metrics.js';
import { GoogleHealthApiError } from './errors.js';

// 14, not a rounder 30 — confirmed live against the real API (M8): a
// dailyRollUp request over active-minutes rejects with 400
// INVALID_ROLLUP_QUERY_DURATION past a 14-day window ("window_size_days *
// page_size must not exceed 14 days for active-minutes"). Steps accepted a
// wider window in the same run, but using the strictest metric's limit for
// every chunk keeps this one constant rather than needing a per-metric
// table that would just be more places to get out of sync with Google's
// actual limits.
const CHUNK_DAYS = 14;

// Splits [0, totalDays] into non-overlapping CHUNK_DAYS-wide windows. Most
// recent chunk first so a backfill that fails partway through has already
// captured the most useful (recent) history.
// Exported for direct unit testing (test/sync.test.ts) — the chunking math
// is exactly the kind of off-by-one-prone logic worth testing in isolation
// rather than only through a full (slow, network-dependent) backfill run.
export function chunkRanges(totalDays: number): DayRange[] {
  const ranges: DayRange[] = [];
  for (let end = 0; end < totalDays; end += CHUNK_DAYS) {
    ranges.push({ startDaysBack: Math.min(end + CHUNK_DAYS, totalDays), endDaysBack: end });
  }
  return ranges;
}

function describeError(err: unknown): string {
  if (err instanceof GoogleHealthApiError) return `${err.code}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

export interface BackfillMetricResult {
  metric: string;
  chunks: number;
  pointsUpserted: number;
  error?: string;
}

// Runs the rollup metrics chunk-by-chunk (each chunk already retried
// internally by google-health.ts's withRetry) and the list-based metrics in
// one paginated call each. A failure in one metric doesn't abort the
// others — each is reported independently so a partial backfill is still
// visible rather than an all-or-nothing failure (plan milestone M8).
export async function runBackfill(userId: string, accessToken: string, totalDays: number): Promise<BackfillMetricResult[]> {
  const ranges = chunkRanges(totalDays);
  const results: BackfillMetricResult[] = [];

  try {
    let pointsUpserted = 0;
    for (const range of ranges) {
      const points = await fetchStepsDailyRollup(accessToken, range);
      upsertStepsRollup(userId, points);
      pointsUpserted += points.length;
    }
    results.push({ metric: 'steps', chunks: ranges.length, pointsUpserted });
  } catch (err) {
    results.push({ metric: 'steps', chunks: 0, pointsUpserted: 0, error: describeError(err) });
  }

  try {
    let pointsUpserted = 0;
    for (const range of ranges) {
      const points = await fetchActiveMinutesDailyRollup(accessToken, range);
      upsertActiveMinutesRollup(userId, points);
      pointsUpserted += points.length;
    }
    results.push({ metric: 'active-minutes', chunks: ranges.length, pointsUpserted });
  } catch (err) {
    results.push({ metric: 'active-minutes', chunks: 0, pointsUpserted: 0, error: describeError(err) });
  }

  try {
    let pointsUpserted = 0;
    for (const range of ranges) {
      const points = await fetchCaloriesDailyRollup(accessToken, range);
      upsertCaloriesRollup(userId, points);
      pointsUpserted += points.length;
    }
    results.push({ metric: 'calories', chunks: ranges.length, pointsUpserted });
  } catch (err) {
    results.push({ metric: 'calories', chunks: 0, pointsUpserted: 0, error: describeError(err) });
  }

  try {
    let pointsUpserted = 0;
    for (const range of ranges) {
      const points = await fetchDistanceDailyRollup(accessToken, range);
      upsertDistanceRollup(userId, points);
      pointsUpserted += points.length;
    }
    results.push({ metric: 'distance', chunks: ranges.length, pointsUpserted });
  } catch (err) {
    results.push({ metric: 'distance', chunks: 0, pointsUpserted: 0, error: describeError(err) });
  }

  try {
    let pointsUpserted = 0;
    for (const range of ranges) {
      const points = await fetchActiveZoneMinutesDailyRollup(accessToken, range);
      upsertActiveZoneMinutesRollup(userId, points);
      pointsUpserted += points.length;
    }
    results.push({ metric: 'active-zone-minutes', chunks: ranges.length, pointsUpserted });
  } catch (err) {
    results.push({ metric: 'active-zone-minutes', chunks: 0, pointsUpserted: 0, error: describeError(err) });
  }

  try {
    let pointsUpserted = 0;
    for (const range of ranges) {
      const points = await fetchTimeInHeartRateZoneDailyRollup(accessToken, range);
      upsertTimeInHeartRateZoneRollup(userId, points);
      pointsUpserted += points.length;
    }
    results.push({ metric: 'time-in-heart-rate-zone', chunks: ranges.length, pointsUpserted });
  } catch (err) {
    results.push({ metric: 'time-in-heart-rate-zone', chunks: 0, pointsUpserted: 0, error: describeError(err) });
  }

  try {
    const points = await fetchRestingHrList(accessToken, totalDays);
    upsertRestingHr(userId, points);
    results.push({ metric: 'resting-heart-rate', chunks: 1, pointsUpserted: points.length });
  } catch (err) {
    results.push({ metric: 'resting-heart-rate', chunks: 0, pointsUpserted: 0, error: describeError(err) });
  }

  try {
    const points = await fetchHrvList(accessToken, totalDays);
    const count = upsertHrv(userId, points);
    results.push({ metric: 'hrv', chunks: 1, pointsUpserted: count });
  } catch (err) {
    results.push({ metric: 'hrv', chunks: 0, pointsUpserted: 0, error: describeError(err) });
  }

  try {
    const samples = await fetchOxygenSaturationSamples(accessToken, totalDays);
    const days = upsertSpo2Daily(userId, samples);
    results.push({ metric: 'spo2', chunks: 1, pointsUpserted: days });
  } catch (err) {
    results.push({ metric: 'spo2', chunks: 0, pointsUpserted: 0, error: describeError(err) });
  }

  try {
    const points = await fetchSleepList(accessToken, totalDays);
    const nights = upsertSleepNights(userId, normalizeSleep(points));
    results.push({ metric: 'sleep', chunks: 1, pointsUpserted: nights.length });
  } catch (err) {
    results.push({ metric: 'sleep', chunks: 0, pointsUpserted: 0, error: describeError(err) });
  }

  try {
    const points = await fetchNutritionLogList(accessToken, totalDays);
    const count = upsertNutritionLogs(userId, points);
    results.push({ metric: 'nutrition', chunks: 1, pointsUpserted: count });
  } catch (err) {
    results.push({ metric: 'nutrition', chunks: 0, pointsUpserted: 0, error: describeError(err) });
  }

  try {
    const points = await fetchExerciseList(accessToken, totalDays);
    const sessions = upsertExerciseSessions(userId, points);
    results.push({ metric: 'exercise', chunks: 1, pointsUpserted: sessions.length });
  } catch (err) {
    results.push({ metric: 'exercise', chunks: 0, pointsUpserted: 0, error: describeError(err) });
  }

  return results;
}

// Scoped refresh for one metric's window — used by the webhook handler
// (M8). Maps Google's dataType name to the matching fetch+upsert pair.
// Returns null for dataTypes we don't recognize, rather than silently
// pretending to have handled them.
export async function refreshMetricWindow(
  userId: string,
  accessToken: string,
  dataType: string,
  range: DayRange
): Promise<{ metric: string; pointsUpserted: number } | null> {
  switch (dataType) {
    case 'steps': {
      const points = await fetchStepsDailyRollup(accessToken, range);
      upsertStepsRollup(userId, points);
      return { metric: 'steps', pointsUpserted: points.length };
    }
    case 'active-minutes': {
      const points = await fetchActiveMinutesDailyRollup(accessToken, range);
      upsertActiveMinutesRollup(userId, points);
      return { metric: 'active-minutes', pointsUpserted: points.length };
    }
    case 'total-calories': {
      const points = await fetchCaloriesDailyRollup(accessToken, range);
      upsertCaloriesRollup(userId, points);
      return { metric: 'calories', pointsUpserted: points.length };
    }
    case 'distance': {
      const points = await fetchDistanceDailyRollup(accessToken, range);
      upsertDistanceRollup(userId, points);
      return { metric: 'distance', pointsUpserted: points.length };
    }
    case 'active-zone-minutes': {
      const points = await fetchActiveZoneMinutesDailyRollup(accessToken, range);
      upsertActiveZoneMinutesRollup(userId, points);
      return { metric: 'active-zone-minutes', pointsUpserted: points.length };
    }
    case 'time-in-heart-rate-zone': {
      const points = await fetchTimeInHeartRateZoneDailyRollup(accessToken, range);
      upsertTimeInHeartRateZoneRollup(userId, points);
      return { metric: 'time-in-heart-rate-zone', pointsUpserted: points.length };
    }
    case 'daily-resting-heart-rate': {
      const daysBack = Math.max(range.startDaysBack, 1);
      const points = await fetchRestingHrList(accessToken, daysBack);
      upsertRestingHr(userId, points);
      return { metric: 'resting-heart-rate', pointsUpserted: points.length };
    }
    case 'daily-heart-rate-variability': {
      const daysBack = Math.max(range.startDaysBack, 1);
      const points = await fetchHrvList(accessToken, daysBack);
      const count = upsertHrv(userId, points);
      return { metric: 'hrv', pointsUpserted: count };
    }
    case 'oxygen-saturation': {
      const daysBack = Math.max(range.startDaysBack, 1);
      const samples = await fetchOxygenSaturationSamples(accessToken, daysBack);
      const days = upsertSpo2Daily(userId, samples);
      return { metric: 'spo2', pointsUpserted: days };
    }
    case 'sleep': {
      const daysBack = Math.max(range.startDaysBack, 1);
      const points = await fetchSleepList(accessToken, daysBack);
      const nights = upsertSleepNights(userId, normalizeSleep(points));
      return { metric: 'sleep', pointsUpserted: nights.length };
    }
    case 'nutrition-log': {
      const daysBack = Math.max(range.startDaysBack, 1);
      const points = await fetchNutritionLogList(accessToken, daysBack);
      const count = upsertNutritionLogs(userId, points);
      return { metric: 'nutrition', pointsUpserted: count };
    }
    case 'exercise': {
      const daysBack = Math.max(range.startDaysBack, 1);
      const points = await fetchExerciseList(accessToken, daysBack);
      const sessions = upsertExerciseSessions(userId, points);
      return { metric: 'exercise', pointsUpserted: sessions.length };
    }
    default:
      return null;
  }
}

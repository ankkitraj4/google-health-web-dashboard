import { classifyHealthApiFailure, GoogleHealthApiError } from './errors.js';

const BASE_URL = 'https://health.googleapis.com/v4';

// A window expressed relative to today: [today - startDaysBack, today -
// endDaysBack]. The hot-sync path (M4/M5) only ever wants endDaysBack: 0
// (through today); backfill (M8) walks older, non-overlapping windows by
// varying both ends, chunked so one request never spans an unbounded range.
export interface DayRange {
  startDaysBack: number;
  endDaysBack: number;
}

function toRange(daysBackOrRange: number | DayRange): DayRange {
  return typeof daysBackOrRange === 'number' ? { startDaysBack: daysBackOrRange, endDaysBack: 0 } : daysBackOrRange;
}

// Ported from the fork's src/api/activity.ts request shape, confirmed
// against a real account in plan milestone M2. Extended in M8 to accept an
// arbitrary historical window instead of always ending today.
function dailyRollUpBody({ startDaysBack, endDaysBack }: DayRange) {
  const end = new Date();
  end.setDate(end.getDate() - endDaysBack);
  const start = new Date();
  start.setDate(start.getDate() - startDaysBack);
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

async function healthFetch<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw classifyHealthApiFailure(res.status, await res.text(), res.headers.get('retry-after'));
  }
  return res.json() as Promise<T>;
}

const MAX_RETRIES = 4;

// Retries only the transient failure classes (rate limits, 5xx/network) with
// exponential backoff, honoring Google's Retry-After when it sends one.
// consent_revoked/insufficient_scope fail fast — retrying those can't help
// (plan milestone M8's backfill backoff requirement).
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err instanceof GoogleHealthApiError && (err.code === 'rate_limited' || err.code === 'upstream_error');
      if (!isRetryable || attempt >= MAX_RETRIES) throw err;
      const retryAfterMs = err instanceof GoogleHealthApiError && err.retryAfterSeconds ? err.retryAfterSeconds * 1000 : null;
      const backoffMs = retryAfterMs ?? Math.min(1000 * 2 ** attempt, 16000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      attempt++;
    }
  }
}

async function fetchDailyRollup<T>(accessToken: string, dataType: string, daysBackOrRange: number | DayRange): Promise<T[]> {
  const data = await withRetry(() =>
    healthFetch<{ rollupDataPoints?: T[] }>(
      `/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`,
      accessToken,
      { method: 'POST', body: JSON.stringify(dailyRollUpBody(toRange(daysBackOrRange))) }
    )
  );
  return data.rollupDataPoints ?? [];
}

export interface StepsRollupDataPoint {
  civilStartTime?: { date?: { year: number; month: number; day: number } };
  civilEndTime?: { date?: { year: number; month: number; day: number } };
  steps?: { countSum?: string };
}

export function fetchStepsDailyRollup(accessToken: string, daysBack: number | DayRange) {
  return fetchDailyRollup<StepsRollupDataPoint>(accessToken, 'steps', daysBack);
}

// Confirmed shape (plan milestone M5): no single total, only a breakdown by
// activity level — callers sum the levels for a daily total.
export interface ActiveMinutesRollupDataPoint {
  civilStartTime?: { date?: { year: number; month: number; day: number } };
  civilEndTime?: { date?: { year: number; month: number; day: number } };
  activeMinutes?: { activeMinutesRollupByActivityLevel?: Array<{ activityLevel: string; activeMinutesSum?: string }> };
}

export function fetchActiveMinutesDailyRollup(accessToken: string, daysBack: number | DayRange) {
  return fetchDailyRollup<ActiveMinutesRollupDataPoint>(accessToken, 'active-minutes', daysBack);
}

// Confirmed shape (plan milestone M5): kcalSum is a number here, unlike
// steps.countSum which comes back as a numeric string.
export interface CaloriesRollupDataPoint {
  civilStartTime?: { date?: { year: number; month: number; day: number } };
  civilEndTime?: { date?: { year: number; month: number; day: number } };
  totalCalories?: { kcalSum?: number };
}

export function fetchCaloriesDailyRollup(accessToken: string, daysBack: number | DayRange) {
  return fetchDailyRollup<CaloriesRollupDataPoint>(accessToken, 'total-calories', daysBack);
}

export interface HeartRateDataPoint {
  heartRate?: { sampleTime?: { physicalTime?: string }; beatsPerMinute?: string };
}

interface HrListResponse {
  dataPoints?: HeartRateDataPoint[];
  nextPageToken?: string;
}

// Ported from the fork's src/api/heart-rate.ts / exercise.ts (they used the
// identical query shape for both the standalone daily card and per-exercise
// HR charts) — intraday heart-rate samples for an arbitrary [start, end)
// range, paginated client-side same as the original.
export async function fetchHeartRateSamples(
  accessToken: string,
  startIso: string,
  endIso: string
): Promise<Array<{ time: string; bpm: number }>> {
  const filter = `heart_rate.sample_time.physical_time >= "${startIso}" AND heart_rate.sample_time.physical_time < "${endIso}"`;
  const samples: Array<{ time: string; bpm: number }> = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ filter, page_size: '10000' });
    if (pageToken) params.set('page_token', pageToken);
    const data = await withRetry(() => healthFetch<HrListResponse>(`/users/me/dataTypes/heart-rate/dataPoints?${params}`, accessToken));
    for (const d of data.dataPoints ?? []) {
      if (d.heartRate?.sampleTime?.physicalTime && d.heartRate?.beatsPerMinute) {
        samples.push({ time: d.heartRate.sampleTime.physicalTime, bpm: parseInt(d.heartRate.beatsPerMinute, 10) });
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return samples.sort((a, b) => a.time.localeCompare(b.time));
}

export interface DailyHeartRateZonesDataPoint {
  dailyHeartRateZones?: {
    date?: { year: number; month: number; day: number };
    heartRateZones?: Array<{ heartRateZoneType: string; minBeatsPerMinute: string; maxBeatsPerMinute: string }>;
  };
}

export async function fetchDailyHeartRateZones(accessToken: string, daysBack: number): Promise<DailyHeartRateZonesDataPoint[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  const filter = `daily_heart_rate_zones.date >= "${startDate.toISOString().split('T')[0]}"`;
  const params = new URLSearchParams({ filter, page_size: '100' });
  const data = await withRetry(() =>
    healthFetch<{ dataPoints?: DailyHeartRateZonesDataPoint[] }>(
      `/users/me/dataTypes/daily-heart-rate-zones/dataPoints?${params}`,
      accessToken
    )
  );
  return data.dataPoints ?? [];
}

export interface RestingHrDataPoint {
  dailyRestingHeartRate?: { date?: { year: number; month: number; day: number }; beatsPerMinute?: string };
}

// Paginated (M8: a 60+ day backfill can exceed one page) and retried — the
// filter has no upper bound, so unlike the rollup endpoints this doesn't
// need chunking into disjoint windows, just enough pages to cover daysBack.
export async function fetchRestingHrList(accessToken: string, daysBack: number): Promise<RestingHrDataPoint[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  const filter = `daily_resting_heart_rate.date >= "${startDate.toISOString().split('T')[0]}"`;
  const results: RestingHrDataPoint[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ filter, page_size: '100' });
    if (pageToken) params.set('page_token', pageToken);
    const data = await withRetry(() =>
      healthFetch<{ dataPoints?: RestingHrDataPoint[]; nextPageToken?: string }>(
        `/users/me/dataTypes/daily-resting-heart-rate/dataPoints?${params}`,
        accessToken
      )
    );
    results.push(...(data.dataPoints ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return results;
}

export interface SleepDataPoint {
  sleep?: {
    interval?: { startTime?: string; endTime?: string };
    summary?: {
      minutesAsleep?: string;
      minutesAwake?: string;
      stagesSummary?: Array<{ type: string; minutes?: string }>;
    };
  };
}

export async function fetchSleepList(accessToken: string, daysBack: number): Promise<SleepDataPoint[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  const filter = `sleep.interval.civil_end_time >= "${startDate.toISOString().split('T')[0]}"`;
  const results: SleepDataPoint[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ filter, page_size: '100' });
    if (pageToken) params.set('page_token', pageToken);
    const data = await withRetry(() =>
      healthFetch<{ dataPoints?: SleepDataPoint[]; nextPageToken?: string }>(
        `/users/me/dataTypes/sleep/dataPoints?${params}`,
        accessToken
      )
    );
    results.push(...(data.dataPoints ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return results;
}

// Confirmed (plan milestone M5): the exercise data type does not support
// server-side filtering by start time ("Member 'exercise.interval.start_time'
// is not supported for filtering") — fetch a page and filter client-side by
// date, same as the fork's own listExercises already does.
export interface ExerciseDataPoint {
  name?: string;
  exercise?: {
    interval?: { startTime?: string; endTime?: string };
    exerciseType?: string;
    displayName?: string;
    notes?: string;
    metricsSummary?: {
      caloriesKcal?: number;
      distanceMillimeters?: number;
      averageHeartRateBeatsPerMinute?: string;
      steps?: string;
      averageSpeedMillimetersPerSecond?: number;
      averagePaceSecondsPerMeter?: number;
      elevationGainMillimeters?: number;
      activeZoneMinutes?: string;
      runVo2Max?: number;
      heartRateZoneDurations?: { lightTime?: string; moderateTime?: string; vigorousTime?: string; peakTime?: string };
    };
  };
}

export async function fetchExerciseList(accessToken: string, daysBack: number): Promise<ExerciseDataPoint[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const results: ExerciseDataPoint[] = [];
  let pageToken: string | undefined;
  // No server-side date filter (see the M5 note above), so for a large
  // backfill window we have to page through and stop once a page's
  // sessions are all older than the cutoff — the API returns newest-first.
  do {
    const params = new URLSearchParams({ page_size: '100' });
    if (pageToken) params.set('page_token', pageToken);
    const data = await withRetry(() =>
      healthFetch<{ dataPoints?: ExerciseDataPoint[]; nextPageToken?: string }>(
        `/users/me/dataTypes/exercise/dataPoints?${params}`,
        accessToken
      )
    );
    const page = data.dataPoints ?? [];
    results.push(...page);
    const oldestOnPage = page[page.length - 1]?.exercise?.interval?.startTime;
    pageToken = oldestOnPage && new Date(oldestOnPage) >= cutoff ? data.nextPageToken : undefined;
  } while (pageToken);
  return results.filter((d) => {
    const start = d.exercise?.interval?.startTime;
    return start ? new Date(start) >= cutoff : false;
  });
}

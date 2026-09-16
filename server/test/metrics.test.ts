import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db.js';
import {
  upsertStepsRollup,
  upsertRestingHr,
  normalizeSleep,
  upsertSleepNights,
  latestDate,
  upsertExerciseSessions,
} from '../src/metrics.js';
import type { StepsRollupDataPoint, RestingHrDataPoint, SleepDataPoint, ExerciseDataPoint } from '../src/google-health.js';

const TEST_USER = 'test-user-1';

beforeEach(() => {
  db.exec('DELETE FROM metrics');
  db.exec('DELETE FROM exercise_sessions');
  db.exec('DELETE FROM sleep_nights');
  db.exec('DELETE FROM users');
  // node:sqlite's DatabaseSync enforces FOREIGN KEY constraints by default —
  // metrics/exercise_sessions/sleep_nights.user_id all reference users(id).
  const now = Date.now();
  db.prepare('INSERT INTO users (id, health_user_id, created_at, updated_at) VALUES (?, ?, ?, ?)').run(TEST_USER, 'health-test-user-1', now, now);
});

describe('upsertStepsRollup', () => {
  it('normalizes real-shaped rollup points and returns them oldest-first', () => {
    // Google returns newest-first (confirmed M2/M4); values are numeric strings.
    const points: StepsRollupDataPoint[] = [
      { civilStartTime: { date: { year: 2026, month: 9, day: 15 } }, steps: { countSum: '5000' } },
      { civilStartTime: { date: { year: 2026, month: 9, day: 14 } }, steps: { countSum: '8000' } },
    ];
    const result = upsertStepsRollup(TEST_USER, points);
    expect(result).toEqual([
      { date: '2026-09-14', value: 8000 },
      { date: '2026-09-15', value: 5000 },
    ]);
  });

  it('is idempotent: re-ingesting the same day updates in place, not duplicated (M4/M5)', () => {
    const day = (v: string) => [{ civilStartTime: { date: { year: 2026, month: 9, day: 15 } }, steps: { countSum: v } }];
    upsertStepsRollup(TEST_USER, day('100'));
    upsertStepsRollup(TEST_USER, day('250')); // simulates steps accruing through the day, same as M4's live finding
    const rows = db.prepare('SELECT value FROM metrics WHERE user_id = ? AND metric_type = ?').all(TEST_USER, 'steps') as Array<{
      value: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(250);
  });

  it('skips points with no start date rather than crashing', () => {
    const points: StepsRollupDataPoint[] = [{ steps: { countSum: '100' } }];
    expect(upsertStepsRollup(TEST_USER, points)).toEqual([]);
  });
});

describe('upsertRestingHr', () => {
  it('parses the real dailyRestingHeartRate shape confirmed in M5', () => {
    const points: RestingHrDataPoint[] = [
      { dailyRestingHeartRate: { date: { year: 2026, month: 9, day: 15 }, beatsPerMinute: '71' } },
    ];
    const result = upsertRestingHr(TEST_USER, points);
    expect(result).toEqual([{ date: '2026-09-15', value: 71 }]);
  });
});

describe('normalizeSleep', () => {
  it('extracts stage minutes and keys the night by end date (confirmed shape from M2/M5)', () => {
    const points: SleepDataPoint[] = [
      {
        sleep: {
          interval: { startTime: '2026-09-13T22:02:00Z', endTime: '2026-09-14T06:07:00Z' },
          summary: {
            minutesAsleep: '411',
            minutesAwake: '74',
            stagesSummary: [
              { type: 'DEEP', minutes: '78' },
              { type: 'REM', minutes: '73' },
            ],
          },
        },
      },
    ];
    const [night] = normalizeSleep(points);
    expect(night.date).toBe('2026-09-14');
    expect(night.minutesAsleep).toBe(411);
    expect(night.stageMinutes).toEqual({ DEEP: 78, REM: 73 });
  });

  it('is a pure function — persistence is a separate step (upsertSleepNights, below)', () => {
    const before = db.prepare('SELECT COUNT(*) as c FROM sleep_nights').get() as { c: number };
    normalizeSleep([
      { sleep: { interval: { startTime: '2026-09-13T22:00:00Z', endTime: '2026-09-14T06:00:00Z' }, summary: {} } },
    ]);
    const after = db.prepare('SELECT COUNT(*) as c FROM sleep_nights').get() as { c: number };
    expect(after.c).toBe(before.c);
  });
});

describe('upsertSleepNights', () => {
  it('is idempotent on night (keyed by wake-up date): re-ingesting overwrites, not duplicates (plan milestone M10)', () => {
    const night = {
      date: '2026-09-14',
      startTime: '2026-09-13T22:02:00Z',
      endTime: '2026-09-14T06:07:00Z',
      minutesAsleep: 411,
      minutesAwake: 74,
      stageMinutes: { DEEP: 78, REM: 73, LIGHT: 200, AWAKE: 74 },
    };
    upsertSleepNights(TEST_USER, [night]);
    upsertSleepNights(TEST_USER, [{ ...night, minutesAsleep: 420 }]);
    const rows = db.prepare('SELECT minutes_asleep as minutesAsleep FROM sleep_nights WHERE user_id = ?').all(TEST_USER) as Array<{
      minutesAsleep: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].minutesAsleep).toBe(420);
  });

  it('stores each sleep stage in its own column', () => {
    upsertSleepNights(TEST_USER, [
      {
        date: '2026-09-14',
        startTime: '2026-09-13T22:02:00Z',
        endTime: '2026-09-14T06:07:00Z',
        minutesAsleep: 411,
        minutesAwake: 74,
        stageMinutes: { DEEP: 78, REM: 73, LIGHT: 260 },
      },
    ]);
    const row = db.prepare('SELECT stage_deep, stage_light, stage_rem, stage_awake FROM sleep_nights WHERE user_id = ?').get(TEST_USER) as {
      stage_deep: number;
      stage_light: number;
      stage_rem: number;
      stage_awake: number;
    };
    expect(row).toEqual({ stage_deep: 78, stage_light: 260, stage_rem: 73, stage_awake: 0 });
  });
});

describe('latestDate', () => {
  it('returns the last (most recent, since points are oldest-first) date', () => {
    expect(latestDate([{ date: '2026-09-13', value: 1 }, { date: '2026-09-15', value: 2 }])).toBe('2026-09-15');
  });
  it('returns null for an empty list', () => {
    expect(latestDate([])).toBeNull();
  });
});

describe('upsertExerciseSessions', () => {
  it('is idempotent on Google-provided record name, matching M5/M6 live findings', () => {
    const point: ExerciseDataPoint = {
      name: 'users/x/dataTypes/exercise/dataPoints/809906727161255472',
      exercise: {
        interval: { startTime: '2026-09-15T09:02:33.200Z', endTime: '2026-09-15T09:24:28.400Z' },
        exerciseType: 'BIKING',
        metricsSummary: { caloriesKcal: 83, averageHeartRateBeatsPerMinute: '103' },
      },
    };
    upsertExerciseSessions(TEST_USER, [point]);
    upsertExerciseSessions(TEST_USER, [point]);
    const rows = db.prepare('SELECT * FROM exercise_sessions WHERE user_id = ?').all(TEST_USER);
    expect(rows).toHaveLength(1);
  });

  it('skips a point with no source name/start/end', () => {
    const result = upsertExerciseSessions(TEST_USER, [{ exercise: { exerciseType: 'BIKING' } }]);
    expect(result).toEqual([]);
  });
});

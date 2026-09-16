import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db.js';
import {
  upsertStepsRollup,
  upsertDistanceRollup,
  upsertActiveZoneMinutesRollup,
  upsertTimeInHeartRateZoneRollup,
  upsertRestingHr,
  upsertHrv,
  upsertSpo2Daily,
  upsertNutritionLogs,
  upsertDeviceSnapshots,
  upsertSleepTemperature,
  upsertRespiratoryRate,
  upsertCoreBodyTemperature,
  upsertHydrationLogs,
  upsertBasalEnergyBurned,
  upsertAltitudeRollup,
  upsertFloorsRollup,
  normalizeSleep,
  upsertSleepNights,
  latestDate,
  upsertExerciseSessions,
} from '../src/metrics.js';
import type {
  StepsRollupDataPoint,
  DistanceRollupDataPoint,
  ActiveZoneMinutesRollupDataPoint,
  TimeInHeartRateZoneRollupDataPoint,
  RestingHrDataPoint,
  HrvDataPoint,
  NutritionLogDataPoint,
  PairedDevice,
  SleepTemperatureDataPoint,
  RespiratoryRateDataPoint,
  HydrationLogDataPoint,
  BasalEnergyBurnedDataPoint,
  AltitudeRollupDataPoint,
  FloorsRollupDataPoint,
  SleepDataPoint,
  ExerciseDataPoint,
} from '../src/google-health.js';

const TEST_USER = 'test-user-1';

beforeEach(() => {
  db.exec('DELETE FROM metrics');
  db.exec('DELETE FROM exercise_sessions');
  db.exec('DELETE FROM sleep_nights');
  db.exec('DELETE FROM hrv_daily');
  db.exec('DELETE FROM spo2_daily');
  db.exec('DELETE FROM nutrition_logs');
  db.exec('DELETE FROM device_snapshots');
  db.exec('DELETE FROM temperature_daily');
  db.exec('DELETE FROM core_temp_daily');
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

describe('upsertDistanceRollup', () => {
  it('parses the real distance dailyRollUp shape (M10 — corrects M5\'s wrong "no distance data type" finding)', () => {
    const points: DistanceRollupDataPoint[] = [
      { civilStartTime: { date: { year: 2026, month: 9, day: 16 } }, distance: { millimetersSum: '1592800' } },
    ];
    const result = upsertDistanceRollup(TEST_USER, points);
    expect(result).toEqual([{ date: '2026-09-16', value: 1592800 }]);
  });
});

describe('upsertActiveZoneMinutesRollup', () => {
  it('splits the three zones into separate metric_type rows', () => {
    const points: ActiveZoneMinutesRollupDataPoint[] = [
      {
        civilStartTime: { date: { year: 2026, month: 9, day: 16 } },
        activeZoneMinutes: { sumInFatBurnHeartZone: '6', sumInCardioHeartZone: '2', sumInPeakHeartZone: '0' },
      },
    ];
    upsertActiveZoneMinutesRollup(TEST_USER, points);
    const rows = db
      .prepare('SELECT metric_type, value FROM metrics WHERE user_id = ? ORDER BY metric_type')
      .all(TEST_USER) as Array<{ metric_type: string; value: number }>;
    expect(rows).toEqual([
      { metric_type: 'azm-cardio', value: 2 },
      { metric_type: 'azm-fat-burn', value: 6 },
      { metric_type: 'azm-peak', value: 0 },
    ]);
  });
});

describe('upsertTimeInHeartRateZoneRollup', () => {
  it('converts each present zone\'s duration to minutes, defaulting absent zones to 0', () => {
    const points: TimeInHeartRateZoneRollupDataPoint[] = [
      {
        civilStartTime: { date: { year: 2026, month: 9, day: 16 } },
        timeInHeartRateZone: {
          timeInHeartRateZones: [
            { heartRateZone: 'LIGHT', duration: '67800s' },
            { heartRateZone: 'MODERATE', duration: '420s' },
          ],
        },
      },
    ];
    upsertTimeInHeartRateZoneRollup(TEST_USER, points);
    const rows = db
      .prepare('SELECT metric_type, value FROM metrics WHERE user_id = ? ORDER BY metric_type')
      .all(TEST_USER) as Array<{ metric_type: string; value: number }>;
    expect(rows).toEqual([
      { metric_type: 'hr-zone-light', value: 1130 },
      { metric_type: 'hr-zone-moderate', value: 7 },
      { metric_type: 'hr-zone-peak', value: 0 },
      { metric_type: 'hr-zone-vigorous', value: 0 },
    ]);
  });
});

describe('upsertHrv', () => {
  it('is idempotent on date and stores the richer sub-fields (M10)', () => {
    const points: HrvDataPoint[] = [
      {
        dailyHeartRateVariability: {
          date: { year: 2026, month: 9, day: 16 },
          averageHeartRateVariabilityMilliseconds: 17.3,
          nonRemHeartRateBeatsPerMinute: '65',
          entropy: 2.171,
          deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds: 17.8,
        },
      },
    ];
    expect(upsertHrv(TEST_USER, points)).toBe(1);
    expect(upsertHrv(TEST_USER, points)).toBe(1); // re-ingest: still one row, not two
    const row = db.prepare('SELECT * FROM hrv_daily WHERE user_id = ?').get(TEST_USER) as Record<string, unknown>;
    expect(row.avg_hrv_ms).toBe(17.3);
    expect(row.non_rem_hr_bpm).toBe(65);
    expect(row.entropy).toBe(2.171);
    expect(row.deep_sleep_rmssd_ms).toBe(17.8);
  });

  it('skips points missing a date or the average value', () => {
    expect(upsertHrv(TEST_USER, [{ dailyHeartRateVariability: {} }])).toBe(0);
  });
});

describe('upsertSpo2Daily', () => {
  it('aggregates raw samples into one avg/min/max row per calendar day (oxygen-saturation has no dailyRollUp support — confirmed live, M10)', () => {
    const samples = [
      { time: '2026-09-16T05:00:00Z', percentage: 94 },
      { time: '2026-09-16T05:01:00Z', percentage: 96 },
      { time: '2026-09-15T22:00:00Z', percentage: 92 },
    ];
    const days = upsertSpo2Daily(TEST_USER, samples);
    expect(days).toBe(2);
    const rows = db
      .prepare('SELECT date, avg_percentage, min_percentage, max_percentage, sample_count FROM spo2_daily WHERE user_id = ? ORDER BY date')
      .all(TEST_USER);
    expect(rows).toEqual([
      { date: '2026-09-15', avg_percentage: 92, min_percentage: 92, max_percentage: 92, sample_count: 1 },
      { date: '2026-09-16', avg_percentage: 95, min_percentage: 94, max_percentage: 96, sample_count: 2 },
    ]);
  });
});

describe('upsertNutritionLogs', () => {
  it('is idempotent on Google-provided record name and extracts protein from the nutrients array (M11 — "nutrition-log", not "nutrition", was the real data type name)', () => {
    const point: NutritionLogDataPoint = {
      name: 'users/x/dataTypes/nutrition-log/dataPoints/6522603451112558366',
      nutritionLog: {
        interval: { startTime: '2026-09-16T11:15:00Z', endTime: '2026-09-16T11:45:00Z' },
        mealType: 'LUNCH',
        foodDisplayName: 'Air-fried Salmon',
        energy: { kcal: 210 },
        totalCarbohydrate: { grams: 0 },
        totalFat: { grams: 11 },
        nutrients: [{ nutrient: 'PROTEIN', quantity: { grams: 25 } }],
      },
    };
    expect(upsertNutritionLogs(TEST_USER, [point])).toBe(1);
    expect(upsertNutritionLogs(TEST_USER, [point])).toBe(1);
    const rows = db.prepare('SELECT * FROM nutrition_logs WHERE user_id = ?').all(TEST_USER);
    expect(rows).toHaveLength(1);
    const row = rows[0] as Record<string, unknown>;
    expect(row.meal_type).toBe('LUNCH');
    expect(row.food_name).toBe('Air-fried Salmon');
    expect(row.energy_kcal).toBe(210);
    expect(row.protein_g).toBe(25);
  });

  it('skips a point with no source name/start/end', () => {
    expect(upsertNutritionLogs(TEST_USER, [{ nutritionLog: { mealType: 'LUNCH' } }])).toBe(0);
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

describe('upsertDeviceSnapshots', () => {
  it('is idempotent on (device, lastSyncTime): re-fetching before the tracker syncs again inserts nothing new (M12)', () => {
    const device: PairedDevice = {
      deviceType: 'TRACKER',
      deviceVersion: 'Fitbit Air',
      batteryStatus: 'Medium',
      batteryLevel: 28,
      lastSyncTime: '2026-09-16T17:42:59Z',
    };
    expect(upsertDeviceSnapshots(TEST_USER, [device])).toBe(1);
    expect(upsertDeviceSnapshots(TEST_USER, [device])).toBe(0); // same lastSyncTime — no new snapshot
    const rows = db.prepare('SELECT * FROM device_snapshots WHERE user_id = ?').all(TEST_USER);
    expect(rows).toHaveLength(1);

    // A real subsequent sync (new lastSyncTime) does add a new row —
    // this is meant to accumulate a battery/sync-cadence history, not
    // just overwrite a single "current status" row.
    const laterSync: PairedDevice = { ...device, lastSyncTime: '2026-09-16T18:00:00Z', batteryLevel: 27 };
    expect(upsertDeviceSnapshots(TEST_USER, [laterSync])).toBe(1);
    expect(db.prepare('SELECT COUNT(*) as c FROM device_snapshots WHERE user_id = ?').get(TEST_USER)).toEqual({ c: 2 });
  });

  it('skips a device with no type or no lastSyncTime', () => {
    expect(upsertDeviceSnapshots(TEST_USER, [{ deviceType: 'TRACKER' }])).toBe(0);
  });
});

describe('upsertSleepTemperature', () => {
  it('is idempotent on date and stores nightly/baseline/stddev (M13 — schema from the ghealth CLI, matches real data confirmed live)', () => {
    const points: SleepTemperatureDataPoint[] = [
      {
        dailySleepTemperatureDerivations: {
          date: { year: 2026, month: 9, day: 16 },
          nightlyTemperatureCelsius: 33.8,
          baselineTemperatureCelsius: 33.55,
          relativeNightlyStddev30dCelsius: 0.28,
        },
      },
    ];
    expect(upsertSleepTemperature(TEST_USER, points)).toBe(1);
    expect(upsertSleepTemperature(TEST_USER, points)).toBe(1);
    const rows = db.prepare('SELECT * FROM temperature_daily WHERE user_id = ?').all(TEST_USER);
    expect(rows).toHaveLength(1);
    const row = rows[0] as Record<string, unknown>;
    expect(row.nightly_c).toBe(33.8);
    expect(row.baseline_c).toBe(33.55);
  });

  it('skips a point missing a date or the required nightly value', () => {
    expect(upsertSleepTemperature(TEST_USER, [{ dailySleepTemperatureDerivations: {} }])).toBe(0);
  });

  it('stores NULL, not the literal string "NaN", for a new account\'s first ~2 days (confirmed live: Google\'s proto3 JSON sends "NaN" for baseline/stddev before 30 days of history exist)', () => {
    const points: SleepTemperatureDataPoint[] = [
      {
        dailySleepTemperatureDerivations: {
          date: { year: 2026, month: 9, day: 12 },
          nightlyTemperatureCelsius: 33.07,
          baselineTemperatureCelsius: 'NaN',
          relativeNightlyStddev30dCelsius: 'NaN',
        },
      },
    ];
    upsertSleepTemperature(TEST_USER, points);
    const row = db.prepare('SELECT baseline_c, stddev_30d_c FROM temperature_daily WHERE user_id = ?').get(TEST_USER);
    expect(row).toEqual({ baseline_c: null, stddev_30d_c: null });
  });
});

describe('upsertRespiratoryRate', () => {
  it('parses the real dailyRespiratoryRate shape (M13, confirmed live)', () => {
    const points: RespiratoryRateDataPoint[] = [
      { dailyRespiratoryRate: { date: { year: 2026, month: 9, day: 16 }, breathsPerMinute: 16 } },
    ];
    expect(upsertRespiratoryRate(TEST_USER, points)).toEqual([{ date: '2026-09-16', value: 16 }]);
  });
});

describe('upsertCoreBodyTemperature', () => {
  it('aggregates raw samples into one avg/min/max row per calendar day, same shape as SpO2 (M13 — core-body-temperature has no dailyRollUp support per the ghealth CLI schema)', () => {
    const samples = [
      { time: '2026-09-16T05:00:00Z', celsius: 36.5 },
      { time: '2026-09-16T05:01:00Z', celsius: 36.7 },
    ];
    expect(upsertCoreBodyTemperature(TEST_USER, samples)).toBe(1);
    const row = db.prepare('SELECT avg_c, min_c, max_c, sample_count FROM core_temp_daily WHERE user_id = ?').get(TEST_USER);
    expect(row).toEqual({ avg_c: 36.6, min_c: 36.5, max_c: 36.7, sample_count: 2 });
  });
});

describe('upsertHydrationLogs', () => {
  it('sums milliliters per civil day (hydration-log has no dailyRollUp support — list-only per the ghealth CLI schema)', () => {
    const points: HydrationLogDataPoint[] = [
      { hydrationLog: { interval: { startTime: '2026-09-16T08:00:00Z' }, amountConsumed: { milliliters: 250 } } },
      { hydrationLog: { interval: { startTime: '2026-09-16T12:00:00Z' }, amountConsumed: { milliliters: 300 } } },
    ];
    expect(upsertHydrationLogs(TEST_USER, points)).toEqual([{ date: '2026-09-16', value: 550 }]);
  });
});

describe('upsertBasalEnergyBurned', () => {
  it('sums kcal per civil day (basal-energy-burned is list-only, same as hydration-log)', () => {
    const points: BasalEnergyBurnedDataPoint[] = [
      { basalEnergyBurned: { interval: { startTime: '2026-09-16T00:00:00Z' }, kcal: 40 } },
      { basalEnergyBurned: { interval: { startTime: '2026-09-16T01:00:00Z' }, kcal: 38 } },
    ];
    expect(upsertBasalEnergyBurned(TEST_USER, points)).toEqual([{ date: '2026-09-16', value: 78 }]);
  });
});

describe('upsertAltitudeRollup', () => {
  it('parses the inferred gainMillimetersSum rollup field (M13 — no real data to confirm the exact Sum field name against, see google-health.ts)', () => {
    const points: AltitudeRollupDataPoint[] = [
      { civilStartTime: { date: { year: 2026, month: 9, day: 16 } }, altitude: { gainMillimetersSum: '1500' } },
    ];
    expect(upsertAltitudeRollup(TEST_USER, points)).toEqual([{ date: '2026-09-16', value: 1500 }]);
  });
});

describe('upsertFloorsRollup', () => {
  it('parses the inferred countSum rollup field (M13 — no real data to confirm against)', () => {
    const points: FloorsRollupDataPoint[] = [
      { civilStartTime: { date: { year: 2026, month: 9, day: 16 } }, floors: { countSum: '8' } },
    ];
    expect(upsertFloorsRollup(TEST_USER, points)).toEqual([{ date: '2026-09-16', value: 8 }]);
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

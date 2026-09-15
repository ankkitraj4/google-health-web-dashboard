import { db } from './db.js';
import type {
  StepsRollupDataPoint,
  ActiveMinutesRollupDataPoint,
  CaloriesRollupDataPoint,
  RestingHrDataPoint,
  SleepDataPoint,
  ExerciseDataPoint,
} from './google-health.js';

// Normalized daily metric storage: one row per (user, metric type, bucket
// start). The primary key doubles as the idempotency key for upserts —
// re-ingesting the same day's value just overwrites it rather than
// duplicating it (plan milestone M4/M5's dedup requirement).
db.exec(`
  CREATE TABLE IF NOT EXISTS metrics (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    source TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, metric_type, start_time)
  );

  -- Exercise is session-based, not one-value-per-day, so it gets its own
  -- table keyed by Google's own record id (source_id) rather than a date.
  CREATE TABLE IF NOT EXISTS exercise_sessions (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    exercise_type TEXT NOT NULL,
    calories_kcal REAL,
    distance_mm INTEGER,
    avg_heart_rate INTEGER,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, source_id)
  );
`);

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

function isoDate(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

// Anchors each day's bucket at UTC midnight for now — a deliberate
// simplification (see M5 note in plan/plan.md) pending proper local-day
// bucketing using the UTC-offset fields confirmed present on sleep/exercise
// records.
function dateToEpochMs(d: { year: number; month: number; day: number }): number {
  return Date.UTC(d.year, d.month - 1, d.day);
}

const upsertDailyStmt = db.prepare(
  `INSERT INTO metrics (user_id, metric_type, start_time, end_time, value, unit, source, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, 'google_health', ?)
   ON CONFLICT(user_id, metric_type, start_time) DO UPDATE SET
     end_time = excluded.end_time,
     value = excluded.value,
     updated_at = excluded.updated_at`
);

function upsertDaily(
  userId: string,
  metricType: string,
  unit: string,
  entries: Array<{ start?: { year: number; month: number; day: number }; end?: { year: number; month: number; day: number }; value: number }>
): DailyPoint[] {
  const now = Date.now();
  const results: DailyPoint[] = [];
  for (const e of entries) {
    if (!e.start) continue;
    const end = e.end ?? e.start;
    upsertDailyStmt.run(userId, metricType, dateToEpochMs(e.start), dateToEpochMs(end), e.value, unit, now);
    results.push({ date: isoDate(e.start), value: e.value });
  }
  return results.reverse(); // Google returns most-recent-first; charts want oldest-first.
}

export function upsertStepsRollup(userId: string, points: StepsRollupDataPoint[]): DailyPoint[] {
  return upsertDaily(
    userId,
    'steps',
    'count',
    points.map((p) => ({ start: p.civilStartTime?.date, end: p.civilEndTime?.date, value: Number(p.steps?.countSum ?? 0) }))
  );
}

export function upsertActiveMinutesRollup(userId: string, points: ActiveMinutesRollupDataPoint[]): DailyPoint[] {
  return upsertDaily(
    userId,
    'active-minutes',
    'minutes',
    points.map((p) => {
      const levels = p.activeMinutes?.activeMinutesRollupByActivityLevel ?? [];
      const total = levels.reduce((sum, l) => sum + Number(l.activeMinutesSum ?? 0), 0);
      return { start: p.civilStartTime?.date, end: p.civilEndTime?.date, value: total };
    })
  );
}

export function upsertCaloriesRollup(userId: string, points: CaloriesRollupDataPoint[]): DailyPoint[] {
  return upsertDaily(
    userId,
    'calories',
    'kcal',
    points.map((p) => ({ start: p.civilStartTime?.date, end: p.civilEndTime?.date, value: p.totalCalories?.kcalSum ?? 0 }))
  );
}

export function upsertRestingHr(userId: string, points: RestingHrDataPoint[]): DailyPoint[] {
  return upsertDaily(
    userId,
    'resting-heart-rate',
    'bpm',
    points
      .filter((p) => p.dailyRestingHeartRate?.date)
      .map((p) => ({
        start: p.dailyRestingHeartRate!.date,
        value: Number(p.dailyRestingHeartRate?.beatsPerMinute ?? 0),
      }))
  );
}

export interface SleepNight {
  date: string; // night keyed by end date (wake-up day)
  startTime: string;
  endTime: string;
  minutesAsleep: number;
  minutesAwake: number;
  stageMinutes: Record<string, number>; // e.g. { DEEP: 78, REM: 73, LIGHT: 259, AWAKE: 73 }
}

// Sleep isn't upserted into the shared `metrics` table (it's not a single
// scalar per day - duration, stages, and start/end all matter to the UI),
// but it's still normalized and deduped the same way conceptually: keyed by
// night, re-fetching just returns the same nights rather than accumulating.
export function normalizeSleep(points: SleepDataPoint[]): SleepNight[] {
  return points
    .filter((p) => p.sleep?.interval?.startTime && p.sleep?.interval?.endTime)
    .map((p) => {
      const stageMinutes: Record<string, number> = {};
      for (const s of p.sleep?.summary?.stagesSummary ?? []) {
        stageMinutes[s.type] = Number(s.minutes ?? 0);
      }
      return {
        date: p.sleep!.interval!.endTime!.slice(0, 10),
        startTime: p.sleep!.interval!.startTime!,
        endTime: p.sleep!.interval!.endTime!,
        minutesAsleep: Number(p.sleep?.summary?.minutesAsleep ?? 0),
        minutesAwake: Number(p.sleep?.summary?.minutesAwake ?? 0),
        stageMinutes,
      };
    })
    .reverse();
}

export interface ExerciseSession {
  sourceId: string;
  startTime: string;
  endTime: string;
  exerciseType: string;
  caloriesKcal: number | null;
  distanceMm: number | null;
  avgHeartRate: number | null;
}

const upsertExerciseStmt = db.prepare(
  `INSERT INTO exercise_sessions (user_id, source_id, start_time, end_time, exercise_type, calories_kcal, distance_mm, avg_heart_rate, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(user_id, source_id) DO UPDATE SET
     end_time = excluded.end_time,
     exercise_type = excluded.exercise_type,
     calories_kcal = excluded.calories_kcal,
     distance_mm = excluded.distance_mm,
     avg_heart_rate = excluded.avg_heart_rate,
     updated_at = excluded.updated_at`
);

export function upsertExerciseSessions(userId: string, points: ExerciseDataPoint[]): ExerciseSession[] {
  const now = Date.now();
  const results: ExerciseSession[] = [];
  for (const p of points) {
    const sourceId = p.name;
    const start = p.exercise?.interval?.startTime;
    const end = p.exercise?.interval?.endTime;
    if (!sourceId || !start || !end) continue;
    const summary = p.exercise?.metricsSummary;
    const avgHr = summary?.averageHeartRateBeatsPerMinute ? Number(summary.averageHeartRateBeatsPerMinute) : null;
    upsertExerciseStmt.run(
      userId,
      sourceId,
      new Date(start).getTime(),
      new Date(end).getTime(),
      p.exercise?.exerciseType ?? 'OTHER',
      summary?.caloriesKcal ?? null,
      summary?.distanceMillimeters ?? null,
      avgHr,
      now
    );
    results.push({
      sourceId,
      startTime: start,
      endTime: end,
      exerciseType: p.exercise?.exerciseType ?? 'OTHER',
      caloriesKcal: summary?.caloriesKcal ?? null,
      distanceMm: summary?.distanceMillimeters ?? null,
      avgHeartRate: avgHr,
    });
  }
  return results;
}

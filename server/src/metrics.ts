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
    display_name TEXT,
    notes TEXT,
    calories_kcal REAL,
    distance_mm INTEGER,
    avg_heart_rate INTEGER,
    steps INTEGER,
    avg_speed_mm_per_s REAL,
    avg_pace_s_per_m REAL,
    elevation_gain_mm INTEGER,
    active_zone_minutes INTEGER,
    vo2_max REAL,
    hr_zone_light_s REAL,
    hr_zone_moderate_s REAL,
    hr_zone_vigorous_s REAL,
    hr_zone_peak_s REAL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, source_id)
  );
`);

// Adds columns introduced after the initial exercise_sessions table shipped
// (plan milestone M6), so existing dev databases upgrade in place instead of
// needing a manual drop.
const exerciseSessionColumns = new Set(
  (db.prepare(`PRAGMA table_info(exercise_sessions)`).all() as Array<{ name: string }>).map((c) => c.name)
);
for (const [column, ddl] of [
  ['display_name', 'ALTER TABLE exercise_sessions ADD COLUMN display_name TEXT'],
  ['notes', 'ALTER TABLE exercise_sessions ADD COLUMN notes TEXT'],
  ['steps', 'ALTER TABLE exercise_sessions ADD COLUMN steps INTEGER'],
  ['avg_speed_mm_per_s', 'ALTER TABLE exercise_sessions ADD COLUMN avg_speed_mm_per_s REAL'],
  ['avg_pace_s_per_m', 'ALTER TABLE exercise_sessions ADD COLUMN avg_pace_s_per_m REAL'],
  ['elevation_gain_mm', 'ALTER TABLE exercise_sessions ADD COLUMN elevation_gain_mm INTEGER'],
  ['active_zone_minutes', 'ALTER TABLE exercise_sessions ADD COLUMN active_zone_minutes INTEGER'],
  ['vo2_max', 'ALTER TABLE exercise_sessions ADD COLUMN vo2_max REAL'],
  ['hr_zone_light_s', 'ALTER TABLE exercise_sessions ADD COLUMN hr_zone_light_s REAL'],
  ['hr_zone_moderate_s', 'ALTER TABLE exercise_sessions ADD COLUMN hr_zone_moderate_s REAL'],
  ['hr_zone_vigorous_s', 'ALTER TABLE exercise_sessions ADD COLUMN hr_zone_vigorous_s REAL'],
  ['hr_zone_peak_s', 'ALTER TABLE exercise_sessions ADD COLUMN hr_zone_peak_s REAL'],
] as const) {
  if (!exerciseSessionColumns.has(column)) db.exec(ddl);
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

// Points are oldest-first (see upsertDaily below), so the last one is the
// most recent day with real data — the freshness signal the frontend uses
// to flag a metric as stale (plan milestone M7), independent of whether the
// fetch itself just succeeded.
export function latestDate(points: DailyPoint[]): string | null {
  return points.length ? points[points.length - 1].date : null;
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

function parseDurationSeconds(dur?: string): number | null {
  if (!dur) return null;
  const match = dur.match(/^(-?\d+(?:\.\d+)?)s$/);
  return match ? Number(match[1]) : null;
}

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

const upsertExerciseStmt = db.prepare(
  `INSERT INTO exercise_sessions (
     user_id, source_id, start_time, end_time, exercise_type, display_name, notes,
     calories_kcal, distance_mm, avg_heart_rate, steps, avg_speed_mm_per_s, avg_pace_s_per_m,
     elevation_gain_mm, active_zone_minutes, vo2_max,
     hr_zone_light_s, hr_zone_moderate_s, hr_zone_vigorous_s, hr_zone_peak_s, updated_at
   )
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(user_id, source_id) DO UPDATE SET
     end_time = excluded.end_time,
     exercise_type = excluded.exercise_type,
     display_name = excluded.display_name,
     notes = excluded.notes,
     calories_kcal = excluded.calories_kcal,
     distance_mm = excluded.distance_mm,
     avg_heart_rate = excluded.avg_heart_rate,
     steps = excluded.steps,
     avg_speed_mm_per_s = excluded.avg_speed_mm_per_s,
     avg_pace_s_per_m = excluded.avg_pace_s_per_m,
     elevation_gain_mm = excluded.elevation_gain_mm,
     active_zone_minutes = excluded.active_zone_minutes,
     vo2_max = excluded.vo2_max,
     hr_zone_light_s = excluded.hr_zone_light_s,
     hr_zone_moderate_s = excluded.hr_zone_moderate_s,
     hr_zone_vigorous_s = excluded.hr_zone_vigorous_s,
     hr_zone_peak_s = excluded.hr_zone_peak_s,
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
    const zones = summary?.heartRateZoneDurations;
    const hrZoneSeconds = {
      light: parseDurationSeconds(zones?.lightTime),
      moderate: parseDurationSeconds(zones?.moderateTime),
      vigorous: parseDurationSeconds(zones?.vigorousTime),
      peak: parseDurationSeconds(zones?.peakTime),
    };
    const session: ExerciseSession = {
      sourceId,
      startTime: start,
      endTime: end,
      exerciseType: p.exercise?.exerciseType ?? 'OTHER',
      displayName: p.exercise?.displayName ?? null,
      notes: p.exercise?.notes ?? null,
      caloriesKcal: summary?.caloriesKcal ?? null,
      distanceMm: summary?.distanceMillimeters ?? null,
      avgHeartRate: avgHr,
      steps: summary?.steps ? Number(summary.steps) : null,
      avgSpeedMmPerS: summary?.averageSpeedMillimetersPerSecond ?? null,
      avgPaceSPerM: summary?.averagePaceSecondsPerMeter ?? null,
      elevationGainMm: summary?.elevationGainMillimeters ?? null,
      activeZoneMinutes: summary?.activeZoneMinutes ? Number(summary.activeZoneMinutes) : null,
      vo2Max: summary?.runVo2Max ?? null,
      hrZoneSeconds,
    };
    upsertExerciseStmt.run(
      userId,
      sourceId,
      new Date(start).getTime(),
      new Date(end).getTime(),
      session.exerciseType,
      session.displayName,
      session.notes,
      session.caloriesKcal,
      session.distanceMm,
      session.avgHeartRate,
      session.steps,
      session.avgSpeedMmPerS,
      session.avgPaceSPerM,
      session.elevationGainMm,
      session.activeZoneMinutes,
      session.vo2Max,
      hrZoneSeconds.light,
      hrZoneSeconds.moderate,
      hrZoneSeconds.vigorous,
      hrZoneSeconds.peak,
      now
    );
    results.push(session);
  }
  return results;
}

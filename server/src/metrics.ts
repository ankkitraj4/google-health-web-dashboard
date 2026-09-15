import { db } from './db.js';
import type { RollupDataPoint } from './google-health.js';

// Normalized metric storage: one row per (user, metric type, bucket start).
// The primary key doubles as the idempotency key for upserts — re-ingesting
// the same day's rollup just overwrites the value rather than duplicating it
// (plan milestone M4/M5's dedup requirement).
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
`);

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

function isoDate(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

// Anchors each day's bucket at UTC midnight for now — a deliberate
// simplification flagged for M5, which wires the sleep endpoint's explicit
// UTC-offset fields (confirmed present in M2) into proper local-day bucketing.
function dateToEpochMs(d: { year: number; month: number; day: number }): number {
  return Date.UTC(d.year, d.month - 1, d.day);
}

export function upsertStepsRollup(userId: string, rollupDataPoints: RollupDataPoint[]): DailyPoint[] {
  const now = Date.now();
  const upsert = db.prepare(
    `INSERT INTO metrics (user_id, metric_type, start_time, end_time, value, unit, source, updated_at)
     VALUES (?, 'steps', ?, ?, ?, 'count', 'google_health', ?)
     ON CONFLICT(user_id, metric_type, start_time) DO UPDATE SET
       end_time = excluded.end_time,
       value = excluded.value,
       updated_at = excluded.updated_at`
  );

  const results: DailyPoint[] = [];
  for (const point of rollupDataPoints) {
    const startDate = point.civilStartTime?.date;
    const endDate = point.civilEndTime?.date ?? startDate;
    if (!startDate || !endDate) continue;
    const value = Number(point.steps?.countSum ?? 0);
    upsert.run(userId, dateToEpochMs(startDate), dateToEpochMs(endDate), value, now);
    results.push({ date: isoDate(startDate), value });
  }
  // Google returns most-recent-first; the UI wants oldest-first for charts.
  return results.reverse();
}

export function getStoredDailyMetric(userId: string, metricType: string, sinceEpochMs: number): DailyPoint[] {
  const rows = db
    .prepare(
      `SELECT start_time, value FROM metrics
       WHERE user_id = ? AND metric_type = ? AND start_time >= ?
       ORDER BY start_time ASC`
    )
    .all(userId, metricType, sinceEpochMs) as Array<{ start_time: number; value: number }>;
  return rows.map((r) => ({ date: new Date(r.start_time).toISOString().slice(0, 10), value: r.value }));
}

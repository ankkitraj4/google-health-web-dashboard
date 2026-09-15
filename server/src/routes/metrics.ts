import { Router } from 'express';
import type { AuthedRequest } from '../session.js';
import { getValidAccessToken } from '../oauth.js';
import {
  fetchStepsDailyRollup,
  fetchActiveMinutesDailyRollup,
  fetchCaloriesDailyRollup,
  fetchRestingHrList,
  fetchSleepList,
  fetchExerciseList,
  fetchHeartRateSamples,
  fetchDailyHeartRateZones,
} from '../google-health.js';
import {
  upsertStepsRollup,
  upsertActiveMinutesRollup,
  upsertCaloriesRollup,
  upsertRestingHr,
  normalizeSleep,
  upsertExerciseSessions,
} from '../metrics.js';

export const metricsRouter = Router();

function requireAuth(req: AuthedRequest, res: import('express').Response): req is AuthedRequest & { userId: string } {
  if (!req.userId) {
    res.status(401).json({ error: 'not_authenticated' });
    return false;
  }
  return true;
}

function daysParam(req: AuthedRequest): number {
  return Math.min(Math.max(Number(req.query.days) || 7, 1), 30);
}

metricsRouter.get('/api/metrics/steps', async (req: AuthedRequest, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const accessToken = await getValidAccessToken(req.userId);
    const points = upsertStepsRollup(req.userId, await fetchStepsDailyRollup(accessToken, daysParam(req)));
    res.json({ points });
  } catch (err) {
    console.error('[metrics] steps fetch failed:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'upstream_fetch_failed' });
  }
});

metricsRouter.get('/api/metrics/active-minutes', async (req: AuthedRequest, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const accessToken = await getValidAccessToken(req.userId);
    const points = upsertActiveMinutesRollup(req.userId, await fetchActiveMinutesDailyRollup(accessToken, daysParam(req)));
    res.json({ points });
  } catch (err) {
    console.error('[metrics] active-minutes fetch failed:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'upstream_fetch_failed' });
  }
});

metricsRouter.get('/api/metrics/calories', async (req: AuthedRequest, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const accessToken = await getValidAccessToken(req.userId);
    const points = upsertCaloriesRollup(req.userId, await fetchCaloriesDailyRollup(accessToken, daysParam(req)));
    res.json({ points });
  } catch (err) {
    console.error('[metrics] calories fetch failed:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'upstream_fetch_failed' });
  }
});

metricsRouter.get('/api/metrics/resting-heart-rate', async (req: AuthedRequest, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const accessToken = await getValidAccessToken(req.userId);
    const points = upsertRestingHr(req.userId, await fetchRestingHrList(accessToken, daysParam(req)));
    res.json({ points });
  } catch (err) {
    console.error('[metrics] resting-heart-rate fetch failed:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'upstream_fetch_failed' });
  }
});

metricsRouter.get('/api/metrics/sleep', async (req: AuthedRequest, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const accessToken = await getValidAccessToken(req.userId);
    const nights = normalizeSleep(await fetchSleepList(accessToken, daysParam(req)));
    res.json({ nights });
  } catch (err) {
    console.error('[metrics] sleep fetch failed:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'upstream_fetch_failed' });
  }
});

// Intraday heart-rate samples, either for one calendar date (?date=) or an
// explicit range (?start=&end=, used by the exercise-detail HR chart).
// Not persisted like the other metrics — it's a fine-grained visualization
// detail re-fetched on demand, not one of M5's dedup-tracked daily rollups.
metricsRouter.get('/api/metrics/heart-rate', async (req: AuthedRequest, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { date, start, end } = req.query as { date?: string; start?: string; end?: string };
    let startIso: string;
    let endIso: string;
    if (start && end) {
      startIso = start;
      endIso = end;
    } else {
      const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : new Date();
      if (isNaN(day.getTime())) {
        res.status(400).json({ error: 'invalid_date' });
        return;
      }
      const dayStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      startIso = dayStart.toISOString();
      endIso = dayEnd.toISOString();
    }
    const accessToken = await getValidAccessToken(req.userId);
    const samples = await fetchHeartRateSamples(accessToken, startIso, endIso);
    res.json({ samples });
  } catch (err) {
    console.error('[metrics] heart-rate fetch failed:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'upstream_fetch_failed' });
  }
});

metricsRouter.get('/api/metrics/heart-rate-zones', async (req: AuthedRequest, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const accessToken = await getValidAccessToken(req.userId);
    const days = await fetchDailyHeartRateZones(accessToken, daysParam(req));
    const latest = days[days.length - 1];
    const zoneList = latest?.dailyHeartRateZones?.heartRateZones ?? [];
    const get = (type: string) => {
      const z = zoneList.find((z) => z.heartRateZoneType === type);
      return z ? parseInt(z.minBeatsPerMinute, 10) : null;
    };
    res.json({
      zones: {
        light: get('LIGHT'),
        moderate: get('MODERATE'),
        vigorous: get('VIGOROUS'),
        peak: get('PEAK'),
      },
    });
  } catch (err) {
    console.error('[metrics] heart-rate-zones fetch failed:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'upstream_fetch_failed' });
  }
});

metricsRouter.get('/api/exercise', async (req: AuthedRequest, res) => {
  if (!requireAuth(req, res)) return;
  try {
    // Exercise gets a wider window than the other metrics' 30-day cap: the
    // calendar UI browses whole months at a time, and this is a single
    // client-filtered list fetch (see fetchExerciseList), not an expensive
    // per-day rollup.
    const days = Math.min(Math.max(Number(req.query.days) || 60, 1), 180);
    const accessToken = await getValidAccessToken(req.userId);
    const sessions = upsertExerciseSessions(req.userId, await fetchExerciseList(accessToken, days));
    res.json({ sessions });
  } catch (err) {
    console.error('[metrics] exercise fetch failed:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'upstream_fetch_failed' });
  }
});

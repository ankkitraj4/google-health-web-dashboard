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

metricsRouter.get('/api/exercise', async (req: AuthedRequest, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const accessToken = await getValidAccessToken(req.userId);
    const sessions = upsertExerciseSessions(req.userId, await fetchExerciseList(accessToken, daysParam(req)));
    res.json({ sessions });
  } catch (err) {
    console.error('[metrics] exercise fetch failed:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'upstream_fetch_failed' });
  }
});

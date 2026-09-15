import { Router } from 'express';
import type { AuthedRequest } from '../session.js';
import { getValidAccessToken } from '../oauth.js';
import { fetchStepsDailyRollup } from '../google-health.js';
import { upsertStepsRollup } from '../metrics.js';

export const metricsRouter = Router();

metricsRouter.get('/api/metrics/steps', async (req: AuthedRequest, res) => {
  if (!req.userId) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 30);

  try {
    const accessToken = await getValidAccessToken(req.userId);
    const rollupDataPoints = await fetchStepsDailyRollup(accessToken, days);
    const points = upsertStepsRollup(req.userId, rollupDataPoints);
    res.json({ points });
  } catch (err) {
    console.error('[metrics] steps fetch failed:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'upstream_fetch_failed' });
  }
});

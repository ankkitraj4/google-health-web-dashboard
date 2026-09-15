import { Router } from 'express';
import type { AuthedRequest } from '../session.js';
import { getValidAccessToken } from '../oauth.js';
import { runBackfill } from '../sync.js';

export const backfillRouter = Router();

// Manual trigger for now — this is a single-user local app, so a real job
// queue/worker would be pure overhead. Runs synchronously (chunked, with
// google-health.ts's built-in retry/backoff) and returns a per-metric
// summary rather than firing-and-forgetting (plan milestone M8).
backfillRouter.post('/api/backfill', async (req: AuthedRequest, res) => {
  if (!req.userId) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }
  const days = Math.min(Math.max(Number(req.query.days) || 90, 1), 730);
  try {
    const accessToken = await getValidAccessToken(req.userId);
    const results = await runBackfill(req.userId, accessToken, days);
    res.json({ days, results });
  } catch (err) {
    console.error('[backfill] failed:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'upstream_error' });
  }
});

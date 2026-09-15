import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { attachSession } from './session.js';
import { authRouter } from './routes/auth.js';
import { sessionRouter } from './routes/session.js';
import { metricsRouter } from './routes/metrics.js';
import { backfillRouter } from './routes/backfill.js';
import { webhookRouter } from './routes/webhook.js';
import { pruneExpired } from './db.js';

const app = express();
// Captures the exact raw request bytes alongside the parsed body — the
// webhook route (M8) needs them verbatim to verify Google's signature,
// which is computed over the raw JSON, not over our parsed-and-reserialized
// version of it (whitespace/key-order could differ).
app.use(express.json({ verify: (req, _res, buf) => { (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf); } }));
app.use(cookieParser());
app.use(attachSession);

app.use(authRouter);
app.use(sessionRouter);
app.use(metricsRouter);
app.use(backfillRouter);
app.use(webhookRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
});

// Best-effort cleanup of expired sessions/OAuth-in-flight state; fine to run
// on a plain interval for a single-user local dev app.
setInterval(pruneExpired, 10 * 60 * 1000).unref();

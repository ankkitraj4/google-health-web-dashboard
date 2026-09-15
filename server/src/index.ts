import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { attachSession } from './session.js';
import { authRouter } from './routes/auth.js';
import { sessionRouter } from './routes/session.js';
import { metricsRouter } from './routes/metrics.js';
import { pruneExpired } from './db.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(attachSession);

app.use(authRouter);
app.use(sessionRouter);
app.use(metricsRouter);

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

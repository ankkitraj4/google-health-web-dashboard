import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { db } from '../src/db.js';
import { attachSession, createSession, SESSION_COOKIE_NAME } from '../src/session.js';
import { sessionRouter } from '../src/routes/session.js';
import { metricsRouter } from '../src/routes/metrics.js';
import { authRouter } from '../src/routes/auth.js';

// A minimal app mirroring index.ts's middleware order, without starting a
// real listener — enough to exercise route logic + auth guarding for real
// (plan milestone M9's "backend route tests").
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(attachSession);
  app.use(sessionRouter);
  app.use(metricsRouter);
  app.use(authRouter);
  return app;
}

beforeEach(() => {
  db.exec('DELETE FROM users');
  db.exec('DELETE FROM sessions');
});

describe('GET /api/session', () => {
  it('reports unauthenticated with no cookie', async () => {
    const res = await request(buildApp()).get('/api/session');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authenticated: false });
  });

  it('reports unauthenticated for a garbage/unknown cookie value, not an error', async () => {
    const res = await request(buildApp()).get('/api/session').set('Cookie', `${SESSION_COOKIE_NAME}=not-a-real-session-id`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authenticated: false });
  });

  it('reports authenticated with the real user info for a valid session', async () => {
    const now = Date.now();
    db.prepare('INSERT INTO users (id, health_user_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
      'user-1',
      '1718654208682928394',
      'Test User',
      now,
      now
    );
    const sessionId = createSession('user-1');

    const res = await request(buildApp()).get('/api/session').set('Cookie', `${SESSION_COOKIE_NAME}=${sessionId}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authenticated: true, healthUserId: '1718654208682928394', displayName: 'Test User' });
  });
});

describe('metric routes require authentication', () => {
  it('GET /api/metrics/steps without a session returns 401 not_authenticated', async () => {
    const res = await request(buildApp()).get('/api/metrics/steps');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'not_authenticated' });
  });

  it('GET /api/exercise without a session returns 401', async () => {
    const res = await request(buildApp()).get('/api/exercise');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/logout', () => {
  it('succeeds (204) even with no active session', async () => {
    const res = await request(buildApp()).post('/api/logout');
    expect(res.status).toBe(204);
  });

  it('clears the session cookie and invalidates the session server-side', async () => {
    const now = Date.now();
    db.prepare('INSERT INTO users (id, health_user_id, created_at, updated_at) VALUES (?, ?, ?, ?)').run('user-1', 'hid-1', now, now);
    const sessionId = createSession('user-1');

    const app = buildApp();
    const logoutRes = await request(app).post('/api/logout').set('Cookie', `${SESSION_COOKIE_NAME}=${sessionId}`);
    expect(logoutRes.status).toBe(204);
    expect(db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)).toBeUndefined();

    const sessionRes = await request(app).get('/api/session').set('Cookie', `${SESSION_COOKIE_NAME}=${sessionId}`);
    expect(sessionRes.body).toEqual({ authenticated: false });
  });
});

describe('POST /api/disconnect', () => {
  it('requires authentication', async () => {
    const res = await request(buildApp()).post('/api/disconnect');
    expect(res.status).toBe(401);
  });
});

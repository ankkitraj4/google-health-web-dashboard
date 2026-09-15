import type { Request, Response } from 'express';
import { db } from './db.js';
import { randomToken } from './crypto.js';

// A request once attachSession's middleware has run — req.userId is set when
// a valid session cookie was present, left undefined otherwise.
export interface AuthedRequest extends Request {
  userId?: string;
}

export const SESSION_COOKIE_NAME = 'health_dashboard_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function createSession(userId: string): string {
  const id = randomToken();
  const now = Date.now();
  db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    id,
    userId,
    now,
    now + SESSION_TTL_MS
  );
  return id;
}

export function getSessionUserId(sessionId: string | undefined): string | null {
  if (!sessionId) return null;
  const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?').get(sessionId) as
    | { user_id: string; expires_at: number }
    | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }
  return row.user_id;
}

export function destroySession(sessionId: string | undefined): void {
  if (!sessionId) return;
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

const isProd = process.env.NODE_ENV === 'production';

export function setSessionCookie(res: Response, sessionId: string): void {
  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

// Express middleware: resolves req.userId from the session cookie, if any.
// Does NOT reject unauthenticated requests — routes that require a session
// check req.userId themselves, so public routes (like /api/session) can
// still respond with an "unauthenticated" shape instead of a 401.
export function attachSession(req: AuthedRequest, _res: Response, next: () => void): void {
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  const userId = getSessionUserId(sessionId);
  if (userId) req.userId = userId;
  next();
}

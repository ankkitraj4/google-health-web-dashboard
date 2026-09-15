import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db.js';
import { createSession, getSessionUserId, destroySession } from '../src/session.js';

// node:sqlite's DatabaseSync enforces FOREIGN KEY constraints by default
// (confirmed by these tests failing without this fixture) — sessions.user_id
// references users(id), so a real user row must exist first.
function makeUser(id: string): void {
  const now = Date.now();
  db.prepare('INSERT INTO users (id, health_user_id, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, `health-${id}`, now, now);
}

beforeEach(() => {
  db.exec('DELETE FROM sessions');
  db.exec('DELETE FROM users');
  makeUser('user-42');
  makeUser('user-1');
});

describe('createSession / getSessionUserId', () => {
  it('round-trips a session id to its user id', () => {
    const id = createSession('user-42');
    expect(getSessionUserId(id)).toBe('user-42');
  });

  it('returns null for an unknown session id', () => {
    expect(getSessionUserId('never-issued')).toBeNull();
  });

  it('returns null for undefined (no cookie present)', () => {
    expect(getSessionUserId(undefined)).toBeNull();
  });

  it('treats an expired session as invalid and deletes it (lazy expiry)', () => {
    const id = createSession('user-42');
    db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, id);

    expect(getSessionUserId(id)).toBeNull();
    expect(db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)).toBeUndefined();
  });

  it('generates a distinct id each call', () => {
    const a = createSession('user-1');
    const b = createSession('user-1');
    expect(a).not.toBe(b);
  });
});

describe('destroySession', () => {
  it('removes the session so it no longer resolves', () => {
    const id = createSession('user-42');
    destroySession(id);
    expect(getSessionUserId(id)).toBeNull();
  });

  it('is a no-op for undefined (does not throw)', () => {
    expect(() => destroySession(undefined)).not.toThrow();
  });
});

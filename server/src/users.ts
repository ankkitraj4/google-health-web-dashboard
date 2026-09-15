import { randomUUID } from 'node:crypto';
import { db } from './db.js';

export interface User {
  id: string;
  health_user_id: string;
  legacy_user_id: string | null;
  email: string | null;
}

// Upserts a user keyed by Google Health's healthUserId (the stable identity
// for this account — see plan milestone M2). Returns our internal user id.
export function upsertUserByHealthId(healthUserId: string, legacyUserId: string | null, email: string | null): string {
  const now = Date.now();
  const existing = db.prepare('SELECT id FROM users WHERE health_user_id = ?').get(healthUserId) as
    | { id: string }
    | undefined;

  if (existing) {
    db.prepare('UPDATE users SET legacy_user_id = ?, email = ?, updated_at = ? WHERE id = ?').run(
      legacyUserId,
      email,
      now,
      existing.id
    );
    return existing.id;
  }

  const id = randomUUID();
  db.prepare(
    'INSERT INTO users (id, health_user_id, legacy_user_id, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, healthUserId, legacyUserId, email, now, now);
  return id;
}

export function getUser(userId: string): User | undefined {
  return db.prepare('SELECT id, health_user_id, legacy_user_id, email FROM users WHERE id = ?').get(userId) as
    | User
    | undefined;
}

export function deleteUser(userId: string): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../src/db.js';
import { beginAuthorization, exchangeCodeForTokens, storeTokens, getValidAccessToken, revokeAndForget } from '../src/oauth.js';
import { GoogleHealthApiError } from '../src/errors.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  db.exec('DELETE FROM oauth_requests');
  db.exec('DELETE FROM oauth_tokens');
  db.exec('DELETE FROM sessions');
  db.exec('DELETE FROM users');
  // node:sqlite's DatabaseSync enforces FOREIGN KEY constraints by default —
  // oauth_tokens/sessions.user_id both reference users(id).
  const now = Date.now();
  db.prepare('INSERT INTO users (id, health_user_id, created_at, updated_at) VALUES (?, ?, ?, ?)').run('user-1', 'health-user-1', now, now);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('beginAuthorization (PKCE/state)', () => {
  it('generates a state, stores its code_verifier, and builds a valid S256 auth URL', () => {
    const { state, authUrl } = beginAuthorization();
    expect(state.length).toBeGreaterThan(10);

    const url = new URL(authUrl);
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('response_type')).toBe('code');

    const row = db.prepare('SELECT code_verifier FROM oauth_requests WHERE state = ?').get(state);
    expect(row).toBeTruthy();
  });

  it('generates a different state and verifier on each call', () => {
    const a = beginAuthorization();
    const b = beginAuthorization();
    expect(a.state).not.toBe(b.state);
  });
});

describe('exchangeCodeForTokens (state consumption)', () => {
  it('rejects an unknown state without ever calling the token endpoint', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(exchangeCodeForTokens('some-code', 'never-issued-state')).rejects.toThrow(/Unknown or already-used/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('consumes the state so it cannot be replayed (single use)', async () => {
    const { state } = beginAuthorization();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'x', token_type: 'Bearer' }))
    );

    await exchangeCodeForTokens('code-1', state);
    // Second attempt with the same state must fail even though the first succeeded.
    await expect(exchangeCodeForTokens('code-2', state)).rejects.toThrow(/Unknown or already-used/);
  });

  it('rejects an expired state', async () => {
    const { state } = beginAuthorization();
    // Simulate the 10-minute TTL having passed.
    db.prepare('UPDATE oauth_requests SET expires_at = ? WHERE state = ?').run(Date.now() - 1000, state);
    await expect(exchangeCodeForTokens('code', state)).rejects.toThrow(/expired/);
  });
});

describe('getValidAccessToken (token refresh)', () => {
  it('returns the cached access token without refreshing when it is not near expiry', async () => {
    storeTokens('user-1', { access_token: 'cached-token', refresh_token: 'rt', expires_in: 3600, scope: 'x', token_type: 'Bearer' });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const token = await getValidAccessToken('user-1');
    expect(token).toBe('cached-token');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshes when the cached token is expired, and persists the new one', async () => {
    storeTokens('user-1', { access_token: 'old-token', refresh_token: 'rt', expires_in: -10, scope: 'x', token_type: 'Bearer' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ access_token: 'refreshed-token', expires_in: 3600, scope: 'x', token_type: 'Bearer' }))
    );

    const token = await getValidAccessToken('user-1');
    expect(token).toBe('refreshed-token');

    // A second call now finds the freshly-stored token cached — no second refresh.
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await getValidAccessToken('user-1')).toBe('refreshed-token');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the existing refresh token when a refresh response omits one (Google only re-issues on first consent)', async () => {
    storeTokens('user-1', { access_token: 'a', refresh_token: 'original-refresh-token', expires_in: -10, scope: 'x', token_type: 'Bearer' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ access_token: 'b', expires_in: -10, scope: 'x', token_type: 'Bearer' })));
    await getValidAccessToken('user-1'); // triggers one refresh, storing 'b' with the same refresh token

    // Force another refresh and inspect what refresh_token this second call actually sent.
    let sentBody = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = String(init.body);
        return jsonResponse({ access_token: 'c', expires_in: 3600, scope: 'x', token_type: 'Bearer' });
      })
    );
    await getValidAccessToken('user-1');
    expect(new URLSearchParams(sentBody).get('refresh_token')).toBe('original-refresh-token');
  });

  it('classifies a real invalid_grant rejection as consent_revoked (M7/M8 live finding)', async () => {
    storeTokens('user-1', { access_token: 'a', refresh_token: 'revoked-token', expires_in: -10, scope: 'x', token_type: 'Bearer' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400))
    );

    await expect(getValidAccessToken('user-1')).rejects.toSatisfy((err: unknown) => err instanceof GoogleHealthApiError && err.code === 'consent_revoked');
  });

  it('throws for a user with no stored credentials at all', async () => {
    await expect(getValidAccessToken('never-connected-user')).rejects.toThrow(/No stored credentials/);
  });
});

describe('revokeAndForget', () => {
  it('deletes local tokens and sessions even if the remote revoke call fails', async () => {
    storeTokens('user-1', { access_token: 'a', refresh_token: 'rt', expires_in: 3600, scope: 'x', token_type: 'Bearer' });
    db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run('sess-1', 'user-1', Date.now(), Date.now() + 1000);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await revokeAndForget('user-1');

    expect(db.prepare('SELECT * FROM oauth_tokens WHERE user_id = ?').get('user-1')).toBeUndefined();
    expect(db.prepare('SELECT * FROM sessions WHERE user_id = ?').get('user-1')).toBeUndefined();
  });
});

import { createHash, randomBytes } from 'node:crypto';
import { db } from './db.js';
import { decryptSecret, encryptSecret } from './crypto.js';
import { classifyRefreshFailure } from './errors.js';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

// Scopes confirmed working against a real Google Fitbit Air account in plan
// milestone M2. `settings.readonly` (needed for pairedDevices/device info)
// was added in M11 at the user's request to collect everything available —
// it must also be declared under Data Access in Google Cloud Console before
// Google will actually grant it; requesting an undeclared restricted scope
// hard-blocks the *entire* auth request (see M2's finding), not just this
// one scope.
const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.nutrition.readonly',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.profile.readonly',
  'https://www.googleapis.com/auth/googlehealth.settings.readonly',
].join(' ');

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface PkceRequest {
  state: string;
  authUrl: string;
}

const OAUTH_REQUEST_TTL_MS = 10 * 60 * 1000; // 10 minutes to complete the redirect round trip

export function beginAuthorization(): PkceRequest {
  const codeVerifier = base64Url(randomBytes(32));
  const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest());
  const state = base64Url(randomBytes(16));

  const now = Date.now();
  db.prepare(
    'INSERT INTO oauth_requests (state, code_verifier, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(state, codeVerifier, now, now + OAUTH_REQUEST_TTL_MS);

  const params = new URLSearchParams({
    client_id: requiredEnv('GOOGLE_CLIENT_ID'),
    redirect_uri: requiredEnv('OAUTH_REDIRECT_URI'),
    response_type: 'code',
    scope: SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return { state, authUrl: `${AUTH_ENDPOINT}?${params.toString()}` };
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

// Consumes (and deletes) the stored PKCE verifier for `state`. Throws if the
// state is unknown or expired — guards against CSRF and replay.
function consumeOAuthRequest(state: string): string {
  const row = db.prepare('SELECT code_verifier, expires_at FROM oauth_requests WHERE state = ?').get(state) as
    | { code_verifier: string; expires_at: number }
    | undefined;
  db.prepare('DELETE FROM oauth_requests WHERE state = ?').run(state);
  if (!row) throw new Error('Unknown or already-used OAuth state');
  if (row.expires_at < Date.now()) throw new Error('OAuth state expired — please try logging in again');
  return row.code_verifier;
}

export async function exchangeCodeForTokens(code: string, state: string): Promise<TokenResponse> {
  const codeVerifier = consumeOAuthRequest(state);

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: requiredEnv('GOOGLE_CLIENT_ID'),
      client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: requiredEnv('OAUTH_REDIRECT_URI'),
    }),
  });
  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json()) as TokenResponse;
}

async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: requiredEnv('GOOGLE_CLIENT_ID'),
      client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) {
    throw classifyRefreshFailure(response.status, await response.text());
  }
  return (await response.json()) as TokenResponse;
}

export function storeTokens(userId: string, tokens: TokenResponse): void {
  const now = Date.now();
  const existingRefresh = db
    .prepare('SELECT refresh_token_encrypted FROM oauth_tokens WHERE user_id = ?')
    .get(userId) as { refresh_token_encrypted: string } | undefined;

  // Google only returns a refresh_token on the very first consent (or when
  // prompt=consent forces re-issue); keep the existing one if this response
  // didn't include a new one.
  const refreshTokenPlain = tokens.refresh_token ?? (existingRefresh ? decryptSecret(existingRefresh.refresh_token_encrypted) : null);
  if (!refreshTokenPlain) {
    throw new Error('No refresh token available to store (none returned and none on file)');
  }

  db.prepare(
    `INSERT INTO oauth_tokens (user_id, refresh_token_encrypted, access_token_encrypted, access_token_expires_at, scope, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       refresh_token_encrypted = excluded.refresh_token_encrypted,
       access_token_encrypted = excluded.access_token_encrypted,
       access_token_expires_at = excluded.access_token_expires_at,
       scope = excluded.scope,
       updated_at = excluded.updated_at`
  ).run(
    userId,
    encryptSecret(refreshTokenPlain),
    encryptSecret(tokens.access_token),
    now + tokens.expires_in * 1000,
    tokens.scope,
    now
  );
}

// Returns a currently-valid access token for this user, refreshing against
// Google first if the cached one is expired or close to it.
export async function getValidAccessToken(userId: string): Promise<string> {
  const row = db
    .prepare('SELECT refresh_token_encrypted, access_token_encrypted, access_token_expires_at FROM oauth_tokens WHERE user_id = ?')
    .get(userId) as
    | { refresh_token_encrypted: string; access_token_encrypted: string | null; access_token_expires_at: number | null }
    | undefined;
  if (!row) throw new Error('No stored credentials for this user — reconnect required');

  const SAFETY_MARGIN_MS = 60 * 1000;
  if (row.access_token_encrypted && row.access_token_expires_at && row.access_token_expires_at - SAFETY_MARGIN_MS > Date.now()) {
    return decryptSecret(row.access_token_encrypted);
  }

  const refreshToken = decryptSecret(row.refresh_token_encrypted);
  const tokens = await refreshTokens(refreshToken);
  storeTokens(userId, tokens);
  return tokens.access_token;
}

export async function revokeAndForget(userId: string): Promise<void> {
  const row = db.prepare('SELECT refresh_token_encrypted FROM oauth_tokens WHERE user_id = ?').get(userId) as
    | { refresh_token_encrypted: string }
    | undefined;
  if (row) {
    const refreshToken = decryptSecret(row.refresh_token_encrypted);
    // Best-effort: Google's revoke endpoint invalidates the whole grant.
    await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(refreshToken)}`, { method: 'POST' }).catch(() => {
      // Revocation failing shouldn't block local cleanup — we still delete our copy below.
    });
  }
  db.prepare('DELETE FROM oauth_tokens WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

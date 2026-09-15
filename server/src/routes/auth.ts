import { Router } from 'express';
import { beginAuthorization, exchangeCodeForTokens, getValidAccessToken, revokeAndForget, storeTokens } from '../oauth.js';
import type { AuthedRequest } from '../session.js';
import { clearSessionCookie, createSession, destroySession, setSessionCookie, SESSION_COOKIE_NAME } from '../session.js';
import { deleteUser, upsertUserByHealthId } from '../users.js';

export const authRouter = Router();

authRouter.get('/auth/login', (_req, res) => {
  const { authUrl } = beginAuthorization();
  res.redirect(authUrl);
});

authRouter.get('/callback', async (req, res) => {
  const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

  if (error) {
    res.redirect(`${frontendOrigin}/?auth_error=${encodeURIComponent(error)}`);
    return;
  }
  if (!code || !state) {
    res.redirect(`${frontendOrigin}/?auth_error=missing_code_or_state`);
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code, state);

    const identityRes = await fetch('https://health.googleapis.com/v4/users/me/identity', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!identityRes.ok) {
      throw new Error(`Failed to fetch Health identity (${identityRes.status}): ${await identityRes.text()}`);
    }
    const identity = (await identityRes.json()) as { healthUserId: string; legacyUserId?: string };

    const userId = upsertUserByHealthId(identity.healthUserId, identity.legacyUserId ?? null, null);
    storeTokens(userId, tokens);

    const sessionId = createSession(userId);
    setSessionCookie(res, sessionId);
    res.redirect(frontendOrigin + '/');
  } catch (err) {
    console.error('[auth] callback failed:', err instanceof Error ? err.message : err);
    res.redirect(`${frontendOrigin}/?auth_error=callback_failed`);
  }
});

authRouter.post('/api/logout', (req, res) => {
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  destroySession(sessionId);
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.post('/api/disconnect', async (req: AuthedRequest, res) => {
  if (!req.userId) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }
  await revokeAndForget(req.userId);
  deleteUser(req.userId);
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  destroySession(sessionId);
  clearSessionCookie(res);
  res.status(204).end();
});

// Dev/manual-verification helper only (not in the plan's public surface):
// confirms the backend can mint a live access token from the stored refresh
// token without ever handing it to the browser.
authRouter.get('/api/debug/token-check', async (req: AuthedRequest, res) => {
  if (!req.userId) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }
  try {
    await getValidAccessToken(req.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

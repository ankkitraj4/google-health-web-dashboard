import { describe, it, expect } from 'vitest';
import { classifyHealthApiFailure, classifyRefreshFailure } from '../src/errors.js';

// These response shapes are the real ones confirmed live in plan
// milestones M2/M7/M8, not guessed.
describe('classifyHealthApiFailure', () => {
  it('classifies 429 as rate_limited and carries Retry-After', () => {
    const err = classifyHealthApiFailure(429, 'Too Many Requests', '30');
    expect(err.code).toBe('rate_limited');
    expect(err.status).toBe(429);
    expect(err.retryAfterSeconds).toBe(30);
  });

  it('classifies 401 as consent_revoked', () => {
    const err = classifyHealthApiFailure(401, 'unauthorized', null);
    expect(err.code).toBe('consent_revoked');
    expect(err.status).toBe(401);
  });

  it('classifies a real ACCESS_TOKEN_SCOPE_INSUFFICIENT 403 as insufficient_scope', () => {
    const body = JSON.stringify({
      error: {
        code: 403,
        message: 'Request had insufficient authentication scopes.',
        status: 'PERMISSION_DENIED',
        details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }],
      },
    });
    const err = classifyHealthApiFailure(403, body, null);
    expect(err.code).toBe('insufficient_scope');
    expect(err.status).toBe(403);
  });

  it('classifies an unrelated 403 as upstream_error, not insufficient_scope', () => {
    const err = classifyHealthApiFailure(403, '{"error":"some other forbidden reason"}', null);
    expect(err.code).toBe('upstream_error');
  });

  it('classifies a real INVALID_ROLLUP_QUERY_DURATION 400 as upstream_error (not retryable)', () => {
    const body = JSON.stringify({
      error: { code: 400, status: 'INVALID_ARGUMENT', details: [{ reason: 'INVALID_ROLLUP_QUERY_DURATION' }] },
    });
    const err = classifyHealthApiFailure(400, body, null);
    expect(err.code).toBe('upstream_error');
  });

  it('classifies 5xx as upstream_error', () => {
    expect(classifyHealthApiFailure(500, 'Internal Server Error', null).code).toBe('upstream_error');
    expect(classifyHealthApiFailure(504, 'Gateway Timeout', null).code).toBe('upstream_error');
  });
});

describe('classifyRefreshFailure', () => {
  it('classifies invalid_grant as consent_revoked', () => {
    const err = classifyRefreshFailure(400, JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }));
    expect(err.code).toBe('consent_revoked');
    expect(err.status).toBe(401);
  });

  it('classifies other refresh failures as upstream_error', () => {
    const err = classifyRefreshFailure(500, 'server error');
    expect(err.code).toBe('upstream_error');
  });
});

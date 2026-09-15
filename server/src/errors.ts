// Typed classification for failures talking to Google (OAuth token endpoint
// or the Health API itself), so routes can respond with a specific,
// actionable error code instead of a generic 502 (plan milestone M7).
export type GoogleErrorCode = 'consent_revoked' | 'insufficient_scope' | 'rate_limited' | 'upstream_error';

export class GoogleHealthApiError extends Error {
  code: GoogleErrorCode;
  status: number;
  retryAfterSeconds?: number;

  constructor(message: string, code: GoogleErrorCode, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = 'GoogleHealthApiError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// Classifies a failed Health API response body/status into one of the codes
// above. Shapes confirmed against real responses: ACCESS_TOKEN_SCOPE_INSUFFICIENT
// seen in plan milestone M2 (pairedDevices without settings.readonly).
export function classifyHealthApiFailure(status: number, bodyText: string, retryAfterHeader: string | null): GoogleHealthApiError {
  if (status === 429) {
    const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    return new GoogleHealthApiError('Google Health API rate limit exceeded', 'rate_limited', 429, retryAfter);
  }
  if (status === 401) {
    return new GoogleHealthApiError('Google rejected the access token (likely revoked)', 'consent_revoked', 401);
  }
  if (status === 403 && bodyText.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
    return new GoogleHealthApiError('Access token missing a required scope for this data type', 'insufficient_scope', 403);
  }
  return new GoogleHealthApiError(`Google Health API error (${status}): ${bodyText}`, 'upstream_error', 502);
}

// Classifies a failed OAuth token-refresh response. Google returns 400 with
// {"error":"invalid_grant"} when the refresh token has been revoked or
// expired — this is the real-world "user revoked consent" signal, distinct
// from any Health API response.
export function classifyRefreshFailure(status: number, bodyText: string): GoogleHealthApiError {
  if (bodyText.includes('invalid_grant')) {
    return new GoogleHealthApiError('Refresh token invalid or revoked', 'consent_revoked', 401);
  }
  return new GoogleHealthApiError(`Token refresh failed (${status}): ${bodyText}`, 'upstream_error', 502);
}

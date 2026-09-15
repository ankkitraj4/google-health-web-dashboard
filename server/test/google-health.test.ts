import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchRestingHrList, fetchStepsDailyRollup } from '../src/google-health.js';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchRestingHrList pagination', () => {
  it('follows nextPageToken until exhausted and concatenates every page (M8 finding: hot-sync page size was too small for a real backfill)', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        if (!url.includes('page_token')) {
          return jsonResponse({
            dataPoints: [{ dailyRestingHeartRate: { date: { year: 2026, month: 9, day: 15 }, beatsPerMinute: '71' } }],
            nextPageToken: 'page-2',
          });
        }
        return jsonResponse({
          dataPoints: [{ dailyRestingHeartRate: { date: { year: 2026, month: 9, day: 14 }, beatsPerMinute: '70' } }],
        });
      })
    );

    const points = await fetchRestingHrList('fake-token', 30);
    expect(points).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('page_token=page-2');
  });

  it('makes a single call when there is no next page', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ dataPoints: [] }));
    vi.stubGlobal('fetch', fetchSpy);
    await fetchRestingHrList('fake-token', 7);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('retry/backoff on transient failures', () => {
  it('retries a 429 with the server-specified Retry-After and eventually succeeds', async () => {
    let attempt = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        attempt++;
        if (attempt === 1) return jsonResponse({ error: 'rate limited' }, 429, { 'retry-after': '0' });
        return jsonResponse({ rollupDataPoints: [{ civilStartTime: { date: { year: 2026, month: 9, day: 15 } }, steps: { countSum: '100' } }] });
      })
    );

    const points = await fetchStepsDailyRollup('fake-token', 7);
    expect(attempt).toBe(2);
    expect(points).toHaveLength(1);
  });

  it('does not retry a consent_revoked-classified failure (401) — fails fast', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ error: 'unauthorized' }, 401));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(fetchStepsDailyRollup('fake-token', 7)).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1); // no retry attempts for a non-retryable class
  });
});

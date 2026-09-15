import { Router, type Request } from 'express';
import { verifyWebhookSignature } from '../webhook-verify.js';
import { getUserByHealthId } from '../users.js';
import { getValidAccessToken } from '../oauth.js';
import { refreshMetricWindow } from '../sync.js';
import type { DayRange } from '../google-health.js';

export const webhookRouter = Router();

interface WebhookNotification {
  version?: string;
  clientProvidedSubscriptionName?: string;
  healthUserId: string;
  operation: 'UPSERT' | 'DELETE';
  dataType: string;
  intervals?: Array<{
    civilDateTimeInterval?: {
      startDateTime?: { date?: { year: number; month: number; day: number } };
      endDateTime?: { date?: { year: number; month: number; day: number } };
    };
    physicalTimeInterval?: { startTime?: string; endTime?: string };
  }>;
  recordId?: string;
}

function daysBackFromDate(d: { year: number; month: number; day: number } | undefined): number | null {
  if (!d) return null;
  const then = Date.UTC(d.year, d.month - 1, d.day);
  const diffDays = Math.round((Date.now() - then) / (24 * 60 * 60 * 1000));
  return Math.max(diffDays, 0);
}

// Narrowest window that still covers the notified interval — deliberately
// not a full resync (plan milestone M8's "enqueue a narrow refresh, not a
// blind reprocess"). Capped at 30 days so a stale/old notification can't
// trigger an unbounded refetch.
function rangeForNotification(n: WebhookNotification): DayRange {
  const interval = n.intervals?.[0];
  const startDaysBack =
    daysBackFromDate(interval?.civilDateTimeInterval?.startDateTime?.date) ??
    (interval?.physicalTimeInterval?.startTime ? daysBackFromIso(interval.physicalTimeInterval.startTime) : 1);
  return { startDaysBack: Math.min(Math.max(startDaysBack, 1), 30), endDaysBack: 0 };
}

function daysBackFromIso(iso: string): number {
  const diffDays = Math.round((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(diffDays, 0);
}

async function handleNotification(n: WebhookNotification): Promise<void> {
  const user = getUserByHealthId(n.healthUserId);
  if (!user) {
    console.warn(`[webhook] notification for unknown healthUserId (not our user), ignoring`);
    return;
  }
  const range = rangeForNotification(n);
  try {
    const accessToken = await getValidAccessToken(user.id);
    const result = await refreshMetricWindow(user.id, accessToken, n.dataType, range);
    if (result) {
      console.log(`[webhook] refreshed ${result.metric} (${result.pointsUpserted} points) for dataType=${n.dataType}`);
    } else {
      console.log(`[webhook] no persisted store for dataType=${n.dataType}, nothing to refresh`);
    }
  } catch (err) {
    // Best-effort: the next hot-sync/backfill will pick this up anyway, and
    // Google retries undelivered (non-204) notifications itself.
    console.error(`[webhook] refresh failed for dataType=${n.dataType}:`, err instanceof Error ? err.message : err);
  }
}

webhookRouter.post('/webhooks/health', async (req: Request & { rawBody?: Buffer }, res) => {
  const configuredToken = process.env.WEBHOOK_AUTH_TOKEN;
  if (!configuredToken) {
    console.error('[webhook] WEBHOOK_AUTH_TOKEN is not configured — rejecting all webhook requests');
    res.status(500).end();
    return;
  }
  if (req.headers.authorization !== configuredToken) {
    res.status(401).end();
    return;
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    res.status(400).end();
    return;
  }
  const signatureHeader = req.headers['google-health-api-signature'];
  const signatureOk = await verifyWebhookSignature(
    rawBody,
    Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader
  );
  if (!signatureOk) {
    res.status(401).end();
    return;
  }

  const body = req.body as { data?: WebhookNotification } | Array<{ data: WebhookNotification }>;
  const notifications: WebhookNotification[] = Array.isArray(body)
    ? body.map((item) => item.data)
    : body.data
      ? [body.data]
      : [];

  // Process before responding — fine for a single-user local app; a
  // multi-tenant version would enqueue and return 204 immediately instead.
  for (const n of notifications) {
    await handleNotification(n);
  }

  res.status(204).end();
});

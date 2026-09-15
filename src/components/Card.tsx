import type { ReactNode } from 'react';
import { BackendError } from '../api/backendFetch';

interface CardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function Card({ title, subtitle, children }: CardProps) {
  return (
    <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 h-full overflow-auto flex flex-col">
      <div className="dashboard-card-handle mb-4 cursor-move select-none flex-shrink-0">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
      <div className="flex flex-col flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}

export function LoadingCard({ title }: { title: string }) {
  return (
    <Card title={title}>
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
      </div>
    </Card>
  );
}

export function ErrorCard({ title, error }: { title: string; error: string }) {
  return (
    <Card title={title}>
      <p className="text-red-400 text-sm">{error}</p>
    </Card>
  );
}

export function EmptyCard({ title }: { title: string }) {
  return (
    <Card title={title}>
      <p className="text-gray-500 text-sm">No data available</p>
    </Card>
  );
}

export function UnavailableCard({ title, reason }: { title: string; reason: string }) {
  return (
    <Card title={title}>
      <p className="text-gray-500 text-sm">Not available in this build</p>
      <p className="text-gray-600 text-xs mt-1">{reason}</p>
    </Card>
  );
}

// Google rejected the stored refresh token (revoked consent) — the fix is
// specific and actionable, so this doesn't reuse the generic ErrorCard.
export function ReconnectCard({ title }: { title: string }) {
  return (
    <Card title={title}>
      <p className="text-amber-400 text-sm">Google access needs to be reconnected.</p>
      <p className="text-gray-500 text-xs mt-1">Your Google account access was revoked or expired.</p>
      <a
        href="/auth/login"
        className="text-indigo-400 text-sm underline mt-3 inline-block hover:text-indigo-300"
      >
        Reconnect Google account
      </a>
    </Card>
  );
}

export function RateLimitedCard({ title, retryAfterSeconds }: { title: string; retryAfterSeconds?: number }) {
  return (
    <Card title={title}>
      <p className="text-amber-400 text-sm">Google Health is rate-limiting requests right now.</p>
      <p className="text-gray-500 text-xs mt-1">
        {retryAfterSeconds ? `Try again in about ${retryAfterSeconds}s.` : 'Try again in a minute.'}
      </p>
    </Card>
  );
}

// Maps a caught fetch error to the right capability-aware card (plan
// milestone M7) instead of every card re-deriving this branching itself.
// eslint-disable-next-line react-refresh/only-export-components -- plain helper co-located with the cards it renders
export function renderFetchError(title: string, err: unknown): ReactNode {
  if (err instanceof BackendError) {
    if (err.code === 'consent_revoked') return <ReconnectCard title={title} />;
    if (err.code === 'rate_limited') return <RateLimitedCard title={title} retryAfterSeconds={err.retryAfterSeconds} />;
    if (err.code === 'insufficient_scope') {
      return <UnavailableCard title={title} reason="Not authorized for this data — a required Google Health scope is missing." />;
    }
  }
  return <ErrorCard title={title} error={err instanceof Error ? err.message : 'Something went wrong'} />;
}

// A day count past which we tell the user their data might be behind the
// device — Fitbit typically syncs at least daily, so >36h with no newer
// data suggests the phone/watch hasn't synced recently, not just that
// "today" hasn't finished yet (plan milestone M7's "stale" state).
const STALE_THRESHOLD_HOURS = 36;

// eslint-disable-next-line react-refresh/only-export-components -- plain helper co-located with the cards it renders
export function isStale(latestDate: string | null): boolean {
  if (!latestDate) return false;
  const ageMs = Date.now() - new Date(`${latestDate}T00:00:00Z`).getTime();
  return ageMs > STALE_THRESHOLD_HOURS * 60 * 60 * 1000;
}

export function FreshnessNote({ latestDate }: { latestDate: string | null }) {
  if (!latestDate) return null;
  const stale = isStale(latestDate);
  return (
    <p className={`text-[11px] mt-1 ${stale ? 'text-amber-400' : 'text-gray-600'}`}>
      {stale ? `Data may be stale — last synced ${latestDate}` : `Synced through ${latestDate}`}
    </p>
  );
}

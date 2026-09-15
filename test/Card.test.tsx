import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Card,
  LoadingCard,
  ErrorCard,
  EmptyCard,
  UnavailableCard,
  ReconnectCard,
  RateLimitedCard,
  renderFetchError,
  isStale,
  FreshnessNote,
} from '../src/components/Card';
import { BackendError } from '../src/api/backendFetch';

describe('Card', () => {
  it('renders the title, optional subtitle, and children', () => {
    render(
      <Card title="Sleep" subtitle="Last 7 days">
        <p>body content</p>
      </Card>
    );
    expect(screen.getByText('Sleep')).toBeInTheDocument();
    expect(screen.getByText('Last 7 days')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
  });

  it('omits the subtitle element when none is given', () => {
    render(<Card title="Sleep">x</Card>);
    expect(screen.queryByText('Last 7 days')).not.toBeInTheDocument();
  });
});

describe('basic state cards (loading, error, empty, unavailable)', () => {
  it('LoadingCard shows the title and a spinner, no data claims', () => {
    render(<LoadingCard title="Activity" />);
    expect(screen.getByText('Activity')).toBeInTheDocument();
  });

  it('ErrorCard shows the specific error message', () => {
    render(<ErrorCard title="Activity" error="Request failed (500)" />);
    expect(screen.getByText('Request failed (500)')).toBeInTheDocument();
  });

  it('EmptyCard says no data is available (distinct from an error)', () => {
    render(<EmptyCard title="Activity" />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('UnavailableCard shows the specific capability-gating reason', () => {
    render(<UnavailableCard title="HRV" reason="Advanced vitals aren't wired up yet." />);
    expect(screen.getByText("Advanced vitals aren't wired up yet.")).toBeInTheDocument();
  });
});

describe('ReconnectCard', () => {
  it('names the problem and links to re-authentication', () => {
    render(<ReconnectCard title="Sleep" />);
    expect(screen.getByText(/needs to be reconnected/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Reconnect Google account/ });
    expect(link).toHaveAttribute('href', '/auth/login');
  });
});

describe('RateLimitedCard', () => {
  it('shows the server-provided retry hint when present', () => {
    render(<RateLimitedCard title="Sleep" retryAfterSeconds={45} />);
    expect(screen.getByText('Try again in about 45s.')).toBeInTheDocument();
  });

  it('falls back to a generic hint when no retryAfterSeconds is given', () => {
    render(<RateLimitedCard title="Sleep" />);
    expect(screen.getByText('Try again in a minute.')).toBeInTheDocument();
  });
});

describe('renderFetchError (plan milestone M7 routing)', () => {
  it('routes consent_revoked to ReconnectCard', () => {
    render(<>{renderFetchError('Sleep', new BackendError('x', 'consent_revoked', 401))}</>);
    expect(screen.getByText(/needs to be reconnected/)).toBeInTheDocument();
  });

  it('routes rate_limited to RateLimitedCard, preserving retryAfterSeconds', () => {
    render(<>{renderFetchError('Sleep', new BackendError('x', 'rate_limited', 429, 20))}</>);
    expect(screen.getByText('Try again in about 20s.')).toBeInTheDocument();
  });

  it('routes insufficient_scope to UnavailableCard', () => {
    render(<>{renderFetchError('Sleep', new BackendError('x', 'insufficient_scope', 403))}</>);
    expect(screen.getByText('Not available in this build')).toBeInTheDocument();
  });

  it('falls back to ErrorCard for an unclassified BackendError code', () => {
    render(<>{renderFetchError('Sleep', new BackendError('boom', 'upstream_error', 502))}</>);
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('falls back to ErrorCard for a plain Error (not a BackendError)', () => {
    render(<>{renderFetchError('Sleep', new Error('network down'))}</>);
    expect(screen.getByText('network down')).toBeInTheDocument();
  });

  it('falls back to a generic message for a non-Error thrown value', () => {
    render(<>{renderFetchError('Sleep', 'a plain string was thrown')}</>);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});

describe('isStale / FreshnessNote (36h threshold)', () => {
  it('is not stale for today', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(isStale(today)).toBe(false);
  });

  it('is stale for 3 days ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(isStale(threeDaysAgo)).toBe(true);
  });

  it('is never stale for null (no data yet, not "old" data)', () => {
    expect(isStale(null)).toBe(false);
  });

  it('FreshnessNote renders nothing for null', () => {
    const { container } = render(<FreshnessNote latestDate={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('FreshnessNote shows the stale warning for old data', () => {
    render(<FreshnessNote latestDate="2020-01-01" />);
    expect(screen.getByText(/Data may be stale/)).toBeInTheDocument();
  });

  it('FreshnessNote shows a plain synced note for fresh data', () => {
    const today = new Date().toISOString().slice(0, 10);
    render(<FreshnessNote latestDate={today} />);
    expect(screen.getByText(`Synced through ${today}`)).toBeInTheDocument();
  });
});

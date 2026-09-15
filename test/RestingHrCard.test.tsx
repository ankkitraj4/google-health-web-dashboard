import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RestingHrCard } from '../src/components/RestingHrCard';
import { BackendError } from '../src/api/backendFetch';

const { getRestingHrFromBackend } = vi.hoisted(() => ({ getRestingHrFromBackend: vi.fn() }));
vi.mock('../src/api/resting-hr', () => ({ getRestingHrFromBackend }));

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../src/auth/AuthContext', () => ({ useAuth: useAuthMock }));

vi.mock('../src/context/DateRangeContext', () => ({ useDateRange: () => ({ daysBack: 7, setDaysBack: vi.fn() }) }));

beforeEach(() => {
  getRestingHrFromBackend.mockReset();
  useAuthMock.mockReturnValue({ isAuthenticated: true });
});

describe('RestingHrCard — capability-aware states (plan milestone M7)', () => {
  it('shows a loading state before the fetch resolves', () => {
    getRestingHrFromBackend.mockReturnValue(new Promise(() => {})); // never resolves
    render(<RestingHrCard />);
    expect(screen.getByText('Resting Heart Rate')).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders real data with a freshness note once the fetch resolves', async () => {
    getRestingHrFromBackend.mockResolvedValue({
      points: [
        { date: '2026-09-14', value: 70 },
        { date: '2026-09-15', value: 71 },
      ],
      latestDate: '2026-09-15',
    });
    render(<RestingHrCard />);
    expect(await screen.findByText('71')).toBeInTheDocument();
    expect(screen.getByText('Synced through 2026-09-15')).toBeInTheDocument();
  });

  it('shows the empty state when there is no data yet, not an error', async () => {
    getRestingHrFromBackend.mockResolvedValue({ points: [], latestDate: null });
    render(<RestingHrCard />);
    expect(await screen.findByText('No data available')).toBeInTheDocument();
  });

  it('shows the stale warning when the latest data is old (mirrors the live M7 verification)', async () => {
    getRestingHrFromBackend.mockResolvedValue({ points: [{ date: '2020-01-01', value: 65 }], latestDate: '2020-01-01' });
    render(<RestingHrCard />);
    expect(await screen.findByText(/Data may be stale/)).toBeInTheDocument();
  });

  it('shows the reconnect prompt when the backend reports revoked consent', async () => {
    getRestingHrFromBackend.mockRejectedValue(new BackendError('unauthorized', 'consent_revoked', 401));
    render(<RestingHrCard />);
    expect(await screen.findByText(/needs to be reconnected/)).toBeInTheDocument();
  });

  it('shows a generic error for an unclassified failure', async () => {
    getRestingHrFromBackend.mockRejectedValue(new Error('network blip'));
    render(<RestingHrCard />);
    expect(await screen.findByText('network blip')).toBeInTheDocument();
  });

  it('does not fetch at all when not authenticated', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false });
    render(<RestingHrCard />);
    expect(getRestingHrFromBackend).not.toHaveBeenCalled();
  });
});

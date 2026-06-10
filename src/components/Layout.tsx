import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useDateRange } from '../context/DateRangeContext';
import { getPairedDevices, getUserInfo } from '../api/user';

const FULLWIDTH_KEY = 'dashboard_fullwidth';

function loadFullWidth(): boolean {
  try { return localStorage.getItem(FULLWIDTH_KEY) === 'true'; } catch { return false; }
}

interface TrackerInfo {
  name: string;
  battery: number | null;
  batteryStatus: string;
}

function batteryColor(level: number | null, status: string): string {
  if (level !== null) {
    if (level > 50) return '#22c55e';
    if (level > 20) return '#f59e0b';
    return '#ef4444';
  }
  const s = status.toLowerCase();
  if (s === 'high') return '#22c55e';
  if (s === 'medium') return '#f59e0b';
  if (s === 'low' || s === 'empty') return '#ef4444';
  return '#6b7280';
}

function BatteryIcon({ level, status }: { level: number | null; status: string }) {
  const color = batteryColor(level, status);
  const pct = level ?? (status.toLowerCase() === 'high' ? 85 : status.toLowerCase() === 'medium' ? 50 : 15);

  return (
    <svg width="22" height="12" viewBox="0 0 22 12" className="inline-block mr-1">
      <rect x="0.5" y="0.5" width="18" height="11" rx="2" fill="none" stroke={color} strokeWidth="1" />
      <rect x="19" y="3" width="2.5" height="6" rx="1" fill={color} opacity={0.6} />
      <rect x="2" y="2" width={Math.max(0, (pct / 100) * 14)} height="8" rx="1" fill={color} />
    </svg>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { accessToken, logout } = useAuth();
  const { daysBack, setDaysBack } = useDateRange();
  const [fullWidth, setFullWidth] = useState(loadFullWidth);
  const [tracker, setTracker] = useState<TrackerInfo | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    getPairedDevices(accessToken)
      .then((data) => {
        const trackerDevice = (data.pairedDevices || []).find(
          (d) => d.deviceType === 'TRACKER' && (d.batteryLevel != null || d.batteryStatus)
        );
        if (trackerDevice) {
          setTracker({
            name: String(trackerDevice.deviceVersion || 'Tracker'),
            battery: typeof trackerDevice.batteryLevel === 'number' ? trackerDevice.batteryLevel : null,
            batteryStatus: String(trackerDevice.batteryStatus || ''),
          });
        }
      })
      .catch(() => {});
    getUserInfo(accessToken)
      .then((info) => { if (info.name) setUserName(info.name); })
      .catch(() => {});
  }, [accessToken]);

  function toggleFullWidth() {
    const next = !fullWidth;
    setFullWidth(next);
    localStorage.setItem(FULLWIDTH_KEY, String(next));
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className={`${fullWidth ? '' : 'max-w-7xl'} mx-auto flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Google Health Dashboard</h1>
            {userName && <span className="text-sm text-gray-400 hidden sm:inline">— {userName}</span>}
            {tracker && (
              <span className="flex items-center text-xs text-gray-400 bg-gray-800/60 rounded-lg px-2.5 py-1 gap-1.5">
                <span className="text-gray-300">{tracker.name}</span>
                <BatteryIcon level={tracker.battery} status={tracker.batteryStatus} />
                <span style={{ color: batteryColor(tracker.battery, tracker.batteryStatus) }}>
                  {tracker.battery != null ? `${tracker.battery}%` : tracker.batteryStatus}
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-gray-800 rounded-lg p-0.5 text-xs">
              {[7, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setDaysBack(d)}
                  className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                    daysBack === d ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <button
              onClick={toggleFullWidth}
              className="text-gray-400 hover:text-white text-xs transition-colors cursor-pointer"
              title={fullWidth ? 'Switch to compact layout' : 'Switch to full-width layout'}
            >
              {fullWidth ? 'Compact' : 'Full width'}
            </button>
            <button
              onClick={logout}
              className="text-gray-400 hover:text-white text-sm transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className={`${fullWidth ? '' : 'max-w-7xl'} mx-auto p-6`}>
        {children}
      </main>
    </div>
  );
}

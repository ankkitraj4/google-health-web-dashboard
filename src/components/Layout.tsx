import { useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useDateRange } from '../context/DateRangeContext';

const FULLWIDTH_KEY = 'dashboard_fullwidth';

function loadFullWidth(): boolean {
  try { return localStorage.getItem(FULLWIDTH_KEY) === 'true'; } catch { return false; }
}

export function Layout({ children }: { children: ReactNode }) {
  const { displayName, logout } = useAuth();
  const { daysBack, setDaysBack } = useDateRange();
  const [fullWidth, setFullWidth] = useState(loadFullWidth);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);

  function toggleFullWidth() {
    const next = !fullWidth;
    setFullWidth(next);
    localStorage.setItem(FULLWIDTH_KEY, String(next));
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch('/api/disconnect', { method: 'POST', credentials: 'same-origin' });
    } finally {
      window.location.href = '/';
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className={`${fullWidth ? '' : 'max-w-7xl'} mx-auto flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Google Health Dashboard</h1>
            {displayName && <span className="text-sm text-gray-400 hidden sm:inline">— {displayName}</span>}
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
            <div className="relative">
              <button
                onClick={() => setShowAccountMenu((v) => !v)}
                className="text-gray-400 hover:text-white text-sm transition-colors cursor-pointer"
              >
                Account
              </button>
              {showAccountMenu && (
                <div
                  className="absolute right-0 mt-2 w-48 bg-gray-900 border border-gray-800 rounded-lg shadow-lg py-1 z-10"
                  onMouseLeave={() => setShowAccountMenu(false)}
                >
                  <button
                    onClick={logout}
                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 cursor-pointer"
                  >
                    Sign out
                  </button>
                  <button
                    onClick={disconnect}
                    disabled={disconnecting}
                    className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-800 cursor-pointer disabled:opacity-50"
                  >
                    {disconnecting ? 'Disconnecting…' : 'Disconnect Google account'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className={`${fullWidth ? '' : 'max-w-7xl'} mx-auto p-6`}>
        {children}
      </main>
    </div>
  );
}

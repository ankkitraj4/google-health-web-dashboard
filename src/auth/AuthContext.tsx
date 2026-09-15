import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  displayName: string | null;
  // True only when the /api/session check itself failed (backend
  // unreachable, network error) — distinct from a successful check that
  // came back unauthenticated. Without this, a backend outage looks
  // identical to "never logged in" and silently shows the login screen
  // with no indication anything is wrong (plan milestone M7).
  sessionCheckFailed: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  isAuthenticated: false,
  isLoading: true,
  error: null,
  displayName: null,
  sessionCheckFailed: false,
  logout: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components -- co-located with AuthProvider intentionally
export function useAuth() {
  return useContext(AuthContext);
}

interface SessionResponse {
  authenticated: boolean;
  healthUserId?: string;
  displayName?: string | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/session', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`Session check failed (${res.status})`);
      const data = (await res.json()) as SessionResponse;
      setIsAuthenticated(data.authenticated);
      setDisplayName(data.displayName ?? null);
      setSessionCheckFailed(false);
    } catch {
      // Couldn't even ask whether we're logged in — don't claim we know the
      // answer is "no."
      setIsAuthenticated(false);
      setSessionCheckFailed(true);
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const authError = url.searchParams.get('auth_error');
    if (authError) {
      // Reacting to a one-time OAuth error param read from the URL on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(`Sign-in failed: ${authError}`);
      window.history.replaceState({}, '', '/');
    }

    checkSession().finally(() => setIsLoading(false));
  }, [checkSession]);

  const logout = useCallback(() => {
    fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).finally(() => {
      setIsAuthenticated(false);
    });
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, error, displayName, sessionCheckFailed, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

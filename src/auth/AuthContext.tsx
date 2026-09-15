import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

interface AuthState {
  // Kept for compatibility with existing card components' prop shape.
  // Always null now: the backend (plan milestone M3) owns tokens entirely —
  // the browser only ever sees a session cookie via /api/session, never a
  // Google access or refresh token. Cards that still expect a real
  // accessToken to fetch data directly from Google are updated in M4-M6 to
  // call backend-owned endpoints instead.
  accessToken: null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  logout: () => void;
  refreshToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthState>({
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  logout: () => {},
  refreshToken: async () => null,
});

// eslint-disable-next-line react-refresh/only-export-components -- co-located with AuthProvider intentionally
export function useAuth() {
  return useContext(AuthContext);
}

interface SessionResponse {
  authenticated: boolean;
  healthUserId?: string;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/session', { credentials: 'same-origin' });
      const data = (await res.json()) as SessionResponse;
      setIsAuthenticated(data.authenticated);
    } catch {
      setIsAuthenticated(false);
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

  // No-op: token refresh happens server-side against the stored refresh
  // token, transparently to the browser. Kept only so existing callers of
  // refreshToken() (api/client.ts's 401 handler) don't need to change yet.
  const refreshToken = useCallback(async () => null, []);

  return (
    <AuthContext.Provider value={{ accessToken: null, isAuthenticated, isLoading, error, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

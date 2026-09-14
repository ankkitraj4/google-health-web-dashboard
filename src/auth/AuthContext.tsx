import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { handleCallback, refreshAccessToken, logout as oauthLogout } from './google-oauth';

interface AuthState {
  accessToken: string | null;
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

// eslint-disable-next-line react-refresh/only-export-components -- co-located with AuthProvider intentionally; this whole file is replaced by session-cookie auth in plan milestone M3.
export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Holds the latest doRefresh so the recursive reschedule below doesn't close
  // over doRefresh before its own declaration finishes.
  const doRefreshRef = useRef<(token: string) => Promise<string | null>>(undefined);

  const doRefresh = useCallback(async (token: string): Promise<string | null> => {
    try {
      const tokens = await refreshAccessToken(token);
      setAccessToken(tokens.access_token);
      sessionStorage.setItem('access_token', tokens.access_token);
      if (tokens.refresh_token) {
        sessionStorage.setItem('refresh_token', tokens.refresh_token);
      }
      // Schedule next refresh 5 min before expiry
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      const refreshMs = Math.max((tokens.expires_in - 300) * 1000, 10000);
      const rt = tokens.refresh_token || token;
      refreshTimerRef.current = setTimeout(() => { doRefreshRef.current?.(rt); }, refreshMs);
      return tokens.access_token;
    } catch {
      setError('Session expired. Please log in again.');
      setAccessToken(null);
      sessionStorage.removeItem('access_token');
      return null;
    }
  }, []);
  // doRefresh has a stable identity (empty deps above), so this effect only
  // ever runs once — it just keeps the ref in sync outside of render.
  useEffect(() => {
    doRefreshRef.current = doRefresh;
  }, [doRefresh]);

  // Expose a refresh function for the API client to call on 401
  const refreshTokenFn = useCallback(async (): Promise<string | null> => {
    const rt = sessionStorage.getItem('refresh_token');
    if (!rt) return null;
    return doRefresh(rt);
  }, [doRefresh]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const errorParam = url.searchParams.get('error');

    if (errorParam) {
      // Reacting to a one-time OAuth redirect param read from the URL on mount;
      // this whole effect is replaced by a backend session check in plan milestone M3.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(`OAuth error: ${errorParam}`);
      setIsLoading(false);
      window.history.replaceState({}, '', '/');
      return;
    }

    if (code) {
      handleCallback(code)
        .then((tokens) => {
          setAccessToken(tokens.access_token);
          sessionStorage.setItem('access_token', tokens.access_token);
          if (tokens.refresh_token) {
            sessionStorage.setItem('refresh_token', tokens.refresh_token);
            const refreshMs = Math.max((tokens.expires_in - 300) * 1000, 10000);
            refreshTimerRef.current = setTimeout(() => { doRefresh(tokens.refresh_token!); }, refreshMs);
          }
          window.history.replaceState({}, '', '/');
        })
        .catch((err) => {
          setError(err.message);
        })
        .finally(() => {
          setIsLoading(false);
        });
      return;
    }

    // Existing session — always refresh the token on startup
    const refreshToken = sessionStorage.getItem('refresh_token');
    if (refreshToken) {
      doRefresh(refreshToken).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [doRefresh]);

  const logout = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setAccessToken(null);
    oauthLogout();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        isAuthenticated: !!accessToken,
        isLoading,
        error,
        logout,
        refreshToken: refreshTokenFn,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

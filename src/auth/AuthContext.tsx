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

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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
      refreshTimerRef.current = setTimeout(() => { doRefresh(rt); }, refreshMs);
      return tokens.access_token;
    } catch {
      setError('Session expired. Please log in again.');
      setAccessToken(null);
      sessionStorage.removeItem('access_token');
      return null;
    }
  }, []);

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

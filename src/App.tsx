import { useEffect } from 'react';
import { useAuth } from './auth/AuthContext';
import { setRefreshFn } from './api/client';
import { LoginScreen } from './components/LoginScreen';
import { Layout } from './components/Layout';
import { DashboardGrid } from './components/DashboardGrid';
import { DateRangeProvider } from './context/DateRangeContext';

export default function App() {
  const { isAuthenticated, isLoading, error, refreshToken } = useAuth();

  useEffect(() => {
    setRefreshFn(refreshToken);
  }, [refreshToken]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen error={error} />;
  }

  return (
    <DateRangeProvider>
      <Layout>
        <DashboardGrid />
      </Layout>
    </DateRangeProvider>
  );
}

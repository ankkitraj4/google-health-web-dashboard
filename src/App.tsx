import { useAuth } from './auth/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { Layout } from './components/Layout';
import { DashboardGrid } from './components/DashboardGrid';
import { DateRangeProvider } from './context/DateRangeContext';

export default function App() {
  const { isAuthenticated, isLoading, error, sessionCheckFailed } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // Distinct from "not authenticated": we couldn't even reach the backend to
  // ask, so we don't know whether you're logged in — don't show the login
  // screen as if we'd confirmed you're logged out (plan milestone M7).
  if (sessionCheckFailed) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <h1 className="text-xl font-semibold text-white mb-2">Can't reach the server</h1>
          <p className="text-gray-400 text-sm mb-4">
            The dashboard couldn't check your sign-in status. Make sure the backend is running, then try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="text-indigo-400 hover:text-indigo-300 text-sm underline cursor-pointer"
          >
            Retry
          </button>
        </div>
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

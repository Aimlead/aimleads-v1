import React, { Suspense, lazy } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Toaster } from '@/components/ui/toaster';
import { ROUTES } from '@/constants/routes';
import NavigationTracker from '@/lib/NavigationTracker';
import PageNotFound from '@/lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { queryClientInstance } from '@/lib/query-client';

// Eagerly loaded (critical path)
import Dashboard from '@/pages/Dashboard';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import LeadDetail from '@/pages/LeadDetail';

// Lazily loaded (code-split bundles)
const AccountSettings = lazy(() => import('@/pages/AccountSettings'));
const Analytics = lazy(() => import('@/pages/Analytics'));
const Pipeline = lazy(() => import('@/pages/Pipeline'));
const Team = lazy(() => import('@/pages/Team.jsx'));
const ICP = lazy(() => import('@/pages/ICP'));
const Pricing = lazy(() => import('@/pages/Pricing'));
const Settings = lazy(() => import('@/pages/Settings'));
const AuditLog = lazy(() => import('@/pages/AuditLog'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const Billing = lazy(() => import('@/pages/Billing'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-brand-sky rounded-full animate-spin" />
    </div>
  );
}

function FullscreenLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
    </div>
  );
}

function AuthScope() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

function PrivateGuard() {
  const location = useLocation();
  const { isAuthenticated, isLoadingAuth, authError } = useAuth();

  if (isLoadingAuth) {
    return <FullscreenLoader />;
  }

  if (!isAuthenticated || authError?.type === 'auth_required') {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`${ROUTES.login}?redirect=${redirect}`} replace />;
  }

  return (
    <AppShell>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </AppShell>
  );
}

function PublicOnlyGuard({ children }) {
  const { isAuthenticated, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return <FullscreenLoader />;
  }

  if (isAuthenticated) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.home} element={<Landing />} />
      <Route path={ROUTES.pricing} element={<Pricing />} />
      <Route path={ROUTES.forgotPassword} element={<ForgotPassword />} />
      <Route path={ROUTES.resetPassword} element={<ResetPassword />} />
      <Route element={<AuthScope />}>
        <Route
          path={ROUTES.login}
          element={
            <PublicOnlyGuard>
              <Login />
            </PublicOnlyGuard>
          }
        />

        <Route element={<PrivateGuard />}>
          <Route path={ROUTES.dashboard} element={<Dashboard />} />
          <Route path={ROUTES.analytics} element={<Analytics />} />
          <Route path={ROUTES.pipeline} element={<Pipeline />} />
          <Route path={ROUTES.icp} element={<ICP />} />
          <Route path={ROUTES.settings} element={<Settings />} />
          <Route path={ROUTES.accountSettings} element={<AccountSettings />} />
          <Route path={ROUTES.team} element={<Team />} />
          <Route path={ROUTES.leadDetail} element={<LeadDetail />} />
          <Route path={ROUTES.auditLog} element={<AuditLog />} />
                    <Route path={ROUTES.billing} element={<Billing />} />import React, { Suspense, lazy } from 'react';
                    import { QueryClientProvider } from '@tanstack/react-query';
                    import { BrowserRouter as Router, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
                    import AppShell from '@/components/layout/AppShell';
                    import ErrorBoundary from '@/components/ErrorBoundary';
                    import { Toaster } from '@/components/ui/toaster';
                    import { ROUTES } from '@/constants/routes';
                    import NavigationTracker from '@/lib/NavigationTracker';
                    import PageNotFound from '@/lib/PageNotFound';
                    import { AuthProvider, useAuth } from '@/lib/AuthContext';
                    import { queryClientInstance } from '@/lib/query-client';

                    // Eagerly loaded (critical path)
                    import Dashboard from '@/pages/Dashboard';
                    import Landing from '@/pages/Landing';
                    import Login from '@/pages/Login';
                    import LeadDetail from '@/pages/LeadDetail';

                    // Lazily loaded (code-split bundles)
                    const AccountSettings = lazy(() => import('@/pages/AccountSettings'));
                    const Analytics = lazy(() => import('@/pages/Analytics'));
                    const Pipeline = lazy(() => import('@/pages/Pipeline'));
                    const Team = lazy(() => import('@/pages/Team.jsx'));
                    const ICP = lazy(() => import('@/pages/ICP'));
                    const Pricing = lazy(() => import('@/pages/Pricing'));
                    const Settings = lazy(() => import('@/pages/Settings'));
                    const AuditLog = lazy(() => import('@/pages/AuditLog'));
                    const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
                    const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
                    const Billing = lazy(() => import('@/pages/Billing'));

                    function PageLoader() {
                      return (
                          <div className="min-h-[60vh] flex items-center justify-center">
                                <div className="w-8 h-8 border-4 border-slate-200 border-t-brand-sky rounded-full animate-spin" />
                                    </div>
                                      );
                                      }

                                      function FullscreenLoader() {
                                        return (
                                            <div className="fixed inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm">
                                                  <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
                                                      </div>
                                                        );
                                                        }

                                                        function AuthScope() {
                                                          return (
                                                              <AuthProvider>
                                                                    <Outlet />
                                                                        </AuthProvider>
                                                                          );
                                                                          }

                                                                          function PrivateGuard() {
                                                                            const location = useLocation();
                                                                              const { isAuthenticated, isLoadingAuth, authError } = useAuth();

                                                                                if (isLoadingAuth) {
                                                                                    return <FullscreenLoader />;
                                                                                      }

                                                                                        if (!isAuthenticated || authError?.type === 'auth_required') {
                                                                                            const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
                                                                                                return <Navigate to={`${ROUTES.login}?redirect=${redirect}`} replace />;
                                                                                                  }

                                                                                                    return (
                                                                                                        <AppShell>
                                                                                                              <Suspense fallback={<PageLoader />}>
                                                                                                                      <Outlet />
                                                                                                                            </Suspense>
                                                                                                                                </AppShell>
                                                                                                                                  );
                                                                                                                                  }

                                                                                                                                  function PublicOnlyGuard({ children }) {
                                                                                                                                    const { isAuthenticated, isLoadingAuth } = useAuth();

                                                                                                                                      if (isLoadingAuth) {
                                                                                                                                          return <FullscreenLoader />;
                                                                                                                                            }

                                                                                                                                              if (isAuthenticated) {
                                                                                                                                                  return <Navigate to={ROUTES.dashboard} replace />;
                                                                                                                                                    }

                                                                                                                                                      return children;
                                                                                                                                                      }

                                                                                                                                                      function AppRoutes() {
                                                                                                                                                        return (
                                                                                                                                                            <Routes>
                                                                                                                                                                  <Route path={ROUTES.home} element={<Landing />} />
                                                                                                                                                                        <Route path={ROUTES.pricing} element={<Pricing />} />
                                                                                                                                                                              <Route path={ROUTES.forgotPassword} element={<ForgotPassword />} />
                                                                                                                                                                                    <Route path={ROUTES.resetPassword} element={<ResetPassword />} />
                                                                                                                                                                                          <Route element={<AuthScope />}>
                                                                                                                                                                                                  <Route
                                                                                                                                                                                                            path={ROUTES.login}
                                                                                                                                                                                                                      element={
                                                                                                                                                                                                                                  <PublicOnlyGuard>
                                                                                                                                                                                                                                                <Login />
                                                                                                                                                                                                                                                            </PublicOnlyGuard>
                                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                                              />
                                                                                                                                                                                                                                                                                      <Route element={<PrivateGuard />}>
                                                                                                                                                                                                                                                                                                <Route path={ROUTES.dashboard} element={<Dashboard />} />
                                                                                                                                                                                                                                                                                                          <Route path={ROUTES.analytics} element={<Analytics />} />
                                                                                                                                                                                                                                                                                                                    <Route path={ROUTES.pipeline} element={<Pipeline />} />
                                                                                                                                                                                                                                                                                                                              <Route path={ROUTES.icp} element={<ICP />} />
                                                                                                                                                                                                                                                                                                                                        <Route path={ROUTES.settings} element={<Settings />} />
                                                                                                                                                                                                                                                                                                                                                  <Route path={ROUTES.accountSettings} element={<AccountSettings />} />
                                                                                                                                                                                                                                                                                                                                                            <Route path={ROUTES.team} element={<Team />} />
                                                                                                                                                                                                                                                                                                                                                                      <Route path={ROUTES.leadDetail} element={<LeadDetail />} />
                                                                                                                                                                                                                                                                                                                                                                                <Route path={ROUTES.auditLog} element={<AuditLog />} />
                                                                                                                                                                                                                                                                                                                                                                                          <Route path={ROUTES.billing} element={<Billing />} />
                                                                                                                                                                                                                                                                                                                                                                                                  </Route>
                                                                                                                                                                                                                                                                                                                                                                                                        </Route>
                                                                                                                                                                                                                                                                                                                                                                                                              <Route path="*" element={<PageNotFound />} />
                                                                                                                                                                                                                                                                                                                                                                                                                  </Routes>
                                                                                                                                                                                                                                                                                                                                                                                                                    );
                                                                                                                                                                                                                                                                                                                                                                                                                    }

                                                                                                                                                                                                                                                                                                                                                                                                                    function App() {
                                                                                                                                                                                                                                                                                                                                                                                                                      return (
                                                                                                                                                                                                                                                                                                                                                                                                                          <ErrorBoundary>
                                                                                                                                                                                                                                                                                                                                                                                                                                <QueryClientProvider client={queryClientInstance}>
                                                                                                                                                                                                                                                                                                                                                                                                                                        <Router>
                                                                                                                                                                                                                                                                                                                                                                                                                                                  <NavigationTracker />
                                                                                                                                                                                                                                                                                                                                                                                                                                                            <AppRoutes />
                                                                                                                                                                                                                                                                                                                                                                                                                                                                    </Router>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                            <Toaster />
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  </QueryClientProvider>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      </ErrorBoundary>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        );
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        }

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        export default App;
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AppRoutes />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;

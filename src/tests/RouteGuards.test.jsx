import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PrivateGuard, PublicOnlyGuard } from '@/App';

const authState = {
  isAuthenticated: false,
  isLoadingAuth: false,
  authError: null,
};

vi.mock('@/lib/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => authState,
}));

vi.mock('@/components/layout/AppShell', () => ({
  default: ({ children }) => <div data-testid="app-shell">{children}</div>,
}));

function LoginEcho() {
  const location = useLocation();
  return <div data-testid="login-page">{location.search}</div>;
}

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };

function renderPrivate(initialEntry) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]} future={routerFuture}>
      <Routes>
        <Route element={<PrivateGuard />}>
          <Route path="/dashboard" element={<div data-testid="private-content">Dashboard</div>} />
        </Route>
        <Route path="/login" element={<LoginEcho />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PrivateGuard', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoadingAuth = false;
    authState.authError = null;
  });

  it('redirects unauthenticated users to login with a redirect param', () => {
    renderPrivate('/dashboard?tab=leads');

    expect(screen.queryByTestId('private-content')).not.toBeInTheDocument();
    const login = screen.getByTestId('login-page');
    expect(login.textContent).toContain(`redirect=${encodeURIComponent('/dashboard?tab=leads')}`);
  });

  it('redirects to login when the session expired (auth_required error)', () => {
    authState.isAuthenticated = true;
    authState.authError = { type: 'auth_required' };
    renderPrivate('/dashboard');

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('private-content')).not.toBeInTheDocument();
  });

  it('shows a loader instead of redirecting while auth state resolves', () => {
    authState.isLoadingAuth = true;
    renderPrivate('/dashboard');

    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('private-content')).not.toBeInTheDocument();
  });

  it('renders the protected page inside the app shell when authenticated', async () => {
    authState.isAuthenticated = true;
    renderPrivate('/dashboard');

    expect(await screen.findByTestId('private-content')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });
});

describe('PublicOnlyGuard', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoadingAuth = false;
    authState.authError = null;
  });

  function renderPublic() {
    return render(
      <MemoryRouter initialEntries={['/login']} future={routerFuture}>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnlyGuard>
                <div data-testid="login-form">Login</div>
              </PublicOnlyGuard>
            }
          />
          <Route path="/dashboard" element={<div data-testid="dashboard-page">Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('renders the public page for anonymous visitors', () => {
    renderPublic();
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });

  it('redirects authenticated users to the dashboard', () => {
    authState.isAuthenticated = true;
    renderPublic();

    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
    expect(screen.queryByTestId('login-form')).not.toBeInTheDocument();
  });
});

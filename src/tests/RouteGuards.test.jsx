import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import App, { PrivateGuard, PublicOnlyGuard } from '@/App';

const authState = {
  isAuthenticated: false,
  isLoadingAuth: false,
  authError: null,
  user: null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

const resetAuthState = () => {
  authState.isAuthenticated = false;
  authState.isLoadingAuth = false;
  authState.authError = null;
  authState.user = null;
};

vi.mock('@/lib/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => authState,
}));

vi.mock('@/lib/NavigationTracker', () => ({ default: () => null }));

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
  beforeEach(resetAuthState);

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
    // PrivateGuard also requires a resolved user (fails closed when user is null)
    authState.user = { id: 'user_test', email: 'user@example.com' };
    renderPrivate('/dashboard');

    expect(await screen.findByTestId('private-content')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });
});

describe('PublicOnlyGuard', () => {
  beforeEach(resetAuthState);

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

describe('route guards (App integration)', () => {
  beforeEach(() => {
    resetAuthState();
    window.localStorage.clear();
  });

  it('redirects unauthenticated users from a private route to login with redirect param', async () => {
    window.history.pushState({}, '', '/dashboard');
    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/login');
    });
    expect(window.location.search).toContain('redirect=%2Fdashboard');
  });

  it('redirects unauthenticated users from lead detail to login', async () => {
    window.history.pushState({}, '', '/leads/lead_123');
    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/login');
    });
    expect(window.location.search).toContain('redirect=%2Fleads%2Flead_123');
  });

  it('renders a not-found page for unknown public routes', async () => {
    window.history.pushState({}, '', '/cette-page-nexiste-pas');
    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/cette-page-nexiste-pas');
    });
    const matches = await screen.findAllByText(/404|introuvable|not found/i);
    expect(matches.length).toBeGreaterThan(0);
  });
});

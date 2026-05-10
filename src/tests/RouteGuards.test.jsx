import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { dataClient } from '@/services/dataClient';

vi.mock('@/services/dataClient', () => ({
  isApiConfigured: true,
  dataClient: {
    mode: 'api',
    auth: {
      isAuthenticated: vi.fn(),
      getCurrentUser: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      redirectToLogin: vi.fn(),
    },
  },
}));

// Minimal PrivateGuard extracted for testing
function PrivateGuard() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  if (isLoadingAuth) return <div data-testid="loading">loading</div>;
  if (!isAuthenticated) return <div data-testid="redirected">redirected-to-login</div>;
  return <div data-testid="protected">protected-content</div>;
}

const renderWithAuth = (initialEntry = '/dashboard') =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/dashboard" element={<PrivateGuard />} />
          <Route path="/login" element={<div data-testid="login-page">login</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );

describe('PrivateGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state while auth resolves', () => {
    // Never resolves — stays loading
    dataClient.auth.isAuthenticated.mockReturnValue(new Promise(() => {}));
    dataClient.auth.getCurrentUser.mockReturnValue(new Promise(() => {}));
    renderWithAuth();
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('redirects unauthenticated users away from protected routes', async () => {
    dataClient.auth.isAuthenticated.mockResolvedValue(false);
    dataClient.auth.getCurrentUser.mockResolvedValue(null);
    renderWithAuth();
    const el = await screen.findByTestId('redirected');
    expect(el).toBeInTheDocument();
  });

  it('renders protected content for authenticated users', async () => {
    dataClient.auth.isAuthenticated.mockResolvedValue(true);
    dataClient.auth.getCurrentUser.mockResolvedValue({
      id: 'user-1',
      email: 'owner@test.com',
      workspace_id: 'ws-1',
      role: 'owner',
    });
    renderWithAuth();
    const el = await screen.findByTestId('protected');
    expect(el).toBeInTheDocument();
  });
});

// PublicOnlyGuard: authenticated users should be redirected to dashboard
function PublicOnlyGuard({ children }) {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  if (isLoadingAuth) return <div data-testid="loading">loading</div>;
  if (isAuthenticated) return <div data-testid="redirected-to-dashboard">redirected</div>;
  return children;
}

const renderPublicGuard = (initialEntry = '/login') =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnlyGuard>
                <div data-testid="login-page">login</div>
              </PublicOnlyGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );

describe('PublicOnlyGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows login page when unauthenticated', async () => {
    dataClient.auth.isAuthenticated.mockResolvedValue(false);
    dataClient.auth.getCurrentUser.mockResolvedValue(null);
    renderPublicGuard();
    const el = await screen.findByTestId('login-page');
    expect(el).toBeInTheDocument();
  });

  it('redirects authenticated users away from public-only routes', async () => {
    dataClient.auth.isAuthenticated.mockResolvedValue(true);
    dataClient.auth.getCurrentUser.mockResolvedValue({
      id: 'user-1',
      email: 'owner@test.com',
      workspace_id: 'ws-1',
      role: 'owner',
    });
    renderPublicGuard();
    const el = await screen.findByTestId('redirected-to-dashboard');
    expect(el).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { dataClient } from '@/services/dataClient';

// Mock the dataClient
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

const TestConsumer = () => {
  const { user, isAuthenticated, isLoadingAuth, login, logout, refreshUser } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoadingAuth)}</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="user">{user?.email ?? 'none'}</span>
      <button onClick={() => login({ email: 'test@test.com', password: 'Test1234' })}>Login</button>
      <button onClick={() => logout()}>Logout</button>
      <button onClick={() => refreshUser()}>Refresh</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts in loading state then resolves to unauthenticated', async () => {
    dataClient.auth.isAuthenticated.mockResolvedValue(false);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('authenticated').textContent).toBe('false');
    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  it('resolves to authenticated when user exists', async () => {
    dataClient.auth.isAuthenticated.mockResolvedValue(true);
    dataClient.auth.getCurrentUser.mockResolvedValue({ email: 'user@test.com', id: '123' });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });
    expect(screen.getByTestId('user').textContent).toBe('user@test.com');
  });

  it('login sets authenticated state', async () => {
    dataClient.auth.isAuthenticated.mockResolvedValue(false);
    dataClient.auth.login.mockResolvedValue({ email: 'login@test.com', id: 'abc' });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      await userEvent.click(screen.getByText('Login'));
    });

    expect(screen.getByTestId('authenticated').textContent).toBe('true');
    expect(screen.getByTestId('user').textContent).toBe('login@test.com');
  });

  it('logout clears authenticated state', async () => {
    dataClient.auth.isAuthenticated.mockResolvedValue(true);
    dataClient.auth.getCurrentUser.mockResolvedValue({ email: 'user@test.com', id: '123' });
    dataClient.auth.logout.mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('authenticated').textContent).toBe('true'));

    await act(async () => {
      await userEvent.click(screen.getByText('Logout'));
    });

    expect(screen.getByTestId('authenticated').textContent).toBe('false');
    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  it('refreshUser reloads the current user', async () => {
    dataClient.auth.isAuthenticated.mockResolvedValue(true);
    dataClient.auth.getCurrentUser
      .mockResolvedValueOnce({ email: 'before@test.com', id: '123' })
      .mockResolvedValueOnce({ email: 'after@test.com', id: '123' });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('before@test.com'));

    await act(async () => {
      await userEvent.click(screen.getByText('Refresh'));
    });

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('after@test.com'));
  });
});

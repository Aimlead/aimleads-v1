import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '@/App';

vi.mock('@/lib/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({
    isAuthenticated: false,
    isLoadingAuth: false,
    authError: null,
    user: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('@/lib/NavigationTracker', () => ({ default: () => null }));

describe('route guards', () => {
  beforeEach(() => {
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

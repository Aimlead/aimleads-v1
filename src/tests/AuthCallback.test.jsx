import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/lib/i18n';

const checkAppStateMock = vi.fn().mockResolvedValue(undefined);
const navigateMock = vi.fn();

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({
    checkAppState: checkAppStateMock,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/lib/onboarding', () => ({
  resolvePostAuthRoute: vi.fn().mockResolvedValue('/dashboard'),
}));

describe('AuthCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18n.changeLanguage('fr');
  });

  afterEach(() => {
    vi.resetModules();
    window.location.hash = '';
  });

  it('shows error when no tokens or code are present', async () => {
    vi.doMock('@/services/dataClient', () => ({
      dataClient: {
        auth: {
          ssoSession: vi.fn(),
          ssoCodeExchange: vi.fn(),
        },
      },
    }));

    const { default: AuthCallback } = await import('@/pages/AuthCallback');

    render(
      <MemoryRouter
        initialEntries={['/auth/callback']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AuthCallback />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Tokens manquants/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Retour à la connexion/i)).toBeInTheDocument();
  });

  it('shows error when OAuth error is in query params', async () => {
    vi.doMock('@/services/dataClient', () => ({
      dataClient: {
        auth: {
          ssoSession: vi.fn(),
          ssoCodeExchange: vi.fn(),
        },
      },
    }));

    const { default: AuthCallback } = await import('@/pages/AuthCallback');

    render(
      <MemoryRouter
        initialEntries={['/auth/callback?error=access_denied&error_description=User%20denied%20access']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AuthCallback />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/User denied access/i)).toBeInTheDocument();
    });
  });

  it('calls ssoCodeExchange when code query param is present', async () => {
    const ssoCodeExchangeMock = vi.fn().mockResolvedValue({ user: { id: 'u1' } });

    vi.doMock('@/services/dataClient', () => ({
      dataClient: {
        auth: {
          ssoSession: vi.fn(),
          ssoCodeExchange: ssoCodeExchangeMock,
        },
      },
    }));

    const { default: AuthCallback } = await import('@/pages/AuthCallback');

    render(
      <MemoryRouter
        initialEntries={['/auth/callback?code=test-auth-code']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AuthCallback />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(ssoCodeExchangeMock).toHaveBeenCalledWith({ code: 'test-auth-code' });
    });

    await waitFor(() => {
      expect(checkAppStateMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });

  it('shows error when ssoCodeExchange fails', async () => {
    const ssoCodeExchangeMock = vi.fn().mockRejectedValue(new Error('Invalid code'));

    vi.doMock('@/services/dataClient', () => ({
      dataClient: {
        auth: {
          ssoSession: vi.fn(),
          ssoCodeExchange: ssoCodeExchangeMock,
        },
      },
    }));

    const { default: AuthCallback } = await import('@/pages/AuthCallback');

    render(
      <MemoryRouter
        initialEntries={['/auth/callback?code=bad-code']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AuthCallback />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Invalid code/i)).toBeInTheDocument();
    });
  });

  it('shows loading spinner during processing', async () => {
    // Use a never-resolving promise to keep the component in loading state
    const ssoCodeExchangeMock = vi.fn().mockReturnValue(new Promise(() => {}));

    vi.doMock('@/services/dataClient', () => ({
      dataClient: {
        auth: {
          ssoSession: vi.fn(),
          ssoCodeExchange: ssoCodeExchangeMock,
        },
      },
    }));

    const { default: AuthCallback } = await import('@/pages/AuthCallback');

    render(
      <MemoryRouter
        initialEntries={['/auth/callback?code=test-code']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AuthCallback />
      </MemoryRouter>
    );

    expect(screen.getByText(/Connexion en cours/i)).toBeInTheDocument();
  });
});

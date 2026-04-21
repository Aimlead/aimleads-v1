import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/lib/i18n';
import Login from '@/pages/Login';

const loginMock = vi.fn();
const registerMock = vi.fn();

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({
    login: loginMock,
    register: registerMock,
    isAuthenticated: false,
  }),
}));

vi.mock('@/services/dataClient', () => ({
  dataClient: {
    mode: 'api',
    debug: {
      apiBaseUrl: 'http://localhost:3000/api',
      allowApiFallback: false,
    },
    auth: {
      ssoInit: (provider) => `/api/auth/sso/init?provider=${provider}`,
    },
  },
}));

describe('Login SSO buttons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18n.changeLanguage('fr');
  });

  it('renders Google and Microsoft SSO buttons', () => {
    render(
      <MemoryRouter
        initialEntries={['/login']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /Google/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Microsoft/i })).toBeInTheDocument();
  });

  it('Google SSO button has correct href', () => {
    render(
      <MemoryRouter
        initialEntries={['/login']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Login />
      </MemoryRouter>
    );

    const googleLink = screen.getByRole('link', { name: /Google/i });
    expect(googleLink).toHaveAttribute('href', '/api/auth/sso/init?provider=google');
  });

  it('Microsoft SSO button has correct href', () => {
    render(
      <MemoryRouter
        initialEntries={['/login']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Login />
      </MemoryRouter>
    );

    const msLink = screen.getByRole('link', { name: /Microsoft/i });
    expect(msLink).toHaveAttribute('href', '/api/auth/sso/init?provider=azure');
  });

  it('does not render GitHub SSO button', () => {
    render(
      <MemoryRouter
        initialEntries={['/login']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Login />
      </MemoryRouter>
    );

    expect(screen.queryByRole('link', { name: /GitHub/i })).not.toBeInTheDocument();
  });

  it('SSO buttons appear in English when language is switched', async () => {
    i18n.changeLanguage('en');

    render(
      <MemoryRouter
        initialEntries={['/login']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /Continue with Google/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Continue with Microsoft/i })).toBeInTheDocument();
  });

  it('renders the "or continue with" divider', () => {
    render(
      <MemoryRouter
        initialEntries={['/login']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByText(/ou continuer avec/i)).toBeInTheDocument();
  });

  it('SSO grid uses 2-column layout when both providers are available', () => {
    render(
      <MemoryRouter
        initialEntries={['/login']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Login />
      </MemoryRouter>
    );

    const googleLink = screen.getByRole('link', { name: /Google/i });
    const grid = googleLink.closest('.auth-v2-sso-grid');
    expect(grid).toHaveClass('auth-v2-sso-grid--2');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/lib/i18n';

const loginMock = vi.fn();
const registerMock = vi.fn();

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({
    login: loginMock,
    register: registerMock,
    isAuthenticated: false,
  }),
}));

describe('Login SSO fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18n.changeLanguage('fr');
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('renders safely without SSO buttons when ssoInit is unavailable', async () => {
    vi.doMock('@/services/dataClient', () => ({
      dataClient: {
        mode: 'api',
        debug: {
          apiBaseUrl: 'http://localhost:3000/api',
          allowApiFallback: false,
        },
        auth: {},
      },
    }));

    const { default: Login } = await import('@/pages/Login');

    render(
      <MemoryRouter
        initialEntries={['/login']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Content de vous revoir' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continuer avec Google' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continuer avec GitHub' })).not.toBeInTheDocument();
  });

  it('renders safely when ssoInit exists but throws', async () => {
    vi.doMock('@/services/dataClient', () => ({
      dataClient: {
        mode: 'api',
        debug: {
          apiBaseUrl: 'http://localhost:3000/api',
          allowApiFallback: false,
        },
        auth: {
          ssoInit: () => {
            throw new Error('SSO runtime unavailable');
          },
        },
      },
    }));

    const { default: Login } = await import('@/pages/Login');

    render(
      <MemoryRouter
        initialEntries={['/login']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continuer avec Google' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continuer avec GitHub' })).not.toBeInTheDocument();
  });
});

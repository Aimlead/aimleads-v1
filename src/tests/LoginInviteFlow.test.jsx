import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('Login invite flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    i18n.changeLanguage('fr');
  });

  it('prefills signup mode and email from invite query params', () => {
    render(
      <MemoryRouter
        initialEntries={['/login?mode=signup&invite_email=teammate%40company.com']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Créer un compte' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nom complet')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('teammate@company.com');
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByText(/Invitation détectée/i)).toBeInTheDocument();
  });

  it('switches to signup mode when a pricing plan is preselected', () => {
    render(
      <MemoryRouter
        initialEntries={['/login?plan=team']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Créer un compte' })).toBeInTheDocument();
    expect(screen.getByText(/Plan sélectionné/i)).toBeInTheDocument();
    expect(screen.getByText(/team/i)).toBeInTheDocument();
  });

  it('switches the login screen language and persists the selection', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter
        initialEntries={['/login?plan=team']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Login />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'EN' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    });

    expect(window.localStorage.getItem('aimleads-language')).toBe('en');
    expect(screen.getByText(/Selected plan/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue with Google' })).toBeInTheDocument();
  });
});

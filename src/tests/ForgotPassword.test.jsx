import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import i18n from '@/lib/i18n';
import ForgotPassword from '@/pages/ForgotPassword';
import { dataClient } from '@/services/dataClient';

vi.mock('@/services/dataClient', () => ({
  dataClient: {
    auth: {
      resetPassword: vi.fn(),
    },
  },
}));

describe('ForgotPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18n.changeLanguage('en');
  });

  it('renders localized recovery copy and submits the email', async () => {
    const user = userEvent.setup();
    dataClient.auth.resetPassword.mockResolvedValueOnce({ ok: true });

    render(
      <MemoryRouter
        initialEntries={['/forgot-password']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ForgotPassword />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email'), 'demo@aimlead.io');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(dataClient.auth.resetPassword).toHaveBeenCalledWith('demo@aimlead.io');
    expect(await screen.findByText('Email sent!')).toBeInTheDocument();
  });
});

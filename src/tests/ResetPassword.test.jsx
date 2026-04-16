import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/lib/i18n';
import ResetPassword from '@/pages/ResetPassword';

vi.mock('@/services/dataClient', () => ({
  dataClient: {
    auth: {
      completePasswordRecovery: vi.fn(),
    },
  },
}));

describe('ResetPassword', () => {
  it('shows the recovery form when recovery tokens are present', () => {
    i18n.changeLanguage('en');
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    render(
      <MemoryRouter
        initialEntries={['/reset-password#access_token=test-access&refresh_token=test-refresh&type=recovery']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ResetPassword />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeInTheDocument();
    expect(screen.queryByText(/missing recovery tokens/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(replaceStateSpy).toHaveBeenCalled();

    replaceStateSpy.mockRestore();
  });

  it('warns when the recovery link is incomplete', () => {
    i18n.changeLanguage('en');
    render(
      <MemoryRouter
        initialEntries={['/reset-password']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ResetPassword />
      </MemoryRouter>
    );

    expect(screen.getByText(/missing recovery tokens/i)).toBeInTheDocument();
  });
});

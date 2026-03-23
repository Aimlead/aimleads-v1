import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    render(
      <MemoryRouter initialEntries={['/reset-password#access_token=test-access&refresh_token=test-refresh&type=recovery']}>
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
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPassword />
      </MemoryRouter>
    );

    expect(screen.getByText(/missing recovery tokens/i)).toBeInTheDocument();
  });
});

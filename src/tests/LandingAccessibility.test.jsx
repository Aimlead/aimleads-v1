import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BookingModal from '@/components/landing/BookingModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, options) => options?.defaultValue || key,
  }),
}));

describe('landing modal accessibility', () => {
  it('renders the booking modal as an accessible dialog', () => {
    render(<BookingModal open onClose={() => {}} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');
    expect(screen.getByRole('button', { name: /fermer/i })).toBeInTheDocument();
  });
});

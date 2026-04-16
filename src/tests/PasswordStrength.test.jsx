import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PasswordStrength from '@/components/PasswordStrength';

describe('PasswordStrength', () => {
  it('renders localized strength hints for a strong password', () => {
    render(<PasswordStrength password="Aimlead123!" />);

    expect(screen.getByText(/Strong|Fort/i)).toBeInTheDocument();
    expect(screen.getByText(/8\+ characters|8\+ caractères/i)).toBeInTheDocument();
    expect(screen.getByText(/Uppercase|Majuscule/i)).toBeInTheDocument();
    expect(screen.getByText(/Number|Chiffre/i)).toBeInTheDocument();
    expect(screen.getByText(/Special char|Caractère spécial/i)).toBeInTheDocument();
  });
});

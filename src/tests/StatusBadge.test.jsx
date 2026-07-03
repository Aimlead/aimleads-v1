import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from '@/components/leads/StatusBadge.jsx';
import { LEAD_STATUS } from '@/constants/leads';

// StatusBadge translates stored enum values ("To Analyze"…) into the active
// locale (fr by default in tests) before rendering.
describe('StatusBadge', () => {
  it('renders "To Analyze" status translated', () => {
    render(<StatusBadge status={LEAD_STATUS.TO_ANALYZE} />);
    expect(screen.getByText('À analyser')).toBeInTheDocument();
  });

  it('renders "Qualified" status with green styles', () => {
    const { container } = render(<StatusBadge status={LEAD_STATUS.QUALIFIED} />);
    expect(screen.getByText('Qualifié')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('bg-emerald-100');
  });

  it('renders "Rejected" status with red styles', () => {
    const { container } = render(<StatusBadge status={LEAD_STATUS.REJECTED} />);
    expect(screen.getByText('Écarté')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('bg-rose-100');
  });

  it('renders "Processing" status with amber styles', () => {
    const { container } = render(<StatusBadge status={LEAD_STATUS.PROCESSING} />);
    expect(screen.getByText('En cours d’analyse')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('bg-amber-100');
  });

  it('falls back to "To Analyze" styles and raw label for unknown status', () => {
    const { container } = render(<StatusBadge status="Unknown" />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('bg-blue-100');
  });
});

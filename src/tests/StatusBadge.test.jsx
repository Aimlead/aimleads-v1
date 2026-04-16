import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from '@/components/leads/StatusBadge.jsx';
import { LEAD_STATUS } from '@/constants/leads';

describe('StatusBadge', () => {
  it('renders "To Analyze" status', () => {
    render(<StatusBadge status={LEAD_STATUS.TO_ANALYZE} />);
    expect(screen.getByText(LEAD_STATUS.TO_ANALYZE)).toBeInTheDocument();
  });

  it('renders "Qualified" status with green styles', () => {
    const { container } = render(<StatusBadge status={LEAD_STATUS.QUALIFIED} />);
    expect(screen.getByText(LEAD_STATUS.QUALIFIED)).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('bg-emerald-100');
  });

  it('renders "Rejected" status with red styles', () => {
    const { container } = render(<StatusBadge status={LEAD_STATUS.REJECTED} />);
    expect(screen.getByText(LEAD_STATUS.REJECTED)).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('bg-rose-100');
  });

  it('renders "Processing" status with amber styles', () => {
    const { container } = render(<StatusBadge status={LEAD_STATUS.PROCESSING} />);
    expect(screen.getByText(LEAD_STATUS.PROCESSING)).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('bg-amber-100');
  });

  it('falls back to "To Analyze" styles for unknown status', () => {
    const { container } = render(<StatusBadge status="Unknown" />);
    expect(container.firstChild).toHaveClass('bg-blue-100');
  });
});

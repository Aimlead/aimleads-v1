import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScorePill from '@/components/leads/ScorePill.jsx';

describe('ScorePill', () => {
    it('renders a dash when score is null', () => {
          render(<ScorePill score={null} />);
          expect(screen.getByText('-')).toBeInTheDocument();
    });

           it('renders a dash when score is undefined', () => {
            render(<ScorePill score={undefined} />);
                 expect(screen.getByText('-')).toBeInTheDocument();
           });

           it('renders the score value', () => {
                 render(<ScorePill score={82} />);
                 expect(screen.getByText('82')).toBeInTheDocument();
           });

           it('applies green styles for score > 75', () => {
                 const { container } = render(<ScorePill score={80} />);
                 expect(container.firstChild).toHaveClass('bg-emerald-50');
                 expect(container.firstChild).toHaveClass('text-emerald-700');
           });

           it('applies amber styles for score between 50 and 75', () => {
                 const { container } = render(<ScorePill score={60} />);
                 expect(container.firstChild).toHaveClass('bg-amber-50');
                 expect(container.firstChild).toHaveClass('text-amber-700');
           });

           it('applies red styles for score < 50', () => {
                 const { container } = render(<ScorePill score={30} />);
                 expect(container.firstChild).toHaveClass('bg-rose-50');
                 expect(container.firstChild).toHaveClass('text-rose-600');
           });

           it('renders score of 0', () => {
                 render(<ScorePill score={0} />);
                 expect(screen.getByText('0')).toBeInTheDocument();
           });
});

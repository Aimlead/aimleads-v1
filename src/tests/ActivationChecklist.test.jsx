import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sparkles, Target } from 'lucide-react';
import ActivationChecklist from '@/components/ActivationChecklist';

describe('ActivationChecklist', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders incomplete setup steps and fires the next action', async () => {
    const onConfigureIcp = vi.fn();

    render(
      <ActivationChecklist
        steps={[
          {
            id: 'icp',
            icon: Target,
            title: 'Set your active ICP',
            description: 'Configure your scoring profile.',
            complete: false,
            actionLabel: 'Configure ICP',
            onAction: onConfigureIcp,
          },
          {
            id: 'analysis',
            icon: Sparkles,
            title: 'Analyze your first lead',
            description: 'Run your first analysis.',
            complete: true,
            actionLabel: 'Analyze',
            onAction: vi.fn(),
          },
        ]}
      />
    );

    expect(screen.getByText(/Activation Checklist|Checklist d'activation/i)).toBeInTheDocument();
    expect(screen.getByText(/1\/2 complete|1\/2 terminés|1\/2 terminé/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /configure icp/i }));
    expect(onConfigureIcp).toHaveBeenCalledTimes(1);
  });

  it('collapses into a compact banner and can resume later', async () => {
    render(
      <ActivationChecklist
        steps={[
          {
            id: 'import',
            icon: Sparkles,
            title: 'Import your first list',
            description: 'Upload leads.',
            complete: false,
            actionLabel: 'Import leads',
            onAction: vi.fn(),
          },
        ]}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /hide|masquer/i }));

    expect(screen.getByText(/0\/1.*(Resume setup|Reprenez la configuration)/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /activation checklist|checklist d'activation/i }));
    expect(screen.getByRole('button', { name: /hide|masquer/i })).toBeInTheDocument();
  });

  it('does not render when all steps are complete', () => {
    const { container } = render(
      <ActivationChecklist
        steps={[
          {
            id: 'sequence',
            icon: Sparkles,
            title: 'Generate a first sequence',
            description: 'Done.',
            complete: true,
            actionLabel: 'Open Outreach',
            onAction: vi.fn(),
          },
        ]}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});

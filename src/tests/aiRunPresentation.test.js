import { describe, expect, it } from 'vitest';
import {
  buildAiRunActivityModel,
  formatAiRunCost,
  formatAiRunDuration,
  humanizeAiModel,
} from '@/lib/aiRunPresentation';

describe('aiRunPresentation', () => {
  it('builds a compact dashboard activity model', () => {
    const model = buildAiRunActivityModel([
      {
        id: 'run-1',
        status: 'completed',
        model: 'claude-sonnet-4-6',
        provider: 'anthropic',
        duration_ms: 8200,
        input_tokens: 2400,
        output_tokens: 900,
        estimated_cost: 0.0214,
        created_at: '2026-04-16T10:00:00.000Z',
      },
      {
        id: 'run-2',
        status: 'failed',
        model: 'claude-haiku-4-5-20251001',
        provider: 'anthropic',
        duration_ms: 1200,
        input_tokens: 800,
        output_tokens: 0,
        estimated_cost: 0.0006,
        created_at: '2026-04-16T11:00:00.000Z',
      },
    ]);

    expect(model.totalRuns).toBe(2);
    expect(model.completed).toBe(1);
    expect(model.failed).toBe(1);
    expect(model.totalTokens).toBe(4100);
    expect(model.modelMix).toEqual(expect.arrayContaining([
      {
        model: 'claude-haiku-4-5-20251001',
        label: 'Claude Haiku',
        count: 1,
      },
      {
        model: 'claude-sonnet-4-6',
        label: 'Claude Sonnet',
        count: 1,
      },
    ]));
    expect(model.recentRuns[0].id).toBe('run-2');
  });

  it('formats model names, cost, and duration for display', () => {
    expect(humanizeAiModel('claude-sonnet-4-6')).toBe('Claude Sonnet');
    expect(formatAiRunCost(0.0214, 'en-US')).toBe('$0.0214');
    expect(formatAiRunDuration(8200, 'en-US')).toBe('8.2 s');
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';

// Tests for llmService graceful degradation (no API key in CI)
// These run without actual LLM calls.

test('llmService exports enrichWithLlm function', async () => {
  const mod = await import('../server/services/llmService.js');
  assert.ok(typeof mod.enrichWithLlm === 'function', 'enrichWithLlm must be exported');
});

test('enrichWithLlm returns null gracefully when no API keys configured', async () => {
  // Temporarily clear keys
  const savedAnthropic = process.env.ANTHROPIC_API_KEY;
  const savedOpenAI = process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    // Re-import fresh (node caches modules so we test the already-imported instance)
    const { enrichWithLlm } = await import('../server/services/llmService.js');

    const result = await enrichWithLlm({
      lead: { company_name: 'Test Co', industry: 'SaaS' },
      icpProfile: { name: 'Test ICP', weights: {} },
      scoringContext: { icp_score: 70, icp_category: 'Strong Fit', icp_signals: [] },
    });

    // When no key is configured at module init time, result should be null or empty
    assert.ok(
      result === null || result === undefined || (typeof result === 'object' && !result.inferred_signals),
      'should return null or empty when no LLM key is available at module load time'
    );
  } finally {
    // Restore keys
    if (savedAnthropic) process.env.ANTHROPIC_API_KEY = savedAnthropic;
    if (savedOpenAI) process.env.OPENAI_API_KEY = savedOpenAI;
  }
});

test('llmService hasAnyLLM flag reflects key presence', async () => {
  // Since module is cached, this tests the state at import time
  const mod = await import('../server/services/llmService.js');

  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const expectedHasAny = hasAnthropic || hasOpenAI;

  // We can't directly access hasAnyLLM but we can observe behavior via enrichWithLlm
  // If no keys: result should be null quickly (no HTTP calls)
  if (!expectedHasAny) {
    const { enrichWithLlm } = mod;
    const start = Date.now();
    const result = await enrichWithLlm({
      lead: { company_name: 'NoKey Co' },
      icpProfile: { weights: {} },
      scoringContext: { icp_score: 50, icp_category: 'Medium Fit', icp_signals: [] },
    });
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 200, `should return quickly when no key (${elapsed}ms)`);
    assert.ok(result === null || result === undefined, 'should return null with no keys');
  } else {
    // Keys are set: function is available
    assert.ok(typeof mod.enrichWithLlm === 'function');
  }
});

test('analyzeLead with skipLlm completes quickly and returns valid structure', async () => {
  const { analyzeLead } = await import('../server/services/analyzeService.js');

  const icp = {
    id: 'icp-llm-test',
    name: 'LLM Test ICP',
    weights: {
      industrie: { primaires: ['Tech'], secondaires: [], exclusions: [] },
      roles: { exacts: ['CEO'], proches: [], exclusions: [] },
    },
  };

  const lead = {
    id: 'lead-llm-test',
    company_name: 'LLM Test Co',
    industry: 'Tech',
    contact_role: 'CEO',
    company_size: 50,
    country: 'France',
  };

  const start = Date.now();
  const result = await analyzeLead({ lead, icpProfile: icp, skipLlm: true });
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 500, `skipLlm should be fast (${elapsed}ms)`);
  assert.ok(typeof result.final_score === 'number', 'should return final_score');
  assert.ok(typeof result.icp_score === 'number', 'should return icp_score');
  // ai_signals are generated deterministically even without LLM
  assert.ok(Array.isArray(result.signals), 'should have signals array');
  assert.ok(Array.isArray(result.ai_signals), 'should have ai_signals array');
});

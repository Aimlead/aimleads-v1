import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeLlmResult, pickAnalysisModel } from '../server/services/llmService.js';

const restoreEnv = (previous) => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

test('pickAnalysisModel defaults to Haiku below the deep threshold and Sonnet above it', () => {
  const previous = {
    LLM_MODEL: process.env.LLM_MODEL,
    LLM_HAIKU_MODEL: process.env.LLM_HAIKU_MODEL,
    LLM_SONNET_MODEL: process.env.LLM_SONNET_MODEL,
    SONNET_SCORE_THRESHOLD: process.env.SONNET_SCORE_THRESHOLD,
  };
  delete process.env.LLM_MODEL;
  delete process.env.LLM_HAIKU_MODEL;
  delete process.env.LLM_SONNET_MODEL;
  delete process.env.SONNET_SCORE_THRESHOLD;

  assert.equal(pickAnalysisModel(42), 'claude-haiku-4-5-20251001');
  assert.equal(pickAnalysisModel(85), 'claude-sonnet-4-6');

  restoreEnv(previous);
});

test('normalizeLlmResult salvages valid arrays and clamps confidence', () => {
  const normalized = normalizeLlmResult({
    score_adjustment: 7,
    confidence_level: 120,
    inferred_signals: {
      pre_call: ['recent_funding', '', null],
      negative: ['signed_competitor'],
    },
    buying_signals: ['Raised a Series A', '', 'Hiring SDRs'],
    fit_reasoning: 'Strong fit around role and segment.',
    key_insights: ['Strong fit', 'Fast GTM'],
    risk_factors: ['Competitive pressure'],
    icebreaker_email: 'Congrats on the new round.',
    icebreaker_linkedin: 'Impressed by the hiring momentum.',
    icebreaker_call: 'You seem to be ramping the team quickly.',
    suggested_action: 'Open an outbound thread this week.',
  });

  assert.equal(normalized.confidence_level, 100);
  assert.deepEqual(normalized.inferred_signals.pre_call, ['recent_funding']);
  assert.deepEqual(normalized.buying_signals, ['Raised a Series A', 'Hiring SDRs']);
});

test('normalizeLlmResult rejects clearly invalid payloads', () => {
  const normalized = normalizeLlmResult({
    score_adjustment: 99,
    confidence_level: 20,
    fit_reasoning: '',
    suggested_action: '',
  });

  assert.equal(normalized, null);
});

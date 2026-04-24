import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeScoreDetailsWithSignalAnalysis } from '../server/routes/leads.js';

test('mergeScoreDetailsWithSignalAnalysis preserves deterministic ICP sections', () => {
  const existing = {
    icp_analysis: 'Great fit for SMB SaaS in France.',
    icp_criteria: { industry: 'match', role: 'partial' },
    criteria_breakdown: {
      industry: { points: 30, match: 'parfait' },
      role: { points: 15, match: 'partiel' },
    },
    score_breakdown: { deterministic_score: 78 },
    deterministic_score: 78,
  };

  const signalResult = {
    ai_score: 84,
    ai_boost: 4,
    confidence: 72,
    signals: ['New VP Sales hired'],
    positives: ['New VP Sales hired'],
    negatives: [],
    action: 'contact_soon',
    icebreaker: 'Congrats on the recent leadership hire.',
    sources: ['https://example.com/news'],
    _meta: { model: 'claude-sonnet-test' },
  };

  const merged = mergeScoreDetailsWithSignalAnalysis(existing, signalResult, { website_url: 'example.com' });

  assert.equal(merged.icp_analysis, existing.icp_analysis);
  assert.deepEqual(merged.icp_criteria, existing.icp_criteria);
  assert.deepEqual(merged.criteria_breakdown, existing.criteria_breakdown);
  assert.deepEqual(merged.score_breakdown, existing.score_breakdown);
  assert.equal(merged.deterministic_score, existing.deterministic_score);

  assert.equal(merged.signal_analysis.ai_score, 84);
  assert.equal(merged.signal_analysis.ai_boost, 4);
  assert.equal(merged.signal_analysis.suggested_action, 'contact_soon');
  assert.deepEqual(merged.signal_analysis.sources, ['https://example.com/news']);
  assert.equal(merged.signal_analysis.website, 'example.com');
});

test('mergeScoreDetailsWithSignalAnalysis keeps ICP-only text untouched and stores signal summary under signal_analysis', () => {
  const existing = {
    icp_summary: 'Deterministic ICP summary that must never be replaced.',
    icp_analysis: 'ICP score (deterministic): 74/100',
    criteria_breakdown: {
      industry: { points: 20, evaluated_value: 'SaaS' },
    },
  };

  const signalResult = {
    ai_score: 77,
    ai_boost: 3,
    confidence: 69,
    summary: 'AI signal score: 77, confidence: 69, contact soon.',
    signals: ['Leadership change'],
    positives: ['Leadership change'],
    negatives: [],
    action: 'contact_soon',
    icebreaker: 'Congrats on your new leadership hire.',
    sources: ['https://example.com/signal'],
  };

  const merged = mergeScoreDetailsWithSignalAnalysis(existing, signalResult, { website_url: 'example.com' });

  assert.equal(merged.icp_summary, existing.icp_summary);
  assert.equal(merged.icp_analysis, existing.icp_analysis);
  assert.deepEqual(merged.criteria_breakdown, existing.criteria_breakdown);

  assert.equal(merged.signal_analysis.summary, signalResult.summary);
  assert.equal(merged.signal_analysis.ai_score, 77);
  assert.equal(merged.signal_analysis.confidence, 69);
  assert.deepEqual(merged.signal_analysis.signals, ['Leadership change']);
  assert.match(merged.icp_analysis, /deterministic/i);
  assert.doesNotMatch(merged.icp_analysis, /ai signal score|confidence|boost/i);
});

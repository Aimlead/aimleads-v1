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

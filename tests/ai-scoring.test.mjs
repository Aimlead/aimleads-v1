import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreAiSignals } from '../server/services/aiSignalService.js';

test('ai score stays low when there are no verified intent signals', () => {
  const result = scoreAiSignals({
    lead: {
      company_name: 'No Signal Co',
      website_url: 'nosignal.example',
      contact_name: 'Alex',
      contact_role: 'CTO',
      industry: 'Software Development',
      company_size: 120,
      country: 'France',
    },
    icpScore: 70,
    scoreDetails: {},
    blendWeights: { icp: 60, ai: 40 },
  });

  assert.equal(result.aiScore, 12);
  assert.equal(result.aiBoost, 0);
  assert.ok(result.aiConfidence <= 45);
  assert.ok(result.aiSignals.some((signal) => signal.type === 'neutral'));
});

test('manual intent signals materially increase ai score', () => {
  const result = scoreAiSignals({
    lead: {
      company_name: 'Intent Co',
      intent_signals: {
        pre_call: ['recent_funding', 'active_rfp'],
        post_contact: ['budget_available'],
      },
    },
    icpScore: 60,
    scoreDetails: {},
    blendWeights: { icp: 60, ai: 40 },
  });

  assert.ok(result.aiScore >= 40);
  assert.ok(result.aiConfidence >= 35);
  assert.ok(result.aiSignals.some((signal) => signal.source === 'intent-manual'));
  assert.ok(result.aiBoost > 0);
});

test('hard-stop internet negative keeps final scoring coherent with reject action', () => {
  const result = scoreAiSignals({
    lead: {
      company_name: 'Dead Co',
      internet_signals: [{ key: 'closed_or_dead', confidence: 1, evidence: 'https://news.example/dead' }],
    },
    icpScore: 95,
    scoreDetails: {},
    blendWeights: { icp: 60, ai: 40 },
  });

  assert.ok(result.aiScore <= 10);
  assert.ok(result.aiBoost <= -30);
  assert.ok(result.finalScore <= 10);
  assert.ok(result.finalCategory === 'Low Fit' || result.finalCategory === 'Excluded');
  assert.equal(result.finalStatus, 'Rejected');
  assert.equal(result.finalRecommendedAction, 'Reject lead now');
  assert.ok(result.aiSignals.some((signal) => signal.source === 'internet' && signal.type === 'negative'));
});

test('priority-block negative caps score and avoids strong-fit paradox', () => {
  const result = scoreAiSignals({
    lead: {
      company_name: 'No Budget Co',
      internet_signals: [{ key: 'no_budget', confidence: 0.95, evidence: 'https://example.com/interview' }],
    },
    icpScore: 90,
    scoreDetails: {},
    blendWeights: { icp: 60, ai: 40 },
  });

  assert.ok(result.finalScore <= 49);
  assert.notEqual(result.finalCategory, 'Strong Fit');
  assert.ok(['Nurture sequence', 'Reject lead'].includes(result.finalRecommendedAction));
});

test('icp hard exclusion forces final score to zero', () => {
  const result = scoreAiSignals({
    lead: {
      company_name: 'Excluded Co',
      intent_signals: {
        pre_call: ['recent_funding'],
      },
    },
    icpScore: 90,
    scoreDetails: {
      industrie: { match: 'exclu' },
    },
    blendWeights: { icp: 60, ai: 40 },
  });

  assert.equal(result.finalScore, 0);
  assert.equal(result.finalCategory, 'Excluded');
});

test('without intent signals, ai does not distort icp baseline', () => {
  const icpScore = 63;
  const result = scoreAiSignals({
    lead: {
      company_name: 'Baseline Co',
    },
    icpScore,
    scoreDetails: {},
    blendWeights: { icp: 60, ai: 40 },
  });

  assert.equal(result.aiBoost, 0);
  assert.equal(result.finalScore, icpScore);
});

test('external internet buying signal increases final prioritization and action urgency', () => {
  const result = scoreAiSignals({
    lead: {
      company_name: 'RFP Co',
      internet_signals: [
        {
          key: 'active_rfp',
          confidence: 0.95,
          evidence: 'https://rfp.example/opportunity',
          source_type: 'official_company_site',
          found_at: new Date().toISOString(),
        },
      ],
    },
    icpScore: 50,
    scoreDetails: {},
    blendWeights: { icp: 60, ai: 40 },
  });

  assert.ok(result.aiBoost > 0);
  assert.ok(result.finalScore > 50);
  assert.equal(result.finalRecommendedAction, 'Contact in 24h');
});

test('blend weights influence ai boost intensity', () => {
  const baseLead = {
    company_name: 'Weight Co',
    internet_signals: [
      {
        key: 'active_rfp',
        confidence: 0.9,
        evidence: 'https://weight.example/rfp',
        source_type: 'official_company_site',
        found_at: new Date().toISOString(),
      },
    ],
  };

  const lowAiWeight = scoreAiSignals({
    lead: baseLead,
    icpScore: 55,
    scoreDetails: {},
    blendWeights: { icp: 80, ai: 20 },
  });

  const highAiWeight = scoreAiSignals({
    lead: baseLead,
    icpScore: 55,
    scoreDetails: {},
    blendWeights: { icp: 40, ai: 60 },
  });

  assert.ok(Math.abs(highAiWeight.aiBoost) > Math.abs(lowAiWeight.aiBoost));
});

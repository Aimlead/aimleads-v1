import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeLead } from '../server/services/analyzeService.js';

const BASE_ICP = {
  id: 'icp-test-1',
  name: 'Test ICP',
  is_active: true,
  weights: {
    industrie: { primaires: ['SaaS', 'Software'], secondaires: ['IT'], exclusions: ['Defense'] },
    roles: { exacts: ['CEO', 'CTO'], proches: ['VP', 'Director'], exclusions: [] },
    typeClient: { primaire: ['B2B'], secondaire: [] },
    structure: { taille_min: 10, taille_max: 500 },
    geo: { pays: ['France', 'Germany'] },
  },
};

const PERFECT_LEAD = {
  id: 'lead-test-1',
  company_name: 'Acme SaaS',
  industry: 'SaaS',
  company_size: 80,
  country: 'France',
  contact_role: 'CEO',
  website_url: 'acmesaas.io',
};

const EXCLUDED_LEAD = {
  id: 'lead-test-2',
  company_name: 'Defense Corp',
  industry: 'Defense', // in exclusions
  company_size: 5000,
  country: 'Unknown',
  contact_role: 'CEO',
};

test('analyzeLead returns required fields', async () => {
  const result = await analyzeLead({ lead: PERFECT_LEAD, icpProfile: BASE_ICP, skipLlm: true });

  assert.ok(typeof result.icp_score === 'number', 'should have icp_score');
  assert.ok(typeof result.final_score === 'number', 'should have final_score');
  assert.ok(typeof result.icp_category === 'string' || typeof result.category === 'string', 'should have category');
  assert.ok(typeof result.status === 'string', 'should have status');
  assert.ok(Array.isArray(result.signals), 'should have signals array');
  assert.ok(result.icp_profile_id === BASE_ICP.id, 'should reference icp profile');
});

test('analyzeLead perfect-fit lead scores higher than weak lead', async () => {
  const weakLead = {
    id: 'lead-weak',
    company_name: 'Random Corp',
    industry: 'Agriculture',
    company_size: 10000,
    country: 'Nowhere',
    contact_role: 'Intern',
  };

  const perfectResult = await analyzeLead({ lead: PERFECT_LEAD, icpProfile: BASE_ICP, skipLlm: true });
  const weakResult = await analyzeLead({ lead: weakLead, icpProfile: BASE_ICP, skipLlm: true });

  assert.ok(perfectResult.icp_score > weakResult.icp_score,
    `perfect lead (${perfectResult.icp_score}) should outscore weak lead (${weakResult.icp_score})`);
  assert.ok(perfectResult.final_score >= 50, `expected passing final_score, got ${perfectResult.final_score}`);
  assert.notEqual(perfectResult.status, 'Rejected', 'perfect fit should not be rejected');
});

test('analyzeLead excluded lead scores zero and is rejected', async () => {
  const result = await analyzeLead({ lead: EXCLUDED_LEAD, icpProfile: BASE_ICP, skipLlm: true });

  assert.equal(result.final_score, 0, 'excluded lead must have final_score 0');
  assert.ok(result.final_category === 'Excluded' || result.category === 'Excluded', 'should be Excluded category');
  assert.equal(result.final_status, 'Rejected', 'excluded lead should be Rejected');
});

test('analyzeLead without icp profile returns graceful fallback', async () => {
  // analyzeLead should not crash if called with minimal icpProfile
  const minimalIcp = { id: 'icp-min', name: 'Minimal', weights: {} };
  const result = await analyzeLead({ lead: PERFECT_LEAD, icpProfile: minimalIcp, skipLlm: true });

  assert.ok(typeof result.icp_score === 'number', 'should still return icp_score');
  assert.ok(typeof result.final_score === 'number', 'should still return final_score');
});

test('analyzeLead skipLlm=true completes and returns valid structure', async () => {
  const start = Date.now();
  const result = await analyzeLead({ lead: PERFECT_LEAD, icpProfile: BASE_ICP, skipLlm: true });
  const elapsed = Date.now() - start;

  // Should be fast without LLM network call
  assert.ok(elapsed < 500, `skipLlm should complete quickly (took ${elapsed}ms)`);
  // Result has all required fields
  assert.ok(typeof result.final_score === 'number');
  assert.ok(typeof result.icp_score === 'number');
  assert.ok(typeof result.final_category === 'string');
  assert.ok(typeof result.final_status === 'string');
});

test('analyzeLead negative internet signal reduces final score', async () => {
  const leadWithNegativeSignal = {
    ...PERFECT_LEAD,
    internet_signals: [
      { key: 'closed_or_dead', confidence: 0.99, evidence: 'https://news.example/bankruptcy' },
    ],
  };

  const baseline = await analyzeLead({ lead: PERFECT_LEAD, icpProfile: BASE_ICP, skipLlm: true });
  const withNegative = await analyzeLead({ lead: leadWithNegativeSignal, icpProfile: BASE_ICP, skipLlm: true });

  assert.ok(withNegative.final_score < baseline.final_score, 'negative signal should reduce final score');
  assert.equal(withNegative.final_status, 'Rejected', 'dead company should be rejected');
});

test('analyzeLead positive internet signal boosts final score', async () => {
  const leadWithPositiveSignal = {
    ...PERFECT_LEAD,
    internet_signals: [
      {
        key: 'active_rfp',
        confidence: 0.95,
        evidence: 'https://rfp.example/tender',
        source_type: 'official_company_site',
        found_at: new Date().toISOString(),
      },
    ],
  };

  const baseline = await analyzeLead({ lead: PERFECT_LEAD, icpProfile: BASE_ICP, skipLlm: true });
  const withPositive = await analyzeLead({ lead: leadWithPositiveSignal, icpProfile: BASE_ICP, skipLlm: true });

  assert.ok(withPositive.final_score >= baseline.final_score, 'positive signal should not decrease score');
});

test('analyzeLead score is always 0-100', async () => {
  const extremeLead = {
    ...PERFECT_LEAD,
    company_size: 999999,
    country: 'Antarctica',
    industry: 'Underwater basket weaving',
    contact_role: 'Intern',
    internet_signals: [
      { key: 'closed_or_dead', confidence: 1, evidence: 'dead' },
    ],
  };

  const result = await analyzeLead({ lead: extremeLead, icpProfile: BASE_ICP, skipLlm: true });

  assert.ok(result.icp_score >= 0 && result.icp_score <= 100, 'icp_score must be 0-100');
  assert.ok(result.final_score >= 0 && result.final_score <= 100, 'final_score must be 0-100');
});

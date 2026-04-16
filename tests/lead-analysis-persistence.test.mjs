import assert from 'node:assert/strict';
import test from 'node:test';
import { toLeadAnalysisUpdatePayload } from '../server/services/leadAnalysisPersistence.js';

test('lead analysis persistence keeps discovered internet signals but not inferred LLM intent signals', () => {
  const payload = toLeadAnalysisUpdatePayload({
    status: 'Qualified',
    final_status: 'Qualified',
    icp_score: 74,
    ai_score: 61,
    inferred_intent_signals: {
      pre_call: ['recent_funding'],
    },
    discovered_internet_signals: [
      { key: 'active_rfp', confidence: 92 },
    ],
  });

  assert.equal(payload.status, 'Qualified');
  assert.equal(payload.icp_score, 74);
  assert.equal(payload.ai_score, 61);
  assert.ok(!Object.hasOwn(payload, 'intent_signals'));
  assert.deepEqual(payload.internet_signals, [{ key: 'active_rfp', confidence: 92 }]);
});

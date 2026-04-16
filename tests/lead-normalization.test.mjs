import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeIntentSignalsPayload, normalizeLeadForResponse } from '../server/lib/leadNormalization.js';

test('normalizeIntentSignalsPayload reshapes legacy array payloads', () => {
  const normalized = normalizeIntentSignalsPayload([
    'recent_funding',
    { key: 'active_rfp' },
    { key: 'no_budget', type: 'negative' },
    { label: 'recent_funding' },
  ]);

  assert.deepEqual(normalized, {
    pre_call: ['recent_funding', 'active_rfp'],
    post_contact: [],
    negative: ['no_budget'],
  });
});

test('normalizeLeadForResponse restores final status and structured intent signals', () => {
  const lead = normalizeLeadForResponse({
    id: 'lead-1',
    status: 'Error',
    final_status: 'Qualified',
    signals: ['recent_funding', { key: 'no_budget', type: 'negative' }],
  });

  assert.equal(lead.status, 'Qualified');
  assert.deepEqual(lead.intent_signals, {
    pre_call: ['recent_funding'],
    post_contact: [],
    negative: ['no_budget'],
  });
});

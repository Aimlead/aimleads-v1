import test from 'node:test';
import assert from 'node:assert/strict';

import { discoverInternetSignals } from '../server/services/internetSignalDiscoveryService.js';

const html = `
<html>
  <body>
    <h1>Acme announces Series B funding round</h1>
    <p>We are hiring across Europe and expanding our team.</p>
  </body>
</html>
`;

const fakeFetch = async (url) => {
  const value = String(url || '');
  if (value.endsWith('/')) {
    return {
      ok: true,
      headers: { get: () => 'text/html; charset=utf-8' },
      text: async () => html,
    };
  }

  return {
    ok: false,
    headers: { get: () => 'text/html; charset=utf-8' },
    text: async () => '',
  };
};

test('discovers signals from website text and role metadata', async () => {
  const lead = {
    website_url: 'acme.example',
    contact_role: 'CTO',
  };

  const result = await discoverInternetSignals({ lead, maxPages: 3, fetchFn: fakeFetch });

  const keys = new Set((result.signals || []).map((entry) => entry.key));
  assert.ok(keys.has('recent_funding'));
  assert.ok(keys.has('strong_growth'));
  assert.ok(keys.has('decision_maker_involved'));
  assert.ok((result.pages_scanned || 0) >= 1);
  assert.ok(Array.isArray(result.findings));
});

test('returns warning when lead has no website', async () => {
  const result = await discoverInternetSignals({
    lead: { contact_role: 'IT Director' },
    fetchFn: fakeFetch,
  });

  assert.ok(Array.isArray(result.warnings));
  assert.ok(result.warnings.includes('missing_website_url'));
});

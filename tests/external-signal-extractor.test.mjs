import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSignalFromFinding, extractSignalsFromFindings } from '../server/services/externalSignalExtractor.js';

test('extracts active_rfp from raw finding text', () => {
  const signal = extractSignalFromFinding({
    lead: { website_url: 'gammafintech.ai' },
    finding: {
      title: 'Gamma Fintech opens RFP for sales automation',
      snippet: 'A new request for proposal was published this week.',
      url: 'https://gammafintech.ai/procurement/rfp-sales-automation',
      published_at: '2026-03-10',
    },
  });

  assert.ok(signal);
  assert.equal(signal.key, 'active_rfp');
  assert.equal(signal.source_type, 'official_company_site');
  assert.ok(Number.isFinite(signal.confidence));
});

test('extracts hard negative closure signal', () => {
  const signal = extractSignalFromFinding({
    finding: {
      title: 'Company closed after insolvency proceedings',
      snippet: 'The business ceased operations according to court filing.',
      url: 'https://finance-news.example/company-closed',
    },
  });

  assert.ok(signal);
  assert.ok(['liquidation_or_bankruptcy', 'closed_or_dead'].includes(signal.key));
});

test('returns empty list when no keyword can be mapped', () => {
  const signals = extractSignalsFromFindings({
    findings: [
      {
        title: 'Weekly community event recap',
        snippet: 'Company shared culture updates and office photos.',
      },
    ],
  });

  assert.equal(signals.length, 0);
});

test('deduplicates identical extracted signals', () => {
  const findings = [
    {
      title: 'Gamma Fintech raises Series B',
      snippet: 'Funding round announced.',
      url: 'https://technews.example/gamma-series-b',
    },
    {
      title: 'Gamma Fintech raises Series B again in roundup',
      snippet: 'Funding round announced.',
      url: 'https://technews.example/gamma-series-b',
    },
  ];

  const signals = extractSignalsFromFindings({ findings });

  assert.equal(signals.length, 1);
  assert.equal(signals[0].key, 'recent_funding');
});

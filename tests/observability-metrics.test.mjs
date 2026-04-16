import test from 'node:test';
import assert from 'node:assert/strict';

import {
  recordCreditsConsumedMetric,
  recordHttpRequestMetric,
  recordLeadAnalyzedMetric,
  recordLlmTokensUsedMetric,
  renderPrometheusMetrics,
  resetMetrics,
} from '../server/lib/metrics.js';
import { logger } from '../server/lib/observability.js';

test.afterEach(() => {
  resetMetrics();
  delete process.env.LOG_LEVEL;
});

test('renderPrometheusMetrics includes request, lead, credit, and token series', () => {
  recordHttpRequestMetric({
    method: 'POST',
    path: '/api/analyze',
    status: 200,
    latencyMs: 84,
  });
  recordLeadAnalyzedMetric({
    action: 'analyze',
    model: 'claude-haiku-4-5-20251001',
  });
  recordCreditsConsumedMetric({
    action: 'analyze',
    amount: 3,
  });
  recordLlmTokensUsedMetric({
    model: 'claude-haiku-4-5-20251001',
    inputTokens: 120,
    outputTokens: 30,
  });

  const output = renderPrometheusMetrics();

  assert.match(output, /http_requests_total\{method="POST",path="\/api\/analyze",status="200"\} 1/);
  assert.match(output, /http_request_duration_ms_bucket\{method="POST",path="\/api\/analyze",le="100"\} 1/);
  assert.match(output, /leads_analyzed_total\{action="analyze",model="claude-haiku-4-5-20251001"\} 1/);
  assert.match(output, /credits_consumed_total\{action="analyze"\} 3/);
  assert.match(output, /llm_tokens_used_total\{model="claude-haiku-4-5-20251001"\} 150/);
});

test('logger respects LOG_LEVEL filtering', () => {
  process.env.LOG_LEVEL = 'warn';

  const originalLog = console.log;
  const originalError = console.error;
  const lines = [];

  console.log = (line) => lines.push({ sink: 'log', line: String(line) });
  console.error = (line) => lines.push({ sink: 'error', line: String(line) });

  try {
    logger.info('info_hidden', { scope: 'test' });
    logger.warn('warn_visible', { scope: 'test' });
    logger.error('error_visible', { scope: 'test' });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  assert.equal(lines.some((entry) => entry.line.includes('"message":"info_hidden"')), false);
  assert.equal(lines.some((entry) => entry.line.includes('"message":"warn_visible"') && entry.sink === 'log'), true);
  assert.equal(lines.some((entry) => entry.line.includes('"message":"error_visible"') && entry.sink === 'error'), true);
});

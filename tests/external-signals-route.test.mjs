import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aimleads-external-signals-'));
const dbPath = path.join(tmpDir, 'db.json');

process.env.NODE_ENV = 'test';
process.env.DATA_PROVIDER = 'local';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.CORS_ORIGIN = '';
process.env.DB_FILE_PATH = dbPath;
process.env.API_RATE_LIMIT_MAX = '2000';
process.env.AUTH_RATE_LIMIT_MAX = '500';

const { default: app } = await import(`../server/app.js?external-signals=${Date.now()}`);

const server = app.listen(0);
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}/api`;

const request = async (pathname, { method = 'GET', body, cookie } = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  return { response, payload };
};

const extractCookie = (response) => {
  const entries = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  if (entries.length > 0) {
    return entries.map((value) => value.split(';')[0]).join('; ');
  }

  const raw = response.headers.get('set-cookie');
  if (!raw) return '';

  return raw
    .split(/,(?=[^;]+=[^;]+)/g)
    .map((value) => value.split(';')[0])
    .join('; ');
};

const registerAndGetCookie = async (prefix) => {
  const email = `${prefix}.${crypto.randomUUID()}@aimleads.local`;
  const result = await request('/auth/register', {
    method: 'POST',
    body: {
      email,
      password: 'Test1234',
      full_name: prefix,
    },
  });

  assert.equal(result.response.status, 201, `register failed for ${email}`);
  const cookie = extractCookie(result.response);
  assert.ok(cookie, 'missing auth cookie');

  return { email, cookie };
};

test('external findings are extracted and trigger re-analysis', async () => {
  const user = await registerAndGetCookie('signals-user');

  const icpSave = await request('/icp/active', {
    method: 'PUT',
    cookie: user.cookie,
    body: {
      name: 'Validation ICP',
      description: 'profile for external signal route test',
      weights: {
        industrie: {
          primaires: ['Software Development'],
          secondaires: ['IT Services and IT Consulting'],
          exclusions: ['Hospital'],
          scores: { parfait: 30, partiel: 15, aucun: -30, exclu: -100 },
        },
        roles: {
          exacts: ['CTO', 'CIO'],
          proches: ['IT Director'],
          exclusions: ['Intern'],
          scores: { parfait: 25, partiel: 10, aucun: -25, exclu: -100 },
        },
        structure: {
          primaire: { min: 50, max: 5000 },
          secondaire: { min: 30, max: 10000 },
          scores: { parfait: 15, partiel: 10, aucun: -20 },
        },
        geo: {
          primaire: ['France'],
          secondaire: ['Belgium'],
          scores: { parfait: 15, partiel: 5, aucun: -10 },
        },
        typeClient: {
          primaire: ['B2B'],
          secondaire: ['B2B2C'],
          scores: { parfait: 25, partiel: 10, aucun: -40 },
        },
        meta: { minScore: 0, maxScore: 100, finalScoreWeights: { icp: 60, ai: 40 } },
      },
    },
  });

  assert.equal(icpSave.response.status, 200);

  const createdLead = await request('/leads', {
    method: 'POST',
    cookie: user.cookie,
    body: {
      company_name: 'Gamma Fintech',
      website_url: 'gammafintech.ai',
      industry: 'Software Development',
      contact_name: 'Nina Dupont',
      contact_role: 'CTO',
      contact_email: 'nina@gammafintech.ai',
      company_size: 180,
      country: 'France',
      client_type: 'B2B',
    },
  });

  assert.equal(createdLead.response.status, 201);
  const leadId = createdLead.payload?.data?.id;
  assert.ok(leadId, 'lead id missing');

  const enrich = await request(`/leads/${leadId}/external-signals`, {
    method: 'POST',
    cookie: user.cookie,
    body: {
      replace: false,
      reanalyze: true,
      findings: [
        {
          title: 'Gamma Fintech opens RFP for sales automation',
          snippet: 'The request for proposal was published this week.',
          url: 'https://gammafintech.ai/procurement/rfp-sales-automation',
          published_at: '2026-03-10',
        },
        {
          title: 'Gamma Fintech raises Series B',
          snippet: 'Funding round announced to accelerate go-to-market.',
          url: 'https://technews.example/gamma-series-b',
          published_at: '2026-03-12',
        },
      ],
    },
  });

  assert.equal(enrich.response.status, 200);
  assert.equal(enrich.payload?.data?.reanalyzed, true);
  assert.ok((enrich.payload?.data?.extracted_from_findings || 0) >= 1);
  assert.ok((enrich.payload?.data?.signals_count || 0) >= 1);

  const updatedLead = enrich.payload?.data?.lead;
  assert.ok(Array.isArray(updatedLead?.internet_signals));
  assert.ok(updatedLead.internet_signals.length >= 1);
  assert.equal(typeof updatedLead.final_score, 'number');
  assert.equal(typeof updatedLead.ai_score, 'number');
  assert.equal(typeof updatedLead.final_recommended_action, 'string');
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(tmpDir, { recursive: true, force: true });
});

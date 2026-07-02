import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aimleads-ai-refund-'));
const dbPath = path.join(tmpDir, 'db.json');

process.env.NODE_ENV = 'test';
process.env.DATA_PROVIDER = 'local';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.CORS_ORIGIN = '';
process.env.DB_FILE_PATH = dbPath;
process.env.API_RATE_LIMIT_MAX = '2000';
process.env.AUTH_RATE_LIMIT_MAX = '500';
delete process.env.ANTHROPIC_API_KEY;

const { default: app } = await import(`../server/app.js?ai-refund=${Date.now()}`);

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

const registerUser = async (email) => {
  const { response, payload } = await request('/auth/register', {
    method: 'POST',
    body: { email, password: 'Test1234!aA', full_name: 'Refund Tester' },
  });
  assert.equal(response.status, 201, `register failed: ${JSON.stringify(payload)}`);
  return extractCookie(response);
};

const getBalance = async (cookie) => {
  const { response, payload } = await request('/workspace/credits', { cookie });
  assert.equal(response.status, 200);
  return Number(payload?.data?.balance);
};

test('AI actions without an LLM key fail closed with AI_NOT_CONFIGURED and refund credits', async (t) => {
  const cookie = await registerUser('refund.user@example.com');

  // Active ICP profile so analyze-signals passes its precondition checks.
  const icpRes = await request('/icp', {
    method: 'POST',
    cookie,
    body: {
      name: 'Refund ICP',
      description: 'test',
      weights: {
        industrie: { primaires: ['SaaS'], exclusions: [] },
        roles: { exacts: ['CEO'], proches: [] },
        geo: { primaire: ['France'] },
        structure: { primaire: { min: 1, max: 1000 } },
      },
    },
  });
  assert.equal(icpRes.response.status, 201, JSON.stringify(icpRes.payload));

  const leadRes = await request('/leads', {
    method: 'POST',
    cookie,
    body: {
      company_name: 'Refund Co',
      industry: 'SaaS',
      country: 'France',
      contact_role: 'CEO',
    },
  });
  assert.equal(leadRes.response.status, 201, JSON.stringify(leadRes.payload));
  const leadId = leadRes.payload?.data?.id;
  assert.ok(leadId);

  const balanceBefore = await getBalance(cookie);
  assert.ok(balanceBefore > 0);

  await t.test('analyze-signals returns 503 AI_NOT_CONFIGURED', async () => {
    const { response, payload } = await request(`/leads/${leadId}/analyze-signals`, {
      method: 'POST',
      cookie,
    });
    assert.equal(response.status, 503);
    assert.equal(payload?.code, 'AI_NOT_CONFIGURED');
  });

  await t.test('credits deducted by the failed action are refunded', async () => {
    const balanceAfter = await getBalance(cookie);
    assert.equal(balanceAfter, balanceBefore);
  });

  await t.test('ICP generation returns 503 AI_NOT_CONFIGURED and refunds', async () => {
    const before = await getBalance(cookie);
    const { response, payload } = await request('/icp/generate', {
      method: 'POST',
      cookie,
      body: { description: 'Editeurs SaaS B2B en France de 10 à 500 salariés vendant aux équipes commerciales.' },
    });
    assert.equal(response.status, 503);
    assert.equal(payload?.code, 'AI_NOT_CONFIGURED');
    assert.equal(await getBalance(cookie), before);
  });
});

test('workspace owner can still grant credits outside production (dev tooling)', async () => {
  const cookie = await registerUser('grant.user@example.com');
  const before = await getBalance(cookie);

  const { response, payload } = await request('/workspace/credits/grant', {
    method: 'POST',
    cookie,
    body: { amount: 25, description: 'test grant' },
  });
  assert.equal(response.status, 200, JSON.stringify(payload));

  const after = await getBalance(cookie);
  assert.equal(after, before + 25);
});

test.after(() => {
  server.close();
});

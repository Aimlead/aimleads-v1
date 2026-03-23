import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aimleads-dev-routes-'));
const dbPath = path.join(tmpDir, 'db.json');

process.env.NODE_ENV = 'test';
process.env.DATA_PROVIDER = 'local';
process.env.SESSION_SECRET = 'test-session-secret-dev';
process.env.CORS_ORIGIN = '';
process.env.DB_FILE_PATH = dbPath;
process.env.API_RATE_LIMIT_MAX = '2000';
process.env.AUTH_RATE_LIMIT_MAX = '500';

const { default: app } = await import(`../server/app.js?dev-routes=${Date.now()}`);

const server = await new Promise((resolve) => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
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
  if (entries.length > 0) return entries.map((value) => value.split(';')[0]).join('; ');
  const raw = response.headers.get('set-cookie');
  if (!raw) return '';
  return raw.split(/,(?=[^;]+=[^;]+)/g).map((value) => value.split(';')[0]).join('; ');
};

const registerAndGetCookie = async (prefix) => {
  const email = `${prefix}.${crypto.randomUUID()}@aimleads.local`;
  const result = await request('/auth/register', {
    method: 'POST',
    body: { email, password: 'Test1234', full_name: prefix },
  });

  assert.equal(result.response.status, 201);
  const cookie = extractCookie(result.response);
  assert.ok(cookie, 'missing auth cookie');
  return { cookie };
};

test('POST /dev/reanalyze awaits analysis results before reporting success', async () => {
  const user = await registerAndGetCookie('dev-reanalyze');

  const createdLead = await request('/leads', {
    method: 'POST',
    cookie: user.cookie,
    body: {
      company_name: 'Dev Route Labs',
      industry: 'Software Development',
      contact_name: 'Alex Martin',
      contact_role: 'CTO',
      company_size: 150,
      country: 'France',
    },
  });

  assert.equal(createdLead.response.status, 201);

  const result = await request('/dev/reanalyze', {
    method: 'POST',
    cookie: user.cookie,
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.payload?.data?.analyzed, 1);

  const leads = await request('/leads', { cookie: user.cookie });
  const lead = leads.payload?.data?.[0];
  assert.equal(typeof lead?.final_score, 'number');
  assert.equal(typeof lead?.ai_score, 'number');
  assert.ok(lead?.last_analyzed_at, 'expected reanalyze to persist analysis fields');
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(tmpDir, { recursive: true, force: true });
});

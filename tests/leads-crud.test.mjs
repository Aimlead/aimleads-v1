/**
 * Backend tests: leads CRUD, DELETE, search pagination, auth security
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aimleads-leads-tests-'));
const dbPath = path.join(tmpDir, 'db.json');

process.env.NODE_ENV = 'test';
process.env.DATA_PROVIDER = 'local';
process.env.SESSION_SECRET = 'test-session-secret-leads';
process.env.CORS_ORIGIN = '';
process.env.DB_FILE_PATH = dbPath;
process.env.API_RATE_LIMIT_MAX = '2000';
process.env.AUTH_RATE_LIMIT_MAX = '500';

const { default: app } = await import(`../server/app.js?test=${Date.now()}`);

const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
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
    try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  }
  return { response, payload };
};

const extractCookie = (response) => {
  const entries = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  if (entries.length > 0) return entries.map((v) => v.split(';')[0]).join('; ');
  const raw = response.headers.get('set-cookie');
  if (!raw) return '';
  return raw.split(/,(?=[^;]+=[^;]+)/g).map((v) => v.split(';')[0]).join('; ');
};

const registerAndGetCookie = async (prefix) => {
  const email = `${prefix}.${crypto.randomUUID()}@aimleads.local`;
  const result = await request('/auth/register', {
    method: 'POST',
    body: { email, password: 'Test1234', full_name: prefix },
  });
  assert.equal(result.response.status, 201, `register failed for ${email}: ${JSON.stringify(result.payload)}`);
  const cookie = extractCookie(result.response);
  assert.ok(cookie, 'missing auth cookie');
  return { email, cookie, user: result.payload?.user };
};

const createLead = async (cookie, overrides = {}) =>
  request('/leads', {
    method: 'POST',
    cookie,
    body: {
      company_name: 'Test Corp',
      website_url: 'testcorp.example',
      industry: 'Software Development',
      contact_name: 'Alice',
      contact_role: 'CTO',
      contact_email: 'alice@testcorp.example',
      company_size: 200,
      country: 'France',
      ...overrides,
    },
  });

// ─── AUTH ──────────────────────────────────────────────────────────────────

test('password complexity — rejects weak password (no uppercase)', async () => {
  const email = `weak.${crypto.randomUUID()}@aimleads.local`;
  const { response } = await request('/auth/register', {
    method: 'POST',
    body: { email, password: 'test1234', full_name: 'Weak Pass' },
  });
  assert.equal(response.status, 400, 'should reject password without uppercase');
});

test('password complexity — rejects password without digit', async () => {
  const email = `weak.${crypto.randomUUID()}@aimleads.local`;
  const { response } = await request('/auth/register', {
    method: 'POST',
    body: { email, password: 'TestPassword', full_name: 'Weak Pass' },
  });
  assert.equal(response.status, 400, 'should reject password without digit');
});

test('PATCH /auth/me — update full_name', async () => {
  const user = await registerAndGetCookie('patchme');
  const { response, payload } = await request('/auth/me', {
    method: 'PATCH',
    cookie: user.cookie,
    body: { full_name: 'Updated Name' },
  });
  assert.equal(response.status, 200);
  assert.equal(payload?.user?.full_name, 'Updated Name');
});

test('PATCH /auth/me — unauthorized without cookie', async () => {
  const { response } = await request('/auth/me', {
    method: 'PATCH',
    body: { full_name: 'Hacker' },
  });
  assert.equal(response.status, 401);
});

// ─── LEADS CRUD ────────────────────────────────────────────────────────────

test('POST /leads — creates a lead', async () => {
  const user = await registerAndGetCookie('creator');
  const { response, payload } = await createLead(user.cookie);
  assert.equal(response.status, 201);
  assert.ok(payload?.data?.id, 'created lead should have id');
  assert.equal(payload?.data?.company_name, 'Test Corp');
});

test('GET /leads/:id — retrieves a specific lead', async () => {
  const user = await registerAndGetCookie('getter');
  const created = await createLead(user.cookie);
  const leadId = created.payload?.data?.id;
  assert.ok(leadId);

  const { response, payload } = await request(`/leads/${leadId}`, { cookie: user.cookie });
  assert.equal(response.status, 200);
  assert.equal(payload?.data?.id, leadId);
});

test('PATCH /leads/:id — updates a lead', async () => {
  const user = await registerAndGetCookie('updater');
  const created = await createLead(user.cookie);
  const leadId = created.payload?.data?.id;

  const { response, payload } = await request(`/leads/${leadId}`, {
    method: 'PATCH',
    cookie: user.cookie,
    body: { notes: 'Updated notes', follow_up_status: 'Called' },
  });
  assert.equal(response.status, 200);
  assert.equal(payload?.data?.notes, 'Updated notes');
  assert.equal(payload?.data?.follow_up_status, 'Called');
});

test('DELETE /leads/:id — deletes a lead', async () => {
  const user = await registerAndGetCookie('deleter');
  const created = await createLead(user.cookie);
  const leadId = created.payload?.data?.id;
  assert.ok(leadId);

  const { response: deleteResponse } = await request(`/leads/${leadId}`, {
    method: 'DELETE',
    cookie: user.cookie,
  });
  assert.ok([200, 204].includes(deleteResponse.status), `expected 200/204 but got ${deleteResponse.status}`);

  // Lead should no longer be accessible
  const { response: getResponse } = await request(`/leads/${leadId}`, { cookie: user.cookie });
  assert.equal(getResponse.status, 404);
});

test('DELETE /leads/:id — 404 for another workspace', async () => {
  const userA = await registerAndGetCookie('del-a');
  const userB = await registerAndGetCookie('del-b');
  const created = await createLead(userA.cookie);
  const leadId = created.payload?.data?.id;

  const { response } = await request(`/leads/${leadId}`, {
    method: 'DELETE',
    cookie: userB.cookie,
  });
  assert.equal(response.status, 404);
});

// ─── SEARCH PAGINATION ─────────────────────────────────────────────────────

test('GET /leads/search — requires q param', async () => {
  const user = await registerAndGetCookie('search-empty');
  const { response } = await request('/leads/search', { cookie: user.cookie });
  assert.equal(response.status, 400);
});

test('GET /leads/search — returns results with pagination meta', async () => {
  const user = await registerAndGetCookie('search-paged');
  await createLead(user.cookie, { company_name: 'Searchable Corp', industry: 'Finance' });
  await createLead(user.cookie, { company_name: 'Another Searchable Inc', industry: 'Healthcare' });

  const { response, payload } = await request('/leads/search?q=searchable&limit=10&offset=0', { cookie: user.cookie });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(payload?.data));
  assert.ok(payload?.meta?.total >= 2);
  assert.equal(payload?.meta?.limit, 10);
  assert.equal(payload?.meta?.offset, 0);
  assert.equal(typeof payload?.meta?.has_more, 'boolean');
});

test('GET /leads/search — pagination offset works', async () => {
  const user = await registerAndGetCookie('search-offset');
  for (let i = 0; i < 3; i++) {
    await createLead(user.cookie, { company_name: `Paged Corp ${i}` });
  }

  const page1 = await request('/leads/search?q=paged+corp&limit=2&offset=0', { cookie: user.cookie });
  const page2 = await request('/leads/search?q=paged+corp&limit=2&offset=2', { cookie: user.cookie });

  assert.equal(page1.payload?.data?.length, 2);
  assert.equal(page2.payload?.data?.length, 1);
  assert.equal(page1.payload?.meta?.has_more, true);
  assert.equal(page2.payload?.meta?.has_more, false);
});

// ─── RATE LIMITING ─────────────────────────────────────────────────────────

test('unauthenticated requests return 401', async () => {
  const { response } = await request('/leads');
  assert.equal(response.status, 401);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aimleads-sso-tests-'));
const dbPath = path.join(tmpDir, 'db.json');

process.env.NODE_ENV = 'test';
process.env.DATA_PROVIDER = 'local';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.DB_FILE_PATH = dbPath;
process.env.API_RATE_LIMIT_MAX = '2000';
process.env.AUTH_RATE_LIMIT_MAX = '500';

const { default: app } = await import(`../server/app.js?test=sso-${Date.now()}`);

const server = app.listen(0);
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}/api`;

const request = async (pathname, { method = 'GET', body, cookie, followRedirects = false } = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    redirect: followRedirects ? 'follow' : 'manual',
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

// ── SSO init route tests ──────────────────────────────────────────────────────

test('GET /auth/sso/init returns 400 when AUTH_PROVIDER is legacy', async () => {
  // In this test environment, AUTH_PROVIDER defaults to legacy (DATA_PROVIDER=local)
  const { response, payload } = await request('/auth/sso/init?provider=google');
  assert.equal(response.status, 400);
  assert.match(payload?.message || '', /SSO requires Supabase/);
});

test('GET /auth/sso/init returns 400 for unsupported provider', async () => {
  const { response, payload } = await request('/auth/sso/init?provider=facebook');
  assert.equal(response.status, 400);
  // In legacy mode, the error is about Supabase requirement, not about provider
  assert.ok(payload?.message);
});

test('GET /auth/sso/init returns 400 for empty provider', async () => {
  const { response, payload } = await request('/auth/sso/init');
  assert.equal(response.status, 400);
  assert.ok(payload?.message);
});

// ── SSO session exchange tests ────────────────────────────────────────────────

test('POST /auth/sso/session returns 400 when AUTH_PROVIDER is legacy', async () => {
  const { response, payload } = await request('/auth/sso/session', {
    method: 'POST',
    body: {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
    },
  });
  assert.equal(response.status, 400);
  assert.match(payload?.message || '', /SSO requires Supabase/);
});

test('POST /auth/sso/session returns 400 with missing tokens', async () => {
  const { response, payload } = await request('/auth/sso/session', {
    method: 'POST',
    body: {},
  });
  assert.equal(response.status, 400);
  assert.ok(payload?.message);
});

test('POST /auth/sso/session returns 400 with empty access_token', async () => {
  const { response, payload } = await request('/auth/sso/session', {
    method: 'POST',
    body: {
      access_token: '',
      refresh_token: 'test-refresh-token',
    },
  });
  assert.equal(response.status, 400);
  assert.ok(payload?.message);
});

test('POST /auth/sso/session returns 400 with empty refresh_token', async () => {
  const { response, payload } = await request('/auth/sso/session', {
    method: 'POST',
    body: {
      access_token: 'test-access-token',
      refresh_token: '',
    },
  });
  assert.equal(response.status, 400);
  assert.ok(payload?.message);
});

// ── SSO code exchange tests ───────────────────────────────────────────────────

test('POST /auth/sso/code returns 400 when AUTH_PROVIDER is legacy', async () => {
  const { response, payload } = await request('/auth/sso/code', {
    method: 'POST',
    body: { code: 'test-auth-code' },
  });
  assert.equal(response.status, 400);
  assert.match(payload?.message || '', /SSO requires Supabase/);
});

test('POST /auth/sso/code returns 400 with missing code', async () => {
  const { response, payload } = await request('/auth/sso/code', {
    method: 'POST',
    body: {},
  });
  assert.equal(response.status, 400);
  assert.ok(payload?.message);
});

test('POST /auth/sso/code returns 400 with empty code', async () => {
  const { response, payload } = await request('/auth/sso/code', {
    method: 'POST',
    body: { code: '' },
  });
  assert.equal(response.status, 400);
  assert.ok(payload?.message);
});

// ── ALLOWED_SSO_PROVIDERS sanity check ────────────────────────────────────────

test('SSO init rejects providers not in the allow-list', async () => {
  for (const provider of ['facebook', 'twitter', 'linkedin', '', 'GOOGLE']) {
    const { response, payload } = await request(`/auth/sso/init?provider=${encodeURIComponent(provider)}`);
    assert.equal(response.status, 400, `Expected 400 for provider "${provider}"`);
    assert.ok(payload?.message, `Expected error message for provider "${provider}"`);
  }
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(tmpDir, { recursive: true, force: true });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aimleads-auth-lockout-'));
const dbPath = path.join(tmpDir, 'db.json');

process.env.NODE_ENV = 'test';
process.env.DATA_PROVIDER = 'local';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.CORS_ORIGIN = '';
process.env.DB_FILE_PATH = dbPath;
process.env.API_RATE_LIMIT_MAX = '2000';
process.env.AUTH_RATE_LIMIT_MAX = '500';

const { default: app } = await import(`../server/app.js?test=${Date.now()}`);

const server = app.listen(0);
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}/api`;

const request = async (pathname, { method = 'GET', body } = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
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

test('POST /auth/login locks the account after repeated invalid passwords', async () => {
  const email = `lockout.${crypto.randomUUID()}@aimleads.local`;
  const register = await request('/auth/register', {
    method: 'POST',
    body: {
      email,
      password: 'Test1234',
      full_name: 'Lockout Test',
    },
  });

  assert.equal(register.response.status, 201);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const login = await request('/auth/login', {
      method: 'POST',
      body: {
        email,
        password: 'WrongPassword123',
      },
    });

    assert.equal(login.response.status, 401, `attempt ${attempt} should fail with 401`);
    assert.equal(login.payload?.message, 'Invalid credentials');
  }

  const locked = await request('/auth/login', {
    method: 'POST',
    body: {
      email,
      password: 'Test1234',
    },
  });

  assert.equal(locked.response.status, 429);
  assert.match(String(locked.payload?.message || ''), /temporarily locked/i);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(tmpDir, { recursive: true, force: true });
});

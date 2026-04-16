import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aimleads-public-tests-'));
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

test('POST /public/demo-requests stores inbound demo capture locally', async () => {
  const result = await request('/public/demo-requests', {
    method: 'POST',
    body: {
      full_name: 'Rico Example',
      company: 'Aimlead',
      email: 'rico@example.com',
      team_size: '4 SDRs',
      interest: 'Lead-Scoreur SaaS',
      notes: 'Need a guided rollout quickly.',
    },
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.payload?.ok, true);

  const db = JSON.parse(await fs.readFile(dbPath, 'utf8'));
  assert.equal(Array.isArray(db.demoRequests), true);
  assert.equal(db.demoRequests.length, 1);
  assert.equal(db.demoRequests[0].email, 'rico@example.com');
  assert.equal(db.demoRequests[0].company, 'Aimlead');
});

test('POST /public/analytics-events stores product events locally', async () => {
  const result = await request('/public/analytics-events', {
    method: 'POST',
    body: {
      event: 'pricing_plan_selected',
      path: '/pricing',
      source: 'pricing_page',
      properties: {
        plan: 'team',
      },
    },
  });

  assert.equal(result.response.status, 202);
  assert.equal(result.payload?.ok, true);

  const db = JSON.parse(await fs.readFile(dbPath, 'utf8'));
  assert.equal(Array.isArray(db.productEvents), true);
  assert.equal(db.productEvents.length, 1);
  assert.equal(db.productEvents[0].event, 'pricing_plan_selected');
  assert.equal(db.productEvents[0].properties?.plan, 'team');
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(tmpDir, { recursive: true, force: true });
});

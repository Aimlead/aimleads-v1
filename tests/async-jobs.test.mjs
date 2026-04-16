import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aimleads-async-jobs-'));
const dbPath = path.join(tmpDir, 'db.json');

process.env.NODE_ENV = 'test';
process.env.DATA_PROVIDER = 'local';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.CORS_ORIGIN = '';
process.env.DB_FILE_PATH = dbPath;
process.env.API_RATE_LIMIT_MAX = '2000';
process.env.AUTH_RATE_LIMIT_MAX = '500';

const { default: app } = await import(`../server/app.js?test=${Date.now()}`);
const { __resetJobsForTests } = await import('../server/lib/queue.js');

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

  return { email, cookie, user: result.payload?.user };
};

const waitForJobCompletion = async (cookie, jobId) => {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const status = await request(`/jobs/${jobId}/status`, { cookie });
    assert.equal(status.response.status, 200);

    const job = status.payload?.data;
    if (job?.status === 'completed' || job?.status === 'failed') {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  throw new Error(`Job ${jobId} did not complete within timeout`);
};

test('workspace async_jobs flag queues reanalyze jobs and exposes polling status', async () => {
  __resetJobsForTests();
  const user = await registerAndGetCookie('async-owner');

  const enableFlag = await request('/workspace/feature-flags/async_jobs', {
    method: 'PUT',
    cookie: user.cookie,
    body: { enabled: true },
  });

  assert.equal(enableFlag.response.status, 200);
  assert.equal(enableFlag.payload?.data?.enabled, true);

  const icpSave = await request('/icp/active', {
    method: 'PUT',
    cookie: user.cookie,
    body: {
      name: 'Async ICP',
      description: 'profile for async jobs test',
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
      company_name: 'Async Labs',
      industry: 'Software Development',
      contact_name: 'Alex Martin',
      contact_role: 'CTO',
      company_size: 170,
      country: 'France',
      client_type: 'B2B',
    },
  });

  assert.equal(createdLead.response.status, 201);
  const leadId = createdLead.payload?.data?.id;
  assert.ok(leadId, 'lead id missing');

  const queued = await request(`/leads/${leadId}/reanalyze`, {
    method: 'POST',
    cookie: user.cookie,
    body: {
      async: true,
    },
  });

  assert.equal(queued.response.status, 202);
  assert.equal(queued.payload?.data?.status, 'queued');
  assert.match(String(queued.payload?.data?.jobId || ''), /^job_/);

  const completedJob = await waitForJobCompletion(user.cookie, queued.payload?.data?.jobId);
  assert.equal(completedJob.status, 'completed');
  assert.equal(completedJob.action, 'reanalyze');
  assert.equal(completedJob.lead_id, leadId);
  assert.equal(completedJob.result?.data?.lead?.id, leadId);
  assert.equal(typeof completedJob.result?.data?.analysis?.final_score, 'number');
});

test.after(async () => {
  __resetJobsForTests();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(tmpDir, { recursive: true, force: true });
});

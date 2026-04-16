import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aimleads-tests-'));
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

test('health endpoint works', async () => {
  const { response, payload } = await request('/health');
  assert.equal(response.status, 200);
  assert.equal(payload?.status, 'ok');
  assert.ok(response.headers.get('x-aimleads-version'));
  assert.ok(response.headers.get('cache-control')?.includes('no-store'));
  assert.ok(payload?.build?.version);
});

test('metrics endpoint exposes prometheus-compatible metrics', async () => {
  const response = await fetch(`${baseUrl}/metrics`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.ok(response.headers.get('content-type')?.includes('text/plain'));
  assert.match(body, /# HELP http_requests_total/);
  assert.match(body, /# TYPE http_request_duration_ms histogram/);
  assert.match(body, /http_requests_total\{/);
});

test('workspace isolation for leads', async () => {
  const userA = await registerAndGetCookie('userA');
  const userB = await registerAndGetCookie('userB');

  const createdLead = await request('/leads', {
    method: 'POST',
    cookie: userA.cookie,
    body: {
      company_name: 'Isolation Corp',
      website_url: 'isolation.test',
      industry: 'Software Development',
      contact_name: 'Jane Doe',
      contact_role: 'CTO',
      contact_email: 'jane@isolation.test',
      company_size: 120,
      country: 'France',
    },
  });

  assert.equal(createdLead.response.status, 201);
  const leadId = createdLead.payload?.data?.id;
  assert.ok(leadId, 'created lead id missing');

  const userALeeds = await request('/leads', { cookie: userA.cookie });
  const userBLeads = await request('/leads', { cookie: userB.cookie });

  assert.equal(userALeeds.response.status, 200);
  assert.equal(userBLeads.response.status, 200);
  assert.equal((userALeeds.payload?.data || []).length, 1);
  assert.equal((userBLeads.payload?.data || []).length, 0);

  const forbiddenRead = await request(`/leads/${leadId}`, { cookie: userB.cookie });
  assert.equal(forbiddenRead.response.status, 404);

  const forbiddenPatch = await request(`/leads/${leadId}`, {
    method: 'PATCH',
    cookie: userB.cookie,
    body: { notes: 'malicious update' },
  });
  assert.equal(forbiddenPatch.response.status, 404);
});

test('workspace isolation for icp + analyze', async () => {
  const userA = await registerAndGetCookie('icpA');
  const userB = await registerAndGetCookie('icpB');

  const icpSave = await request('/icp/active', {
    method: 'PUT',
    cookie: userA.cookie,
    body: {
      name: 'A ICP',
      description: 'workspace A profile',
      weights: {
        industrie: {
          primaires: ['Software Development'],
          secondaires: [],
          exclusions: [],
          scores: { parfait: 30, partiel: 15, aucun: -30, exclu: -100 },
        },
        roles: {
          exacts: ['CTO'],
          proches: ['Director'],
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
          secondaire: [],
          scores: { parfait: 15, partiel: 5, aucun: -10 },
        },
        typeClient: {
          primaire: ['B2B'],
          secondaire: [],
          scores: { parfait: 25, partiel: 10, aucun: -40 },
        },
        meta: { minScore: 0, maxScore: 100, finalScoreWeights: { icp: 60, ai: 40 } },
      },
    },
  });

  assert.equal(icpSave.response.status, 200);
  const icpId = icpSave.payload?.data?.id;
  assert.ok(icpId, 'icp id missing');

  const bIcpList = await request('/icp', { cookie: userB.cookie });
  assert.equal(bIcpList.response.status, 200);
  assert.equal((bIcpList.payload?.data || []).length, 0);

  const analysis = await request('/analyze', {
    method: 'POST',
    cookie: userB.cookie,
    body: {
      icp_profile_id: icpId,
      lead: {
        company_name: 'Forbidden Analyze',
        website_url: 'forbidden.test',
        industry: 'Software Development',
        company_size: 120,
        country: 'France',
        contact_name: 'John Doe',
        contact_role: 'CTO',
        contact_email: 'john@forbidden.test',
      },
    },
  });

  assert.equal(analysis.response.status, 400);
  assert.equal(analysis.payload?.message, 'No active ICP profile found');
});

test('POST /analyze records a workspace-scoped ai_run entry', async () => {
  const user = await registerAndGetCookie('airun-analyze');

  const icpSave = await request('/icp/active', {
    method: 'PUT',
    cookie: user.cookie,
    body: {
      name: 'AI Run ICP',
      description: 'profile for ai run test',
      weights: {
        industrie: {
          primaires: ['Software Development'],
          secondaires: [],
          exclusions: [],
          scores: { parfait: 30, partiel: 15, aucun: -30, exclu: -100 },
        },
        roles: {
          exacts: ['CTO'],
          proches: ['Director'],
          exclusions: ['Intern'],
          scores: { parfait: 25, partiel: 10, aucun: -25, exclu: -100 },
        },
        structure: {
          primaire: { min: 10, max: 5000 },
          secondaire: { min: 1, max: 10000 },
          scores: { parfait: 15, partiel: 10, aucun: -20 },
        },
        geo: {
          primaire: ['France'],
          secondaire: [],
          scores: { parfait: 15, partiel: 5, aucun: -10 },
        },
        typeClient: {
          primaire: ['B2B'],
          secondaire: [],
          scores: { parfait: 25, partiel: 10, aucun: -40 },
        },
        meta: { minScore: 0, maxScore: 100, finalScoreWeights: { icp: 60, ai: 40 } },
      },
    },
  });
  assert.equal(icpSave.response.status, 200);

  const analyzeResponse = await request('/analyze', {
    method: 'POST',
    cookie: user.cookie,
    body: {
      lead: {
        company_name: 'AI Run Corp',
        website_url: 'ai-run.test',
        industry: 'Software Development',
        company_size: 120,
        country: 'France',
        contact_name: 'Ada Lovelace',
        contact_role: 'CTO',
        contact_email: 'ada@ai-run.test',
        client_type: 'B2B',
      },
    },
  });

  assert.equal(analyzeResponse.response.status, 200);
  assert.equal(typeof analyzeResponse.payload?.data?.final_score, 'number');

  const aiRunsResponse = await request('/workspace/ai-runs', {
    cookie: user.cookie,
  });

  assert.equal(aiRunsResponse.response.status, 200);
  assert.equal(Array.isArray(aiRunsResponse.payload?.data), true);
  assert.equal(aiRunsResponse.payload?.data?.length, 1);
  assert.equal(aiRunsResponse.payload?.data?.[0]?.action, 'analyze');
  assert.equal(aiRunsResponse.payload?.data?.[0]?.status, 'completed');
  assert.equal(aiRunsResponse.payload?.data?.[0]?.workspace_id, user.user?.workspace_id);
});

test('DELETE /auth/me deletes the account without wiping workspace leads', async () => {
  const user = await registerAndGetCookie('selfdelete');

  const createdLead = await request('/leads', {
    method: 'POST',
    cookie: user.cookie,
    body: {
      company_name: 'Delete Safety Corp',
      website_url: 'delete-safety.test',
      industry: 'Software Development',
      contact_name: 'Nora Safety',
      contact_role: 'CTO',
      contact_email: 'nora@delete-safety.test',
      company_size: 40,
      country: 'France',
    },
  });

  assert.equal(createdLead.response.status, 201);
  const leadId = createdLead.payload?.data?.id;
  assert.ok(leadId, 'created lead id missing');

  const deleted = await request('/auth/me', {
    method: 'DELETE',
    cookie: user.cookie,
  });

  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.payload?.message, 'Account deleted. Workspace data was not deleted.');

  const db = JSON.parse(await fs.readFile(dbPath, 'utf8'));
  assert.equal((db.users || []).some((entry) => entry.id === user.user?.id), false, 'user should be deleted');
  assert.equal((db.leads || []).some((entry) => entry.id === leadId), true, 'workspace leads should remain intact');
});

test('POST /auth/reset-password/complete is unavailable in legacy auth mode but no longer 404s', async () => {
  const { response, payload } = await request('/auth/reset-password/complete', {
    method: 'POST',
    body: {
      access_token: 'legacy-access',
      refresh_token: 'legacy-refresh',
      new_password: 'Reset123',
    },
  });

  assert.equal(response.status, 400);
  assert.equal(payload?.message, 'Password recovery is only available with Supabase Auth.');
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(tmpDir, { recursive: true, force: true });
});

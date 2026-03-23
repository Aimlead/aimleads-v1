import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aimleads-audit-tests-'));
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

const registerAndGetCookie = async (prefix, emailOverride = '') => {
  const email = emailOverride || `${prefix}.${crypto.randomUUID()}@aimleads.local`;
  const result = await request('/auth/register', {
    method: 'POST',
    body: {
      email,
      password: 'Test1234',
      full_name: prefix,
    },
  });

  assert.equal(result.response.status, 201, `register failed for ${email}: ${JSON.stringify(result.payload)}`);
  const cookie = extractCookie(result.response);
  assert.ok(cookie, 'missing auth cookie');

  return { email, cookie, user: result.payload?.user };
};

const listAuditEntries = async (cookie) => {
  const audit = await request('/audit?limit=100', { cookie });
  assert.equal(audit.response.status, 200);
  return audit.payload?.data || [];
};

test('audit log captures workspace governance actions and sensitive exports', async () => {
  const owner = await registerAndGetCookie('audit-owner');
  const firstInviteEmail = `invite.${crypto.randomUUID()}@aimleads.local`;

  const createdInvite = await request('/workspace/invites', {
    method: 'POST',
    cookie: owner.cookie,
    body: {
      email: firstInviteEmail,
      role: 'member',
    },
  });

  assert.equal(createdInvite.response.status, 201);
  const firstInviteId = createdInvite.payload?.data?.id;
  assert.ok(firstInviteId, 'expected invite id');

  let entries = await listAuditEntries(owner.cookie);
  const inviteCreateEntry = entries.find((entry) => entry.resource_type === 'workspace_invite' && entry.action === 'create' && entry.resource_id === firstInviteId);
  assert.ok(inviteCreateEntry, 'expected invite creation audit entry');
  assert.equal(inviteCreateEntry?.changes?.email, firstInviteEmail);
  assert.equal(inviteCreateEntry?.changes?.role, 'member');

  const revokedInvite = await request(`/workspace/invites/${encodeURIComponent(firstInviteId)}`, {
    method: 'DELETE',
    cookie: owner.cookie,
  });

  assert.equal(revokedInvite.response.status, 200);

  entries = await listAuditEntries(owner.cookie);
  const inviteDeleteEntry = entries.find((entry) => entry.resource_type === 'workspace_invite' && entry.action === 'delete' && entry.resource_id === firstInviteId);
  assert.ok(inviteDeleteEntry, 'expected invite revoke audit entry');
  assert.equal(inviteDeleteEntry?.changes?.email, firstInviteEmail);

  const teammateEmail = `member.${crypto.randomUUID()}@aimleads.local`;
  const teammateInvite = await request('/workspace/invites', {
    method: 'POST',
    cookie: owner.cookie,
    body: {
      email: teammateEmail,
      role: 'member',
    },
  });

  assert.equal(teammateInvite.response.status, 201);
  const teammate = await registerAndGetCookie('audit-member', teammateEmail);

  const roleUpdate = await request(`/workspace/members/${encodeURIComponent(teammate.user?.id)}/role`, {
    method: 'PATCH',
    cookie: owner.cookie,
    body: {
      role: 'admin',
    },
  });

  assert.equal(roleUpdate.response.status, 200);

  entries = await listAuditEntries(owner.cookie);
  const memberUpdateEntry = entries.find((entry) => entry.resource_type === 'workspace_member' && entry.action === 'update' && entry.resource_id === teammate.user?.id);
  assert.ok(memberUpdateEntry, 'expected workspace member role-change audit entry');
  assert.equal(memberUpdateEntry?.changes?.email, teammateEmail);
  assert.equal(memberUpdateEntry?.changes?.previous_role, 'member');
  assert.equal(memberUpdateEntry?.changes?.role, 'admin');

  const createdLead = await request('/leads', {
    method: 'POST',
    cookie: owner.cookie,
    body: {
      company_name: 'Audit Export Inc',
      website_url: 'https://audit-export.example',
      source_list: 'security-tests',
    },
  });

  assert.equal(createdLead.response.status, 201);

  const accountExport = await request('/auth/me/export', {
    cookie: owner.cookie,
  });

  assert.equal(accountExport.response.status, 200);

  const leadsExport = await request('/leads/export', {
    cookie: owner.cookie,
  });

  assert.equal(leadsExport.response.status, 200);

  entries = await listAuditEntries(owner.cookie);
  const accountExportEntry = entries.find((entry) => entry.resource_type === 'user_data' && entry.action === 'export');
  assert.ok(accountExportEntry, 'expected account export audit entry');
  assert.equal(accountExportEntry?.changes?.email, owner.email);
  assert.equal(accountExportEntry?.changes?.lead_count, 1);

  const leadsExportEntry = entries.find((entry) => entry.resource_type === 'lead_export' && entry.action === 'export');
  assert.ok(leadsExportEntry, 'expected lead export audit entry');
  assert.equal(leadsExportEntry?.changes?.exported_count, 1);
  assert.equal(leadsExportEntry?.changes?.fields > 0, true);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(tmpDir, { recursive: true, force: true });
});

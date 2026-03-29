import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aimleads-workspace-tests-'));
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

test('invited teammate joins the inviter workspace and clears pending invite', async () => {
  const owner = await registerAndGetCookie('owner');
  const invitedEmail = `invitee.${crypto.randomUUID()}@aimleads.local`;

  const createdInvite = await request('/workspace/invites', {
    method: 'POST',
    cookie: owner.cookie,
    body: {
      email: invitedEmail,
      role: 'admin',
    },
  });

  assert.equal(createdInvite.response.status, 201);
  assert.equal(createdInvite.payload?.data?.email, invitedEmail);
  assert.equal(createdInvite.payload?.data?.role, 'admin');

  const invitesBeforeJoin = await request('/workspace/invites', { cookie: owner.cookie });
  assert.equal(invitesBeforeJoin.response.status, 200);
  assert.equal(invitesBeforeJoin.payload?.data?.length, 1);

  const invitedUser = await registerAndGetCookie('invitee', invitedEmail);
  assert.equal(invitedUser.user?.workspace_id, owner.user?.workspace_id);

  const members = await request('/workspace/members', { cookie: owner.cookie });
  assert.equal(members.response.status, 200);
  assert.equal(members.payload?.data?.length, 2);
  const joinedMember = members.payload?.data?.find((member) => member.email === invitedEmail);
  assert.equal(joinedMember?.role, 'admin');

  const invitesAfterJoin = await request('/workspace/invites', { cookie: owner.cookie });
  assert.equal(invitesAfterJoin.response.status, 200);
  assert.equal(invitesAfterJoin.payload?.data?.length, 0);
});

test('owner can update a member role and safely remove the teammate from workspace access', async () => {
  const owner = await registerAndGetCookie('role-owner');
  const teammateEmail = `teammate.${crypto.randomUUID()}@aimleads.local`;

  const invite = await request('/workspace/invites', {
    method: 'POST',
    cookie: owner.cookie,
    body: {
      email: teammateEmail,
      role: 'member',
    },
  });

  assert.equal(invite.response.status, 201);
  const teammate = await registerAndGetCookie('teammate', teammateEmail);

  const roleUpdate = await request(`/workspace/members/${encodeURIComponent(teammate.user?.id)}/role`, {
    method: 'PATCH',
    cookie: owner.cookie,
    body: {
      role: 'admin',
    },
  });

  assert.equal(roleUpdate.response.status, 200);
  assert.equal(roleUpdate.payload?.data?.role, 'admin');

  const removed = await request(`/workspace/members/${encodeURIComponent(teammate.user?.id)}`, {
    method: 'DELETE',
    cookie: owner.cookie,
  });

  assert.equal(removed.response.status, 200);
  assert.equal(removed.payload?.data?.removed_from_workspace, true);
  assert.equal(removed.payload?.data?.email, teammateEmail);

  const membersAfterRemoval = await request('/workspace/members', { cookie: owner.cookie });
  assert.equal(membersAfterRemoval.response.status, 200);
  assert.equal(membersAfterRemoval.payload?.data?.length, 1);
  assert.equal(membersAfterRemoval.payload?.data?.some((member) => member.email === teammateEmail), false);

  const removedMemberInvites = await request('/workspace/invites', { cookie: teammate.cookie });
  assert.equal(removedMemberInvites.response.status, 403);
  assert.equal(removedMemberInvites.payload?.message, 'Unable to verify your workspace membership.');
});

test('owner can transfer ownership and the former owner can then delete their account safely', async () => {
  const owner = await registerAndGetCookie('transfer-owner');
  const teammateEmail = `transfer-target.${crypto.randomUUID()}@aimleads.local`;

  const invite = await request('/workspace/invites', {
    method: 'POST',
    cookie: owner.cookie,
    body: {
      email: teammateEmail,
      role: 'member',
    },
  });

  assert.equal(invite.response.status, 201);
  const teammate = await registerAndGetCookie('transfer-target', teammateEmail);

  const transfer = await request(`/workspace/members/${encodeURIComponent(teammate.user?.id)}/transfer-ownership`, {
    method: 'POST',
    cookie: owner.cookie,
  });

  assert.equal(transfer.response.status, 200);
  assert.equal(transfer.payload?.data?.new_owner?.email, teammateEmail);
  assert.equal(transfer.payload?.data?.new_owner?.role, 'owner');
  assert.equal(transfer.payload?.data?.previous_owner?.role, 'admin');

  const membersAfterTransfer = await request('/workspace/members', { cookie: owner.cookie });
  assert.equal(membersAfterTransfer.response.status, 200);

  const formerOwner = membersAfterTransfer.payload?.data?.find((member) => member.email === owner.email);
  const newOwner = membersAfterTransfer.payload?.data?.find((member) => member.email === teammateEmail);
  assert.equal(formerOwner?.role, 'admin');
  assert.equal(newOwner?.role, 'owner');

  const deletion = await request('/auth/me', {
    method: 'DELETE',
    cookie: owner.cookie,
  });

  assert.equal(deletion.response.status, 200);

  const remainingMembers = await request('/workspace/members', { cookie: teammate.cookie });
  assert.equal(remainingMembers.response.status, 200);
  assert.equal(remainingMembers.payload?.data?.length, 1);
  assert.equal(remainingMembers.payload?.data?.[0]?.email, teammateEmail);
  assert.equal(remainingMembers.payload?.data?.[0]?.role, 'owner');
});

test('admin can invite a member but cannot invite another admin', async () => {
  const owner = await registerAndGetCookie('admin-owner');
  const adminEmail = `admin.${crypto.randomUUID()}@aimleads.local`;

  const inviteAdmin = await request('/workspace/invites', {
    method: 'POST',
    cookie: owner.cookie,
    body: {
      email: adminEmail,
      role: 'admin',
    },
  });

  assert.equal(inviteAdmin.response.status, 201);
  const adminUser = await registerAndGetCookie('admin-user', adminEmail);

  const forbiddenInvite = await request('/workspace/invites', {
    method: 'POST',
    cookie: adminUser.cookie,
    body: {
      email: `second-admin.${crypto.randomUUID()}@aimleads.local`,
      role: 'admin',
    },
  });

  assert.equal(forbiddenInvite.response.status, 403);

  const allowedInvite = await request('/workspace/invites', {
    method: 'POST',
    cookie: adminUser.cookie,
    body: {
      email: `member.${crypto.randomUUID()}@aimleads.local`,
      role: 'member',
    },
  });

  assert.equal(allowedInvite.response.status, 201);
});

test('DELETE /auth/me blocks deleting the last owner when other members exist', async () => {
  const owner = await registerAndGetCookie('delete-owner');
  const teammateEmail = `delete-member.${crypto.randomUUID()}@aimleads.local`;

  const invite = await request('/workspace/invites', {
    method: 'POST',
    cookie: owner.cookie,
    body: {
      email: teammateEmail,
      role: 'member',
    },
  });

  assert.equal(invite.response.status, 201);
  await registerAndGetCookie('delete-member', teammateEmail);

  const deletion = await request('/auth/me', {
    method: 'DELETE',
    cookie: owner.cookie,
  });

  assert.equal(deletion.response.status, 400);
  assert.equal(deletion.payload?.message, 'Transfer ownership before deleting the last owner account.');
});

test('access-management routes fail closed when workspace membership cannot be verified', async () => {
  const owner = await registerAndGetCookie('membership-owner');
  const raw = JSON.parse(await fs.readFile(dbPath, 'utf8'));
  raw.workspaceMembers = [];
  await fs.writeFile(dbPath, JSON.stringify(raw, null, 2), 'utf8');

  const inviteList = await request('/workspace/invites', { cookie: owner.cookie });
  assert.equal(inviteList.response.status, 403);
  assert.equal(inviteList.payload?.message, 'Unable to verify your workspace membership.');

  const deletion = await request('/auth/me', {
    method: 'DELETE',
    cookie: owner.cookie,
  });
  assert.equal(deletion.response.status, 409);
  assert.equal(
    deletion.payload?.message,
    'Unable to verify workspace ownership. Please contact support before deleting this account.'
  );
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(tmpDir, { recursive: true, force: true });
});

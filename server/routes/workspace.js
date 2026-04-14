import express from 'express';
import { requireAuth, wrapAsyncRoutes } from '../lib/middleware.js';
import { dataStore, getDataStoreRuntime } from '../lib/dataStore.js';
import { getAuthProvider, getDataProvider, getRuntimeConfig } from '../lib/config.js';
import { schemas, validateBody } from '../lib/validation.js';
import { writeAuditLog } from '../lib/auditLog.js';
import { getUserWorkspaceId } from '../lib/scope.js';
import { getCircuitBreakerStatus } from '../services/llmService.js';
import { listCrmIntegrations } from '../services/crmService.js';
import { getBalance, grantCredits, getTransactionHistory, getWorkspacePlan, CREDIT_COSTS } from '../lib/credits.js';

const router = express.Router();
wrapAsyncRoutes(router);

const MANAGE_INVITES_ROLES = new Set(['owner', 'admin']);
const MANAGE_ROLES_ROLES = new Set(['owner']);

const resolveCurrentWorkspaceAccess = async (user) => {
  const members = await dataStore.listWorkspaceMembers(user);
  const membershipUserId = String(user?.supabase_auth_id || user?.id || '').trim();
  const appUserId = String(user?.id || '').trim();

  const currentMember =
    members.find((member) => String(member.user_id || '').trim() === membershipUserId)
    || members.find((member) => String(member.app_user_id || '').trim() === appUserId)
    || null;

  return {
    members,
    currentMember,
    currentRole: currentMember?.role || null,
  };
};

const deny = (res, message = 'Forbidden') => res.status(403).json({ message });

router.get('/members', requireAuth, async (req, res) => {
  const user = req.user;
  const workspaceId = getUserWorkspaceId(user);

  try {
    const members = await dataStore.listWorkspaceMembers(user);
    return res.json({ data: members });
  } catch {
    return res.json({
      data: [
        {
          user_id: user.id,
          app_user_id: user.id,
          supabase_auth_id: user.supabase_auth_id || null,
          workspace_id: workspaceId,
          email: user.email,
          full_name: user.full_name,
          role: 'owner',
          created_at: user.created_at,
          is_current_user: true,
        },
      ],
    });
  }
});

router.get('/invites', requireAuth, async (req, res) => {
  const { currentRole } = await resolveCurrentWorkspaceAccess(req.user);
  if (!currentRole) {
    return deny(res, 'Unable to verify your workspace membership.');
  }
  if (!MANAGE_INVITES_ROLES.has(currentRole)) {
    return deny(res, 'Only workspace owners and admins can view pending invites.');
  }

  const invites = await dataStore.listWorkspaceInvites(req.user);
  return res.json({ data: invites });
});

router.post('/invites', requireAuth, validateBody(schemas.workspaceInviteCreateSchema), async (req, res) => {
  const { currentRole } = await resolveCurrentWorkspaceAccess(req.user);
  if (!currentRole) {
    return deny(res, 'Unable to verify your workspace membership.');
  }
  if (!MANAGE_INVITES_ROLES.has(currentRole)) {
    return deny(res, 'Only workspace owners and admins can invite teammates.');
  }

  const email = String(req.validatedBody.email || '').trim().toLowerCase();
  const requestedRole = String(req.validatedBody.role || 'member').trim().toLowerCase();
  if (email === String(req.user?.email || '').trim().toLowerCase()) {
    return res.status(400).json({ message: 'You are already part of this workspace.' });
  }

  if (currentRole === 'admin' && requestedRole !== 'member') {
    return deny(res, 'Admins can invite members only.');
  }

  const invite = await dataStore.createWorkspaceInvite(req.user, req.validatedBody);
  await writeAuditLog({
    user: req.user,
    action: 'create',
    resourceType: 'workspace_invite',
    resourceId: invite.id,
    changes: {
      email: invite.email,
      role: invite.role,
      status: invite.status,
    },
  });
  return res.status(201).json({ data: invite });
});

router.delete('/invites/:inviteId', requireAuth, async (req, res) => {
  const { currentRole } = await resolveCurrentWorkspaceAccess(req.user);
  if (!currentRole) {
    return deny(res, 'Unable to verify your workspace membership.');
  }
  if (!MANAGE_INVITES_ROLES.has(currentRole)) {
    return deny(res, 'Only workspace owners and admins can revoke invites.');
  }

  const invite = await dataStore.revokeWorkspaceInvite(req.user, req.params.inviteId);
  if (!invite) {
    return res.status(404).json({ message: 'Invite not found' });
  }

  await writeAuditLog({
    user: req.user,
    action: 'delete',
    resourceType: 'workspace_invite',
    resourceId: invite.id,
    changes: {
      email: invite.email,
      role: invite.role,
      status: invite.status,
    },
  });
  return res.json({ data: invite });
});

router.patch('/members/:memberUserId/role', requireAuth, validateBody(schemas.workspaceMemberRoleUpdateSchema), async (req, res) => {
  const { currentRole, members } = await resolveCurrentWorkspaceAccess(req.user);
  if (!currentRole) {
    return deny(res, 'Unable to verify your workspace membership.');
  }
  if (!MANAGE_ROLES_ROLES.has(currentRole)) {
    return deny(res, 'Only workspace owners can change member roles.');
  }

  const memberUserId = String(req.params.memberUserId || '').trim();
  const currentMembershipUserId = String(req.user?.supabase_auth_id || req.user?.id || '').trim();
  if (memberUserId === currentMembershipUserId) {
    return res.status(400).json({ message: 'Owners cannot change their own role from this screen.' });
  }

  const targetMember = members.find((member) => String(member.user_id || '').trim() === memberUserId);
  if (!targetMember) {
    return res.status(404).json({ message: 'Member not found' });
  }

  if (targetMember.role === 'owner') {
    return res.status(400).json({ message: 'Owner role transfers are not supported yet.' });
  }

  const updated = await dataStore.updateWorkspaceMemberRole(req.user, memberUserId, req.validatedBody.role);
  if (!updated) {
    return res.status(404).json({ message: 'Member not found' });
  }

  await writeAuditLog({
    user: req.user,
    action: 'update',
    resourceType: 'workspace_member',
    resourceId: updated.user_id || memberUserId,
    changes: {
      email: updated.email,
      previous_role: targetMember.role,
      role: updated.role,
    },
  });
  return res.json({ data: updated });
});

router.post('/members/:memberUserId/transfer-ownership', requireAuth, async (req, res) => {
  const { currentRole, currentMember, members } = await resolveCurrentWorkspaceAccess(req.user);
  if (!currentRole) {
    return deny(res, 'Unable to verify your workspace membership.');
  }
  if (currentRole !== 'owner' || !currentMember) {
    return deny(res, 'Only workspace owners can transfer ownership.');
  }

  const targetMemberUserId = String(req.params.memberUserId || '').trim();
  if (!targetMemberUserId) {
    return res.status(400).json({ message: 'Target member is required.' });
  }

  const currentMembershipUserId = String(currentMember.user_id || req.user?.supabase_auth_id || req.user?.id || '').trim();
  if (targetMemberUserId === currentMembershipUserId) {
    return res.status(400).json({ message: 'You already own this workspace.' });
  }

  const targetMember = members.find((member) => String(member.user_id || '').trim() === targetMemberUserId);
  if (!targetMember) {
    return res.status(404).json({ message: 'Member not found' });
  }

  if (targetMember.role === 'owner') {
    return res.status(400).json({ message: 'This member already owns the workspace.' });
  }

  const promotedMember = await dataStore.updateWorkspaceMemberRole(req.user, targetMemberUserId, 'owner');
  if (!promotedMember) {
    return res.status(404).json({ message: 'Member not found' });
  }

  const demotedCurrentMember = await dataStore.updateWorkspaceMemberRole(req.user, currentMembershipUserId, 'admin');
  if (!demotedCurrentMember) {
    return res.status(500).json({
      message: 'Ownership transfer could not be fully completed. The new owner was promoted, but your role could not be updated.',
    });
  }

  await writeAuditLog({
    user: req.user,
    action: 'update',
    resourceType: 'workspace_member',
    resourceId: promotedMember.user_id || targetMemberUserId,
    changes: {
      transfer_ownership: true,
      previous_owner_email: currentMember.email || req.user?.email || '',
      previous_owner_role: currentMember.role,
      new_owner_email: promotedMember.email || targetMember.email || '',
      previous_role: targetMember.role,
      role: promotedMember.role,
    },
  });

  return res.json({
    data: {
      previous_owner: {
        user_id: demotedCurrentMember.user_id || currentMembershipUserId,
        email: demotedCurrentMember.email || currentMember.email || req.user?.email || '',
        role: demotedCurrentMember.role,
      },
      new_owner: promotedMember,
    },
  });
});

router.delete('/members/:memberUserId', requireAuth, async (req, res) => {
  const { currentRole, currentMember, members } = await resolveCurrentWorkspaceAccess(req.user);
  if (!currentRole) {
    return deny(res, 'Unable to verify your workspace membership.');
  }
  if (!MANAGE_ROLES_ROLES.has(currentRole)) {
    return deny(res, 'Only workspace owners can remove members.');
  }

  const memberUserId = String(req.params.memberUserId || '').trim();
  const currentMembershipUserId = String(currentMember?.user_id || req.user?.supabase_auth_id || req.user?.id || '').trim();
  if (!memberUserId) {
    return res.status(400).json({ message: 'Member not found' });
  }

  if (memberUserId === currentMembershipUserId) {
    return res.status(400).json({ message: 'Use account deletion to remove yourself from the workspace.' });
  }

  const targetMember =
    members.find((member) => String(member.user_id || '').trim() === memberUserId)
    || members.find((member) => String(member.app_user_id || '').trim() === memberUserId);

  if (!targetMember) {
    return res.status(404).json({ message: 'Member not found' });
  }

  if (targetMember.role === 'owner') {
    const ownerCount = members.filter((member) => member.role === 'owner').length;
    if (ownerCount <= 1) {
      return res.status(400).json({ message: 'Transfer ownership before removing the last owner account.' });
    }
  }

  const removed = await dataStore.deleteWorkspaceMembership(
    req.user,
    String(targetMember.user_id || memberUserId).trim()
  );

  if (!removed) {
    return res.status(404).json({ message: 'Member not found' });
  }

  await writeAuditLog({
    user: req.user,
    action: 'delete',
    resourceType: 'workspace_member',
    resourceId: targetMember.user_id || memberUserId,
    changes: {
      email: targetMember.email,
      role: targetMember.role,
      removed_from_workspace: true,
    },
  });

  return res.json({
    data: {
      ...targetMember,
      removed_from_workspace: true,
    },
  });
});

// ─────────────────────────────────────────────────────────────────
// Credits
// ─────────────────────────────────────────────────────────────────

router.get('/credits', requireAuth, async (req, res) => {
  const workspaceId = getUserWorkspaceId(req.user);
  const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit || '20', 10)));
  const offset = Math.max(0, Number.parseInt(req.query.offset || '0', 10));

  const [balance, transactions, plan] = await Promise.all([
    getBalance(workspaceId),
    getTransactionHistory(workspaceId, { limit, offset }),
    getWorkspacePlan(workspaceId),
  ]);

  return res.json({
    data: {
      balance,
      costs: CREDIT_COSTS,
      transactions,
      plan,
    },
  });
});

// Admin-only endpoint: grant credits to a workspace (sales-assisted, future Stripe webhook)
// Requires service role or owner role — currently owner-only for simplicity.
router.post('/credits/grant', requireAuth, async (req, res) => {
  const { members, currentMember } = await resolveCurrentWorkspaceAccess(req.user);
  if (!members || !currentMember || currentMember.role !== 'owner') {
    return deny(res, 'Only the workspace owner can grant credits.');
  }

  const amount = Number.parseInt(req.body?.amount || '0', 10);
  const description = String(req.body?.description || '').trim() || null;

  if (!amount || amount <= 0 || amount > 10000) {
    return res.status(400).json({ message: 'amount must be between 1 and 10000' });
  }

  const workspaceId = getUserWorkspaceId(req.user);
  const result = await grantCredits(workspaceId, amount, 'grant', description, {
    granted_by: req.user.id,
  });

  if (!result.success) {
    return res.status(500).json({ message: result.error || 'Failed to grant credits' });
  }

  return res.json({ data: result });
});

router.get('/integration-status', requireAuth, async (req, res) => {
  const config = getRuntimeConfig();

  const supabaseUrl = Boolean(config.supabase.url);
  const supabasePublishableKey = Boolean(config.supabase.publishableKey);
  const supabaseServiceRoleKey = Boolean(config.supabase.serviceRoleKey);
  const supabaseConfigured = supabaseUrl && supabaseServiceRoleKey;
  const hasCorsOrigin = Boolean(config.corsOrigin || process.env.VERCEL_URL);
  const cbStatus = getCircuitBreakerStatus();

  // CRM integration status — graceful degradation if DB unavailable
  const crmStatus = { hubspot: false, salesforce: false };
  try {
    const workspaceId = getUserWorkspaceId(req.user);
    const integrations = await listCrmIntegrations(workspaceId);
    for (const integration of integrations) {
      if (integration.is_active) {
        crmStatus[integration.crm_type] = true;
      }
    }
  } catch {
    // Non-critical — leave both false
  }

  res.json({
    claude: Boolean(process.env.ANTHROPIC_API_KEY),
    hunter: Boolean(process.env.HUNTER_API_KEY),
    newsApi: Boolean(process.env.NEWS_API_KEY),
    crm: crmStatus,
    supabase: {
      configured: supabaseConfigured,
      url: supabaseUrl,
      publishableKey: supabasePublishableKey,
      serviceRoleKey: supabaseServiceRoleKey,
    },
    runtime: {
      nodeEnv: config.nodeEnv,
      dataProvider: config.dataProvider,
      authProvider: config.authProvider,
      activeProvider: config.dataProvider,
      fallbackReason: null,
      demoBootstrapEnabled: config.demoBootstrapEnabled,
      apiDocsEnabled: config.apiDocsEnabled,
    },
    security: {
      secureCookies: Boolean(config.isProduction),
      trustedOriginsConfigured: hasCorsOrigin,
      publicBetaReady: Boolean(
        supabaseConfigured
        && process.env.ANTHROPIC_API_KEY
        && hasCorsOrigin
        && getDataProvider() === 'supabase'
        && getAuthProvider() === 'supabase'
        && !config.demoBootstrapEnabled
        && !config.apiDocsEnabled
      ),
      circuit_breaker_open: cbStatus.isOpen,
    },
  });
});

export default router;

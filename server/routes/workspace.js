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
import { sendEmail, EmailTemplates } from '../lib/email.js';
import { bootstrapWorkspaceDemoData } from '../services/bootstrap.js';
import { getPlanCatalog, getPlanEntitlements } from '../lib/plans.js';
import { listAiRunsForWorkspace } from '../services/aiRunService.js';
import { listWorkspaceFeatureFlags, setWorkspaceFeatureFlag } from '../lib/featureFlags.js';

const router = express.Router();
wrapAsyncRoutes(router);

const MANAGE_INVITES_ROLES = new Set(['owner', 'admin']);
const MANAGE_ROLES_ROLES = new Set(['owner']);
const TOP_ACTION_LIMIT = 5;

const buildSeatSummary = ({ entitlements, members, invites }) => {
  const seatsIncluded = Number(entitlements?.seats_included ?? 0);
  const usedSeats = Array.isArray(members) ? members.length : 0;
  const pendingInvites = Array.isArray(invites) ? invites.length : 0;
  const reservedSeats = usedSeats + pendingInvites;
  return {
    seats_included: seatsIncluded,
    seats_used: usedSeats,
    pending_invites: pendingInvites,
    reserved_seats: reservedSeats,
    seats_remaining: Math.max(0, seatsIncluded - reservedSeats),
    limit_reached: seatsIncluded > 0 ? reservedSeats >= seatsIncluded : false,
  };
};

const buildCrmSummary = ({ entitlements, integrations }) => {
  const crmSlotsIncluded = Number(entitlements?.crm_integrations ?? 0);
  const activeIntegrations = Array.isArray(integrations)
    ? integrations.filter((integration) => integration?.is_active)
    : [];
  const connectedTypes = activeIntegrations
    .map((integration) => String(integration?.crm_type || '').trim())
    .filter(Boolean);

  return {
    crm_slots_included: crmSlotsIncluded,
    crm_slots_used: activeIntegrations.length,
    crm_slots_remaining: Math.max(0, crmSlotsIncluded - activeIntegrations.length),
    crm_limit_reached: crmSlotsIncluded > 0 ? activeIntegrations.length >= crmSlotsIncluded : true,
    connected_crm_types: connectedTypes,
  };
};

const summarizeCredits = ({ balance, transactions, plan }) => {
  const entitlements = getPlanEntitlements(plan?.plan_slug);
  const usableTransactions = Array.isArray(transactions) ? transactions : [];
  const now = Date.now();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  let recentUsage = 0;
  const actionUsage = new Map();

  for (const transaction of usableTransactions) {
    const amount = Number(transaction?.amount ?? 0);
    if (!Number.isFinite(amount) || amount >= 0) continue;

    const usage = Math.abs(amount);
    const action = String(transaction?.action || 'unknown');
    const createdAtMs = new Date(transaction?.created_at || 0).getTime();
    if (Number.isFinite(createdAtMs) && now - createdAtMs <= THIRTY_DAYS_MS) {
      recentUsage += usage;
    }

    const current = actionUsage.get(action) || { action, credits: 0, count: 0 };
    current.credits += usage;
    current.count += 1;
    actionUsage.set(action, current);
  }

  const includedCredits = Number(entitlements?.credits_included ?? 0);
  const remainingCredits = Number(balance ?? 0);
  const estimatedUsedCredits = Math.max(0, includedCredits - remainingCredits);
  const usagePercent = includedCredits > 0
    ? Math.max(0, Math.min(100, Math.round((estimatedUsedCredits / includedCredits) * 100)))
    : 0;
  const averageDailyUsage = recentUsage > 0 ? recentUsage / 30 : 0;
  const projectedRunwayDays = averageDailyUsage > 0
    ? Math.max(1, Math.round(remainingCredits / averageDailyUsage))
    : null;

  return {
    entitlements,
    usage: {
      credits_included: includedCredits,
      estimated_used_credits: estimatedUsedCredits,
      remaining_credits: remainingCredits,
      usage_percent: usagePercent,
      recent_30d_credits: recentUsage,
      projected_runway_days: projectedRunwayDays,
      usage_window_days: 30,
    },
    top_actions: [...actionUsage.values()]
      .sort((left, right) => right.credits - left.credits)
      .slice(0, TOP_ACTION_LIMIT),
  };
};

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

const buildWorkspaceExport = async (user) => {
  const workspaceId = getUserWorkspaceId(user);

  const [members, invites, leads, icpProfiles, auditLog, aiRuns, balance, transactions, plan] = await Promise.all([
    dataStore.listWorkspaceMembers(user).catch(() => []),
    dataStore.listWorkspaceInvites(user).catch(() => []),
    dataStore.listLeads(user, '-created_at').catch(() => []),
    dataStore.listIcpProfiles(user).catch(() => []),
    dataStore.listAuditLog(user, { limit: 1000, offset: 0 }).catch(() => []),
    listAiRunsForWorkspace(user, { limit: 500, offset: 0 }).catch(() => []),
    getBalance(workspaceId).catch(() => 0),
    getTransactionHistory(workspaceId, { limit: 250, offset: 0 }).catch(() => []),
    getWorkspacePlan(workspaceId).catch(() => null),
  ]);

  return {
    exported_at: new Date().toISOString(),
    workspace: {
      id: workspaceId,
      name: user?.workspace_name || null,
    },
    requester: {
      id: user?.id || null,
      email: user?.email || null,
      full_name: user?.full_name || null,
    },
    members,
    invites,
    leads,
    icp_profiles: icpProfiles,
    audit_log: auditLog,
    ai_runs: aiRuns,
    credits: {
      balance,
      transactions,
      plan,
    },
  };
};

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
  const { currentRole, members } = await resolveCurrentWorkspaceAccess(req.user);
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

  const workspaceId = getUserWorkspaceId(req.user);
  const [plan, invites] = await Promise.all([
    getWorkspacePlan(workspaceId).catch(() => null),
    dataStore.listWorkspaceInvites(req.user).catch(() => []),
  ]);
  const entitlements = getPlanEntitlements(plan?.plan_slug);
  const seatSummary = buildSeatSummary({ entitlements, members, invites });
  if (seatSummary.limit_reached) {
    return res.status(409).json({
      message: 'Your workspace has reached the team seat limit for the current plan.',
      code: 'WORKSPACE_SEAT_LIMIT_REACHED',
      entitlements,
      usage: seatSummary,
    });
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

  // Send invite email (fire-and-forget — never block the HTTP response)
  const appUrl = String(process.env.APP_ORIGIN || process.env.CORS_ORIGIN || 'https://app.aimlead.io').replace(/\/$/, '');
  const inviteUrl = `${appUrl}/login?mode=signup&email=${encodeURIComponent(email)}&invite_id=${invite.id}`;
  const workspaceName = req.user?.workspace_name || req.user?.full_name?.split(' ')[0] + "'s workspace" || 'your workspace';
  sendEmail(EmailTemplates.workspaceInvite({
    toEmail: email,
    inviterName: req.user?.full_name || req.user?.email || 'A teammate',
    workspaceName,
    inviteUrl,
    role: invite.role,
  })).catch(() => {}); // ignore email errors — never block the response

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

router.get('/export', requireAuth, async (req, res) => {
  const exportData = await buildWorkspaceExport(req.user);
  const filename = `aimleads-workspace-export-${new Date().toISOString().slice(0, 10)}.json`;

  await writeAuditLog({
    user: req.user,
    action: 'export',
    resourceType: 'workspace_data',
    resourceId: filename,
    changes: {
      workspace_id: exportData.workspace.id,
      lead_count: Array.isArray(exportData.leads) ? exportData.leads.length : 0,
      member_count: Array.isArray(exportData.members) ? exportData.members.length : 0,
      invite_count: Array.isArray(exportData.invites) ? exportData.invites.length : 0,
    },
  }).catch(() => {});

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(JSON.stringify(exportData, null, 2));
});

router.post('/sample-data', requireAuth, async (req, res) => {
  const before = await dataStore.listLeads(req.user, '-created_at').catch(() => []);
  const beforeCount = Array.isArray(before) ? before.length : 0;

  await bootstrapWorkspaceDemoData(dataStore, req.user);

  const after = await dataStore.listLeads(req.user, '-created_at').catch(() => []);
  const afterCount = Array.isArray(after) ? after.length : 0;
  const inserted = Math.max(0, afterCount - beforeCount);

  await writeAuditLog({
    user: req.user,
    action: 'create',
    resourceType: 'workspace_sample_data',
    resourceId: req.user?.workspace_id || 'workspace',
    changes: {
      inserted,
      total: afterCount,
      already_seeded: inserted === 0 && beforeCount > 0,
    },
  }).catch(() => {});

  return res.status(inserted > 0 ? 201 : 200).json({
    data: {
      inserted,
      total: afterCount,
      already_seeded: inserted === 0 && beforeCount > 0,
    },
  });
});

router.get('/ai-runs', requireAuth, async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number.parseInt(req.query.limit || '50', 10)));
  const offset = Math.max(0, Number.parseInt(req.query.offset || '0', 10));
  const runs = await listAiRunsForWorkspace(req.user, { limit, offset });
  return res.json({ data: runs });
});

router.get('/feature-flags', requireAuth, async (req, res) => {
  const { currentRole } = await resolveCurrentWorkspaceAccess(req.user);
  const flags = await listWorkspaceFeatureFlags(getUserWorkspaceId(req.user));

  return res.json({
    data: {
      current_role: currentRole,
      can_manage: MANAGE_INVITES_ROLES.has(currentRole),
      flags,
    },
  });
});

router.put('/feature-flags/:flagName', requireAuth, validateBody(schemas.featureFlagUpdateSchema), async (req, res) => {
  const { currentRole } = await resolveCurrentWorkspaceAccess(req.user);
  if (!currentRole) {
    return deny(res, 'Unable to verify your workspace membership.');
  }
  if (!MANAGE_INVITES_ROLES.has(currentRole)) {
    return deny(res, 'Only workspace owners and admins can manage feature flags.');
  }

  const updatedFlag = await setWorkspaceFeatureFlag({
    workspaceId: getUserWorkspaceId(req.user),
    flagName: req.params.flagName,
    enabled: req.validatedBody.enabled,
    updatedByUserId: req.user?.id || null,
  });

  await writeAuditLog({
    user: req.user,
    action: 'update',
    resourceType: 'feature_flag',
    resourceId: updatedFlag.flag_name,
    changes: {
      enabled: updatedFlag.enabled,
      category: updatedFlag.category,
    },
  }).catch(() => {});

  return res.json({ data: updatedFlag });
});

// ─────────────────────────────────────────────────────────────────
// Credits
// ─────────────────────────────────────────────────────────────────

router.get('/credits', requireAuth, async (req, res) => {
  const workspaceId = getUserWorkspaceId(req.user);
  const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit || '20', 10)));
  const offset = Math.max(0, Number.parseInt(req.query.offset || '0', 10));

  const [balance, transactions, plan, members, invites, integrations] = await Promise.all([
    getBalance(workspaceId),
    getTransactionHistory(workspaceId, { limit, offset }),
    getWorkspacePlan(workspaceId),
    dataStore.listWorkspaceMembers(req.user).catch(() => []),
    dataStore.listWorkspaceInvites(req.user).catch(() => []),
    listCrmIntegrations(workspaceId).catch(() => []),
  ]);
  const summary = summarizeCredits({ balance, transactions, plan });
  const seatSummary = buildSeatSummary({
    entitlements: summary.entitlements,
    members,
    invites,
  });
  const crmSummary = buildCrmSummary({
    entitlements: summary.entitlements,
    integrations,
  });

  return res.json({
    data: {
      balance,
      costs: CREDIT_COSTS,
      transactions,
      plan,
      entitlements: summary.entitlements,
      usage: {
        ...summary.usage,
        ...seatSummary,
        ...crmSummary,
      },
      top_actions: summary.top_actions,
      plan_catalog: getPlanCatalog(),
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
  const hasCorsOrigin = Boolean(config.corsOrigin);
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

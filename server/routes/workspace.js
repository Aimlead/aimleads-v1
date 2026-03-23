import express from 'express';
import { requireAuth, wrapAsyncRoutes } from '../lib/middleware.js';
import { dataStore } from '../lib/dataStore.js';
import { schemas, validateBody } from '../lib/validation.js';
import { writeAuditLog } from '../lib/auditLog.js';

const router = express.Router();
wrapAsyncRoutes(router);

const MANAGE_INVITES_ROLES = new Set(['owner', 'admin']);
const MANAGE_ROLES_ROLES = new Set(['owner']);

const resolveCurrentWorkspaceAccess = async (user) => {
  const members = await dataStore.listWorkspaceMembers(user);
  const membershipUserId = String(user?.supabase_auth_id || user?.id || '').trim();
  const normalizedEmail = String(user?.email || '').trim().toLowerCase();

  const currentMember =
    members.find((member) => String(member.user_id || '').trim() === membershipUserId)
    || members.find((member) => String(member.app_user_id || '').trim() === String(user?.id || '').trim())
    || members.find((member) => String(member.email || '').trim().toLowerCase() === normalizedEmail)
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
  const workspaceId = user.workspace_id;

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
  const { currentRole } = await resolveCurrentWorkspaceAccess(req.user);
  if (!currentRole) {
    return deny(res, 'Unable to verify your workspace membership.');
  }
  if (!MANAGE_ROLES_ROLES.has(currentRole)) {
    return deny(res, 'Only workspace owners can remove members.');
  }
  return res.status(400).json({
    message: 'Safe member removal is not supported yet. This account-to-workspace model still needs a deeper tenancy pass.',
  });
});

router.get('/integration-status', requireAuth, (req, res) => {
  res.json({
    claude: Boolean(process.env.ANTHROPIC_API_KEY),
    hunter: Boolean(process.env.HUNTER_API_KEY),
    newsApi: Boolean(process.env.NEWS_API_KEY),
  });
});

export default router;

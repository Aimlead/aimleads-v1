import { dataStore } from './dataStore.js';
import { createId } from './utils.js';

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const resolveDisplayName = (authUser, fallback = 'New User') => {
  const metadata = authUser?.user_metadata || authUser?.raw_user_meta_data || {};
  const fullName = String(metadata.full_name || metadata.name || '').trim();
  if (fullName) return fullName;

  const email = normalizeEmail(authUser?.email);
  if (email.includes('@')) {
    const [localPart] = email.split('@');
    if (localPart) return localPart;
  }

  return String(fallback || 'New User').trim() || 'New User';
};

export const attachWorkspaceMembershipContext = async (user) => {
  if (!user) return null;

  const membership = await dataStore.findFirstWorkspaceMembershipForUser(user).catch(() => null);
  if (!membership?.workspace_id) {
    return {
      ...user,
      workspace_context: null,
      workspace_membership_verified: false,
      workspace_id: '',
      current_workspace_id: '',
      workspace_role: null,
    };
  }

  return {
    ...user,
    workspace_context: {
      workspace_id: membership.workspace_id,
      role: membership.role || user.workspace_role || null,
      app_user_id: membership.app_user_id || user.app_user_id || user.id || null,
    },
    workspace_membership_verified: true,
    workspace_id: membership.workspace_id,
    current_workspace_id: membership.workspace_id,
    workspace_role: membership.role || user.workspace_role || null,
    app_user_id: membership.app_user_id || user.app_user_id || user.id || null,
  };
};

export const ensureWorkspaceUserForAuth = async ({ authUser, fallbackFullName = '' } = {}) => {
  if (!authUser?.id) return null;

  const email = normalizeEmail(authUser.email);
  const fullName = resolveDisplayName(authUser, fallbackFullName || 'New User');

  let appUser = await dataStore.findUserBySupabaseAuthId(authUser.id);
  if (appUser) {
    const updates = {};

    if (email && normalizeEmail(appUser.email) !== email) {
      updates.email = email;
    }

    if (fullName && normalizeEmail(appUser.full_name) !== normalizeEmail(fullName)) {
      updates.full_name = fullName;
    }

    if (!appUser.supabase_auth_id) {
      updates.supabase_auth_id = authUser.id;
    }

    if (Object.keys(updates).length > 0) {
      appUser = (await dataStore.updateUser(appUser.id, updates)) || { ...appUser, ...updates };
    }

    return attachWorkspaceMembershipContext(appUser);
  }

  if (email) {
    appUser = await dataStore.findUserByEmail(email).catch(() => null);
  }

  if (appUser) {
    const updates = {};

    if (fullName && normalizeEmail(appUser.full_name) !== normalizeEmail(fullName)) {
      updates.full_name = fullName;
    }

    if (!appUser.supabase_auth_id || String(appUser.supabase_auth_id).trim() !== String(authUser.id).trim()) {
      updates.supabase_auth_id = authUser.id;
    }

    if (Object.keys(updates).length > 0) {
      appUser = (await dataStore.updateUser(appUser.id, updates)) || { ...appUser, ...updates };
    }

    return attachWorkspaceMembershipContext(appUser);
  }

  const pendingInvite = email ? await dataStore.findActiveWorkspaceInviteByEmail(email).catch(() => null) : null;

  appUser = await dataStore.createUser({
    id: createId('user'),
    workspace_id: pendingInvite?.workspace_id || createId('ws'),
    workspace_role: pendingInvite?.role || 'owner',
    email: email || `${String(authUser.id).slice(0, 8)}@unknown.local`,
    full_name: fullName,
    supabase_auth_id: authUser.id,
    created_at: new Date().toISOString(),
  });

  if (pendingInvite) {
    await dataStore.consumeWorkspaceInviteByEmail(email, {
      accepted_by_user_id: appUser.id,
    }).catch(() => null);
  }

  const withContext = await attachWorkspaceMembershipContext(appUser);
  // Flag as newly-created so callers can send welcome emails
  return withContext ? { ...withContext, _is_new: true } : withContext;
};

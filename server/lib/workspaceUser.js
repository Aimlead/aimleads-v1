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

    return appUser;
  }

  if (email) {
    const byEmail = await dataStore.findUserByEmail(email);
    if (byEmail) {
      if (byEmail.supabase_auth_id && String(byEmail.supabase_auth_id) !== String(authUser.id)) {
        const conflict = new Error('This email is already linked to another auth account.');
        conflict.status = 409;
        throw conflict;
      }

      const updates = {
        supabase_auth_id: authUser.id,
      };

      if (fullName && normalizeEmail(byEmail.full_name) !== normalizeEmail(fullName)) {
        updates.full_name = fullName;
      }

      appUser = (await dataStore.updateUser(byEmail.id, updates)) || { ...byEmail, ...updates };
      return appUser;
    }
  }

  appUser = await dataStore.createUser({
    id: createId('user'),
    workspace_id: createId('ws'),
    email: email || `${String(authUser.id).slice(0, 8)}@unknown.local`,
    full_name: fullName,
    supabase_auth_id: authUser.id,
    created_at: new Date().toISOString(),
  });

  return appUser;
};
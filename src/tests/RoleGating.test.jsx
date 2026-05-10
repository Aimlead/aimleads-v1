import { describe, it, expect } from 'vitest';

const findCurrentMember = (members, user) => {
  const membershipUserId = String(user?.supabase_auth_id || user?.id || '').trim();
  const normalizedEmail = String(user?.email || '').trim().toLowerCase();

  return (
    members.find((m) => String(m.user_id || '').trim() === membershipUserId)
    || members.find((m) => String(m.app_user_id || '').trim() === String(user?.id || '').trim())
    || members.find((m) => String(m.email || '').trim().toLowerCase() === normalizedEmail)
    || null
  );
};

const resolveRoleCapabilities = (currentRole) => ({
  canManageInvites: currentRole === 'owner' || currentRole === 'admin',
  canManageRoles: currentRole === 'owner',
  isOwner: currentRole === 'owner',
});

const MEMBERS = [
  { user_id: 'auth-owner', app_user_id: 'app-1', email: 'owner@co.com', role: 'owner' },
  { user_id: 'auth-admin', app_user_id: 'app-2', email: 'admin@co.com', role: 'admin' },
  { user_id: 'auth-member', app_user_id: 'app-3', email: 'member@co.com', role: 'member' },
];

describe('findCurrentMember', () => {
  it('matches by supabase_auth_id (primary key)', () => {
    const user = { supabase_auth_id: 'auth-owner', id: 'app-1', email: 'owner@co.com' };
    const found = findCurrentMember(MEMBERS, user);
    expect(found?.role).toBe('owner');
  });

  it('falls back to app_user_id when supabase_auth_id absent', () => {
    const user = { supabase_auth_id: '', id: 'app-2', email: 'admin@co.com' };
    const found = findCurrentMember(MEMBERS, user);
    expect(found?.role).toBe('admin');
  });

  it('falls back to email when both ids absent', () => {
    const user = { supabase_auth_id: '', id: '', email: 'member@co.com' };
    const found = findCurrentMember(MEMBERS, user);
    expect(found?.role).toBe('member');
  });

  it('returns null when no match found', () => {
    const user = { supabase_auth_id: 'unknown', id: 'unknown', email: 'nobody@co.com' };
    expect(findCurrentMember(MEMBERS, user)).toBeNull();
  });
});

describe('role capabilities', () => {
  it('owner can manage invites and roles', () => {
    const caps = resolveRoleCapabilities('owner');
    expect(caps.canManageInvites).toBe(true);
    expect(caps.canManageRoles).toBe(true);
    expect(caps.isOwner).toBe(true);
  });

  it('admin can manage invites but not roles', () => {
    const caps = resolveRoleCapabilities('admin');
    expect(caps.canManageInvites).toBe(true);
    expect(caps.canManageRoles).toBe(false);
    expect(caps.isOwner).toBe(false);
  });

  it('member has read-only access', () => {
    const caps = resolveRoleCapabilities('member');
    expect(caps.canManageInvites).toBe(false);
    expect(caps.canManageRoles).toBe(false);
  });

  it('null role has no capabilities', () => {
    const caps = resolveRoleCapabilities(null);
    expect(caps.canManageInvites).toBe(false);
    expect(caps.canManageRoles).toBe(false);
  });
});

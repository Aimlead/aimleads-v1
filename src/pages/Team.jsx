import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Crown, Loader2, Mail, Shield, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ROUTES } from '@/constants/routes';
import { dataClient } from '@/services/dataClient';
import { useAuth } from '@/lib/AuthContext';

const INVITE_ROLE_OPTIONS = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
];

function RoleBadge({ role }) {
  const configs = {
    owner: { color: 'bg-brand-sky/10 text-brand-sky', icon: Crown },
    admin: { color: 'bg-blue-100 text-blue-700', icon: Shield },
    member: { color: 'bg-slate-100 text-slate-600', icon: null },
  };
  const config = configs[role] || configs.member;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${config.color}`}>
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {role}
    </span>
  );
}

const findCurrentMember = (members, user) => {
  const membershipUserId = String(user?.supabase_auth_id || user?.id || '').trim();
  const normalizedEmail = String(user?.email || '').trim().toLowerCase();

  return (
    members.find((member) => String(member.user_id || '').trim() === membershipUserId)
    || members.find((member) => String(member.app_user_id || '').trim() === String(user?.id || '').trim())
    || members.find((member) => String(member.email || '').trim().toLowerCase() === normalizedEmail)
    || null
  );
};

const formatDate = (value) => {
  if (!value) return 'n/a';

  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return 'n/a';
  }
};

export default function Team() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [lastCreatedInvite, setLastCreatedInvite] = useState(null);
  const [copiedInviteKey, setCopiedInviteKey] = useState('');

  const {
    data: members = [],
    isLoading: isLoadingMembers,
    error: membersError,
  } = useQuery({
    queryKey: ['workspace-members'],
    queryFn: () => dataClient.workspace.listMembers(),
    enabled: typeof dataClient.workspace?.listMembers === 'function',
  });

  const currentMember = useMemo(() => findCurrentMember(members, user), [members, user]);
  const currentRole = currentMember?.role || null;
  const canManageInvites = currentRole === 'owner' || currentRole === 'admin';
  const canManageRoles = currentRole === 'owner';
  const inviteRoleOptions = currentRole === 'admin'
    ? INVITE_ROLE_OPTIONS.filter((option) => option.value === 'member')
    : INVITE_ROLE_OPTIONS;
  const buildInviteSignupUrl = (email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '';
    const params = new URLSearchParams({
      mode: 'signup',
      invite_email: normalizedEmail,
    });
    return `${origin}${ROUTES.login}?${params.toString()}`;
  };
  const copyInviteSignupUrl = async (email, key = email) => {
    const inviteLink = buildInviteSignupUrl(email);
    if (!inviteLink) {
      toast.error('Create an invite before copying the signup link.');
      return;
    }

    if (!navigator?.clipboard?.writeText) {
      toast.error('Clipboard access is not available in this browser.');
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedInviteKey(String(key || email));
      toast.success('Signup link copied.');
    } catch {
      toast.error('Failed to copy the signup link.');
    }
  };

  const {
    data: invites = [],
    isLoading: isLoadingInvites,
    error: invitesError,
  } = useQuery({
    queryKey: ['workspace-invites'],
    queryFn: () => dataClient.workspace.listInvites(),
    enabled: canManageInvites && typeof dataClient.workspace?.listInvites === 'function',
  });

  const inviteMutation = useMutation({
    mutationFn: (payload) => dataClient.workspace.inviteMember(payload),
    onSuccess: (invite, variables) => {
      toast.success(`Invite created for ${variables.email}.`);
      setInviteEmail('');
      setInviteRole('member');
      setLastCreatedInvite(invite || null);
      setCopiedInviteKey('');
      queryClient.invalidateQueries({ queryKey: ['workspace-invites'] });
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to create invite');
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ memberUserId, role }) => dataClient.workspace.updateMemberRole(memberUserId, { role }),
    onSuccess: () => {
      toast.success('Role updated.');
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to update member role');
    },
  });

  const transferOwnershipMutation = useMutation({
    mutationFn: (memberUserId) => dataClient.workspace.transferOwnership(memberUserId),
    onSuccess: (result) => {
      const nextOwnerLabel = result?.new_owner?.full_name || result?.new_owner?.email || 'the selected member';
      toast.success(`Ownership transferred to ${nextOwnerLabel}. You are now an admin.`);
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-invites'] });
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to transfer ownership');
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId) => dataClient.workspace.revokeInvite(inviteId),
    onSuccess: () => {
      toast.success('Invite revoked.');
      queryClient.invalidateQueries({ queryKey: ['workspace-invites'] });
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to revoke invite');
    },
  });

  const handleInviteSubmit = async (event) => {
    event.preventDefault();
    const email = String(inviteEmail || '').trim().toLowerCase();
    if (!email) {
      toast.error('Enter an email address.');
      return;
    }

    await inviteMutation.mutateAsync({
      email,
      role: inviteRole,
    });
  };
  const memberCountLabel = `${members.length} member${members.length === 1 ? '' : 's'}`;
  const pendingInviteCount = canManageInvites ? invites.length : 0;
  const inviteCountLabel = `${pendingInviteCount} pending invite${pendingInviteCount === 1 ? '' : 's'}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team</h1>
          <p className="mt-1 text-slate-500">Manage who can access this workspace and who can qualify leads.</p>
          <p className="mt-2 text-sm text-slate-400">
            {memberCountLabel}
            {canManageInvites ? ` • ${inviteCountLabel}` : ''}
          </p>
        </div>

        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <span>Your role</span>
            <RoleBadge role={currentRole || 'member'} />
          </div>
          <p className="text-xs text-slate-400">
            Workspace: <span className="font-mono">{user?.workspace_id}</span>
          </p>
        </div>
      </div>

      {!isLoadingMembers && !currentMember ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          We could not verify your workspace membership cleanly. Access management stays read-only until the membership record is repaired.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Invite teammate
          </CardTitle>
          <CardDescription>
            This creates a pending invite for this email. The teammate will join this workspace when they sign up with the same email address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManageInvites ? (
            <>
              <form onSubmit={handleInviteSubmit} className="grid gap-3 md:grid-cols-[1.6fr_0.8fr_auto]">
                <Input
                  type="email"
                  placeholder="teammate@company.com"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  disabled={inviteMutation.isPending}
                />
                <select
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value)}
                  disabled={inviteMutation.isPending}
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
                >
                  {inviteRoleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Button type="submit" disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  Create invite
                </Button>
              </form>

              <div className="rounded-xl border border-brand-sky/20 bg-brand-sky/5 p-4 text-xs text-slate-600">
                <p className="font-medium text-slate-800">How teammates join</p>
                <p className="mt-1">
                  They need to create their account with the invited email address. If you are not sending transactional emails yet, copy the signup link below and share it manually.
                </p>
                {lastCreatedInvite?.email ? (
                  <div className="mt-3 rounded-xl border border-white/70 bg-white/80 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Latest invite</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{lastCreatedInvite.email}</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
                      {buildInviteSignupUrl(lastCreatedInvite.email)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => copyInviteSignupUrl(lastCreatedInvite.email, `latest:${lastCreatedInvite.id || lastCreatedInvite.email}`)}
                      >
                        {copiedInviteKey === `latest:${lastCreatedInvite.id || lastCreatedInvite.email}`
                          ? <Check className="mr-2 h-4 w-4" />
                          : <Copy className="mr-2 h-4 w-4" />}
                        {copiedInviteKey === `latest:${lastCreatedInvite.id || lastCreatedInvite.email}` ? 'Copied' : 'Copy signup link'}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Only workspace owners and admins can create invites.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Pending invites
          </CardTitle>
          <CardDescription>
            Pending invites stay here until the teammate signs up with the invited email or you revoke the invite.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManageInvites ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Only workspace owners and admins can view pending invites.
            </div>
          ) : isLoadingInvites ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading invites...
            </div>
          ) : invitesError ? (
            <p className="text-sm text-rose-600">{invitesError.message || 'Failed to load invites.'}</p>
          ) : invites.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              <p>No pending invites.</p>
              <p className="mt-1 text-xs text-slate-400">Create an invite to add your first teammate.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {invites.map((invite) => {
                const isRevoking = revokeInviteMutation.isPending && revokeInviteMutation.variables === invite.id;

                return (
                  <div key={invite.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.5fr)_140px_120px_auto] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{invite.email}</p>
                      <p className="text-xs text-slate-500">Created {formatDate(invite.created_at)}</p>
                    </div>
                    <RoleBadge role={invite.role} />
                    <span className="text-xs font-medium uppercase tracking-wide text-amber-600">Pending</span>
                    <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyInviteSignupUrl(invite.email, invite.id)}
                      >
                        {copiedInviteKey === invite.id ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                        {copiedInviteKey === invite.id ? 'Copied' : 'Copy signup link'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isRevoking}
                        onClick={() => revokeInviteMutation.mutate(invite.id)}
                      >
                        {isRevoking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Revoke'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Members
          </CardTitle>
          <CardDescription>
            {members.length <= 1
              ? "You're the only member in this workspace."
              : 'Manage who can collaborate on qualification, pipeline reviews, and outreach.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingMembers ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading members...
            </div>
          ) : membersError ? (
            <p className="text-sm text-rose-600">{membersError.message || 'Failed to load workspace members.'}</p>
          ) : members.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              No team members found.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {members.map((member) => {
                const isCurrentUser = Boolean(member.is_current_user) || Boolean(findCurrentMember([member], user));
                const isUpdatingRole = roleMutation.isPending && roleMutation.variables?.memberUserId === member.user_id;
                const isTransferringOwnership =
                  transferOwnershipMutation.isPending && transferOwnershipMutation.variables === member.user_id;
                const canEditMember = canManageRoles && !isCurrentUser && member.role !== 'owner';
                const canTransferOwnership = canManageRoles && !isCurrentUser && member.role !== 'owner';

                return (
                  <div key={member.user_id || member.app_user_id || member.email} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.6fr)_160px_auto] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {member.full_name || member.email || member.user_id}
                        {isCurrentUser ? <span className="ml-2 text-xs text-slate-400">You</span> : null}
                      </p>
                      {member.email ? <p className="truncate text-xs text-slate-500">{member.email}</p> : null}
                    </div>

                    {canEditMember ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={member.role}
                          onChange={(event) =>
                            roleMutation.mutate({
                              memberUserId: member.user_id,
                              role: event.target.value,
                            })
                          }
                          disabled={isUpdatingRole}
                          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
                        >
                          {INVITE_ROLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {isUpdatingRole ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                      </div>
                    ) : (
                      <RoleBadge role={member.role} />
                    )}

                    <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
                      {canTransferOwnership ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isTransferringOwnership}
                          onClick={() => {
                            const memberLabel = member.full_name || member.email || member.user_id;
                            const confirmed = window.confirm(
                              `Transfer workspace ownership to ${memberLabel}? You will become an admin.`
                            );
                            if (!confirmed) return;
                            transferOwnershipMutation.mutate(member.user_id);
                          }}
                        >
                          {isTransferringOwnership ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Transfer ownership
                        </Button>
                      ) : null}
                      <span className="text-xs text-slate-400">
                        {member.role === 'owner'
                          ? 'Owner actions unavailable'
                          : canManageRoles
                            ? 'Role managed above'
                            : 'Read only'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-slate-600">
            Safe member removal is still disabled. If the current owner needs to leave, transfer ownership first, then handle the account deletion from the new ownership state.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roles & permissions</CardTitle>
          <CardDescription>Keep the role choice simple and explicit while safe offboarding stays intentionally limited.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-medium text-slate-900">Owner</p>
            <p className="mt-1 text-xs text-slate-500">Full workspace control, including role management and ownership transfer.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-medium text-slate-900">Admin</p>
            <p className="mt-1 text-xs text-slate-500">Can invite members and manage pending invites.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-medium text-slate-900">Member</p>
            <p className="mt-1 text-xs text-slate-500">Can use the workspace but cannot manage access.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

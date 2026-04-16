import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Copy, Crown, Loader2, Mail, Shield, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ROUTES } from '@/constants/routes';
import { dataClient } from '@/services/dataClient';
import { useAuth } from '@/lib/AuthContext';

function RoleBadge({ role }) {
  const { t } = useTranslation();
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
      {t(`team.${role}`, role)}
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

const formatDate = (value, locale) => {
  if (!value) return 'n/a';

  try {
    return new Date(value).toLocaleDateString(locale);
  } catch {
    return 'n/a';
  }
};

export default function Team() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [lastCreatedInvite, setLastCreatedInvite] = useState(null);
  const [copiedInviteKey, setCopiedInviteKey] = useState('');
  const inviteRoleOptions = useMemo(() => ([
    { value: 'member', label: t('team.member') },
    { value: 'admin', label: t('team.admin') },
  ]), [t]);

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
  const membershipIssue = !isLoadingMembers && !currentMember;
  const accessSummary = membershipIssue
    ? t('team.access.membershipVerificationNeeded')
    : canManageRoles
      ? t('team.access.fullAccess')
      : canManageInvites
        ? t('team.access.inviteOnly')
        : t('team.access.readOnly');
  const visibleInviteRoleOptions = currentRole === 'admin'
    ? inviteRoleOptions.filter((option) => option.value === 'member')
    : inviteRoleOptions;
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
      toast.error(t('team.errors.createInviteBeforeCopy'));
      return;
    }

    if (!navigator?.clipboard?.writeText) {
      toast.error(t('team.errors.clipboardUnavailable'));
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedInviteKey(String(key || email));
      toast.success(t('team.copyInviteLink'));
    } catch {
      toast.error(t('team.errors.copyInviteFailed'));
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

  const { data: creditsData = null } = useQuery({
    queryKey: ['workspaceCreditsForTeam'],
    queryFn: () => dataClient.workspace.getCredits({ limit: 10 }),
    enabled: typeof dataClient.workspace?.getCredits === 'function',
    staleTime: 60_000,
  });

  const inviteMutation = useMutation({
    mutationFn: (payload) => dataClient.workspace.inviteMember(payload),
    onSuccess: (invite) => {
      toast.success(t('team.inviteSent'));
      setInviteEmail('');
      setInviteRole('member');
      setLastCreatedInvite(invite || null);
      setCopiedInviteKey('');
      queryClient.invalidateQueries({ queryKey: ['workspace-invites'] });
    },
    onError: (error) => {
      if (error?.payload?.code === 'WORKSPACE_SEAT_LIMIT_REACHED') {
        toast.error(t('team.errors.seatLimitReached'));
        return;
      }
      toast.error(error?.message || t('team.errors.createInvite'));
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ memberUserId, role }) => dataClient.workspace.updateMemberRole(memberUserId, { role }),
    onSuccess: () => {
      toast.success(t('team.roleUpdated'));
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
    },
    onError: (error) => {
      toast.error(error?.message || t('team.errors.updateRole'));
    },
  });

  const transferOwnershipMutation = useMutation({
    mutationFn: (memberUserId) => dataClient.workspace.transferOwnership(memberUserId),
    onSuccess: () => {
      toast.success(t('team.ownershipTransferred'));
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-invites'] });
    },
    onError: (error) => {
      toast.error(error?.message || t('team.errors.transferOwnership'));
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId) => dataClient.workspace.revokeInvite(inviteId),
    onSuccess: () => {
      toast.success(t('team.inviteRevoked'));
      queryClient.invalidateQueries({ queryKey: ['workspace-invites'] });
    },
    onError: (error) => {
      toast.error(error?.message || t('team.errors.revokeInvite'));
    },
  });

  const handleInviteSubmit = async (event) => {
    event.preventDefault();
    const email = String(inviteEmail || '').trim().toLowerCase();
    if (!email) {
      toast.error(t('team.errors.enterInviteEmail'));
      return;
    }

    await inviteMutation.mutateAsync({
      email,
      role: inviteRole,
    });
  };
  const memberCountLabel = t('team.memberCount', { count: members.length });
  const pendingInviteCount = canManageInvites ? invites.length : 0;
  const inviteCountLabel = t('team.pendingInviteCount', { count: pendingInviteCount });
  const seatUsage = creditsData?.usage || {};
  const entitlements = creditsData?.entitlements || {};
  const seatsIncluded = seatUsage?.seats_included ?? entitlements?.seats_included ?? members.length;
  const seatsUsed = seatUsage?.seats_used ?? members.length;
  const pendingSeats = seatUsage?.pending_invites ?? pendingInviteCount;
  const seatsRemaining = seatUsage?.seats_remaining ?? Math.max(0, seatsIncluded - seatsUsed - pendingSeats);
  const seatLimitReached = Boolean(seatUsage?.limit_reached);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('team.title')}</h1>
          <p className="mt-1 text-slate-500">{t('team.subtitle')}</p>
          <p className="mt-2 text-sm text-slate-400">
            {memberCountLabel}
            {canManageInvites ? ` • ${inviteCountLabel}` : ''}
          </p>
        </div>

        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <span>{t('team.yourRole')}</span>
            <RoleBadge role={currentRole || 'member'} />
          </div>
          <p className="text-xs font-medium text-slate-600">{t('team.access.mode')}: {accessSummary}</p>
          <p className="text-xs text-slate-400">
            {membershipIssue
              ? t('team.access.membershipIssueBody')
              : canManageRoles
                ? t('team.access.ownerBody')
                : canManageInvites
                  ? t('team.access.adminBody')
                  : t('team.access.memberBody')}
          </p>
          <p className="text-xs text-slate-400">
            {t('team.seats.headerSummary', {
              used: seatsUsed,
              pending: pendingSeats,
              total: seatsIncluded,
            })}
          </p>
        </div>
      </div>

      {membershipIssue ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          {t('team.readOnlyWarning')}
        </div>
      ) : !canManageInvites ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {t('team.access.mode')}: <span className="font-semibold">{accessSummary}</span>. {t('team.access.inviteRestriction')}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {t('team.inviteMember')}
          </CardTitle>
          <CardDescription>{t('team.inviteDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManageInvites ? (
            <>
              <form onSubmit={handleInviteSubmit} className="grid gap-3 md:grid-cols-[1.6fr_0.8fr_auto]">
                <Input
                  type="email"
                  placeholder={t('team.inviteEmailPlaceholder')}
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  disabled={inviteMutation.isPending || seatLimitReached}
                />
                <select
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value)}
                  disabled={inviteMutation.isPending || seatLimitReached}
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
                >
                  {visibleInviteRoleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Button type="submit" disabled={inviteMutation.isPending || seatLimitReached}>
                  {inviteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  {t('team.sendInvite')}
                </Button>
              </form>

              <div className={`rounded-xl border p-4 text-xs ${
                seatLimitReached
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}>
                <div className="flex items-start gap-2">
                  {seatLimitReached ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Users className="mt-0.5 h-4 w-4 shrink-0" />}
                  <div>
                    <p className="font-medium text-slate-800">{t('team.seats.title')}</p>
                    <p className="mt-1">
                      {t('team.seats.summary', {
                        used: seatsUsed,
                        pending: pendingSeats,
                        total: seatsIncluded,
                      })}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {seatLimitReached
                        ? t('team.seats.limitReached')
                        : t('team.seats.remaining', { count: seatsRemaining })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-brand-sky/20 bg-brand-sky/5 p-4 text-xs text-slate-600">
                <p className="font-medium text-slate-800">{t('team.joinFlowTitle')}</p>
                <p className="mt-1">{t('team.joinFlowBody')}</p>
                {lastCreatedInvite?.email ? (
                  <div className="mt-3 rounded-xl border border-white/70 bg-white/80 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{t('team.latestInvite')}</p>
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
                        {copiedInviteKey === `latest:${lastCreatedInvite.id || lastCreatedInvite.email}` ? t('common.copied') : t('team.copyInviteLink')}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              {t('team.onlyAdminsCanInvite')}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {t('team.pendingInvites')}
          </CardTitle>
          <CardDescription>{t('team.pendingInvitesDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManageInvites ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              {t('team.pendingInvitesRestricted')}
            </div>
          ) : isLoadingInvites ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : invitesError ? (
            <p className="text-sm text-rose-600">{invitesError.message || t('team.errors.loadInvites')}</p>
          ) : invites.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              <p>{t('team.noInvites')}</p>
              <p className="mt-1 text-xs text-slate-400">{t('team.noInvitesHint')}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {invites.map((invite) => {
                const isRevoking = revokeInviteMutation.isPending && revokeInviteMutation.variables === invite.id;

                return (
                  <div key={invite.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.5fr)_140px_120px_auto] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{invite.email}</p>
                      <p className="text-xs text-slate-500">{t('team.createdOn', { date: formatDate(invite.created_at, i18n.language) })}</p>
                    </div>
                    <RoleBadge role={invite.role} />
                    <span className="text-xs font-medium uppercase tracking-wide text-amber-600">{t('common.pending')}</span>
                    <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyInviteSignupUrl(invite.email, invite.id)}
                      >
                        {copiedInviteKey === invite.id ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                        {copiedInviteKey === invite.id ? t('common.copied') : t('team.copyInviteLink')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isRevoking}
                        onClick={() => revokeInviteMutation.mutate(invite.id)}
                      >
                        {isRevoking ? <Loader2 className="h-4 w-4 animate-spin" /> : t('team.revokeInvite')}
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
            {t('team.title')}
          </CardTitle>
          <CardDescription>
            {members.length <= 1
              ? t('team.singleMemberDescription')
              : t('team.membersDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingMembers ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : membersError ? (
            <p className="text-sm text-rose-600">{membersError.message || t('team.errors.loadMembers')}</p>
          ) : members.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              {t('team.noMembers')}
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
                        {isCurrentUser ? <span className="ml-2 text-xs text-slate-400">{t('team.you')}</span> : null}
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
                          {inviteRoleOptions.map((option) => (
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
                              t('team.transferOwnershipConfirm', { member: memberLabel })
                            );
                            if (!confirmed) return;
                            transferOwnershipMutation.mutate(member.user_id);
                          }}
                        >
                          {isTransferringOwnership ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          {t('team.transferOwnership')}
                        </Button>
                      ) : null}
                      <span className="text-xs text-slate-400">
                        {member.role === 'owner'
                          ? t('team.ownerRemovalHint')
                          : canManageRoles
                            ? t('team.roleManagedAbove')
                            : t('team.access.readOnly')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-slate-600">
            {t('team.ownerTransferHint')}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('team.rolesPermissions')}</CardTitle>
          <CardDescription>{t('team.rolesPermissionsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-medium text-slate-900">{t('team.owner')}</p>
            <p className="mt-1 text-xs text-slate-500">{t('team.ownerDescription')}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-medium text-slate-900">{t('team.admin')}</p>
            <p className="mt-1 text-xs text-slate-500">{t('team.adminDescription')}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-medium text-slate-900">{t('team.member')}</p>
            <p className="mt-1 text-xs text-slate-500">{t('team.memberDescription')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

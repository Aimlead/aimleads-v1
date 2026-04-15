import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Crown, Loader2, Mail, Shield, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ROUTES } from '@/constants/routes';
import { dataClient } from '@/services/dataClient';
import { useAuth } from '@/lib/AuthContext';

const inviteSchema = z.object({
  email: z.string().min(1, 'L\'email est requis').email('Adresse email invalide'),
  role: z.enum(['member', 'admin'], { required_error: 'Rôle requis' }),
});

const INVITE_ROLE_OPTIONS = [
  { value: 'member', label: 'Membre' },
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
  const [lastCreatedInvite, setLastCreatedInvite] = useState(null);
  const [copiedInviteKey, setCopiedInviteKey] = useState('');

  const { register: registerInvite, handleSubmit: handleInviteRHF, reset: resetInviteForm, formState: { errors: inviteErrors } } = useForm({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'member' },
  });

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
    ? 'Vérification de l\'appartenance requise'
    : canManageRoles
      ? 'Accès complet'
      : canManageInvites
        ? 'Accès invitations uniquement'
        : 'Lecture seule';
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
      toast.error('Créez une invitation avant de copier le lien.');
      return;
    }

    if (!navigator?.clipboard?.writeText) {
      toast.error('Accès au presse-papier non disponible dans ce navigateur.');
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedInviteKey(String(key || email));
      toast.success('Lien d\'inscription copié.');
    } catch {
      toast.error('Échec de la copie du lien d\'inscription.');
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
      toast.success(`Invitation créée pour ${variables.email}.`);
      resetInviteForm();
      setLastCreatedInvite(invite || null);
      setCopiedInviteKey('');
      queryClient.invalidateQueries({ queryKey: ['workspace-invites'] });
    },
    onError: (error) => {
      toast.error(error?.message || 'Échec de la création de l\'invitation.');
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ memberUserId, role }) => dataClient.workspace.updateMemberRole(memberUserId, { role }),
    onSuccess: () => {
      toast.success('Rôle mis à jour.');
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
    },
    onError: (error) => {
      toast.error(error?.message || 'Échec de la mise à jour du rôle.');
    },
  });

  const transferOwnershipMutation = useMutation({
    mutationFn: (memberUserId) => dataClient.workspace.transferOwnership(memberUserId),
    onSuccess: (result) => {
      const nextOwnerLabel = result?.new_owner?.full_name || result?.new_owner?.email || 'le membre sélectionné';
      toast.success(`Propriété transférée à ${nextOwnerLabel}. Vous êtes maintenant admin.`);
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-invites'] });
    },
    onError: (error) => {
      toast.error(error?.message || 'Échec du transfert de propriété.');
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId) => dataClient.workspace.revokeInvite(inviteId),
    onSuccess: () => {
      toast.success('Invitation révoquée.');
      queryClient.invalidateQueries({ queryKey: ['workspace-invites'] });
    },
    onError: (error) => {
      toast.error(error?.message || 'Échec de la révocation de l\'invitation.');
    },
  });

  const handleInviteSubmit = async (data) => {
    await inviteMutation.mutateAsync({
      email: data.email.trim().toLowerCase(),
      role: data.role,
    });
  };
  const memberCountLabel = `${members.length} membre${members.length === 1 ? '' : 's'}`;
  const pendingInviteCount = canManageInvites ? invites.length : 0;
  const inviteCountLabel = `${pendingInviteCount} invitation${pendingInviteCount === 1 ? '' : 's'} en attente`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Équipe</h1>
          <p className="mt-1 text-slate-500">Gérez qui accède à ce workspace et qui qualifie les leads.</p>
          <p className="mt-2 text-sm text-slate-400">
            {memberCountLabel}
            {canManageInvites ? ` • ${inviteCountLabel}` : ''}
          </p>
        </div>

        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <span>Votre rôle</span>
            <RoleBadge role={currentRole || 'member'} />
          </div>
          <p className="text-xs font-medium text-slate-600">Accès : {accessSummary}</p>
          <p className="text-xs text-slate-400">
            {membershipIssue
              ? 'L\'appartenance à ce workspace ne peut pas être vérifiée pour la session actuelle.'
              : canManageRoles
                ? 'Vous gérez les invitations, les rôles, le transfert de propriété et les accès.'
                : canManageInvites
                  ? 'Vous pouvez inviter des membres et gérer les invitations en attente.'
                  : 'Vous pouvez utiliser le workspace, mais les changements d\'accès sont en lecture seule.'}
          </p>
        </div>
      </div>

      {membershipIssue ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          L&apos;appartenance au workspace ne peut pas être vérifiée pour cette session. La gestion de l&apos;équipe reste en lecture seule jusqu&apos;à la réparation de l&apos;enregistrement de membership.
        </div>
      ) : !canManageInvites ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Mode d&apos;accès : <span className="font-semibold">{accessSummary}</span>. La création d&apos;invitations et les changements de rôle sont réservés aux admins et propriétaires.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Inviter un collaborateur
          </CardTitle>
          <CardDescription>
            Crée une invitation pour cet email. Le collaborateur rejoindra ce workspace en s&apos;inscrivant avec la même adresse email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManageInvites ? (
            <>
              <form onSubmit={handleInviteRHF(handleInviteSubmit)} className="space-y-2">
                <div className="grid gap-3 md:grid-cols-[1.6fr_0.8fr_auto]">
                  <div>
                    <Input
                      type="email"
                      placeholder="teammate@company.com"
                      disabled={inviteMutation.isPending}
                      aria-invalid={Boolean(inviteErrors.email)}
                      {...registerInvite('email')}
                    />
                    {inviteErrors.email && (
                      <p className="mt-1 text-xs text-rose-600">{inviteErrors.email.message}</p>
                    )}
                  </div>
                  <select
                    disabled={inviteMutation.isPending}
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
                    {...registerInvite('role')}
                  >
                    {inviteRoleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" disabled={inviteMutation.isPending}>
                    {inviteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                    Inviter
                  </Button>
                </div>
              </form>

              <div className="rounded-xl border border-brand-sky/20 bg-brand-sky/5 p-4 text-xs text-slate-600">
                <p className="font-medium text-slate-800">Comment les collaborateurs rejoignent</p>
                <p className="mt-1">
                  Ils doivent créer leur compte avec l&apos;email invité. Si les emails transactionnels ne sont pas encore configurés, copiez le lien d&apos;inscription ci-dessous et partagez-le manuellement.
                </p>
                {lastCreatedInvite?.email ? (
                  <div className="mt-3 rounded-xl border border-white/70 bg-white/80 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Dernière invitation</p>
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
                        {copiedInviteKey === `latest:${lastCreatedInvite.id || lastCreatedInvite.email}` ? 'Copié' : 'Copier le lien'}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Seuls les propriétaires et admins peuvent créer des invitations. Les membres peuvent utiliser le workspace normalement.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Invitations en attente
          </CardTitle>
          <CardDescription>
            Les invitations restent ici jusqu&apos;à ce que le collaborateur s&apos;inscrive ou que vous la révoquez.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManageInvites ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Les invitations en attente sont visibles uniquement par les admins et propriétaires.
            </div>
          ) : isLoadingInvites ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement des invitations…
            </div>
          ) : invitesError ? (
            <p className="text-sm text-rose-600">{invitesError.message || 'Échec du chargement des invitations.'}</p>
          ) : invites.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              <p>Aucune invitation en attente.</p>
              <p className="mt-1 text-xs text-slate-400">Créez une invitation pour ajouter votre premier collaborateur.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {invites.map((invite) => {
                const isRevoking = revokeInviteMutation.isPending && revokeInviteMutation.variables === invite.id;

                return (
                  <div key={invite.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.5fr)_140px_120px_auto] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{invite.email}</p>
                      <p className="text-xs text-slate-500">Créé le {formatDate(invite.created_at)}</p>
                    </div>
                    <RoleBadge role={invite.role} />
                    <span className="text-xs font-medium uppercase tracking-wide text-amber-600">En attente</span>
                    <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyInviteSignupUrl(invite.email, invite.id)}
                      >
                        {copiedInviteKey === invite.id ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                        {copiedInviteKey === invite.id ? 'Copié' : 'Copier le lien'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isRevoking}
                        onClick={() => revokeInviteMutation.mutate(invite.id)}
                      >
                        {isRevoking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Révoquer'}
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
            Membres
          </CardTitle>
          <CardDescription>
            {members.length <= 1
              ? 'Vous êtes le seul membre de ce workspace.'
              : 'Gérez qui peut collaborer sur la qualification, le pipeline et la prospection.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingMembers ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement des membres…
            </div>
          ) : membersError ? (
            <p className="text-sm text-rose-600">{membersError.message || 'Échec du chargement des membres du workspace.'}</p>
          ) : members.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              Aucun membre trouvé.
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
                        {isCurrentUser ? <span className="ml-2 text-xs text-slate-400">Vous</span> : null}
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
                              `Transférer la propriété du workspace à ${memberLabel} ? Vous deviendrez admin.`
                            );
                            if (!confirmed) return;
                            transferOwnershipMutation.mutate(member.user_id);
                          }}
                        >
                          {isTransferringOwnership ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Transférer la propriété
                        </Button>
                      ) : null}
                      <span className="text-xs text-slate-400">
                        {member.role === 'owner'
                          ? 'Transférez la propriété avant de retirer ce propriétaire'
                          : canManageRoles
                            ? 'Rôle géré ci-dessus'
                            : 'Lecture seule'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-slate-600">
            Les propriétaires peuvent transférer la propriété avant de quitter. Les membres non-propriétaires peuvent être retirés sans impacter l&apos;accès au workspace.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rôles et permissions</CardTitle>
          <CardDescription>Choix de rôle simple et explicite. Le départ sécurisé est intentionnellement limité.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-medium text-slate-900">Propriétaire</p>
            <p className="mt-1 text-xs text-slate-500">Contrôle total du workspace : gestion des rôles et transfert de propriété.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-medium text-slate-900">Admin</p>
            <p className="mt-1 text-xs text-slate-500">Peut inviter des membres et gérer les invitations en attente.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-medium text-slate-900">Membre</p>
            <p className="mt-1 text-xs text-slate-500">Peut utiliser le workspace mais ne peut pas gérer les accès.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

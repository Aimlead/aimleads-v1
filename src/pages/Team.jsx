import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Crown, Mail, Shield, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { dataClient } from '@/services/dataClient';
import { useAuth } from '@/lib/AuthContext';

function RoleBadge({ role }) {
  const configs = {
    owner: { color: 'bg-brand-sky/10 text-brand-sky', icon: Crown },
    admin: { color: 'bg-blue-100 text-blue-700', icon: Shield },
    member: { color: 'bg-slate-100 text-slate-600', icon: null },
  };
  const config = configs[role] || configs.member;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${config.color}`}>
      {Icon && <Icon className="w-3 h-3" />}
      {role}
    </span>
  );
}

export default function Team() {
  const { user } = useAuth();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['workspace-members'],
    queryFn: () => dataClient.workspace.listMembers(),
    enabled: typeof dataClient.workspace?.listMembers === 'function',
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Team</h1>
        <p className="text-slate-500 mt-1">Members of your workspace.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Workspace members
          </CardTitle>
          <CardDescription>
            Workspace: <span className="font-mono text-xs">{user?.workspace_id}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No team members found.</p>
              <p className="text-xs mt-1">Invite teammates to collaborate on your workspace.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {members.map((member) => (
                <div key={member.user_id || member.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{member.full_name || member.email || member.user_id}</p>
                    {member.email && <p className="text-xs text-slate-500">{member.email}</p>}
                  </div>
                  <RoleBadge role={member.role} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Invite team members
          </CardTitle>
          <CardDescription>
            Add colleagues to your workspace to collaborate on lead qualification.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 bg-brand-sky/5 border border-brand-sky/20 rounded-xl">
            <div className="w-10 h-10 rounded-full bg-brand-sky/10 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-brand-sky" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">Invite by email</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Team invitations via email are coming soon. For now, contact your account manager to add users.
              </p>
            </div>
            <Button variant="outline" size="sm" disabled className="shrink-0">
              Coming soon
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

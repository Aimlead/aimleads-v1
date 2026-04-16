import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Download, Filter, Loader2, Mail, RefreshCcw, Search, Shield, Sparkles, Tag, Trash2, TrendingUp, Users } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';
import { dataClient } from '@/services/dataClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const ACTION_ORDER = ['create', 'update', 'delete', 'export'];

function ActionBadge({ action, actionMeta }) {
  const meta = actionMeta[action] || { label: action, color: 'bg-slate-50 text-slate-600 border-slate-100', dot: 'bg-slate-400' };
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border', meta.color)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  );
}

function AuditRow({ entry, delay = 0, resourceMetaMap, actionMeta, t, distanceLocale }) {
  const resourceMeta = resourceMetaMap[entry.resource_type] || { label: entry.resource_type, icon: Shield };
  const ResourceIcon = resourceMeta.icon;
  const changesText = entry.changes
    ? Object.entries(entry.changes)
        .map(([k, v]) => `${k}: ${String(v).slice(0, 50)}`)
        .join(' · ')
    : null;

  return (
    <motion.tr
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.2 }}
      className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
    >
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
            <ResourceIcon className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">{resourceMeta.label}</p>
            <p className="text-xs text-slate-400 font-mono">
              {entry.resource_id
                ? (String(entry.resource_id).length > 20 ? `${String(entry.resource_id).slice(0, 20)}…` : String(entry.resource_id))
                : t('auditLog.common.empty', { defaultValue: '—' })}
            </p>
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <ActionBadge action={entry.action} actionMeta={actionMeta} />
      </td>
      <td className="px-5 py-3.5 max-w-xs">
        {changesText ? (
          <p className="text-xs text-slate-500 truncate">{changesText}</p>
        ) : (
          <p className="text-xs text-slate-300 italic">{t('auditLog.common.empty', { defaultValue: '—' })}</p>
        )}
      </td>
      <td className="px-5 py-3.5 text-right">
        <p className="text-xs text-slate-500">
          {entry.created_at
            ? formatDistanceToNow(new Date(entry.created_at), { addSuffix: true, locale: distanceLocale })
            : t('auditLog.common.empty', { defaultValue: '—' })}
        </p>
        <p className="text-[10px] text-slate-300 mt-0.5">{entry.created_at ? format(new Date(entry.created_at), 'dd MMM HH:mm') : ''}</p>
      </td>
    </motion.tr>
  );
}

export default function AuditLog() {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [resourceFilter, setResourceFilter] = useState('all');

  const actionMeta = {
    create: { label: t('auditLog.actions.create', { defaultValue: 'Created' }), color: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: TrendingUp, dot: 'bg-emerald-400' },
    update: { label: t('auditLog.actions.update', { defaultValue: 'Updated' }), color: 'bg-blue-50 text-blue-700 border-blue-100', icon: Sparkles, dot: 'bg-blue-400' },
    delete: { label: t('auditLog.actions.delete', { defaultValue: 'Deleted' }), color: 'bg-rose-50 text-rose-700 border-rose-100', icon: Trash2, dot: 'bg-rose-400' },
    export: { label: t('auditLog.actions.export', { defaultValue: 'Exported' }), color: 'bg-amber-50 text-amber-700 border-amber-100', icon: Download, dot: 'bg-amber-400' },
  };

  const resourceMetaMap = {
    lead: { label: t('auditLog.resources.lead', { defaultValue: 'Lead' }), icon: TrendingUp },
    icp_profile: { label: t('auditLog.resources.icpProfile', { defaultValue: 'ICP Profile' }), icon: Tag },
    workspace_invite: { label: t('auditLog.resources.workspaceInvite', { defaultValue: 'Workspace Invite' }), icon: Mail },
    workspace_member: { label: t('auditLog.resources.workspaceMember', { defaultValue: 'Workspace Member' }), icon: Users },
    user_data: { label: t('auditLog.resources.userData', { defaultValue: 'Account Data' }), icon: Shield },
    lead_export: { label: t('auditLog.resources.leadExport', { defaultValue: 'Lead Export' }), icon: Download },
  };

  const resourceFilterOptions = [
    { value: 'lead', label: t('auditLog.filters.resourceOptions.leads', { defaultValue: 'Leads' }) },
    { value: 'icp_profile', label: t('auditLog.filters.resourceOptions.icpProfiles', { defaultValue: 'ICP Profiles' }) },
    { value: 'workspace_invite', label: t('auditLog.filters.resourceOptions.workspaceInvites', { defaultValue: 'Workspace invites' }) },
    { value: 'workspace_member', label: t('auditLog.filters.resourceOptions.workspaceMembers', { defaultValue: 'Workspace members' }) },
    { value: 'user_data', label: t('auditLog.filters.resourceOptions.accountDataExports', { defaultValue: 'Account data exports' }) },
    { value: 'lead_export', label: t('auditLog.filters.resourceOptions.leadExports', { defaultValue: 'Lead exports' }) },
  ];
  const distanceLocale = i18n.language?.startsWith('fr') ? fr : enUS;

  const { data: entries = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['audit-log'],
    queryFn: () => dataClient.audit.list({ limit: 200 }),
    staleTime: 10000,
  });

  const filtered = entries.filter((e) => {
    if (actionFilter !== 'all' && e.action !== actionFilter) return false;
    if (resourceFilter !== 'all' && e.resource_type !== resourceFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!String(e.resource_id || '').toLowerCase().includes(s) &&
          !String(e.action || '').toLowerCase().includes(s) &&
          !JSON.stringify(e.changes || {}).toLowerCase().includes(s)) return false;
    }
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{t('auditLog.title', { defaultValue: 'Audit Log' })}</h1>
          </div>
          <p className="text-sm text-slate-500">{t('auditLog.subtitle', { defaultValue: 'Immutable record of all workspace actions and changes.' })}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2 rounded-xl"
        >
          <RefreshCcw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
          {t('auditLog.refresh', { defaultValue: 'Refresh' })}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {ACTION_ORDER.map((action) => {
          const meta = actionMeta[action];
          const count = entries.filter((e) => e.action === action).length;
          return (
            <motion.div
              key={action}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3"
            >
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center border', meta.color)}>
                <meta.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-slate-500 capitalize">
                  {t(`auditLog.countLabels.${action}`, { defaultValue: `${action}s` })}
                </p>
                <p className="text-xl font-bold text-slate-800">{count}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('auditLog.filters.searchPlaceholder', { defaultValue: 'Search changes…' })}
            className="pl-9 rounded-xl text-sm h-9"
          />
        </div>

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-full sm:w-36 h-9 rounded-xl text-sm">
            <Filter className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
            <SelectValue placeholder={t('auditLog.filters.actionPlaceholder', { defaultValue: 'Action' })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('auditLog.filters.allActions', { defaultValue: 'All actions' })}</SelectItem>
            <SelectItem value="create">{t('auditLog.actions.create', { defaultValue: 'Created' })}</SelectItem>
            <SelectItem value="update">{t('auditLog.actions.update', { defaultValue: 'Updated' })}</SelectItem>
            <SelectItem value="delete">{t('auditLog.actions.delete', { defaultValue: 'Deleted' })}</SelectItem>
            <SelectItem value="export">{t('auditLog.actions.export', { defaultValue: 'Exported' })}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={resourceFilter} onValueChange={setResourceFilter}>
          <SelectTrigger className="w-full sm:w-36 h-9 rounded-xl text-sm">
            <SelectValue placeholder={t('auditLog.filters.resourcePlaceholder', { defaultValue: 'Resource' })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('auditLog.filters.allResources', { defaultValue: 'All resources' })}</SelectItem>
            {resourceFilterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(search || actionFilter !== 'all' || resourceFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-500 h-9"
            onClick={() => { setSearch(''); setActionFilter('all'); setResourceFilter('all'); }}
          >
            {t('auditLog.filters.clear', { defaultValue: 'Clear filters' })}
          </Button>
        )}

        <span className="ml-auto text-xs text-slate-400">
          {t('auditLog.filters.entryCount', { defaultValue: '{{count}} entries', count: filtered.length })}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-slate-300" />
            </div>
            <p className="text-sm text-slate-400">{t('auditLog.empty', { defaultValue: 'No audit entries found' })}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('auditLog.table.resource', { defaultValue: 'Resource' })}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('auditLog.table.action', { defaultValue: 'Action' })}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('auditLog.table.changes', { defaultValue: 'Changes' })}</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('auditLog.table.when', { defaultValue: 'When' })}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((entry, i) => (
                  <AuditRow key={entry.id || i} entry={entry} delay={i * 0.02} resourceMetaMap={resourceMetaMap} actionMeta={actionMeta} t={t} distanceLocale={distanceLocale} />
                ))}
              </tbody>
            </table>
            {filtered.length > 100 && (
              <div className="px-5 py-3 text-center text-xs text-slate-400 border-t border-slate-50">
                {t('auditLog.showingFirst', {
                  defaultValue: 'Showing first {{shown}} of {{count}} entries',
                  shown: 100,
                  count: filtered.length,
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, FolderOpen, Loader2, PencilLine, Sparkles, Tags } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { dataClient } from '@/services/dataClient';

const UNLISTED = '__unlisted__';

const normalizeListKey = (value = '') => {
  const trimmed = String(value || '').trim();
  return trimmed || UNLISTED;
};

const formatListLabel = (value, t) => (value === UNLISTED ? t('lists.unlisted', { defaultValue: 'Non classée' }) : value);

export default function Lists() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveTarget, setMoveTarget] = useState(null);
  const [moveValue, setMoveValue] = useState(UNLISTED);
  const [processingKey, setProcessingKey] = useState('');

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => dataClient.leads.list('-created_at'),
  });

  const listStats = useMemo(() => {
    const grouped = new Map();

    for (const lead of leads) {
      const key = normalizeListKey(lead.source_list);
      const current = grouped.get(key) || {
        key,
        total: 0,
        qualified: 0,
        scoreSum: 0,
        scored: 0,
        lastImportAt: null,
      };

      current.total += 1;
      if ((lead.final_category || '').toLowerCase() === 'high fit') current.qualified += 1;

      const score = Number.isFinite(lead.final_score) ? lead.final_score : lead.icp_score;
      if (Number.isFinite(score)) {
        current.scoreSum += score;
        current.scored += 1;
      }

      const createdAt = lead.created_at || lead.created_date;
      if (createdAt && (!current.lastImportAt || new Date(createdAt) > new Date(current.lastImportAt))) {
        current.lastImportAt = createdAt;
      }

      grouped.set(key, current);
    }

    return Array.from(grouped.values()).sort((a, b) => b.total - a.total);
  }, [leads]);

  const refreshLeads = () => queryClient.invalidateQueries({ queryKey: ['leads'] });

  const renameList = async () => {
    if (!renameTarget) return;
    const nextName = renameValue.trim();
    if (!nextName) {
      toast.error(t('lists.toasts.renameRequired', { defaultValue: 'Le nouveau nom de liste est requis.' }));
      return;
    }

    const impacted = leads.filter((lead) => normalizeListKey(lead.source_list) === renameTarget);
    if (impacted.length === 0) return;

    setProcessingKey(`rename-${renameTarget}`);
    try {
      await Promise.all(impacted.map((lead) => dataClient.leads.update(lead.id, { source_list: nextName })));
      toast.success(t('lists.toasts.renamed', { defaultValue: 'Liste renommée sur {{count}} leads.', count: impacted.length }));
      setRenameTarget(null);
      setRenameValue('');
      await refreshLeads();
    } catch {
      toast.error(t('lists.toasts.renameFailed', { defaultValue: 'Impossible de renommer cette liste.' }));
    } finally {
      setProcessingKey('');
    }
  };

  const moveList = async () => {
    if (!moveTarget) return;

    const destination = moveValue === UNLISTED ? '' : moveValue.trim();
    const impacted = leads.filter((lead) => normalizeListKey(lead.source_list) === moveTarget);
    if (impacted.length === 0) return;

    setProcessingKey(`move-${moveTarget}`);
    try {
      await Promise.all(impacted.map((lead) => dataClient.leads.update(lead.id, { source_list: destination })));
      toast.success(t('lists.toasts.moved', {
        defaultValue: '{{count}} leads déplacés vers {{list}}.',
        count: impacted.length,
        list: formatListLabel(moveValue, t),
      }));
      setMoveTarget(null);
      setMoveValue(UNLISTED);
      await refreshLeads();
    } catch {
      toast.error(t('lists.toasts.moveFailed', { defaultValue: 'Impossible de déplacer cette liste.' }));
    } finally {
      setProcessingKey('');
    }
  };

  const totalLists = listStats.length;
  const unlistedLeads = listStats.find((entry) => entry.key === UNLISTED)?.total || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{t('lists.title', { defaultValue: 'Gestion des listes' })}</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {t('lists.subtitle', {
              defaultValue: 'Centralisez vos listes importées, fusionnez les doublons et nettoyez vos sources avant les prochaines campagnes.',
            })}
          </p>
        </div>
        <Badge className="bg-brand-sky/10 text-brand-sky border-brand-sky/20">
          <Sparkles className="w-3.5 h-3.5 mr-1" />
          {t('lists.badge', { defaultValue: 'Ops data produit' })}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">{t('lists.metrics.totalLists', { defaultValue: 'Listes actives' })}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{totalLists}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">{t('lists.metrics.totalLeads', { defaultValue: 'Leads classés' })}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{Math.max(leads.length - unlistedLeads, 0)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">{t('lists.metrics.unlisted', { defaultValue: 'Leads non classés' })}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{unlistedLeads}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-slate-500" />
          <p className="text-sm font-semibold text-slate-900">{t('lists.table.title', { defaultValue: 'Portefeuille de listes' })}</p>
        </div>

        {isLoading ? (
          <div className="py-14 flex items-center justify-center text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            {t('lists.loading', { defaultValue: 'Chargement des listes…' })}
          </div>
        ) : listStats.length === 0 ? (
          <div className="py-14 text-center text-slate-500 text-sm">{t('lists.empty', { defaultValue: 'Aucune liste disponible. Importez des leads pour démarrer.' })}</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {listStats.map((entry) => {
              const avgScore = entry.scored > 0 ? Math.round(entry.scoreSum / entry.scored) : null;
              const busy = processingKey.includes(entry.key);
              return (
                <div key={entry.key} className="px-4 py-3 flex flex-wrap items-center gap-3">
                  <div className="min-w-[220px] flex-1">
                    <p className="font-semibold text-slate-900">{formatListLabel(entry.key, t)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {t('lists.row.meta', {
                        defaultValue: '{{count}} leads · {{qualified}} high fit',
                        count: entry.total,
                        qualified: entry.qualified,
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="gap-1">
                      <Tags className="w-3 h-3" />
                      {avgScore === null ? t('lists.row.noScore', { defaultValue: 'Pas de score' }) : `${avgScore}/100`}
                    </Badge>
                    {entry.lastImportAt ? (
                      <Badge variant="outline">
                        {new Date(entry.lastImportAt).toLocaleDateString()}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={busy}
                      onClick={() => {
                        setRenameTarget(entry.key);
                        setRenameValue(entry.key === UNLISTED ? '' : entry.key);
                      }}
                    >
                      <PencilLine className="w-3.5 h-3.5" />
                      {t('lists.actions.rename', { defaultValue: 'Renommer' })}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={busy || listStats.length < 2}
                      onClick={() => {
                        setMoveTarget(entry.key);
                        const candidate = listStats.find((list) => list.key !== entry.key);
                        setMoveValue(candidate?.key || UNLISTED);
                      }}
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      {t('lists.actions.move', { defaultValue: 'Fusionner / déplacer' })}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('lists.rename.title', { defaultValue: 'Renommer une liste' })}</DialogTitle>
            <DialogDescription>
              {t('lists.rename.desc', { defaultValue: 'Le nom sera mis à jour sur tous les leads de cette liste.' })}
            </DialogDescription>
          </DialogHeader>
          <Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} placeholder="ex: Webinar Avril 2026" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>{t('common.cancel', { defaultValue: 'Annuler' })}</Button>
            <Button onClick={renameList} disabled={processingKey.startsWith('rename-')}>
              {processingKey.startsWith('rename-') ? <Loader2 className="w-4 h-4 animate-spin" /> : t('lists.actions.rename', { defaultValue: 'Renommer' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(moveTarget)} onOpenChange={(open) => !open && setMoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('lists.move.title', { defaultValue: 'Déplacer les leads' })}</DialogTitle>
            <DialogDescription>
              {t('lists.move.desc', { defaultValue: 'Déplacez tous les leads de cette liste vers une autre liste cible.' })}
            </DialogDescription>
          </DialogHeader>
          <Select value={moveValue} onValueChange={setMoveValue}>
            <SelectTrigger>
              <SelectValue placeholder={t('lists.move.placeholder', { defaultValue: 'Choisir une liste cible' })} />
            </SelectTrigger>
            <SelectContent>
              {listStats
                .filter((entry) => entry.key !== moveTarget)
                .map((entry) => (
                  <SelectItem key={entry.key} value={entry.key}>{formatListLabel(entry.key, t)}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveTarget(null)}>{t('common.cancel', { defaultValue: 'Annuler' })}</Button>
            <Button onClick={moveList} disabled={processingKey.startsWith('move-')}>
              {processingKey.startsWith('move-') ? <Loader2 className="w-4 h-4 animate-spin" /> : t('lists.actions.move', { defaultValue: 'Fusionner / déplacer' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

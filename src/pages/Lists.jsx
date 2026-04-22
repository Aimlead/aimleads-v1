import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, ArrowUpDown, ChevronLeft, ChevronRight, FolderOpen, Loader2, PencilLine, Sparkles, Tags } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('total');
  const [sortDirection, setSortDirection] = useState('desc');
  const [page, setPage] = useState(1);
  const [selectedLists, setSelectedLists] = useState([]);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveTarget, setMoveTarget] = useState(null);
  const [moveValue, setMoveValue] = useState(UNLISTED);
  const [bulkMoveTarget, setBulkMoveTarget] = useState(null);
  const [bulkMoveValue, setBulkMoveValue] = useState(UNLISTED);
  const [processingKey, setProcessingKey] = useState('');
  const PAGE_SIZE = 8;

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

    return Array.from(grouped.values());
  }, [leads]);

  const filteredAndSortedLists = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filtered = normalizedSearch
      ? listStats.filter((entry) => formatListLabel(entry.key, t).toLowerCase().includes(normalizedSearch))
      : listStats;

    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') {
        return formatListLabel(a.key, t).localeCompare(formatListLabel(b.key, t), 'fr') * direction;
      }
      if (sortBy === 'qualified') return (a.qualified - b.qualified) * direction;
      if (sortBy === 'avgScore') {
        const aScore = a.scored > 0 ? a.scoreSum / a.scored : -1;
        const bScore = b.scored > 0 ? b.scoreSum / b.scored : -1;
        return (aScore - bScore) * direction;
      }
      if (sortBy === 'lastImportAt') {
        const aDate = a.lastImportAt ? new Date(a.lastImportAt).getTime() : 0;
        const bDate = b.lastImportAt ? new Date(b.lastImportAt).getTime() : 0;
        return (aDate - bDate) * direction;
      }
      return (a.total - b.total) * direction;
    });
  }, [listStats, searchTerm, sortBy, sortDirection, t]);

  const totalPages = Math.max(Math.ceil(filteredAndSortedLists.length / PAGE_SIZE), 1);
  const paginatedLists = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredAndSortedLists.slice(start, start + PAGE_SIZE);
  }, [filteredAndSortedLists, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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
      setSelectedLists((current) => current.filter((key) => key !== renameTarget));
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
      setSelectedLists((current) => current.filter((key) => key !== moveTarget));
      await refreshLeads();
    } catch {
      toast.error(t('lists.toasts.moveFailed', { defaultValue: 'Impossible de déplacer cette liste.' }));
    } finally {
      setProcessingKey('');
    }
  };

  const bulkMoveLists = async () => {
    if (!bulkMoveTarget) return;

    const impacted = leads.filter((lead) => selectedLists.includes(normalizeListKey(lead.source_list)));
    if (!impacted.length) return;

    const destination = bulkMoveValue === UNLISTED ? '' : bulkMoveValue.trim();
    setProcessingKey('bulk-move');
    try {
      await Promise.all(impacted.map((lead) => dataClient.leads.update(lead.id, { source_list: destination })));
      toast.success(t('lists.toasts.moved', {
        defaultValue: '{{count}} leads déplacés vers {{list}}.',
        count: impacted.length,
        list: formatListLabel(bulkMoveValue, t),
      }));
      setBulkMoveTarget(null);
      setBulkMoveValue(UNLISTED);
      setSelectedLists([]);
      await refreshLeads();
    } catch {
      toast.error(t('lists.toasts.moveFailed', { defaultValue: 'Impossible de déplacer cette liste.' }));
    } finally {
      setProcessingKey('');
    }
  };

  const totalLists = listStats.length;
  const unlistedLeads = listStats.find((entry) => entry.key === UNLISTED)?.total || 0;
  const allVisibleSelected = paginatedLists.length > 0 && paginatedLists.every((entry) => selectedLists.includes(entry.key));

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
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <Input
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setPage(1);
            }}
            placeholder={t('lists.table.searchPlaceholder', { defaultValue: 'Rechercher une liste…' })}
            className="w-full sm:max-w-xs"
          />
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="total">{t('lists.table.sort.total', { defaultValue: 'Trier: Nb leads' })}</SelectItem>
              <SelectItem value="qualified">{t('lists.table.sort.qualified', { defaultValue: 'Trier: High fit' })}</SelectItem>
              <SelectItem value="avgScore">{t('lists.table.sort.score', { defaultValue: 'Trier: Score moyen' })}</SelectItem>
              <SelectItem value="lastImportAt">{t('lists.table.sort.date', { defaultValue: 'Trier: Dernier import' })}</SelectItem>
              <SelectItem value="name">{t('lists.table.sort.name', { defaultValue: 'Trier: Nom' })}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
            aria-label={t('lists.table.sort.toggleDirection', { defaultValue: 'Inverser le sens du tri' })}
          >
            <ArrowUpDown className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selectedLists.length === 0}
            onClick={() => {
              setBulkMoveTarget('bulk');
              const candidate = filteredAndSortedLists.find((entry) => !selectedLists.includes(entry.key));
              setBulkMoveValue(candidate?.key || UNLISTED);
            }}
          >
            {t('lists.actions.bulkMove', { defaultValue: 'Déplacer la sélection' })}
          </Button>
          {selectedLists.length > 0 ? (
            <Badge variant="outline">{t('lists.table.selected', { defaultValue: '{{count}} sélectionnée(s)', count: selectedLists.length })}</Badge>
          ) : null}
        </div>

        {isLoading ? (
          <div className="py-14 flex items-center justify-center text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            {t('lists.loading', { defaultValue: 'Chargement des listes…' })}
          </div>
        ) : filteredAndSortedLists.length === 0 ? (
          <div className="py-14 text-center text-slate-500 text-sm">{t('lists.empty', { defaultValue: 'Aucune liste disponible. Importez des leads pour démarrer.' })}</div>
        ) : (
          <div className="divide-y divide-slate-100">
            <div className="px-4 py-2 bg-slate-50 flex items-center text-xs text-slate-500">
              <Checkbox
                checked={allVisibleSelected}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedLists((current) => Array.from(new Set([...current, ...paginatedLists.map((entry) => entry.key)])));
                    return;
                  }
                  setSelectedLists((current) => current.filter((key) => !paginatedLists.find((entry) => entry.key === key)));
                }}
                aria-label={t('lists.table.selectVisible', { defaultValue: 'Sélectionner les listes visibles' })}
              />
              <span className="ml-3">{t('lists.table.visibleCount', { defaultValue: '{{visible}} sur {{total}} listes', visible: paginatedLists.length, total: filteredAndSortedLists.length })}</span>
            </div>
            {paginatedLists.map((entry) => {
              const avgScore = entry.scored > 0 ? Math.round(entry.scoreSum / entry.scored) : null;
              const busy = processingKey.includes(entry.key);
              return (
                <div key={entry.key} className="px-4 py-3 flex flex-wrap items-center gap-3">
                  <Checkbox
                    checked={selectedLists.includes(entry.key)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedLists((current) => [...current, entry.key]);
                      } else {
                        setSelectedLists((current) => current.filter((key) => key !== entry.key));
                      }
                    }}
                    aria-label={t('lists.table.selectList', { defaultValue: 'Sélectionner la liste' })}
                  />
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
                      disabled={busy || filteredAndSortedLists.length < 2}
                      onClick={() => {
                        setMoveTarget(entry.key);
                        const candidate = filteredAndSortedLists.find((list) => list.key !== entry.key);
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
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {t('lists.table.pagination', { defaultValue: 'Page {{page}} / {{total}}', page, total: totalPages })}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(current + 1, totalPages))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
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

      <Dialog open={Boolean(bulkMoveTarget)} onOpenChange={(open) => !open && setBulkMoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('lists.move.title', { defaultValue: 'Déplacer les leads' })}</DialogTitle>
            <DialogDescription>
              {t('lists.move.bulkDesc', {
                defaultValue: 'Déplacez tous les leads des listes sélectionnées vers une autre liste cible.',
              })}
            </DialogDescription>
          </DialogHeader>
          <Select value={bulkMoveValue} onValueChange={setBulkMoveValue}>
            <SelectTrigger>
              <SelectValue placeholder={t('lists.move.placeholder', { defaultValue: 'Choisir une liste cible' })} />
            </SelectTrigger>
            <SelectContent>
              {filteredAndSortedLists
                .filter((entry) => !selectedLists.includes(entry.key))
                .map((entry) => (
                  <SelectItem key={entry.key} value={entry.key}>{formatListLabel(entry.key, t)}</SelectItem>
                ))}
              {selectedLists.includes(UNLISTED) ? null : (
                <SelectItem value={UNLISTED}>{formatListLabel(UNLISTED, t)}</SelectItem>
              )}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkMoveTarget(null)}>{t('common.cancel', { defaultValue: 'Annuler' })}</Button>
            <Button onClick={bulkMoveLists} disabled={processingKey === 'bulk-move'}>
              {processingKey === 'bulk-move' ? <Loader2 className="w-4 h-4 animate-spin" /> : t('lists.actions.bulkMove', { defaultValue: 'Déplacer la sélection' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

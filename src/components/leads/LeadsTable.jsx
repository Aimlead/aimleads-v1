import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { ChevronLeft, ChevronRight, Database, ExternalLink, Loader2, Search, Sparkles, Trash2, Upload, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SkeletonRow } from '@/components/ui/skeleton';
import { ROUTES } from '@/constants/routes';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import FollowUpBadge from '@/components/leads/FollowUpBadge';
import FollowUpFilter from '@/components/leads/FollowUpFilter';
import ScorePill from '@/components/leads/ScorePill';
import StatusBadge from '@/components/leads/StatusBadge';
import StatusFilter from '@/components/leads/StatusFilter';
import { LEAD_STATUS } from '@/constants/leads';
import { dataClient } from '@/services/dataClient';

const formatCompanySize = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'n/a';
  if (numeric >= 1000) return `${Math.round(numeric / 100) / 10}k`;
  return String(numeric);
};

const sourceListLabel = (value) => {
  const text = String(value || '').trim();
  return text || 'Unlisted';
};

const toMetric = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

const toWebsiteHref = (value) => {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.startsWith('http://') || text.startsWith('https://')) return text;
  return `https://${text}`;
};

/**
 * @param {{ leads: Array, isLoading: boolean, onSelectLead: Function, onOpenLeadPage: Function, onLeadUpdated: Function }} props
 */
const PAGE_SIZE = 50;

export default function LeadsTable({ leads, isLoading = false, onSelectLead, onOpenLeadPage, onLeadUpdated }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [followUpFilter, setFollowUpFilter] = useState('all');
  const [industryFilter, setIndustryFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [minScoreFilter, setMinScoreFilter] = useState('');
  const [analyzingIds, setAnalyzingIds] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(null); // null | { type: 'bulk' } | { type: 'single', lead }
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [page, setPage] = useState(1);

  const industries = useMemo(() => {
    const set = new Set(leads.map((l) => l.industry).filter(Boolean));
    return [...set].sort();
  }, [leads]);

  const countries = useMemo(() => {
    const set = new Set(leads.map((l) => l.country).filter(Boolean));
    return [...set].sort();
  }, [leads]);

  const filtered = leads.filter((lead) => {
    const searchValue = search.toLowerCase();
    const matchesSearch =
      !search ||
      lead.company_name?.toLowerCase().includes(searchValue) ||
      lead.contact_name?.toLowerCase().includes(searchValue);

    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    const matchesFollowUp = followUpFilter === 'all' || lead.follow_up_status === followUpFilter;
    const matchesIndustry = !industryFilter || String(lead.industry || '').toLowerCase().includes(industryFilter.toLowerCase());
    const matchesCountry = !countryFilter || lead.country === countryFilter;
    const matchesScore = !minScoreFilter || (lead.final_score ?? lead.icp_score ?? 0) >= Number(minScoreFilter);

    return matchesSearch && matchesStatus && matchesFollowUp && matchesIndustry && matchesCountry && matchesScore;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const filteredStats = useMemo(() => {
    const total = filtered.length;
    const qualified = filtered.filter((lead) => lead.status === LEAD_STATUS.QUALIFIED).length;
    const toAnalyze = filtered.filter((lead) => (lead.status || LEAD_STATUS.TO_ANALYZE) === LEAD_STATUS.TO_ANALYZE).length;
    return { total, qualified, toAnalyze };
  }, [filtered]);

  const filteredIds = useMemo(() => new Set(filtered.map((l) => l.id)), [filtered]);

  // Reset to page 1 whenever filters change
  const handleSearchChange = (v) => { setSearch(v); setPage(1); };
  const handleStatusChange = (v) => { setStatusFilter(v); setPage(1); };
  const handleFollowUpChange = (v) => { setFollowUpFilter(v); setPage(1); };
  const handleIndustryChange = (v) => { setIndustryFilter(v); setPage(1); };
  const handleCountryChange = (v) => { setCountryFilter(v); setPage(1); };
  const handleMinScoreChange = (v) => { setMinScoreFilter(v); setPage(1); };
  const allSelected = filteredIds.size > 0 && [...filteredIds].every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...filteredIds]));
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    const ids = [...selectedIds];
    setDeletingIds(new Set(ids));
    let deleted = 0;
    for (const id of ids) {
      try {
        await dataClient.leads.delete(id);
        deleted += 1;
      } catch {
        // continue
      }
    }
    setSelectedIds(new Set());
    setDeletingIds(new Set());
    setDeleteConfirm(null);
    toast.success(`Deleted ${deleted} lead(s)`);
    onLeadUpdated?.();
  };

  // CRM integrations — loaded once on mount to show bulk push buttons
  const [crmIntegrations, setCrmIntegrations] = useState([]);

  useEffect(() => {
    let cancelled = false;
    dataClient.crm?.list().then((list) => {
      if (!cancelled) setCrmIntegrations(list || []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const activeCrmTypes = crmIntegrations.filter((i) => i.is_active).map((i) => i.crm_type);

  const [syncingCrm, setSyncingCrm] = useState(false);

  const handleBulkSyncCrm = async (crmType) => {
    const ids = [...selectedIds].slice(0, 100);
    setSyncingCrm(true);
    try {
      const result = await dataClient.crm.syncBulk(ids, crmType);
      const label = crmType === 'hubspot' ? 'HubSpot' : 'Salesforce';
      const { success = 0, failed = 0 } = result?.summary || {};
      if (failed === 0) {
        toast.success(`${success} lead(s) synchronisés vers ${label}.`);
      } else {
        toast.warning(`${success} synchronisés, ${failed} échec(s) vers ${label}.`);
      }
    } catch {
      toast.error(`Échec du sync CRM.`);
    } finally {
      setSyncingCrm(false);
    }
  };

  const handleDeleteSingle = async () => {
    const lead = deleteConfirm?.lead;
    if (!lead) return;
    setDeletingIds((prev) => new Set([...prev, lead.id]));
    try {
      await dataClient.leads.delete(lead.id);
      toast.success(`${lead.company_name} deleted`);
      onLeadUpdated?.();
    } catch {
      toast.error(`Failed to delete ${lead.company_name}`);
    } finally {
      setDeletingIds((prev) => { const next = new Set(prev); next.delete(lead.id); return next; });
      setDeleteConfirm(null);
    }
  };

  const handleAnalyze = async (event, lead) => {
    event.stopPropagation();

    setAnalyzingIds((previous) => new Set([...previous, lead.id]));

    try {
      await dataClient.leads.update(lead.id, { status: LEAD_STATUS.PROCESSING });
      onLeadUpdated?.();

      const response = await dataClient.leads.reanalyze(lead.id);
      const score = response?.analysis?.final_score ?? response?.lead?.final_score ?? response?.lead?.icp_score;
      toast.success(`${lead.company_name} analyzed. Stable score: ${score ?? '-'}`);
    } catch (error) {
      toast.error(`Analysis failed for ${lead.company_name}`);
      console.warn('Analyze lead failed', error);
    } finally {
      setAnalyzingIds((previous) => {
        const next = new Set(previous);
        next.delete(lead.id);
        return next;
      });
      onLeadUpdated?.();
    }
  };

  // Shared filters toolbar
  const filtersBar = (
    <div className="p-4 border-b border-slate-100 space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search leads..."
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
            Visible: <span className="font-semibold text-slate-800">{filteredStats.total}</span>
          </span>
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
            Qualified: <span className="font-semibold">{filteredStats.qualified}</span>
          </span>
          <span className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-700">
            To analyze: <span className="font-semibold">{filteredStats.toAnalyze}</span>
          </span>
        </div>
      </div>
      <StatusFilter value={statusFilter} onChange={handleStatusChange} />
      <FollowUpFilter value={followUpFilter} onChange={handleFollowUpChange} />
      <div className="flex flex-wrap gap-2">
        <select
          value={industryFilter}
          onChange={(e) => handleIndustryChange(e.target.value)}
          className="text-xs h-7 rounded-lg border border-slate-200 bg-white px-2 text-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-sky/30"
        >
          <option value="">All industries</option>
          {industries.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <select
          value={countryFilter}
          onChange={(e) => handleCountryChange(e.target.value)}
          className="text-xs h-7 rounded-lg border border-slate-200 bg-white px-2 text-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-sky/30"
        >
          <option value="">All countries</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="number"
          min="0"
          max="100"
          placeholder="Min score"
          value={minScoreFilter}
          onChange={(e) => handleMinScoreChange(e.target.value)}
          className="text-xs h-7 w-24 rounded-lg border border-slate-200 bg-white px-2 text-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-sky/30"
        />
        {(industryFilter || countryFilter || minScoreFilter) && (
          <button
            onClick={() => { handleIndustryChange(''); handleCountryChange(''); handleMinScoreChange(''); }}
            className="text-xs h-7 px-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>
      {someSelected && (
        <div className="flex flex-wrap items-center gap-2 text-sm bg-brand-sky/5 border border-brand-sky/20 rounded-lg px-3 py-2">
          <span className="text-brand-sky font-medium">{selectedIds.size} selected</span>
          {activeCrmTypes.map((crmType) => (
            <Button
              key={crmType}
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => handleBulkSyncCrm(crmType)}
              disabled={syncingCrm}
            >
              {syncingCrm ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Database className="w-3 h-3" />
              )}
              Push to {crmType === 'hubspot' ? 'HubSpot' : 'Salesforce'}
            </Button>
          ))}
          <Button
            size="sm"
            variant="destructive"
            className="h-7 gap-1.5 text-xs ml-auto"
            onClick={() => setDeleteConfirm({ type: 'bulk' })}
            disabled={deletingIds.size > 0}
          >
            <Trash2 className="w-3 h-3" />
            Delete selected
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}
    </div>
  );

  // Pagination controls (shared)
  const paginationBar = totalPages > 1 ? (
    <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
      <span>{filtered.length} leads — page {currentPage} of {totalPages}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Page précédente"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const p = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
          return (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${p === currentPage ? 'bg-brand-sky text-white' : 'hover:bg-slate-100 text-slate-600'}`}
            >
              {p}
            </button>
          );
        })}
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Page suivante"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  ) : null;

  // Empty states
  const emptyAllLeads = (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-4">
      <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-brand-sky/5 to-brand-sky/15 border border-brand-sky/15 flex items-center justify-center">
        <Users className="w-7 h-7 text-brand-sky" />
      </div>
      <div>
        <p className="text-base font-semibold text-slate-700 mb-1">No leads yet</p>
        <p className="text-sm text-slate-400 max-w-xs">
          Import a CSV to get started. AimLeads will score every lead against your ICP automatically.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        <button
          onClick={() => document.getElementById('import-csv-trigger')?.click()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-sky text-white text-sm font-medium hover:bg-brand-sky-2 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Import CSV
        </button>
        <button
          onClick={() => navigate(ROUTES.icp)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          Configure ICP →
        </button>
      </div>
    </div>
  );

  const emptyFiltered = (
    <div className="text-center text-slate-400 py-12 px-4">
      <Search className="w-6 h-6 text-slate-200 mx-auto mb-2" />
      No leads match your filters
    </div>
  );

  return (
    <>
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {filtersBar}

      {/* ── Mobile card list (< md) ─────────────────────────────────────── */}
      <div className="md:hidden">
        {isLoading ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 animate-pulse space-y-2">
                <div className="h-4 bg-slate-100 rounded w-2/3" />
                <div className="h-3 bg-slate-100 rounded w-1/3" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 && leads.length === 0 ? (
          emptyAllLeads
        ) : filtered.length === 0 ? (
          emptyFiltered
        ) : (
          <div className="divide-y divide-slate-100">
            {paginated.map((lead) => {
              const icpScore = toMetric(lead.icp_score);
              const aiScore = toMetric(lead.ai_score);
              const finalScore = toMetric(lead.final_score) ?? icpScore;
              return (
                <div
                  key={lead.id}
                  className="p-4 cursor-pointer active:bg-slate-50 transition-colors"
                  onClick={() => onSelectLead(lead)}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <Checkbox
                        checked={selectedIds.has(lead.id)}
                        onCheckedChange={(e) => { if (typeof e === 'object') e.stopPropagation?.(); toggleSelectOne(lead.id); }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${lead.company_name}`}
                        className="mt-0.5 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{lead.company_name}</p>
                        {lead.contact_name && (
                          <p className="text-xs text-slate-500 truncate">{lead.contact_name}{lead.contact_role ? ` · ${lead.contact_role}` : ''}</p>
                        )}
                      </div>
                    </div>
                    <ScorePill score={finalScore} />
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2 ml-7">
                    <StatusBadge status={lead.status || LEAD_STATUS.TO_ANALYZE} />
                    <FollowUpBadge status={lead.follow_up_status || 'To Contact'} />
                    {lead.industry && (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px]">{lead.industry}</span>
                    )}
                    {lead.country && (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px]">{lead.country}</span>
                    )}
                  </div>
                  {(icpScore !== null || aiScore !== null) && (
                    <p className="text-[11px] text-slate-400 ml-7 mb-2">ICP {icpScore ?? '-'} · AI {aiScore ?? '-'}</p>
                  )}
                  <div className="flex items-center gap-2 ml-7" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onOpenLeadPage?.(lead)}
                      className="text-xs h-7 px-2"
                    >
                      Detail
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={analyzingIds.has(lead.id) || lead.status === LEAD_STATUS.PROCESSING}
                      onClick={(event) => handleAnalyze(event, lead)}
                      className="gap-1 text-xs h-7 px-2"
                    >
                      {analyzingIds.has(lead.id) || lead.status === LEAD_STATUS.PROCESSING ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      {analyzingIds.has(lead.id) ? 'Analyzing...' : 'Analyze'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${lead.company_name}`}
                      disabled={deletingIds.has(lead.id)}
                      onClick={(event) => { event.stopPropagation(); setDeleteConfirm({ type: 'single', lead }); }}
                      className="text-rose-400 hover:text-rose-600 hover:bg-rose-50 px-2 h-7 ml-auto"
                    >
                      {deletingIds.has(lead.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {paginationBar}
      </div>

      {/* ── Desktop table (≥ md) ────────────────────────────────────────── */}
      <div className="hidden md:block">
        <div className="overflow-x-auto">
          <Table className="min-w-[1080px]">
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="w-8 px-3">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all leads"
                  />
                </TableHead>
                <TableHead className="w-[28%]">Company</TableHead>
                <TableHead className="w-[22%]">Contact</TableHead>
                <TableHead className="w-[10%]">Status</TableHead>
                <TableHead className="w-[14%]">Follow-up</TableHead>
                <TableHead className="w-[12%] text-center">Scores</TableHead>
                <TableHead className="w-[10%] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length === 0 && leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>{emptyAllLeads}</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>{emptyFiltered}</TableCell>
                </TableRow>
              ) : (
                paginated.map((lead) => {
                  const icpScore = toMetric(lead.icp_score);
                  const aiScore = toMetric(lead.ai_score);
                  const finalScore = toMetric(lead.final_score) ?? icpScore;

                  return (
                    <TableRow
                      key={lead.id}
                      className={`cursor-pointer hover:bg-slate-50/70 transition-colors ${selectedIds.has(lead.id) ? 'bg-brand-sky/5/40' : ''}`}
                      onClick={() => onSelectLead(lead)}
                    >
                      <TableCell className="px-3" onClick={(e) => { e.stopPropagation(); toggleSelectOne(lead.id); }}>
                        <Checkbox
                          checked={selectedIds.has(lead.id)}
                          onCheckedChange={() => toggleSelectOne(lead.id)}
                          aria-label={`Select ${lead.company_name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900">{lead.company_name}</p>
                          {lead.website_url && (
                            <a
                              href={toWebsiteHref(lead.website_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className="text-xs text-slate-400 hover:text-brand-sky flex items-center gap-1 transition-colors"
                            >
                              {lead.website_url}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px]">
                              {lead.industry || 'No industry'}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px]">
                              {lead.country || 'No country'}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px]">
                              {formatCompanySize(lead.company_size)} emp.
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-brand-sky/5 text-brand-sky text-[11px]">
                              {sourceListLabel(lead.source_list)}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div>
                          <p className="text-sm text-slate-700">{lead.contact_name || '-'}</p>
                          <p className="text-xs text-slate-400">{lead.contact_role || ''}</p>
                          {lead.contact_email ? <p className="text-xs text-slate-400 mt-0.5">{lead.contact_email}</p> : null}
                        </div>
                      </TableCell>

                      <TableCell>
                        <StatusBadge status={lead.status || LEAD_STATUS.TO_ANALYZE} />
                      </TableCell>

                      <TableCell>
                        <FollowUpBadge status={lead.follow_up_status || 'To Contact'} />
                      </TableCell>

                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <ScorePill score={finalScore} />
                          <p className="text-[11px] text-slate-500">ICP {icpScore ?? '-'} | AI {aiScore ?? '-'}</p>
                          {lead.final_recommended_action ? (
                            <p className="text-[11px] text-emerald-700 max-w-[170px] truncate" title={lead.final_recommended_action}>
                              {lead.final_recommended_action}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenLeadPage?.(lead);
                            }}
                            className="text-xs"
                          >
                            Detail
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={analyzingIds.has(lead.id) || lead.status === LEAD_STATUS.PROCESSING}
                            onClick={(event) => handleAnalyze(event, lead)}
                            className="gap-1.5 text-xs"
                          >
                            {analyzingIds.has(lead.id) || lead.status === LEAD_STATUS.PROCESSING ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            {analyzingIds.has(lead.id) ? 'Analyzing...' : 'Analyze'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Delete ${lead.company_name}`}
                            disabled={deletingIds.has(lead.id)}
                            onClick={(event) => { event.stopPropagation(); setDeleteConfirm({ type: 'single', lead }); }}
                            className="text-rose-400 hover:text-rose-600 hover:bg-rose-50 px-2"
                          >
                            {deletingIds.has(lead.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {paginationBar}
      </div>
    </div>

    <AlertDialog open={deleteConfirm?.type === 'bulk'} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {selectedIds.size} lead(s)?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. The selected leads will be permanently removed from your workspace.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeleteSelected} className="bg-rose-600 hover:bg-rose-700">
            Delete {selectedIds.size} lead(s)
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={deleteConfirm?.type === 'single'} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {deleteConfirm?.lead?.company_name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This lead will be permanently removed from your workspace.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeleteSingle} className="bg-rose-600 hover:bg-rose-700">
            Delete lead
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

LeadsTable.propTypes = {
  leads: PropTypes.arrayOf(PropTypes.object).isRequired,
  onSelectLead: PropTypes.func,
  onOpenLeadPage: PropTypes.func,
  onLeadUpdated: PropTypes.func,
};

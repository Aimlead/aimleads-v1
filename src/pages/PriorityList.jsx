import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, Download, ExternalLink, Flame, Loader2, Mail, Phone, Sparkles, Target, UserRoundSearch } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import LeadSlideOver from '@/components/leads/LeadSlideOver';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { exportLeadsToCsv } from '@/lib/exportCsv';
import { dataClient } from '@/services/dataClient';

const CONTACT_STATUS_FILTER = {
  all: 'all',
  untouched: 'untouched',
  engaged: 'engaged',
};

const PIPELINE_SEGMENTS = [
  { key: 'all', label: 'Tous' },
  { key: 'to_analyze', label: 'À analyser' },
  { key: 'in_progress', label: 'En cours' },
  { key: 'qualified', label: 'Qualifié' },
  { key: 'rejected', label: 'Rejeté' },
];

const FOLLOW_UP_SEGMENTS = [
  { key: 'all', label: 'Tous' },
  { key: 'to_contact', label: 'À contacter' },
  { key: 'contacted', label: 'Contacté' },
  { key: 'pending', label: 'En attente' },
  { key: 'won', label: 'Gagné' },
  { key: 'lost', label: 'Perdu' },
];

const clampScore = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

const getAiScore = (lead) => {
  const directAi = clampScore(lead?.ai_score);
  const fallbackAi = clampScore(lead?.score_details?.signal_analysis?.ai_score);
  return directAi ?? fallbackAi;
};

const computePriorityScore = (lead) => {
  const finalScore = clampScore(lead?.final_score);
  const icpScore = clampScore(lead?.icp_score);
  const aiScore = getAiScore(lead);

  const base = finalScore ?? icpScore ?? 0;
  const aiWeight = aiScore === null ? 0 : aiScore * 0.2;
  const hasEmail = Boolean(String(lead?.contact_email || lead?.email || '').trim());
  const hasPhone = Boolean(String(lead?.contact_phone || lead?.phone || '').trim());
  const reachableBoost = hasEmail || hasPhone ? 6 : 0;
  const status = String(lead?.follow_up_status || '').toLowerCase();
  const untouchedBoost = status.includes('contact') || status.includes('meeting') || status.includes('reply') ? 0 : 8;

  return Math.max(0, Math.min(100, Math.round(base + aiWeight + reachableBoost + untouchedBoost)));
};

const getHeat = (score) => {
  if (score >= 80) return { label: 'Hot', className: 'text-rose-700 bg-rose-50 border-rose-200' };
  if (score >= 60) return { label: 'Warm', className: 'text-amber-700 bg-amber-50 border-amber-200' };
  return { label: 'Cold', className: 'text-slate-700 bg-slate-100 border-slate-200' };
};

const buildNextAction = (lead, score) => {
  const status = String(lead?.follow_up_status || '').toLowerCase();
  const hasEmail = Boolean(String(lead?.contact_email || lead?.email || '').trim());
  const hasPhone = Boolean(String(lead?.contact_phone || lead?.phone || '').trim());
  const hasLinkedin = Boolean(String(lead?.linkedin_url || lead?.linkedin || '').trim());

  if (status.includes('meeting') || status.includes('replied')) return 'Prepare follow-up';
  if (score >= 75 && hasPhone) return 'Call now';
  if (hasEmail) return 'Send intro email';
  if (hasLinkedin) return 'Connect on LinkedIn';
  if (hasPhone) return 'Call lead';
  return 'Enrich contact data';
};

const getListLabel = (value, t) => {
  const normalized = String(value || '').trim();
  if (!normalized) return t('dashboard.lists.unlisted', { defaultValue: 'Unlisted' });
  return normalized;
};

const getPipelineBucket = (lead) => {
  const rawStatus = String(lead?.status || lead?.final_category || '').toLowerCase();
  if (rawStatus.includes('to_analyze') || rawStatus.includes('analyse')) return 'to_analyze';
  if (rawStatus.includes('reject') || rawStatus.includes('excluded') || rawStatus.includes('disqual')) return 'rejected';
  if (rawStatus.includes('qualif') || rawStatus.includes('high fit') || rawStatus.includes('strong') || rawStatus.includes('excellent')) return 'qualified';
  if (rawStatus.includes('progress') || rawStatus.includes('review') || rawStatus.includes('working')) return 'in_progress';
  return 'in_progress';
};

const getFollowUpBucket = (lead) => {
  const raw = String(lead?.follow_up_status || '').toLowerCase();
  if (!raw || raw.includes('to contact')) return 'to_contact';
  if (raw.includes('won')) return 'won';
  if (raw.includes('lost') || raw.includes('reject')) return 'lost';
  if (raw.includes('meeting') || raw.includes('proposal') || raw.includes('waiting') || raw.includes('pending')) return 'pending';
  if (raw.includes('contact') || raw.includes('called') || raw.includes('reply')) return 'contacted';
  return 'to_contact';
};

const getStatusTone = (bucket) => {
  if (bucket === 'won') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (bucket === 'lost') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (bucket === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (bucket === 'contacted') return 'bg-sky-50 text-sky-700 border-sky-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const renderLinkedInGlyph = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.15 1.45-2.15 2.94v5.67H9.33V9h3.42v1.56h.05c.48-.9 1.63-1.85 3.35-1.85 3.58 0 4.25 2.35 4.25 5.4v6.34zM5.34 7.43a2.06 2.06 0 110-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
  </svg>
);

export default function PriorityList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedHeat, setSelectedHeat] = useState('all');
  const [selectedContactStatus, setSelectedContactStatus] = useState(CONTACT_STATUS_FILTER.all);
  const [selectedSourceList, setSelectedSourceList] = useState('all');
  const [selectedPipelineSegment, setSelectedPipelineSegment] = useState('all');
  const [selectedFollowUpSegment, setSelectedFollowUpSegment] = useState('all');
  const [sortBy, setSortBy] = useState('priority');
  const [selectedLead, setSelectedLead] = useState(null);
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [isAnalyzingSignals, setIsAnalyzingSignals] = useState(false);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => dataClient.leads.list('-created_at'),
  });

  const sourceListOptions = useMemo(() => {
    const keys = new Set();
    for (const lead of leads) {
      const sourceList = String(lead?.source_list || '').trim();
      keys.add(sourceList || '__unlisted__');
    }

    return Array.from(keys).sort((left, right) => {
      if (left === '__unlisted__') return 1;
      if (right === '__unlisted__') return -1;
      return left.localeCompare(right);
    });
  }, [leads]);

  const rankedLeads = useMemo(() => {
    const enriched = leads.map((lead) => {
      const priorityScore = computePriorityScore(lead);
      const icpScore = clampScore(lead?.icp_score);
      const aiScore = getAiScore(lead);
      const heat = getHeat(priorityScore);
      const contactStatus = String(lead?.follow_up_status || '').toLowerCase();
      return {
        lead,
        priorityScore,
        icpScore,
        aiScore,
        heat,
        nextAction: buildNextAction(lead, priorityScore),
        contactStatus,
        pipelineBucket: getPipelineBucket(lead),
        followUpBucket: getFollowUpBucket(lead),
      };
    });

    const filtered = enriched.filter((entry) => {
      if (selectedHeat !== 'all' && entry.heat.label.toLowerCase() !== selectedHeat) return false;

      const listKey = String(entry.lead?.source_list || '').trim() || '__unlisted__';
      if (selectedSourceList !== 'all' && listKey !== selectedSourceList) return false;
      if (selectedPipelineSegment !== 'all' && entry.pipelineBucket !== selectedPipelineSegment) return false;
      if (selectedFollowUpSegment !== 'all' && entry.followUpBucket !== selectedFollowUpSegment) return false;

      if (selectedContactStatus === CONTACT_STATUS_FILTER.untouched) {
        return !entry.contactStatus.includes('contact')
          && !entry.contactStatus.includes('meeting')
          && !entry.contactStatus.includes('reply');
      }

      if (selectedContactStatus === CONTACT_STATUS_FILTER.engaged) {
        return entry.contactStatus.includes('contact')
          || entry.contactStatus.includes('meeting')
          || entry.contactStatus.includes('reply');
      }

      return true;
    });

    return filtered.sort((left, right) => {
      if (sortBy === 'priority') return right.priorityScore - left.priorityScore;
      if (sortBy === 'icp') return (right.icpScore ?? -1) - (left.icpScore ?? -1);
      if (sortBy === 'ai') return (right.aiScore ?? -1) - (left.aiScore ?? -1);
      if (sortBy === 'company') return String(left.lead?.company_name || '').localeCompare(String(right.lead?.company_name || ''));
      return right.priorityScore - left.priorityScore;
    });
  }, [
    leads,
    selectedHeat,
    selectedSourceList,
    selectedContactStatus,
    sortBy,
    selectedPipelineSegment,
    selectedFollowUpSegment,
  ]);

  const metrics = useMemo(() => {
    const hot = rankedLeads.filter((entry) => entry.heat.label === 'Hot').length;
    const warm = rankedLeads.filter((entry) => entry.heat.label === 'Warm').length;
    const cold = rankedLeads.filter((entry) => entry.heat.label === 'Cold').length;
    return { hot, warm, cold };
  }, [rankedLeads]);

  const topLeads = rankedLeads.slice(0, 3);

  const onOpenPanel = async (lead) => {
    setSelectedLead(lead);
    setSlideOverOpen(true);
    const fresh = await dataClient.leads.getById(lead.id);
    if (fresh) setSelectedLead(fresh);
  };

  const onLeadUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ['leads'] });
  };

  const onExportFiltered = () => {
    if (!rankedLeads.length) {
      toast(t('lists.toasts.exportEmpty', { defaultValue: 'Aucun lead à exporter.' }));
      return;
    }
    exportLeadsToCsv(rankedLeads.map((entry) => entry.lead), 'priority-list.csv');
    toast.success(t('lists.toasts.exportSuccess', { defaultValue: '{{count}} leads exportés en CSV.', count: rankedLeads.length }));
  };

  const onAnalyzeSignals = async () => {
    if (!rankedLeads.length) {
      toast(t('dashboard.toasts.noLeadsInList', { defaultValue: 'No leads in this list.' }));
      return;
    }

    setIsAnalyzingSignals(true);
    try {
      const batch = rankedLeads.slice(0, 20);
      await Promise.all(batch.map((entry) => dataClient.leads.analyzeSignals(entry.lead.id)));
      toast.success(t('leads.analyseSignalsSuccess', { defaultValue: 'Signal analysis completed.' }));
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch {
      toast.error(t('leads.analyseSignalsFailed', { defaultValue: 'Signal analysis failed.' }));
    } finally {
      setIsAnalyzingSignals(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-sky animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Pipeline · Priorité</p>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">{t('priorityList.title', { defaultValue: 'Liste prioritaire' })}</h1>
            <p className="text-slate-500 mt-1 text-sm">
              {t('priorityList.subtitle', {
                defaultValue: 'File classée des leads à traiter en priorité.',
              })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-8 w-[170px] text-xs">
                <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="priority">Sort: Priority</SelectItem>
                <SelectItem value="icp">Sort: ICP score</SelectItem>
                <SelectItem value="ai">Sort: AI score</SelectItem>
                <SelectItem value="company">Sort: Company</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onExportFiltered}>
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
            <Button size="sm" className="h-8 gap-1.5" onClick={onAnalyzeSignals} disabled={isAnalyzingSignals}>
              {isAnalyzingSignals ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Analyze signals
            </Button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Hot: {metrics.hot}</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Warm: {metrics.warm}</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Cold: {metrics.cold}</span>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-slate-100 space-y-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1 flex-wrap">
            {PIPELINE_SEGMENTS.map((segment) => (
              <button
                key={segment.key}
                type="button"
                onClick={() => setSelectedPipelineSegment(segment.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  selectedPipelineSegment === segment.key ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {segment.label}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1 flex-wrap">
            {FOLLOW_UP_SEGMENTS.map((segment) => (
              <button
                key={segment.key}
                type="button"
                onClick={() => setSelectedFollowUpSegment(segment.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  selectedFollowUpSegment === segment.key ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {segment.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant={selectedHeat === 'all' ? 'default' : 'ghost'} size="sm" className="h-8" onClick={() => setSelectedHeat('all')}>All</Button>
            <Button variant={selectedHeat === 'hot' ? 'default' : 'ghost'} size="sm" className="h-8" onClick={() => setSelectedHeat('hot')}>
              <Flame className="w-3.5 h-3.5 mr-1" /> Hot
            </Button>
            <Button variant={selectedHeat === 'warm' ? 'default' : 'ghost'} size="sm" className="h-8" onClick={() => setSelectedHeat('warm')}>Warm</Button>
            <Button variant={selectedHeat === 'cold' ? 'default' : 'ghost'} size="sm" className="h-8" onClick={() => setSelectedHeat('cold')}>Cold</Button>

            <Select value={selectedContactStatus} onValueChange={setSelectedContactStatus}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Contact status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CONTACT_STATUS_FILTER.all}>All status</SelectItem>
                <SelectItem value={CONTACT_STATUS_FILTER.untouched}>Not contacted</SelectItem>
                <SelectItem value={CONTACT_STATUS_FILTER.engaged}>Engaged</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedSourceList} onValueChange={setSelectedSourceList}>
              <SelectTrigger className="h-8 w-[210px] text-xs">
                <SelectValue placeholder="Source list" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All lists</SelectItem>
                {sourceListOptions.map((key) => (
                  <SelectItem key={key} value={key}>{getListLabel(key === '__unlisted__' ? '' : key, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="px-4 sm:px-5 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">Priorité · Top 3</h2>
            <span className="text-xs text-slate-500">Best ranked opportunities</span>
          </div>

          {topLeads.length === 0 ? (
            <div className="text-sm text-slate-500">No leads match current filters.</div>
          ) : (
            <div className="grid md:grid-cols-3 gap-3">
              {topLeads.map(({ lead, priorityScore, icpScore, aiScore, heat }) => {
                const email = String(lead?.contact_email || lead?.email || '').trim();
                const phone = String(lead?.contact_phone || lead?.phone || '').trim();
                const linkedin = String(lead?.linkedin_url || lead?.linkedin || '').trim();
                const icpWidth = `${Math.max(0, Math.min(100, icpScore ?? 0))}%`;
                const aiWidth = `${Math.max(0, Math.min(100, aiScore ?? 0))}%`;
                return (
                  <article key={lead.id} className="rounded-xl border border-slate-200 p-4 bg-white shadow-sm">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <p className="text-xs text-slate-500">{lead.contact_name || 'Unknown contact'}</p>
                        <p className="text-sm font-semibold text-slate-900 truncate max-w-[180px]">{lead.company_name || 'Unknown company'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-4xl leading-none font-bold tracking-tight text-slate-900">{priorityScore}</p>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold mt-1 ${heat.className}`}>
                          {heat.label} · P1
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      <div>
                        <div className="flex justify-between text-[10px] uppercase tracking-wide text-slate-500"><span>ICP</span><span>{icpScore ?? '—'}</span></div>
                        <div className="h-1.5 rounded-full bg-slate-100 mt-1"><div className="h-full rounded-full bg-slate-700" style={{ width: icpWidth }} /></div>
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] uppercase tracking-wide text-slate-500"><span>AI</span><span>{aiScore ?? '—'}</span></div>
                        <div className="h-1.5 rounded-full bg-slate-100 mt-1"><div className="h-full rounded-full bg-amber-500" style={{ width: aiWidth }} /></div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1">
                      {lead.industry ? <span className="text-[10px] rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">{lead.industry}</span> : null}
                      {(lead.employee_count || lead.company_size) ? <span className="text-[10px] rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">{lead.employee_count || lead.company_size}</span> : null}
                      {lead.source_list ? <span className="text-[10px] rounded-md bg-brand-sky/5 px-2 py-0.5 text-brand-sky">{lead.source_list}</span> : null}
                    </div>

                    <div className="mt-3 flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onOpenPanel(lead)} aria-label="Open panel">
                        <UserRoundSearch className="w-3.5 h-3.5" />
                      </Button>
                      {email ? <Button variant="outline" size="icon" className="h-7 w-7" asChild><a href={`mailto:${email}`}><Mail className="w-3.5 h-3.5" /></a></Button> : <Button variant="outline" size="icon" className="h-7 w-7" disabled><Mail className="w-3.5 h-3.5" /></Button>}
                      {phone ? <Button variant="outline" size="icon" className="h-7 w-7" asChild><a href={`tel:${phone}`}><Phone className="w-3.5 h-3.5" /></a></Button> : <Button variant="outline" size="icon" className="h-7 w-7" disabled><Phone className="w-3.5 h-3.5" /></Button>}
                      {linkedin ? <Button variant="outline" size="icon" className="h-7 w-7" asChild><a href={linkedin} target="_blank" rel="noreferrer">{renderLinkedInGlyph()}</a></Button> : <Button variant="outline" size="icon" className="h-7 w-7" disabled>{/* TODO: Enable LinkedIn action when profile URL is available. */}{renderLinkedInGlyph()}</Button>}
                      <div className="ml-auto" />
                      <Button size="sm" className="h-7 text-xs" onClick={() => navigate(`/leads/${lead.id}`, { state: { lead } })}>Open lead</Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="px-4 sm:px-5 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">File d'attente · Next in line</h3>
            <span className="text-xs text-slate-500">{rankedLeads.length} leads</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-4 sm:px-5 py-2.5">Score</th>
                  <th className="text-left px-3 py-2.5">Lead</th>
                  <th className="text-left px-3 py-2.5">Enterprise</th>
                  <th className="text-left px-3 py-2.5">Status</th>
                  <th className="text-left px-3 py-2.5">Next action</th>
                  <th className="text-right px-4 sm:px-5 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rankedLeads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-500">No leads match current filters.</td>
                  </tr>
                ) : rankedLeads.map(({ lead, priorityScore, heat, nextAction, followUpBucket }) => {
                  const email = String(lead?.contact_email || lead?.email || '').trim();
                  const phone = String(lead?.contact_phone || lead?.phone || '').trim();
                  const linkedin = String(lead?.linkedin_url || lead?.linkedin || '').trim();

                  return (
                    <tr key={lead.id} className="hover:bg-slate-50/70">
                      <td className="px-4 sm:px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold tabular-nums text-slate-900">{priorityScore}</span>
                          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${heat.className}`}>{heat.label}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-900">{lead.contact_name || 'Unknown contact'}</p>
                        <p className="text-xs text-slate-500">{lead.contact_role || 'No role'}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-900">{lead.company_name || 'Unknown company'}</p>
                        <p className="text-xs text-slate-500">{lead.industry || 'Industry n/a'}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStatusTone(followUpBucket)}`}>
                          {lead.follow_up_status || 'To Contact'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{nextAction}</td>
                      <td className="px-4 sm:px-5 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onOpenPanel(lead)} aria-label="Open panel">
                            <UserRoundSearch className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => navigate(`/leads/${lead.id}`, { state: { lead } })} aria-label="Open lead">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                          {email ? <Button variant="outline" size="icon" className="h-7 w-7" asChild><a href={`mailto:${email}`}><Mail className="w-3.5 h-3.5" /></a></Button> : <Button variant="outline" size="icon" className="h-7 w-7" disabled><Mail className="w-3.5 h-3.5" /></Button>}
                          {phone ? <Button variant="outline" size="icon" className="h-7 w-7" asChild><a href={`tel:${phone}`}><Phone className="w-3.5 h-3.5" /></a></Button> : <Button variant="outline" size="icon" className="h-7 w-7" disabled><Phone className="w-3.5 h-3.5" /></Button>}
                          {linkedin ? <Button variant="outline" size="icon" className="h-7 w-7" asChild><a href={linkedin} target="_blank" rel="noreferrer">{renderLinkedInGlyph()}</a></Button> : <Button variant="outline" size="icon" className="h-7 w-7" disabled>{/* TODO: Enable LinkedIn action when profile URL is available. */}{renderLinkedInGlyph()}</Button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <LeadSlideOver
        lead={selectedLead}
        open={slideOverOpen}
        onOpenChange={setSlideOverOpen}
        onLeadUpdated={onLeadUpdated}
      />
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, ExternalLink, Flame, Loader2, Mail, Phone, Sparkles, Target, UserRoundSearch } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import LeadSlideOver from '@/components/leads/LeadSlideOver';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { dataClient } from '@/services/dataClient';

const CONTACT_STATUS_FILTER = {
  all: 'all',
  untouched: 'untouched',
  engaged: 'engaged',
};

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

export default function PriorityList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedHeat, setSelectedHeat] = useState('all');
  const [selectedContactStatus, setSelectedContactStatus] = useState(CONTACT_STATUS_FILTER.all);
  const [selectedSourceList, setSelectedSourceList] = useState('all');
  const [sortBy, setSortBy] = useState('priority');
  const [selectedLead, setSelectedLead] = useState(null);
  const [slideOverOpen, setSlideOverOpen] = useState(false);

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
      };
    });

    const filtered = enriched.filter((entry) => {
      if (selectedHeat !== 'all' && entry.heat.label.toLowerCase() !== selectedHeat) return false;

      const listKey = String(entry.lead?.source_list || '').trim() || '__unlisted__';
      if (selectedSourceList !== 'all' && listKey !== selectedSourceList) return false;

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
  }, [leads, selectedHeat, selectedSourceList, selectedContactStatus, sortBy]);

  const metrics = useMemo(() => {
    const hot = rankedLeads.filter((entry) => entry.heat.label === 'Hot').length;
    const warm = rankedLeads.filter((entry) => entry.heat.label === 'Warm').length;
    const cold = rankedLeads.filter((entry) => entry.heat.label === 'Cold').length;
    return { hot, warm, cold };
  }, [rankedLeads]);

  const onOpenPanel = async (lead) => {
    setSelectedLead(lead);
    setSlideOverOpen(true);
    const fresh = await dataClient.leads.getById(lead.id);
    if (fresh) setSelectedLead(fresh);
  };

  const onLeadUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ['leads'] });
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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{t('priorityList.title', { defaultValue: 'Priority List' })}</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {t('priorityList.subtitle', {
              defaultValue: 'Ranked lead queue to focus on the highest-impact outreach next.',
            })}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">Hot: {metrics.hot}</span>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">Warm: {metrics.warm}</span>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">Cold: {metrics.cold}</span>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <Button variant={selectedHeat === 'all' ? 'default' : 'ghost'} size="sm" className="h-8" onClick={() => setSelectedHeat('all')}>All</Button>
          <Button variant={selectedHeat === 'hot' ? 'default' : 'ghost'} size="sm" className="h-8" onClick={() => setSelectedHeat('hot')}>
            <Flame className="w-3.5 h-3.5 mr-1" /> Hot
          </Button>
          <Button variant={selectedHeat === 'warm' ? 'default' : 'ghost'} size="sm" className="h-8" onClick={() => setSelectedHeat('warm')}>Warm</Button>
          <Button variant={selectedHeat === 'cold' ? 'default' : 'ghost'} size="sm" className="h-8" onClick={() => setSelectedHeat('cold')}>Cold</Button>

          <div className="h-5 w-px bg-slate-200 mx-1" />

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

          <div className="ml-auto" />

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
        </div>

        <div className="divide-y divide-slate-100">
          {rankedLeads.length === 0 ? (
            <div className="px-5 py-12 text-center text-slate-500 text-sm">No leads match current filters.</div>
          ) : (
            rankedLeads.map(({ lead, priorityScore, icpScore, aiScore, heat, nextAction }) => {
              const email = String(lead?.contact_email || lead?.email || '').trim();
              const phone = String(lead?.contact_phone || lead?.phone || '').trim();
              const linkedin = String(lead?.linkedin_url || lead?.linkedin || '').trim();

              return (
                <div key={lead.id} className="px-4 sm:px-5 py-4 hover:bg-slate-50/70 transition-colors">
                  <div className="flex flex-col xl:flex-row gap-4 xl:items-center">
                    <div className="flex items-center gap-4 min-w-[180px]">
                      <div className="text-[44px] leading-none font-bold tracking-tight text-slate-900 tabular-nums">{priorityScore}</div>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${heat.className}`}>
                        {heat.label}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1 grid md:grid-cols-[1.4fr_1fr_1fr] gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{lead.company_name || 'Unknown company'}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {lead.contact_name || 'Unknown contact'}
                          {lead.contact_role ? ` · ${lead.contact_role}` : ''}
                        </p>
                        <p className="text-xs text-slate-400 truncate mt-1">
                          {lead.industry || 'Industry n/a'}
                          {lead.employee_count ? ` · ${lead.employee_count} employees` : ''}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 rounded-md border border-slate-200 px-2 py-1">
                          <Target className="w-3.5 h-3.5 text-slate-500" /> ICP: {icpScore ?? '—'}
                        </div>
                        <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 rounded-md border border-amber-200 bg-amber-50 px-2 py-1">
                          <Sparkles className="w-3.5 h-3.5 text-amber-600" /> AI: {aiScore ?? '—'}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate">{getListLabel(lead.source_list, t)}</p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">Next best action</p>
                        <p className="text-sm font-medium text-slate-700">{nextAction}</p>
                        <p className="text-[11px] text-slate-500 truncate">{lead.follow_up_status || 'No follow-up status yet'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onOpenPanel(lead)} aria-label="Open panel">
                        <UserRoundSearch className="w-4 h-4" />
                      </Button>

                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(`/leads/${lead.id}`, { state: { lead } })} aria-label="Open lead">
                        <ExternalLink className="w-4 h-4" />
                      </Button>

                      {email ? (
                        <Button variant="outline" size="icon" className="h-8 w-8" asChild aria-label="Email lead">
                          <a href={`mailto:${email}`}>
                            <Mail className="w-4 h-4" />
                          </a>
                        </Button>
                      ) : (
                        <Button variant="outline" size="icon" className="h-8 w-8" disabled aria-label="Email lead">
                          <Mail className="w-4 h-4" />
                        </Button>
                      )}

                      {phone ? (
                        <Button variant="outline" size="icon" className="h-8 w-8" asChild aria-label="Call lead">
                          <a href={`tel:${phone}`}>
                            <Phone className="w-4 h-4" />
                          </a>
                        </Button>
                      ) : (
                        <Button variant="outline" size="icon" className="h-8 w-8" disabled aria-label="Call lead">
                          <Phone className="w-4 h-4" />
                        </Button>
                      )}

                      {linkedin ? (
                        <Button variant="outline" size="icon" className="h-8 w-8" asChild aria-label="Open LinkedIn">
                          <a href={linkedin} target="_blank" rel="noreferrer">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.15 1.45-2.15 2.94v5.67H9.33V9h3.42v1.56h.05c.48-.9 1.63-1.85 3.35-1.85 3.58 0 4.25 2.35 4.25 5.4v6.34zM5.34 7.43a2.06 2.06 0 110-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
                            </svg>
                          </a>
                        </Button>
                      ) : (
                        <Button variant="outline" size="icon" className="h-8 w-8" disabled aria-label="Open LinkedIn">
                          {/* TODO: Enable LinkedIn action when profile URL is available. */}
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.15 1.45-2.15 2.94v5.67H9.33V9h3.42v1.56h.05c.48-.9 1.63-1.85 3.35-1.85 3.58 0 4.25 2.35 4.25 5.4v6.34zM5.34 7.43a2.06 2.06 0 110-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
                          </svg>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
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

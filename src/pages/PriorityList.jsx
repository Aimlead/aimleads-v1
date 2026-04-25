import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, ExternalLink, Flame, Loader2, Mail, Phone, Sparkles, Target, UserRoundSearch } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import LeadSlideOver from '@/components/leads/LeadSlideOver';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { computeLeadPriority } from '@/lib/leadScoring';
import { dataClient } from '@/services/dataClient';

const CONTACT_STATUS_FILTER = {
  all: 'all',
  untouched: 'untouched',
  engaged: 'engaged',
};

const getListLabel = (value, t) => {
  const normalized = String(value || '').trim();
  if (!normalized) return t('dashboard.lists.unlisted', { defaultValue: 'Unlisted' });
  return normalized;
};

const getPriorityHeat = (priority) => {
  if (priority.priorityScore >= 80) return { key: 'hot', label: 'Hot', className: 'text-rose-700 bg-rose-50 border-rose-200' };
  if (priority.priorityScore >= 60) return { key: 'warm', label: 'Warm', className: 'text-amber-700 bg-amber-50 border-amber-200' };
  return { key: 'cold', label: 'Cold', className: 'text-slate-700 bg-slate-100 border-slate-200' };
};

const normalizeExternalUrl = (url) => {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
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

  const { data: activeIcp = null } = useQuery({
    queryKey: ['icpActive', 'priority-list'],
    queryFn: () => dataClient.icp.getActive(),
    staleTime: 60_000,
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
      const priority = computeLeadPriority(lead, activeIcp);
      const contactStatus = String(lead?.follow_up_status || '').toLowerCase();
      return {
        lead,
        priorityScore: priority.priorityScore,
        icpScore: priority.icpScore,
        aiScore: priority.aiScore,
        heat: getPriorityHeat(priority),
        nextAction: priority.nextAction,
        contactStatus,
      };
    });

    const filtered = enriched.filter((entry) => {
      if (selectedHeat !== 'all' && entry.heat.key !== selectedHeat) return false;

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
  }, [leads, activeIcp, selectedHeat, selectedSourceList, selectedContactStatus, sortBy]);

  const metrics = useMemo(() => {
    const hot = rankedLeads.filter((entry) => entry.heat.key === 'hot').length;
    const warm = rankedLeads.filter((entry) => entry.heat.key === 'warm').length;
    const cold = rankedLeads.filter((entry) => entry.heat.key === 'cold').length;
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
    <div className="mx-auto w-full max-w-[1160px] space-y-4">
      <header className="rounded-xl border border-[#e6e4df] bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            {t('priorityList.eyebrow', { defaultValue: 'File de traitement' })}
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#1a1200]">{t('priorityList.title', { defaultValue: 'Liste prioritaire' })}</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {t('priorityList.subtitle', {
              defaultValue: 'File classée pour traiter les leads qui méritent le prochain geste commercial.',
            })}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700">{t('priorityList.heat.hot', { defaultValue: 'Chaud' })}: {metrics.hot}</span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">{t('priorityList.heat.warm', { defaultValue: 'Tiède' })}: {metrics.warm}</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">{t('priorityList.heat.cold', { defaultValue: 'Froid' })}: {metrics.cold}</span>
        </div>
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-[#e6e4df] bg-white shadow-sm">
        <div className="px-4 sm:px-5 py-3 border-b border-[#ece9e2] flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
          {/* Heat filter row */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <Button variant={selectedHeat === 'all' ? 'default' : 'ghost'} size="sm" className="h-8 flex-shrink-0" onClick={() => setSelectedHeat('all')}>{t('common.all', { defaultValue: 'Tous' })}</Button>
            <Button variant={selectedHeat === 'hot' ? 'default' : 'ghost'} size="sm" className="h-8 flex-shrink-0" onClick={() => setSelectedHeat('hot')}>
              <Flame className="w-3.5 h-3.5 mr-1" /> {t('priorityList.heat.hot', { defaultValue: 'Chaud' })}
            </Button>
            <Button variant={selectedHeat === 'warm' ? 'default' : 'ghost'} size="sm" className="h-8 flex-shrink-0" onClick={() => setSelectedHeat('warm')}>{t('priorityList.heat.warm', { defaultValue: 'Tiède' })}</Button>
            <Button variant={selectedHeat === 'cold' ? 'default' : 'ghost'} size="sm" className="h-8 flex-shrink-0" onClick={() => setSelectedHeat('cold')}>{t('priorityList.heat.cold', { defaultValue: 'Froid' })}</Button>
          </div>

          <div className="hidden sm:block h-5 w-px bg-[#e6e4df] mx-1" />

          {/* Selects row — full-width on mobile, fixed on sm+ */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:flex-wrap">
            <Select value={selectedContactStatus} onValueChange={setSelectedContactStatus}>
              <SelectTrigger className="h-8 w-full sm:w-[180px] text-xs">
                <SelectValue placeholder={t('priorityList.filters.contactStatus', { defaultValue: 'Statut contact' })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CONTACT_STATUS_FILTER.all}>{t('priorityList.filters.allStatus', { defaultValue: 'Tous les statuts' })}</SelectItem>
                <SelectItem value={CONTACT_STATUS_FILTER.untouched}>{t('priorityList.filters.notContacted', { defaultValue: 'Non contactés' })}</SelectItem>
                <SelectItem value={CONTACT_STATUS_FILTER.engaged}>{t('priorityList.filters.engaged', { defaultValue: 'Engagés' })}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedSourceList} onValueChange={setSelectedSourceList}>
              <SelectTrigger className="h-8 w-full sm:w-[210px] text-xs">
                <SelectValue placeholder={t('priorityList.filters.sourceList', { defaultValue: 'Liste source' })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('dashboard.lists.all', { defaultValue: 'Toutes les listes' })}</SelectItem>
                {sourceListOptions.map((key) => (
                  <SelectItem key={key} value={key}>{getListLabel(key === '__unlisted__' ? '' : key, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-8 w-full sm:w-[170px] text-xs">
                <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue placeholder={t('priorityList.filters.sortBy', { defaultValue: 'Trier par' })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="priority">{t('priorityList.sort.priority', { defaultValue: 'Tri: priorité' })}</SelectItem>
                <SelectItem value="icp">{t('priorityList.sort.icp', { defaultValue: 'Tri: score ICP' })}</SelectItem>
                <SelectItem value="ai">{t('priorityList.sort.ai', { defaultValue: 'Tri: score IA' })}</SelectItem>
                <SelectItem value="company">{t('priorityList.sort.company', { defaultValue: 'Tri: entreprise' })}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="divide-y divide-[#eeece7]">
          {rankedLeads.length === 0 ? (
            <div className="px-5 py-12 text-center text-slate-500 text-sm">{t('priorityList.empty', { defaultValue: 'Aucun lead ne correspond aux filtres actuels.' })}</div>
          ) : (
            rankedLeads.map(({ lead, priorityScore, icpScore, aiScore, heat, nextAction }) => {
              const email = String(lead?.contact_email || lead?.email || '').trim();
              const phone = String(lead?.contact_phone || lead?.phone || '').trim();
              const linkedin = String(lead?.linkedin_url || lead?.linkedin || '').trim();

              return (
                <div key={lead.id} className="px-4 sm:px-5 py-4 hover:bg-[#fbfaf8] transition-colors">
                  <div className="flex flex-col xl:flex-row gap-4 xl:items-center">
                    <div className="flex items-center gap-4 min-w-0 sm:min-w-[180px]">
                      <div className="text-[44px] leading-none font-bold tracking-tight text-slate-900 tabular-nums">{priorityScore}</div>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${heat.className}`}>
                        {t(`priorityList.heat.${heat.key}`, { defaultValue: heat.label })}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1 grid md:grid-cols-[1.4fr_1fr_1fr] gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{lead.company_name || t('common.company', { defaultValue: 'Entreprise' })}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {lead.contact_name || t('common.contact', { defaultValue: 'Contact' })}
                          {lead.contact_role ? ` · ${lead.contact_role}` : ''}
                        </p>
                        <p className="text-xs text-slate-400 truncate mt-1">
                          {lead.industry || t('priorityList.industryUnavailable', { defaultValue: 'Secteur non renseigné' })}
                          {lead.employee_count ? ` · ${t('priorityList.employeeCount', { defaultValue: '{{count}} employés', count: lead.employee_count })}` : ''}
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
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">{t('priorityList.nextBestAction', { defaultValue: 'Prochaine action' })}</p>
                        <p className="text-sm font-medium text-slate-700">{nextAction}</p>
                        <p className="text-[11px] text-slate-500 truncate">{lead.follow_up_status || t('priorityList.noFollowUp', { defaultValue: 'Aucun statut de suivi' })}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onOpenPanel(lead)} aria-label={t('priorityList.actions.openPanel', { defaultValue: 'Ouvrir le panneau' })}>
                        <UserRoundSearch className="w-4 h-4" />
                      </Button>

                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(`/leads/${lead.id}`, { state: { lead } })} aria-label={t('priorityList.actions.openLead', { defaultValue: 'Voir le lead' })}>
                        <ExternalLink className="w-4 h-4" />
                      </Button>

                      {email ? (
                        <Button variant="outline" size="icon" className="h-8 w-8" asChild aria-label={t('priorityList.actions.emailLead', { defaultValue: 'Envoyer un email' })}>
                          <a href={`mailto:${email}`}>
                            <Mail className="w-4 h-4" />
                          </a>
                        </Button>
                      ) : (
                        <Button variant="outline" size="icon" className="h-8 w-8" disabled aria-label={t('priorityList.actions.emailLead', { defaultValue: 'Envoyer un email' })}>
                          <Mail className="w-4 h-4" />
                        </Button>
                      )}

                      {phone ? (
                        <Button variant="outline" size="icon" className="h-8 w-8" asChild aria-label={t('priorityList.actions.callLead', { defaultValue: 'Appeler' })}>
                          <a href={`tel:${phone}`}>
                            <Phone className="w-4 h-4" />
                          </a>
                        </Button>
                      ) : (
                        <Button variant="outline" size="icon" className="h-8 w-8" disabled aria-label={t('priorityList.actions.callLead', { defaultValue: 'Appeler' })}>
                          <Phone className="w-4 h-4" />
                        </Button>
                      )}

                      {linkedin ? (
                        <Button variant="outline" size="icon" className="h-8 w-8" asChild aria-label={t('priorityList.actions.openLinkedin', { defaultValue: 'Ouvrir LinkedIn' })}>
                          <a href={normalizeExternalUrl(linkedin)} target="_blank" rel="noreferrer">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.15 1.45-2.15 2.94v5.67H9.33V9h3.42v1.56h.05c.48-.9 1.63-1.85 3.35-1.85 3.58 0 4.25 2.35 4.25 5.4v6.34zM5.34 7.43a2.06 2.06 0 110-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
                            </svg>
                          </a>
                        </Button>
                      ) : (
                        <Button variant="outline" size="icon" className="h-8 w-8" disabled aria-label={t('priorityList.actions.openLinkedin', { defaultValue: 'Ouvrir LinkedIn' })}>
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

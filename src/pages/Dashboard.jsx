import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRight, Circle, Download, Flame, Linkedin, Loader2, Mail, Phone, RefreshCcw, Sparkles, Target, Upload } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import LeadSlideOver from '@/components/leads/LeadSlideOver';
import ImportCSVDialog from '@/components/leads/ImportCSVDialog';
import ResearchLeadDialog from '@/components/leads/ResearchLeadDialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ACTIVATION_ANALYZE_BATCH_SIZE } from '@/constants/activation';
import { ROUTES } from '@/constants/routes';
import { exportLeadsToCsv } from '@/lib/exportCsv';
import { waitForJobCompletion } from '@/lib/jobs';
import { dataClient } from '@/services/dataClient';

const LIST_KEYS = {
  ALL: '__all_lists__',
  UNLISTED: '__unlisted__',
};

const STORAGE_KEY = 'aimleads:selected-source-list';

const toNumericScore = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toSourceListKey = (lead) => {
  const value = String(lead?.source_list || '').trim();
  return value || LIST_KEYS.UNLISTED;
};

const sourceListLabel = (key, t) => {
  if (key === LIST_KEYS.UNLISTED) return t('dashboard.lists.unlisted');
  return key.replace(/_/g, ' ').replace(/\b\d{4}\b.*/g, '').trim().replace(/\b\w/g, c => c.toUpperCase()) || key;
};

const clampScore = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

const estimatePriorityScore = (lead) => {
  const icp = clampScore(lead?.icp_score);
  const final = clampScore(lead?.final_score);
  const ai = clampScore(lead?.ai_score);
  const scoreDetailsAi = clampScore(lead?.score_details?.signal_analysis?.ai_score);
  const aiScore = ai ?? scoreDetailsAi;
  const base = final ?? icp ?? 0;
  const signalWeight = aiScore ? aiScore * 0.25 : 0;
  const freshnessWeight = lead?.llm_enriched ? 8 : 0;
  const needsContactBoost = !String(lead?.follow_up_status || '').toLowerCase().includes('contact') ? 12 : 0;
  return Math.round(base + signalWeight + freshnessWeight + needsContactBoost);
};

const getHeatTier = (lead) => {
  const score = clampScore(lead?.final_score ?? lead?.icp_score) ?? 0;
  if (score >= 80) return 'Hot';
  if (score >= 65) return 'Warm';
  return 'Cold';
};

const HEAT_TIER_BADGE_STYLES = {
  Hot: 'bg-rose-50 text-rose-700 ring-rose-200',
  Warm: 'bg-amber-50 text-amber-700 ring-amber-200',
  Cold: 'bg-slate-100 text-slate-700 ring-slate-200',
};



export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [selectedLead, setSelectedLead] = useState(null);
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [researchDialogOpen, setResearchDialogOpen] = useState(false);
  const [selectedSourceList, setSelectedSourceList] = useState(() => {
    if (typeof window === 'undefined') return LIST_KEYS.ALL;
    return window.localStorage.getItem(STORAGE_KEY) || LIST_KEYS.ALL;
  });
  const [isSwitchingIcp, setIsSwitchingIcp] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [isScoringIcpVisible, setIsScoringIcpVisible] = useState(false);
  const [isAnalyzingSignalsVisible, setIsAnalyzingSignalsVisible] = useState(false);

  const { data: leads = [], isLoading, isError: leadsError, refetch: refetchLeads } = useQuery({
    queryKey: ['leads'],
    queryFn: () => dataClient.leads.list('-created_at'),
  });

  const { data: icpProfiles = [] } = useQuery({
    queryKey: ['icpProfilesQuickSwitch'],
    queryFn: () => dataClient.icp.list(),
  });

  const { data: featureFlagsData = null } = useQuery({
    queryKey: ['workspaceFeatureFlags', 'dashboard'],
    queryFn: () => dataClient.workspace.listFeatureFlags(),
    staleTime: 60_000,
  });

  const activeIcp = useMemo(
    () => icpProfiles.find((profile) => profile.is_active) || icpProfiles[0] || null,
    [icpProfiles]
  );

  const asyncJobsEnabled = Boolean(
    featureFlagsData?.flags?.find((flag) => flag.flag_name === 'async_jobs')?.enabled
  );

  const sourceListOptions = useMemo(() => {
    const counts = new Map();
    for (const lead of leads) {
      const key = toSourceListKey(lead);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count, label: sourceListLabel(key, t) }))
      .sort((left, right) => right.count - left.count);
  }, [leads, t]);

  useEffect(() => {
    const valid =
      selectedSourceList === LIST_KEYS.ALL || sourceListOptions.some((option) => option.key === selectedSourceList);
    if (!valid) setSelectedSourceList(LIST_KEYS.ALL);
  }, [selectedSourceList, sourceListOptions]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, selectedSourceList);
  }, [selectedSourceList]);

  useEffect(() => {
    if (searchParams.get('openImport') !== '1') return;
    setImportDialogOpen(true);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('openImport');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const visibleLeads = useMemo(() => {
    if (selectedSourceList === LIST_KEYS.ALL) return leads;
    return leads.filter((lead) => toSourceListKey(lead) === selectedSourceList);
  }, [leads, selectedSourceList]);

  useEffect(() => {
    if (!selectedLead?.id) return;
    const refreshed = leads.find((lead) => lead.id === selectedLead.id);
    if (refreshed) setSelectedLead((previous) => ({ ...previous, ...refreshed }));
  }, [leads, selectedLead?.id]);

  const handleSelectLead = async (lead) => {
    setSelectedLead(lead);
    setSlideOverOpen(true);
    const freshLead = await dataClient.leads.getById(lead.id);
    if (freshLead) setSelectedLead(freshLead);
  };

  const handleOpenLeadPage = (lead) => {
    navigate(`/leads/${lead.id}`, { state: { lead } });
  };

  const getImportSourceListKey = (importResult) => {
    const sourceKeys = new Set((importResult?.createdLeads || []).map((lead) => toSourceListKey(lead)));
    if (sourceKeys.size === 1) return [...sourceKeys][0];
    return LIST_KEYS.ALL;
  };

  const scrollToLeadsTable = () => {
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      document.getElementById('dashboard-leads-table')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const runLeadAnalysisBatch = async (leadBatch, successMessage) => {
    if (leadBatch.length === 0) return { analyzedCount: 0, firstLeadId: null };

    const confirmedProfile = activeIcp || await dataClient.icp.getActive();
    if (!confirmedProfile) {
      toast.error(t('dashboard.toasts.createActiveIcp'));
      navigate(ROUTES.icp);
      return { analyzedCount: 0, firstLeadId: null };
    }

    setIsReanalyzing(true);
    try {
      let analyzedCount = 0;
      let queuedCount = 0;
      let firstLeadId = leadBatch[0]?.id || null;

      for (const lead of leadBatch) {
        const response = await dataClient.leads.reanalyze(lead.id, { async: asyncJobsEnabled });

        if (response?.jobId) {
          queuedCount += 1;

          if (leadBatch.length === 1) {
            const jobStatus = await waitForJobCompletion(response.jobId, (jobId) => dataClient.jobs.getStatus(jobId));
            if (jobStatus.status === 'failed') {
              throw new Error(jobStatus.error?.message || 'Queued analysis failed.');
            }
          }
        } else {
          analyzedCount += 1;
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['leads'] });

      if (queuedCount > 0 && analyzedCount === 0) {
        toast.success(
          leadBatch.length === 1
            ? t('dashboard.toasts.singleQueuedAndReady', { lead: leadBatch[0]?.company_name || t('common.company') })
            : t('dashboard.toasts.queuedBatch', { count: queuedCount })
        );
      } else {
        toast.success(successMessage || t('dashboard.toasts.analyzedBatch', { count: analyzedCount }));
      }

      return { analyzedCount: analyzedCount || queuedCount, firstLeadId };
    } catch (error) {
      console.warn('Activation analysis failed', error);
      toast.error(t('dashboard.toasts.failedAnalyze'));
      return { analyzedCount: 0, firstLeadId: null };
    } finally {
      setIsReanalyzing(false);
    }
  };

  const focusImportedLeads = async (importResult) => {
    const sourceListKey = getImportSourceListKey(importResult);
    setSelectedSourceList(sourceListKey);
    setImportDialogOpen(false);
    scrollToLeadsTable();
  };

  const handleImportSuccess = (importResult) => {
    if (importResult?.createdLeads?.length) {
      setSelectedSourceList(getImportSourceListKey(importResult));
    }
    queryClient.invalidateQueries({ queryKey: ['leads'] });
  };

  const handleAnalyzeImportedLeads = async (importResult) => {
    const importedLeads = (importResult?.createdLeads || []).slice(0, ACTIVATION_ANALYZE_BATCH_SIZE);
    if (importedLeads.length === 0) {
      await focusImportedLeads(importResult);
      return;
    }

    setSelectedSourceList(getImportSourceListKey(importResult));
    setImportDialogOpen(false);

    const result = await runLeadAnalysisBatch(
      importedLeads,
      `Analyzed ${importedLeads.length} imported lead(s). Review the best one and start the follow-up workflow next.`
    );

    if (result.firstLeadId) {
      const freshLead = await dataClient.leads.getById(result.firstLeadId);
      if (freshLead) {
        setSelectedLead(freshLead);
        setSlideOverOpen(true);
      }
    }
  };

  const handleLeadUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ['leads'] });
  };

  const handleSwitchIcp = async (nextIcpId) => {
    if (!nextIcpId || nextIcpId === activeIcp?.id) return;
    const nextProfile = icpProfiles.find((profile) => profile.id === nextIcpId);
    if (!nextProfile) return;
    setIsSwitchingIcp(true);
    try {
      await dataClient.icp.saveActive(nextProfile);
      toast.success(t('dashboard.toasts.activeIcpChanged', { name: nextProfile.name }));
      queryClient.invalidateQueries({ queryKey: ['icpProfilesQuickSwitch'] });
      queryClient.invalidateQueries({ queryKey: ['icpConfig'] });
    } catch (error) {
      console.warn('Failed to switch ICP', error);
      toast.error(t('dashboard.toasts.failedSwitchIcp'));
    } finally {
      setIsSwitchingIcp(false);
    }
  };

  const handleReanalyzeVisible = async () => {
    if (visibleLeads.length === 0) {
      toast(t('dashboard.toasts.noLeadsInList'));
      return;
    }
    setIsReanalyzing(true);
    try {
      let analyzedCount = 0;
      const confirmedProfile = activeIcp || await dataClient.icp.getActive();
      if (!confirmedProfile) throw new Error(t('dashboard.toasts.noActiveIcpFound'));

      let queuedCount = 0;
      for (const lead of visibleLeads) {
        const response = await dataClient.leads.reanalyze(lead.id, { async: asyncJobsEnabled });
        if (response?.jobId) {
          queuedCount += 1;
        } else {
          analyzedCount += 1;
        }
      }

      toast.success(
        queuedCount > 0 && analyzedCount === 0
          ? t('dashboard.toasts.reanalyzeQueuedBatch', { count: queuedCount })
          : t('dashboard.toasts.reanalyzedBatch', { count: analyzedCount })
      );
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (error) {
      console.warn('Re-analyze failed', error);
      toast.error(t('dashboard.toasts.failedReanalyze'));
    } finally {
      setIsReanalyzing(false);
    }
  };

  const handleScoreIcpVisible = async () => {
    if (visibleLeads.length === 0) {
      toast(t('dashboard.toasts.noLeadsInList'));
      return;
    }
    setIsScoringIcpVisible(true);
    try {
      let scoredCount = 0;
      for (const lead of visibleLeads) {
        await dataClient.leads.scoreIcp(lead.id);
        scoredCount += 1;
      }
      toast.success(
        t('dashboard.toasts.icpScoredBatch', {
          defaultValue: '{{count}} lead(s) scored with ICP.',
          count: scoredCount,
        })
      );
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (error) {
      console.warn('ICP scoring failed', error);
      toast.error(
        t('dashboard.toasts.failedIcpScoreBatch', {
          defaultValue: 'ICP scoring failed for this batch.',
        })
      );
    } finally {
      setIsScoringIcpVisible(false);
    }
  };

  const handleAnalyzeSignalsVisible = async () => {
    if (visibleLeads.length === 0) {
      toast(t('dashboard.toasts.noLeadsInList'));
      return;
    }
    setIsAnalyzingSignalsVisible(true);
    try {
      let updatedCount = 0;
      let queuedCount = 0;
      for (const lead of visibleLeads) {
        const response = await dataClient.leads.discoverSignals(lead.id, { async: asyncJobsEnabled, reanalyze: true, replace: true });
        if (response?.jobId) queuedCount += 1;
        else updatedCount += 1;
      }

      toast.success(
        queuedCount > 0 && updatedCount === 0
          ? t('dashboard.toasts.signalsAnalyzeQueuedBatch', {
              defaultValue: '{{count}} lead(s) queued for signal analysis.',
              count: queuedCount,
            })
          : t('dashboard.toasts.signalsAnalyzedBatch', {
              defaultValue: 'Signal analysis finished for {{count}} lead(s).',
              count: updatedCount,
            })
      );
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (error) {
      console.warn('Signal analysis failed', error);
      toast.error(
        t('dashboard.toasts.failedSignalAnalyzeBatch', {
          defaultValue: 'Signal analysis failed for this batch.',
        })
      );
    } finally {
      setIsAnalyzingSignalsVisible(false);
    }
  };

  const getLeadScore = useMemo(() => (lead) => {
    const finalScore = toNumericScore(lead?.final_score);
    if (finalScore !== null) return finalScore;
    return toNumericScore(lead?.icp_score);
  }, []);

  const visibleStats = useMemo(() => {
    let qualified = 0;
    let toAnalyze = 0;
    const scored = [];

    for (const lead of visibleLeads) {
      const score = getLeadScore(lead);
      if (score !== null) scored.push(score);
      if (String(lead.status || '').toLowerCase() === 'qualified') {
        qualified += 1;
      }
      if (String(lead.status || '').toLowerCase() === 'to analyze') {
        toAnalyze += 1;
      }
    }

    const avgScore = scored.length > 0
      ? Math.round(scored.reduce((acc, s) => acc + s, 0) / scored.length)
      : 0;

    return {
      totalLeads: visibleLeads.length,
      qualified,
      toAnalyze,
      avgScore,
    };
  }, [visibleLeads, getLeadScore]);

  const {
    totalLeads,
    qualified: qualifiedLeads,
    toAnalyze,
    avgScore,
  } = visibleStats;

  const rankedPriorityLeads = useMemo(() => {
    return [...visibleLeads]
      .map((lead) => ({
        ...lead,
        priorityRankScore: estimatePriorityScore(lead),
      }))
      .sort((left, right) => right.priorityRankScore - left.priorityRankScore);
  }, [visibleLeads]);
  const topPriorityLeads = rankedPriorityLeads.slice(0, 3);
  const nextPriorityLeads = rankedPriorityLeads.slice(3, 11);
  const priorityLead = topPriorityLeads[0] || null;
  // Leads analyzed more than 30 days ago with no follow-up progression: surfaced so the user
  // can re-score or re-engage them before the data becomes stale.
  const staleLeadCount = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return visibleLeads.filter((lead) => {
      const analyzedAt = lead.last_analyzed_at ? new Date(lead.last_analyzed_at).getTime() : NaN;
      if (!Number.isFinite(analyzedAt)) return false;
      if (analyzedAt >= cutoff) return false;
      const status = String(lead.follow_up_status || '').toLowerCase();
      return !status.includes('won') && !status.includes('lost');
    }).length;
  }, [visibleLeads]);

  const openLinkedin = (lead) => {
    const linkedinUrl = lead?.linkedin_url || lead?.linkedin || '';
    if (!linkedinUrl) return;
    const withProtocol = /^https?:\/\//i.test(linkedinUrl) ? linkedinUrl : `https://${linkedinUrl}`;
    window.open(withProtocol, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div className="mb-4 rounded-xl border border-[#e6e4df] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">{t('dashboard.priority.eyebrow', { defaultValue: 'Today · Priority' })}</p>
            <h1 className="mt-1 text-[30px] font-bold tracking-tight text-[#1a1200]">{t('dashboard.priority.title', { defaultValue: 'Who to contact now' })}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('dashboard.priority.subtitle', { defaultValue: 'A focused view built from your real leads, ICP scoring, and AI signals.' })}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={handleScoreIcpVisible} disabled={isScoringIcpVisible || isReanalyzing || isAnalyzingSignalsVisible} className="h-8 gap-1.5 rounded-md border-[#e8e5de] text-[11.5px]">
              {isScoringIcpVisible ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
              {t('dashboard.actions.analyzeIcp', { defaultValue: 'Analyze ICP' })}
            </Button>
            <Button variant="outline" size="sm" onClick={handleAnalyzeSignalsVisible} disabled={isAnalyzingSignalsVisible || isReanalyzing || isScoringIcpVisible} className="h-8 gap-1.5 rounded-md border-[#e8e5de] text-[11.5px]">
              {isAnalyzingSignalsVisible ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {t('dashboard.actions.analyzeSignals', { defaultValue: 'Analyze signals' })}
            </Button>
            <Button variant="outline" size="sm" onClick={handleReanalyzeVisible} disabled={isReanalyzing} className="h-8 gap-1.5 rounded-md border-[#e8e5de] text-[11.5px]">
              {isReanalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
              {t('dashboard.actions.reanalyze')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportLeadsToCsv(visibleLeads, `leads-${selectedSourceList === '__all_lists__' ? 'all' : selectedSourceList}.csv`)} disabled={visibleLeads.length === 0} className="h-8 gap-1.5 rounded-md border-[#e8e5de] text-[11.5px]">
              <Download className="h-3.5 w-3.5" />
              {t('common.export')}
            </Button>
            <Button id="import-csv-trigger" onClick={() => setImportDialogOpen(true)} size="sm" className="h-8 gap-1.5 rounded-md bg-[#1a1200] text-[11.5px] text-white hover:bg-[#2a1f07]">
              <Upload className="h-3.5 w-3.5" />
              {t('dashboard.actions.importCsv')}
            </Button>
            <Button id="research-lead-trigger" onClick={() => setResearchDialogOpen(true)} size="sm" variant="outline" className="h-8 gap-1.5 rounded-md border-[#e8e5de] text-[11.5px]">
              <Sparkles className="h-3.5 w-3.5" />
              {t('dashboard.actions.researchLead', { defaultValue: 'Research lead' })}
            </Button>
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_280px]">
        <div className="rounded-xl border border-[#e6e4df] bg-white p-4 shadow-sm">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">{t('dashboard.selectors.list')}</p>
          <div className="mt-2 flex items-center gap-2">
            <Select value={selectedSourceList} onValueChange={setSelectedSourceList}>
              <SelectTrigger className="h-9 border-[#e6e4df] text-sm">
                <SelectValue placeholder={t('dashboard.placeholders.selectLeadList')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={LIST_KEYS.ALL}>{t('dashboard.lists.all')} ({leads.length})</SelectItem>
                {sourceListOptions.map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {option.label} ({option.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.lists)} className="h-9 px-3 text-xs">{t('dashboard.selectors.manageLists', { defaultValue: 'Manage lists' })}</Button>
          </div>
        </div>
        <div className="rounded-xl border border-[#e6e4df] bg-white p-4 shadow-sm">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">ICP</p>
          <Select value={activeIcp?.id || ''} onValueChange={handleSwitchIcp} disabled={isSwitchingIcp || icpProfiles.length === 0}>
            <SelectTrigger className="mt-2 h-9 border-[#e6e4df] text-sm"><SelectValue placeholder={t('dashboard.placeholders.selectActiveIcp')} /></SelectTrigger>
            <SelectContent>{icpProfiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {!activeIcp && !isLoading && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">{t('dashboard.noIcpWarning.body', 'AI scoring and lead qualification require an active ICP profile.')}</p>
        </div>
      )}

      {leadsError && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{t('dashboard.errors.failedToLoadLeads')}</span>
          <Button variant="outline" size="sm" onClick={() => refetchLeads()}>{t('common.retry')}</Button>
        </div>
      )}

      {!isLoading && totalLeads > 0 && priorityLead ? (
        <section className="mb-4 rounded-xl border border-[#e6e4df] bg-white p-5 shadow-sm">
          <div className="grid gap-5 xl:grid-cols-[140px_1fr_auto] xl:items-center">
            <div className="relative h-[132px] w-[132px]">
              <div
                className="h-full w-full rounded-full"
                style={{
                  background: `conic-gradient(#f0a63b ${(clampScore(priorityLead.final_score ?? priorityLead.icp_score) ?? 0) * 3.6}deg, #efece6 0deg)`,
                }}
              />
              <div className="absolute inset-[8px] flex flex-col items-center justify-center rounded-full bg-white">
                <p className="text-[42px] font-bold leading-none tracking-tight text-[#1a1200]">{clampScore(priorityLead.final_score ?? priorityLead.icp_score) ?? '—'}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Final score</p>
              </div>
            </div>
              <h2 className="mt-3 truncate text-[34px] font-bold leading-tight tracking-tight text-[#1a1200]">{priorityLead.company_name}</h2>
              <p className="mt-1 text-[15px] text-slate-600">{priorityLead.contact_name || t('common.contact')} · {priorityLead.contact_role || t('common.contact')}</p>
              <div className="mt-3 grid grid-cols-3 gap-2.5">
                <div className="rounded-lg border border-[#ece9e2] bg-[#fcfbf9] p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Final</p>
                  <p className="mt-1 text-xl font-bold text-[#1a1200]">{clampScore(priorityLead.final_score ?? priorityLead.icp_score) ?? '—'}</p>
                </div>
                <div className="rounded-lg border border-[#ece9e2] bg-[#fcfbf9] p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">ICP</p>
                  <p className="mt-1 text-xl font-bold text-[#1a1200]">{clampScore(priorityLead.icp_score) ?? '—'}</p>
                </div>
                <div className="rounded-lg border border-[#ece9e2] bg-[#fcfbf9] p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">AI</p>
                  <p className="mt-1 text-xl font-bold text-[#1a1200]">{clampScore(priorityLead.ai_score ?? priorityLead?.score_details?.signal_analysis?.ai_score) ?? '—'}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {priorityLead.source_list ? <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">{priorityLead.source_list}</span> : null}
                {priorityLead.industry ? <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{priorityLead.industry}</span> : null}
              </div>
            </div>
            <div className="flex flex-col gap-2 xl:min-w-[190px]">
              <Button size="sm" onClick={() => handleSelectLead(priorityLead)} className="justify-start gap-1.5 bg-[#1a1200] text-white hover:bg-[#2a1f07]">{t('dashboard.priority.openSlideOver', { defaultValue: 'Open slide-over' })}</Button>
              <Button size="sm" variant="outline" onClick={() => handleOpenLeadPage(priorityLead)} className="justify-start gap-1.5"><ArrowRight className="h-3.5 w-3.5" />{t('dashboard.priority.openLead', { defaultValue: 'Open lead page' })}</Button>
              <Button size="sm" variant="outline" disabled={!priorityLead.phone} onClick={() => window.open(`tel:${priorityLead.phone}`, '_self')} className="justify-start gap-1.5"><Phone className="h-3.5 w-3.5" />{t('dashboard.priority.call', { defaultValue: 'Call' })}</Button>
              <Button size="sm" variant="outline" disabled={!priorityLead.contact_email} onClick={() => { window.location.href = `mailto:${priorityLead.contact_email}`; }} className="justify-start gap-1.5"><Mail className="h-3.5 w-3.5" />{t('dashboard.priority.email', { defaultValue: 'Email' })}</Button>
              <Button size="sm" variant="outline" disabled={!(priorityLead.linkedin_url || priorityLead.linkedin)} onClick={() => openLinkedin(priorityLead)} className="justify-start gap-1.5"><Linkedin className="h-3.5 w-3.5" />LinkedIn</Button>
              </div>
        </section>
      ) : null}

      {!isLoading && totalLeads > 0 && (
        <section className="mb-4 grid overflow-hidden rounded-xl border border-[#e6e4df] bg-white shadow-sm sm:grid-cols-4">
          <div className="border-b border-r border-[#ece9e2] p-4 sm:border-b-0"><p className="text-[10.75px] font-semibold uppercase tracking-[0.1em] text-slate-500">{t('dashboard.stats.total', { defaultValue: 'Total leads' })}</p><p className="mt-1 text-[31px] font-bold leading-none text-[#1a1200]">{totalLeads}</p><p className="mt-1 text-[11px] text-slate-500">In selected list</p></div>
          <div className="border-b border-r border-[#ece9e2] p-4 sm:border-b-0"><p className="text-[10.75px] font-semibold uppercase tracking-[0.1em] text-slate-500">{t('dashboard.stats.qualified', { defaultValue: 'Qualified' })}</p><p className="mt-1 text-[31px] font-bold leading-none text-[#1a1200]">{qualifiedLeads}</p><p className="mt-1 text-[11px] text-slate-500">Status = qualified</p></div>
          <div className="border-b border-r border-[#ece9e2] p-4 sm:border-b-0"><p className="text-[10.75px] font-semibold uppercase tracking-[0.1em] text-slate-500">{t('dashboard.stats.avg', { defaultValue: 'Avg score' })}</p><p className="mt-1 text-[31px] font-bold leading-none text-[#1a1200]">{avgScore}</p><p className="mt-1 text-[11px] text-slate-500">Across scored leads</p></div>
          <div className="p-4"><p className="text-[10.75px] font-semibold uppercase tracking-[0.1em] text-slate-500">{t('dashboard.banner.staleLabel', { defaultValue: 'Stale >30d' })}</p><p className="mt-1 text-[31px] font-bold leading-none text-amber-700">{staleLeadCount}</p><p className="mt-1 text-[11px] text-slate-500">{t('dashboard.stats.toAnalyze', { defaultValue: 'To analyze' })}: {toAnalyze}</p></div>
        </section>
      )}

      {!isLoading && topPriorityLeads.length > 0 && (
        <section className="mb-4">
          <h3 className="mb-3 text-[24px] font-semibold tracking-tight text-[#1a1200]">{t('dashboard.priority.topLeads', { defaultValue: 'Top 3 hot leads' })}</h3>
          <div className="grid gap-3 xl:grid-cols-3">
            {topPriorityLeads.map((lead, index) => {
              const finalScore = clampScore(lead.final_score ?? lead.icp_score);
              const icpScore = clampScore(lead.icp_score);
              const aiScore = clampScore(lead.ai_score ?? lead?.score_details?.signal_analysis?.ai_score);
              const heatTier = getHeatTier(lead);
              return (
                <button key={lead.id} type="button" onClick={() => handleSelectLead(lead)} className="group rounded-xl border border-[#e6e4df] bg-white p-4 text-left shadow-sm transition hover:border-[#d9d5cb]">
                  <div className="flex items-start justify-between gap-2"><div><p className="text-2xl font-semibold text-slate-950">{lead.company_name}</p><p className="text-sm text-slate-500">{lead.contact_role || t('common.contact')}</p></div><div className="flex items-center gap-1.5"><span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold leading-tight text-rose-700 ring-1 ring-rose-200 transition-colors group-hover:bg-rose-100">P{index + 1}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold leading-tight ring-1 transition-colors ${HEAT_TIER_BADGE_STYLES[heatTier]}`}>{heatTier}</span></div></div>
                  <p className="mt-3 text-5xl font-bold leading-none text-slate-950">{finalScore ?? '—'}<span className="text-xl text-slate-300">/100</span></p>
                  <div className="mt-3 space-y-2">
                    <div><div className="mb-1 flex justify-between text-xs text-slate-500"><span>ICP</span><span>{icpScore ?? '—'}</span></div><div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-900" style={{ width: `${icpScore ?? 0}%` }} /></div></div>
                    <div><div className="mb-1 flex justify-between text-xs text-slate-500"><span>AI</span><span>{aiScore ?? '—'}</span></div><div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-500" style={{ width: `${aiScore ?? 0}%` }} /></div></div>
                  </div>
                  <div className="mt-3 border-t border-dashed border-[#ece9e2] pt-2 text-xs text-slate-500">{lead.follow_up_status || t('dashboard.priority.toContact', { defaultValue: 'To contact' })}</div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {!isLoading && nextPriorityLeads.length > 0 && (
        <section id="dashboard-leads-table" className="mb-5 overflow-hidden rounded-xl border border-[#e6e4df] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#ece9e2] px-4 py-3">
            <h3 className="text-2xl font-semibold tracking-tight text-[#1a1200]">{t('dashboard.priority.nextInLine', { defaultValue: 'Next in line' })}</h3>
            <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.pipeline)}>{t('dashboard.priority.openPipeline', { defaultValue: 'Open pipeline' })}</Button>
          </div>
          <div className="grid grid-cols-[90px_minmax(160px,1.6fr)_minmax(140px,1fr)_minmax(120px,0.8fr)_minmax(140px,1fr)_130px] items-center gap-3 bg-[#faf9f7] px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            <span>{t('dashboard.priority.score', { defaultValue: 'Score' })}</span>
            <span>{t('dashboard.priority.lead', { defaultValue: 'Lead' })}</span>
            <span>{t('dashboard.priority.company', { defaultValue: 'Company' })}</span>
            <span>{t('dashboard.priority.status', { defaultValue: 'Status' })}</span>
            <span>{t('dashboard.priority.list', { defaultValue: 'List' })}</span>
            <span className="text-right">{t('dashboard.priority.actions', { defaultValue: 'Actions' })}</span>
          </div>
          <div className="divide-y divide-[#eeece7]">
            {nextPriorityLeads.slice(0, 8).map((lead) => {
              const score = clampScore(lead.final_score ?? lead.icp_score) ?? 0;
              return (
                <button key={lead.id} type="button" onClick={() => handleSelectLead(lead)} className="grid w-full grid-cols-[90px_minmax(160px,1.6fr)_minmax(140px,1fr)_minmax(120px,0.8fr)_minmax(140px,1fr)_130px] items-center gap-3 px-4 py-3 text-left hover:bg-[#fbfaf8]">
                  <div className="flex items-center gap-2"><Circle className={`h-2.5 w-2.5 ${score >= 80 ? 'fill-rose-500 text-rose-500' : score >= 65 ? 'fill-amber-500 text-amber-500' : 'fill-slate-400 text-slate-400'}`} /><span className="text-3xl font-semibold text-slate-900">{score}</span></div>
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{lead.contact_name || t('common.contact')}</p><p className="truncate text-[11.5px] text-slate-500">{lead.contact_role || t('common.contact')}</p></div>
                  <div className="truncate text-[12.75px] font-medium text-slate-700">{lead.company_name}</div>
                  <div className="truncate text-sm text-slate-600">{lead.follow_up_status || t('dashboard.priority.toContact', { defaultValue: 'To contact' })}</div>
                  <div className="truncate text-sm text-slate-500">{lead.source_list || t('dashboard.lists.unlisted')}</div>
                  <div className="text-right text-sm text-slate-500">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-7 px-2 text-xs"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleOpenLeadPage(lead);
                      }}
                    >
                      {t('dashboard.priority.openLead', { defaultValue: 'Open lead' })}
                    </Button>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <LeadSlideOver
        lead={selectedLead}
        open={slideOverOpen}
        onOpenChange={setSlideOverOpen}
        onLeadUpdated={handleLeadUpdated}
      />

      <ImportCSVDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportSuccess={handleImportSuccess}
        hasActiveIcp={Boolean(activeIcp?.id)}
        onReviewIcp={() => {
          setImportDialogOpen(false);
          navigate(ROUTES.icp);
        }}
        onFocusImportedLeads={focusImportedLeads}
        onAnalyzeImportedLeads={handleAnalyzeImportedLeads}
      />

      <ResearchLeadDialog
        open={researchDialogOpen}
        onClose={() => setResearchDialogOpen(false)}
        onLeadCreated={(lead) => {
          setResearchDialogOpen(false);
          if (lead) {
            setSelectedLead(lead);
            setSlideOverOpen(true);
          }
        }}
      />
    </>
  );
}

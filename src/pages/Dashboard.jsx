import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRight, Building2, Circle, Copy, Download, Ellipsis, Flame, Linkedin, Loader2, Mail, Phone, RefreshCcw, Sparkles, Target, Upload } from 'lucide-react';
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
import { computeLeadPriority, deriveLeadNextAction, getBestOutreachHook } from '@/lib/leadScoring';
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

const deriveNextAction = (lead) => {
  return deriveLeadNextAction(lead);
};

const getStatusTone = (score) => {
  if (score >= 80) return 'text-rose-700 bg-rose-50 border-rose-200';
  if (score >= 65) return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-slate-700 bg-slate-100 border-slate-200';
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();

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
    const highPriorityCount = [];

    for (const lead of visibleLeads) {
      const score = getLeadScore(lead);
      if (score !== null) {
        scored.push(score);
        if (score >= 80) highPriorityCount.push(score);
      }
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
      highPriority: highPriorityCount.length,
    };
  }, [visibleLeads, getLeadScore]);

  const {
    totalLeads,
    qualified: qualifiedLeads,
    toAnalyze,
    avgScore,
    highPriority,
  } = visibleStats;

  const rankedPriorityLeads = useMemo(() => {
    return [...visibleLeads]
      .map((lead) => {
        const priorityMeta = computeLeadPriority(lead, activeIcp);
        return {
          ...lead,
          priorityMeta,
          priorityRankScore: priorityMeta.priorityScore,
        };
      })
      .sort((left, right) => right.priorityRankScore - left.priorityRankScore);
  }, [visibleLeads, activeIcp]);

  const topPriorityLeads = rankedPriorityLeads.slice(0, 3);
  const nextPriorityLeads = rankedPriorityLeads.slice(3, 11);
  const priorityLead = topPriorityLeads[0] || null;

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

  const copyLeadHook = async (lead) => {
    const hook = getBestOutreachHook(lead) || `${lead.company_name}: ${deriveNextAction(lead)}`;
    try {
      await navigator.clipboard.writeText(hook);
      toast.success(t('toasts.copied', { defaultValue: 'Copied.' }));
    } catch {
      toast.error(t('errors.generic', { defaultValue: 'Something went wrong.' }));
    }
  };

  const openSequenceBuilder = (lead) => {
    navigate(`${ROUTES.outreach}?leadId=${encodeURIComponent(lead.id)}&mode=sequence`, { state: { lead } });
  };

  const isMockMode = dataClient.mode === 'mock';

  const formatDateEyebrow = new Date().toLocaleDateString(i18n.language, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-4 pb-2">
        <section className="rounded-xl border border-[#e6e4df] bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                {formatDateEyebrow} · {t('dashboard.priority.eyebrow', { defaultValue: 'File prioritaire' })}
              </p>
              <h1 className="mt-1 text-[31px] font-bold tracking-tight text-[#1a1200]">
                {t('dashboard.priority.title', { defaultValue: 'Qui contacter maintenant' })}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {t('dashboard.priority.subtitle', { defaultValue: 'Leads classés par fit ICP, signaux disponibles et dynamique de suivi.' })}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Select value={selectedSourceList} onValueChange={setSelectedSourceList}>
                  <SelectTrigger className="h-8 w-[250px] border-[#e8e5de] text-xs">
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
                <Select value={activeIcp?.id || ''} onValueChange={handleSwitchIcp} disabled={isSwitchingIcp || icpProfiles.length === 0}>
                  <SelectTrigger className="h-8 w-[220px] border-[#e8e5de] text-xs">
                    <SelectValue placeholder={t('dashboard.placeholders.selectActiveIcp')} />
                  </SelectTrigger>
                  <SelectContent>
                    {icpProfiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-start gap-1.5 lg:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReanalyzeVisible}
                disabled={isReanalyzing}
                className="h-8 gap-1.5 rounded-md border-[#e8e5de] px-2.5 text-[11.5px]"
              >
                {isReanalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                {t('dashboard.actions.reanalyze')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportLeadsToCsv(visibleLeads, `leads-${selectedSourceList === '__all_lists__' ? 'all' : selectedSourceList}.csv`)}
                disabled={visibleLeads.length === 0}
                className="h-8 gap-1.5 rounded-md border-[#e8e5de] px-2.5 text-[11.5px]"
              >
                <Download className="h-3.5 w-3.5" />
                {t('common.export')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAnalyzeSignalsVisible}
                disabled={isMockMode || isAnalyzingSignalsVisible || isReanalyzing || isScoringIcpVisible}
                title={isMockMode ? t('dashboard.actions.requiresInternet', { defaultValue: 'Action désactivée en local: elle nécessite Internet.' }) : undefined}
                className="h-8 gap-1.5 rounded-md border-[#e8e5de] px-2.5 text-[11.5px]"
              >
                {isAnalyzingSignalsVisible ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {t('dashboard.actions.analyzeSignals', { defaultValue: 'Analyser les signaux' })}
              </Button>
              <Button id="import-csv-trigger" size="sm" onClick={() => setImportDialogOpen(true)} className="h-8 gap-1.5 rounded-md bg-[#1a1200] px-2.5 text-[11.5px] text-white hover:bg-[#2a1f07]">
                <Upload className="h-3.5 w-3.5" />
                {t('dashboard.actions.importCsv')}
              </Button>
              <Button
                id="research-lead-trigger"
                size="sm"
                variant="outline"
                onClick={() => setResearchDialogOpen(true)}
                disabled={isMockMode}
                title={isMockMode ? t('dashboard.actions.requiresInternet', { defaultValue: 'Action désactivée en local: elle nécessite Internet.' }) : undefined}
                className="h-8 gap-1.5 rounded-md border-[#e8e5de] px-2.5 text-[11.5px]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {t('dashboard.actions.researchLead', { defaultValue: 'Rechercher un lead' })}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleScoreIcpVisible}
                disabled={isScoringIcpVisible || isReanalyzing || isAnalyzingSignalsVisible}
                className="h-8 gap-1.5 rounded-md border-[#e8e5de] px-2.5 text-[11.5px]"
              >
                {isScoringIcpVisible ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
                {t('dashboard.actions.analyzeIcp', { defaultValue: 'Scorer ICP' })}
              </Button>
            </div>
          </div>
        </section>

        {!activeIcp && !isLoading && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">{t('dashboard.noIcpWarning.body', 'AI scoring and lead qualification require an active ICP profile.')}</p>
          </div>
        )}

        {leadsError && (
          <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{t('dashboard.errors.failedToLoadLeads')}</span>
            <Button variant="outline" size="sm" onClick={() => refetchLeads()}>{t('common.retry')}</Button>
          </div>
        )}

        {!isLoading && totalLeads > 0 && priorityLead && (
          <section className="w-full rounded-xl border border-[#e6e4df] bg-white px-6 py-5 shadow-sm">
            <div className="grid gap-6 xl:grid-cols-[136px_minmax(0,1fr)_auto] xl:items-center">
              <div className="relative h-[118px] w-[118px]">
                <div
                  className="h-full w-full rounded-full"
                  style={{
                    background: `conic-gradient(#f0a63b ${(priorityLead.priorityMeta?.finalScore ?? clampScore(priorityLead.final_score ?? priorityLead.icp_score) ?? 0) * 3.6}deg, #efece6 0deg)`,
                  }}
                />
                <div className="absolute inset-[7px] flex flex-col items-center justify-center rounded-full bg-white">
                  <p className="text-[38px] font-bold leading-none tracking-tight text-[#1a1200]">{priorityLead.priorityMeta?.finalScore ?? clampScore(priorityLead.final_score ?? priorityLead.icp_score) ?? '—'}</p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">{t('dashboard.priority.finalScore', { defaultValue: 'Score final' })}</p>
                </div>
              </div>

              <div className="min-w-0">
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-amber-700">
                  {t('dashboard.priority.today', { defaultValue: 'Priorité du jour' })}
                </span>
                <h2 className="mt-1.5 truncate text-[30px] font-bold leading-tight tracking-tight text-[#1a1200]">{priorityLead.company_name}</h2>
                <p className="mt-1 truncate text-sm text-slate-600">{priorityLead.contact_name || t('common.contact')} · {priorityLead.contact_role || t('common.contact')}</p>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-600">
                  <span><strong className="text-slate-900">ICP:</strong> {priorityLead.priorityMeta?.icpScore ?? clampScore(priorityLead.icp_score) ?? '—'}</span>
                  <span><strong className="text-slate-900">AI:</strong> {priorityLead.priorityMeta?.aiScore ?? clampScore(priorityLead.ai_score ?? priorityLead?.score_details?.signal_analysis?.ai_score) ?? '—'}</span>
                  <span><strong className="text-slate-900">{t('dashboard.priority.bestTime', { defaultValue: 'Meilleur créneau' })}:</strong> {t('dashboard.priority.morning', { defaultValue: 'Matin' })}</span>
                  <span><strong className="text-slate-900">{t('dashboard.priority.path', { defaultValue: 'Suite' })}:</strong> {deriveNextAction(priorityLead)}</span>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {priorityLead.source_list ? <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">{priorityLead.source_list}</span> : null}
                  {priorityLead.industry ? <span className="rounded-md border border-[#ece9e2] bg-[#fcfbf9] px-2 py-1 text-xs text-slate-600">{priorityLead.industry}</span> : null}
                </div>
              </div>

              <div className="z-[1] flex flex-wrap items-center gap-1.5 xl:justify-end xl:gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!priorityLead.phone}
                  onClick={() => window.open(`tel:${priorityLead.phone}`, '_self')}
                  className="h-8 gap-1.5 rounded-md border-[#dcd8cd] px-2.5 text-xs"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {t('dashboard.priority.call', { defaultValue: 'Appeler' })}
                </Button>
                <Button size="sm" variant="outline" onClick={() => copyLeadHook(priorityLead)} className="h-8 gap-1.5 rounded-md border-[#dcd8cd] px-2.5 text-xs">
                  <Copy className="h-3.5 w-3.5" />
                  {t('dashboard.priority.copyHook', { defaultValue: "Copier l'accroche" })}
                </Button>
                <Button size="sm" variant="outline" onClick={() => openSequenceBuilder(priorityLead)} className="h-8 gap-1.5 rounded-md border-[#dcd8cd] px-2.5 text-xs">{t('dashboard.priority.generateSequence', { defaultValue: 'Préparer une séquence' })}</Button>
                <Button size="icon" variant="outline" onClick={() => navigate(ROUTES.priorities)} className="h-8 w-8 rounded-md border-[#dcd8cd]" aria-label={t('dashboard.priority.openPriorityList', { defaultValue: 'Ouvrir la liste prioritaire' })}>
                  <Ellipsis className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleSelectLead(priorityLead)} className="h-8 px-2 text-xs">{t('dashboard.priority.openPanel', { defaultValue: 'Ouvrir le panneau' })}</Button>
                <Button size="sm" variant="ghost" onClick={() => handleOpenLeadPage(priorityLead)} className="h-8 px-2 text-xs">{t('dashboard.priority.openLead', { defaultValue: 'Voir le lead' })}</Button>
              </div>
            </div>
          </section>
        )}

        {!isLoading && totalLeads > 0 && (
          <section className="grid overflow-hidden rounded-xl border border-[#e6e4df] bg-white shadow-sm sm:grid-cols-4">
            <div className="border-b border-r border-[#ece9e2] px-4 py-3.5 sm:border-b-0">
              <p className="text-[10.75px] font-semibold uppercase tracking-[0.1em] text-slate-500">{t('dashboard.priority.focusList', { defaultValue: 'Liste active' })}</p>
              <p className="mt-0.5 text-[27px] font-bold leading-none text-[#1a1200]">{totalLeads}</p>
              <p className="mt-1 text-[11px] text-slate-500">{sourceListLabel(selectedSourceList === LIST_KEYS.ALL ? LIST_KEYS.ALL : selectedSourceList, t)}</p>
            </div>
            <div className="border-b border-r border-[#ece9e2] px-4 py-3.5 sm:border-b-0">
              <p className="text-[10.75px] font-semibold uppercase tracking-[0.1em] text-slate-500">{t('dashboard.priority.highPriority', { defaultValue: 'Haute priorité' })}</p>
              <p className="mt-0.5 text-[27px] font-bold leading-none text-[#1a1200]">{highPriority}</p>
              <p className="mt-1 text-[11px] text-slate-500">{t('dashboard.priority.score80', { defaultValue: 'Score 80+' })}</p>
            </div>
            <div className="border-b border-r border-[#ece9e2] px-4 py-3.5 sm:border-b-0">
              <p className="text-[10.75px] font-semibold uppercase tracking-[0.1em] text-slate-500">{t('dashboard.priority.pipelineReady', { defaultValue: 'Prêts pipeline' })}</p>
              <p className="mt-0.5 text-[27px] font-bold leading-none text-[#1a1200]">{qualifiedLeads}</p>
              <p className="mt-1 text-[11px] text-slate-500">{t('dashboard.priority.qualifiedLeads', { defaultValue: 'Leads qualifiés' })}</p>
            </div>
            <div className="px-4 py-3.5">
              <p className="text-[10.75px] font-semibold uppercase tracking-[0.1em] text-slate-500">{t('dashboard.priority.updatedAvg', { defaultValue: 'Score moyen' })}</p>
              <p className="mt-0.5 text-[27px] font-bold leading-none text-[#1a1200]">{avgScore}</p>
              <p className="mt-1 text-[11px] text-slate-500">{t('dashboard.priority.staleAndAnalyze', { defaultValue: '{{stale}} obsolète(s) · {{toAnalyze}} à analyser', stale: staleLeadCount, toAnalyze })}</p>
            </div>
          </section>
        )}

        {!isLoading && topPriorityLeads.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[24px] font-semibold tracking-tight text-[#1a1200]">{t('dashboard.priority.topLeads', { defaultValue: 'Top 3 des leads chauds' })}</h3>
            </div>
            <div className="grid gap-3.5 xl:grid-cols-3">
              {topPriorityLeads.map((lead, index) => {
                const finalScore = lead.priorityMeta?.finalScore ?? clampScore(lead.final_score ?? lead.icp_score);
                const icpScore = lead.priorityMeta?.icpScore ?? clampScore(lead.icp_score) ?? 0;
                const aiScore = lead.priorityMeta?.aiScore ?? clampScore(lead.ai_score ?? lead?.score_details?.signal_analysis?.ai_score) ?? 0;
                return (
                  <article key={lead.id} className="rounded-xl border border-[#e6e4df] bg-white p-[18px] shadow-sm transition hover:border-[#d9d5cb]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-950">{lead.company_name}</p>
                        <p className="truncate text-[12px] text-slate-500">{lead.contact_name || t('common.contact')} · {lead.contact_role || t('common.contact')}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">P{index + 1}</span>
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                          <Flame className="mr-1 h-3 w-3" />Hot
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-[86px_1fr] gap-2.5">
                      <p className="text-[52px] font-bold leading-none tracking-tight text-slate-950">{finalScore ?? '—'}</p>
                      <div className="space-y-1.5 pt-1">
                        <div>
                          <div className="mb-1 flex justify-between text-[11px] text-slate-500"><span>ICP</span><span>{icpScore}</span></div>
                          <div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-900" style={{ width: `${icpScore}%` }} /></div>
                        </div>
                        <div>
                          <div className="mb-1 flex justify-between text-[11px] text-slate-500"><span>AI</span><span>{aiScore}</span></div>
                          <div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-500" style={{ width: `${aiScore}%` }} /></div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {lead.industry ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10.5px] font-medium text-slate-600">{lead.industry}</span> : null}
                      {lead.company_size ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10.5px] font-medium text-slate-600">{lead.company_size}</span> : null}
                      {lead.source_list ? <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10.5px] font-medium text-sky-700">{lead.source_list}</span> : null}
                    </div>

                    <div className="mt-3 flex items-center gap-1.5 border-t border-dashed border-[#ece9e2] pt-2">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSelectLead(lead)}><ArrowRight className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!lead.contact_email} onClick={() => { if (lead.contact_email) window.location.href = `mailto:${lead.contact_email}`; }}><Mail className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!(lead.phone || lead.contact_phone)} onClick={() => { const phone = lead.phone || lead.contact_phone; if (phone) window.location.href = `tel:${phone}`; }}><Phone className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!(lead.linkedin_url || lead.linkedin)} onClick={() => openLinkedin(lead)}><Linkedin className="h-3.5 w-3.5" /></Button>
                      <div className="flex-1" />
                      <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => handleOpenLeadPage(lead)}>
                        {t('dashboard.priority.openLead', { defaultValue: 'Voir le lead' })}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {!isLoading && nextPriorityLeads.length > 0 && (
          <section id="dashboard-leads-table" className="overflow-hidden rounded-xl border border-[#e6e4df] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#ece9e2] px-4 py-2.5">
              <h3 className="text-[23px] font-semibold tracking-tight text-[#1a1200]">{t('dashboard.priority.nextInLine', { defaultValue: 'Suite de la file' })}</h3>
              <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.pipeline)}>{t('dashboard.priority.openPipeline', { defaultValue: 'Ouvrir le pipeline' })}</Button>
            </div>
            <div className="grid grid-cols-[82px_minmax(190px,1.9fr)_minmax(150px,1fr)_minmax(140px,0.9fr)_minmax(180px,1fr)_172px] items-center gap-4 bg-[#faf9f7] px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              <span>{t('dashboard.priority.score', { defaultValue: 'Score' })}</span>
              <span>{t('dashboard.priority.lead', { defaultValue: 'Lead' })}</span>
              <span>{t('dashboard.priority.company', { defaultValue: 'Entreprise' })}</span>
              <span>{t('dashboard.priority.status', { defaultValue: 'Statut' })}</span>
              <span>{t('dashboard.priority.nextAction', { defaultValue: 'Prochaine action' })}</span>
              <span className="text-right">{t('dashboard.priority.actions', { defaultValue: 'Actions' })}</span>
            </div>
            <div className="divide-y divide-[#eeece7]">
              {nextPriorityLeads.slice(0, 8).map((lead) => {
                const score = lead.priorityMeta?.priorityScore ?? clampScore(lead.final_score ?? lead.icp_score) ?? 0;
                const nextAction = lead.priorityMeta?.nextAction ?? deriveNextAction(lead);
                const emailAddress = String(lead.email || lead.contact_email || '').trim();
                const phoneNumber = String(lead.phone || lead.contact_phone || '').trim();
                return (
                  <button key={lead.id} type="button" onClick={() => handleSelectLead(lead)} className="grid w-full grid-cols-[82px_minmax(190px,1.9fr)_minmax(150px,1fr)_minmax(140px,0.9fr)_minmax(180px,1fr)_172px] items-center gap-4 px-4 py-2.5 text-left hover:bg-[#fbfaf8]">
                    <div className="flex items-center gap-1.5">
                      <Circle className={`h-2.5 w-2.5 ${score >= 80 ? 'fill-rose-500 text-rose-500' : score >= 65 ? 'fill-amber-500 text-amber-500' : 'fill-slate-400 text-slate-400'}`} />
                      <span className="text-[28px] font-semibold leading-none text-slate-900">{score}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-slate-900">{lead.contact_name || t('common.contact')}</p>
                      <p className="truncate text-[11.5px] text-slate-500">{lead.contact_role || t('common.contact')}</p>
                    </div>
                    <div className="truncate text-[12.75px] font-medium text-slate-700">{lead.company_name}</div>
                    <div>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStatusTone(score)}`}>
                        {lead.follow_up_status || t('dashboard.priority.toContact', { defaultValue: 'À contacter' })}
                      </span>
                    </div>
                    <div className="truncate text-[13px] text-slate-600">{nextAction}</div>
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleSelectLead(lead);
                        }}
                      >
                        {t('common.open', { defaultValue: 'Ouvrir' })}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleOpenLeadPage(lead);
                        }}
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={!emailAddress}
                        className="h-7 w-7"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (emailAddress) window.location.href = `mailto:${emailAddress}`;
                        }}
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={!phoneNumber}
                        className="h-7 w-7"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (phoneNumber) window.location.href = `tel:${phoneNumber}`;
                        }}
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {!isLoading && totalLeads === 0 && (
          <section className="rounded-xl border border-dashed border-[#ddd8cd] bg-white/70 p-8 text-center">
            <Building2 className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-2 text-sm text-slate-600">{t('dashboard.empty.noLeads', { defaultValue: 'Aucun lead dans cette liste pour le moment.' })}</p>
          </section>
        )}
      </div>

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

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useSpring, useTransform, useMotionValue } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Brain, CheckCircle2, Clock3, CreditCard, Database, Download, Loader2, MessageSquare, RefreshCcw, Sparkles, Target, TrendingUp, Upload, Users, XCircle } from 'lucide-react';
import { BarChart, Bar, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import ActivationChecklist from '@/components/ActivationChecklist';
import LeadSlideOver from '@/components/leads/LeadSlideOver';
import ImportCSVDialog from '@/components/leads/ImportCSVDialog';
import ResearchLeadDialog from '@/components/leads/ResearchLeadDialog';
import LeadsTable from '@/components/leads/LeadsTable';
import EmptyState from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ACTIVATION_ANALYZE_BATCH_SIZE } from '@/constants/activation';
import { ROUTES } from '@/constants/routes';
import { LEAD_STATUS } from '@/constants/leads';
import { getActivationState } from '@/lib/activation';
import { buildAiRunActivityModel, formatAiRunCost, formatAiRunDuration, formatAiRunRelativeTime, formatAiRunTimestamp } from '@/lib/aiRunPresentation';
import { useAuth } from '@/lib/AuthContext';
import { buildDashboardInsightModel } from '@/lib/dashboardInsights';
import { exportLeadsToCsv } from '@/lib/exportCsv';
import { waitForJobCompletion } from '@/lib/jobs';
import { dataClient } from '@/services/dataClient';

const LIST_KEYS = {
  ALL: '__all_lists__',
  UNLISTED: '__unlisted__',
};

const STORAGE_KEY = 'aimleads:selected-source-list';

const STAT_STYLE = {
  total: { icon: Users, bg: 'bg-gradient-to-br from-violet-500 to-violet-600', glow: 'shadow-[0_6px_20px_-6px_rgba(139,92,246,0.5)]', tint: 'from-violet-50/60' },
  qualified: { icon: TrendingUp, bg: 'bg-gradient-to-br from-emerald-500 to-emerald-600', glow: 'shadow-[0_6px_20px_-6px_rgba(16,185,129,0.5)]', tint: 'from-emerald-50/60' },
  avg: { icon: Target, bg: 'bg-gradient-to-br from-amber-500 to-orange-500', glow: 'shadow-[0_6px_20px_-6px_rgba(245,158,11,0.5)]', tint: 'from-amber-50/60' },
  toAnalyze: { icon: Sparkles, bg: 'bg-gradient-to-br from-sky-500 to-blue-600', glow: 'shadow-[0_6px_20px_-6px_rgba(58,141,255,0.55)]', tint: 'from-sky-50/60' },
};

const BILLING_ACTION_LABELS = {
  analyze: 'billing.actions.analyze',
  reanalyze_llm: 'billing.actions.reanalyze',
  discover_signals: 'billing.actions.discoverSignals',
  sequence: 'billing.actions.sequence',
  icp_generate: 'billing.actions.icpGenerate',
  analytics_insights: 'billing.actions.analyticsInsights',
  grant: 'billing.actions.grant',
  trial: 'billing.actions.trial',
};

const AI_RUN_STATUS_STYLES = {
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
  running: 'border-amber-200 bg-amber-50 text-amber-700',
  unknown: 'border-slate-200 bg-slate-100 text-slate-600',
};

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

const getBillingActionLabel = (action, t) => {
  const key = BILLING_ACTION_LABELS[action];
  return key ? t(key) : String(action || 'unknown');
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
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

  const { data: leads = [], isLoading, isError: leadsError, refetch: refetchLeads } = useQuery({
    queryKey: ['leads'],
    queryFn: () => dataClient.leads.list('-created_at'),
  });

  const { data: icpProfiles = [] } = useQuery({
    queryKey: ['icpProfilesQuickSwitch'],
    queryFn: () => dataClient.icp.list(),
  });

  const { data: creditsData = null } = useQuery({
    queryKey: ['workspaceCreditsSnapshot'],
    queryFn: () => dataClient.workspace.getCredits({ limit: 10 }),
    staleTime: 60_000,
  });

  const { data: aiRuns = [], isLoading: aiRunsLoading } = useQuery({
    queryKey: ['workspaceAiRuns'],
    queryFn: () => dataClient.workspace.listAiRuns({ limit: 8 }),
    staleTime: 30_000,
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

  const activationState = useMemo(
    () => getActivationState({ activeIcp, leads }),
    [activeIcp, leads]
  );

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
      await queryClient.invalidateQueries({ queryKey: ['workspaceAiRuns'] });

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
    queryClient.invalidateQueries({ queryKey: ['workspaceAiRuns'] });
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
      queryClient.invalidateQueries({ queryKey: ['workspaceAiRuns'] });
    } catch (error) {
      console.warn('Re-analyze failed', error);
      toast.error(t('dashboard.toasts.failedReanalyze'));
    } finally {
      setIsReanalyzing(false);
    }
  };

  const getLeadScore = (lead) => {
    const finalScore = toNumericScore(lead?.final_score);
    if (finalScore !== null) return finalScore;
    return toNumericScore(lead?.icp_score);
  };
  const hasAnalyzedLead = activationState.hasAnalyzedLead;
  const scoredLeads = visibleLeads.map((lead) => getLeadScore(lead)).filter((score) => score !== null);
  const totalLeads = visibleLeads.length;
  const qualifiedLeads = visibleLeads.filter((lead) => lead.status === LEAD_STATUS.QUALIFIED).length;
  const toAnalyze = visibleLeads.filter((lead) => lead.status === LEAD_STATUS.TO_ANALYZE).length;
  const avgScore =
    scoredLeads.length > 0 ? Math.round(scoredLeads.reduce((acc, score) => acc + score, 0) / scoredLeads.length) : 0;
  const aiEnriched = visibleLeads.filter((l) => l.llm_enriched).length;
  const selectedListLabel = selectedSourceList === LIST_KEYS.ALL
    ? t('dashboard.lists.all')
    : sourceListOptions.find((option) => option.key === selectedSourceList)?.label || sourceListLabel(selectedSourceList, t);
  const analyzedVisible = visibleLeads.filter((lead) => getLeadScore(lead) !== null).length;
  const showActivationChecklist = !activationState.hasActiveIcp || totalLeads < 10;
  const creditsBalance = creditsData?.balance ?? null;
  const creditRunwayDays = creditsData?.usage?.projected_runway_days ?? null;
  const entitlements = creditsData?.entitlements || {};
  const planSlug = creditsData?.plan?.plan_slug || 'free';
  const dashboardLocale = i18n.resolvedLanguage?.startsWith('fr') ? 'fr-FR' : 'en-US';
  const seatsIncluded = creditsData?.usage?.seats_included ?? entitlements?.seats_included ?? 0;
  const seatsUsed = creditsData?.usage?.seats_used ?? 0;
  const crmSlotsIncluded = creditsData?.usage?.crm_slots_included ?? entitlements?.crm_integrations ?? 0;
  const crmSlotsUsed = creditsData?.usage?.crm_slots_used ?? 0;
  const topAction = creditsData?.top_actions?.[0] || null;
  const qualificationRate = analyzedVisible > 0 ? Math.round((qualifiedLeads / analyzedVisible) * 100) : 0;
  const actionReadyLeads = visibleLeads.filter((lead) => {
    const score = getLeadScore(lead);
    return lead.status === LEAD_STATUS.QUALIFIED || (score !== null && score >= 65);
  }).length;
  const scoreDistribution = useMemo(() => {
    const buckets = [
      { label: '0-24', range: [0, 24], color: '#f87171' },
      { label: '25-49', range: [25, 49], color: '#fb923c' },
      { label: '50-64', range: [50, 64], color: '#facc15' },
      { label: '65-79', range: [65, 79], color: '#34d399' },
      { label: '80-100', range: [80, 100], color: '#38bdf8' },
    ];
    return buckets.map((b) => ({
      ...b,
      count: scoredLeads.filter((s) => s >= b.range[0] && s <= b.range[1]).length,
    }));
  }, [scoredLeads]);

  const roiInsightModel = useMemo(() => buildDashboardInsightModel({
    visibleLeads,
    activeIcp,
    creditsBalance,
    seatsIncluded,
    seatsUsed,
    crmSlotsIncluded,
    crmSlotsUsed,
  }), [activeIcp, creditsBalance, crmSlotsIncluded, crmSlotsUsed, seatsIncluded, seatsUsed, visibleLeads]);
  const aiActivityModel = useMemo(() => buildAiRunActivityModel(aiRuns), [aiRuns]);
  const aiTopModel = aiActivityModel.modelMix[0] || null;

  const stats = [
    { key: 'total', value: totalLeads, label: t('dashboard.stats.total') },
    { key: 'qualified', value: qualifiedLeads, label: t('dashboard.stats.qualified') },
    { key: 'avg', value: avgScore, label: t('dashboard.stats.avg') },
    { key: 'toAnalyze', value: toAnalyze, label: t('dashboard.stats.toAnalyze') },
  ];

  const handleActivationAnalysis = async () => {
    if (leads.length === 0) {
      setImportDialogOpen(true);
      return;
    }

    const nextLead = activationState.leadToAnalyze || leads[0];
    const result = await runLeadAnalysisBatch(
      [nextLead],
      t('dashboard.toasts.singleAnalyzed', { lead: nextLead.company_name || t('common.company') })
    );

    if (result.firstLeadId) {
      const freshLead = await dataClient.leads.getById(result.firstLeadId);
      if (freshLead) {
        setSelectedLead(freshLead);
        setSlideOverOpen(true);
      }
    }
  };

  const activationSteps = [
    {
      id: 'icp',
      icon: Target,
      title: t('dashboard.activation.icp.title'),
      description: activeIcp
        ? t('dashboard.activation.icp.descriptionComplete', { name: activeIcp.name })
        : t('dashboard.activation.icp.descriptionPending'),
      complete: activationState.hasActiveIcp,
      actionLabel: activeIcp ? t('dashboard.activation.icp.reviewAction') : t('dashboard.activation.icp.configureAction'),
      onAction: () => navigate(ROUTES.icp),
    },
    {
      id: 'import',
      icon: Upload,
      title: t('dashboard.activation.import.title'),
      description: leads.length > 0
        ? t('dashboard.activation.import.descriptionComplete', { count: leads.length })
        : t('dashboard.activation.import.descriptionPending'),
      complete: activationState.hasImportedLeads,
      actionLabel: leads.length > 0 ? t('dashboard.activation.import.reviewAction') : t('dashboard.activation.import.importAction'),
      onAction: leads.length > 0 ? scrollToLeadsTable : () => setImportDialogOpen(true),
    },
    {
      id: 'analysis',
      icon: Sparkles,
      title: t('dashboard.activation.analysis.title'),
      description: hasAnalyzedLead
        ? t('dashboard.activation.analysis.descriptionComplete')
        : t('dashboard.activation.analysis.descriptionPending'),
      complete: hasAnalyzedLead,
      actionLabel:
        leads.length === 0
          ? t('dashboard.activation.analysis.importFirst')
          : !activeIcp
            ? t('dashboard.activation.analysis.configureFirst')
            : isReanalyzing
              ? t('dashboard.activation.analysis.loading')
              : t('dashboard.activation.analysis.action'),
      onAction:
        leads.length === 0
          ? () => setImportDialogOpen(true)
          : !activeIcp
            ? () => navigate(ROUTES.icp)
            : handleActivationAnalysis,
      disabled: Boolean(activeIcp) && leads.length > 0 && (isReanalyzing || !activationState.leadToAnalyze),
    },
    {
      id: 'review',
      icon: MessageSquare,
      title: t('dashboard.activation.review.title'),
      description: activationState.hasFollowUpStarted
        ? t('dashboard.activation.review.descriptionComplete')
        : t('dashboard.activation.review.descriptionPending'),
      complete: activationState.hasFollowUpStarted,
      actionLabel: activationState.leadToReview ? t('dashboard.activation.review.openBestLead') : t('dashboard.activation.review.openPipeline'),
      onAction: activationState.leadToReview
        ? () => handleOpenLeadPage(activationState.leadToReview)
        : () => navigate(ROUTES.pipeline),
      disabled: !activationState.hasAnalyzedLead,
    },
  ];

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{t('dashboard.title')}</h1>
          <p className="text-slate-500 mt-0.5 text-sm">{t('dashboard.subtitle')}</p>
          {aiEnriched > 0 && (
            <p className="text-xs text-brand-sky mt-1 flex items-center gap-1">
              <Brain className="w-3 h-3" />
              {t('dashboard.aiEnriched', { count: aiEnriched })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleReanalyzeVisible} disabled={isReanalyzing} className="gap-1.5 h-8 text-xs">
            {isReanalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
            {t('dashboard.actions.reanalyze')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportLeadsToCsv(visibleLeads, `leads-${selectedSourceList === '__all_lists__' ? 'all' : selectedSourceList}.csv`)}
            disabled={visibleLeads.length === 0}
            className="gap-1.5 h-8 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            {t('common.export')}
          </Button>
          <Button
            id="research-lead-trigger"
            onClick={() => setResearchDialogOpen(true)}
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 text-xs border-sky-200 text-sky-700 hover:bg-sky-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Recherche IA
          </Button>
          <Button
            id="import-csv-trigger"
            onClick={() => setImportDialogOpen(true)}
            size="sm"
            className="gap-1.5 h-8 text-xs bg-gradient-to-r from-brand-sky to-brand-sky-2"
          >
            <Upload className="w-3.5 h-3.5" />
            {t('dashboard.actions.importCsv')}
          </Button>
        </div>
      </div>

      {/* ── Context bar: ICP + List selectors ──────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5 p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-slate-400 uppercase shrink-0">{t('dashboard.selectors.icp')}</span>
          <Select
            value={activeIcp?.id || ''}
            onValueChange={handleSwitchIcp}
            disabled={isSwitchingIcp || icpProfiles.length === 0}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={t('dashboard.placeholders.selectActiveIcp')} />
            </SelectTrigger>
            <SelectContent>
              {icpProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-px bg-slate-200 hidden sm:block" />
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-slate-400 uppercase shrink-0">{t('dashboard.selectors.list')}</span>
          <Select value={selectedSourceList} onValueChange={setSelectedSourceList}>
            <SelectTrigger className="h-8 text-sm">
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
        </div>
      </div>

      {showActivationChecklist ? <ActivationChecklist steps={activationSteps} /> : null}

      {!isLoading && totalLeads > 0 && (
        <div className="mb-5 rounded-2xl border border-brand-sky/15 bg-gradient-to-r from-brand-sky/5 to-sky-50 px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {t('dashboard.banner.liveInWorkspace', { list: selectedListLabel })}
              </p>
              <p className="text-sm text-slate-500">
                {t('dashboard.banner.leadsLoaded', { count: totalLeads })}
                {activeIcp ? ` · ${t('dashboard.banner.activeIcp', { name: activeIcp.name })}` : ` · ${t('dashboard.banner.noActiveIcp')}`}
                {analyzedVisible > 0 ? ` · ${t('dashboard.banner.scored', { count: analyzedVisible })}` : ` · ${t('dashboard.banner.readyToAnalyze')}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-white px-2.5 py-1 border border-slate-200">{t('dashboard.banner.qualifiedShort', { count: qualifiedLeads })}</span>
              <span className="rounded-full bg-white px-2.5 py-1 border border-slate-200">{t('dashboard.banner.toAnalyzeShort', { count: toAnalyze })}</span>
              <span className="rounded-full bg-white px-2.5 py-1 border border-slate-200">{t('dashboard.banner.avgScoreShort', { score: avgScore })}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Error state ─────────────────────────────────────────────────── */}
      {leadsError && (
        <div className="flex items-center gap-3 mb-5 p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{t('dashboard.errors.failedToLoadLeads')}</span>
          <Button variant="outline" size="sm" onClick={() => refetchLeads()} className="gap-1.5 h-7 text-xs border-rose-200 text-rose-600 hover:bg-rose-100">
            <RefreshCcw className="w-3 h-3" />
            {t('common.retry')}
          </Button>
        </div>
      )}

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : stats.map((stat, index) => {
              const style = STAT_STYLE[stat.key];
              const Icon = style.icon;
              return (
                <motion.div
                  key={stat.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.05 }}
                  whileHover={{ y: -2 }}
                  className={`relative overflow-hidden bg-gradient-to-br ${style.tint} to-white rounded-xl border border-slate-200/70 p-4 shadow-[0_1px_3px_rgba(15,26,46,0.05)] hover:shadow-[0_8px_24px_-8px_rgba(15,26,46,0.15)] hover:border-slate-300/60 transition-all duration-200`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${style.bg} ${style.glow} flex items-center justify-center shrink-0 ring-1 ring-white/30`}>
                      <Icon className="w-4 h-4 text-white drop-shadow" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xl font-bold text-slate-900 leading-tight tracking-tight">{stat.value}</p>
                      <p className="text-xs text-slate-500 truncate">{stat.label}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
      </div>

      {!isLoading && (
        <div className="mb-5 grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {t('dashboard.roi.eyebrow')}
                </p>
                <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                  {t('dashboard.roi.title')}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {t('dashboard.roi.subtitle')}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {t('dashboard.roi.focusLabel')}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {activeIcp ? t('dashboard.roi.focusWithIcp', { name: activeIcp.name }) : t('dashboard.roi.focusWithoutIcp')}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('dashboard.roi.metrics.qualificationRate')}</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{qualificationRate}%</p>
                <p className="mt-1 text-xs text-slate-500">
                  {t('dashboard.roi.metrics.qualificationRateHint', { analyzed: analyzedVisible })}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('dashboard.roi.metrics.actionReady')}</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{actionReadyLeads}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {t('dashboard.roi.metrics.actionReadyHint')}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('dashboard.roi.metrics.creditsRunway')}</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                  {creditRunwayDays ? t('dashboard.roi.runwayDays', { count: creditRunwayDays }) : t('dashboard.roi.runwayNoUsage')}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {creditsBalance === null
                    ? t('dashboard.roi.metrics.creditsLoading')
                    : t('dashboard.roi.metrics.creditsHint', { count: creditsBalance })}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-brand-sky/15 bg-gradient-to-br from-brand-sky/5 to-sky-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-sky">
              {t('dashboard.roi.nextMoveEyebrow')}
            </p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
              {t('dashboard.roi.nextMoveTitle')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {activationState.hasAnalyzedLead
                ? t('dashboard.roi.nextMoveAnalyzed')
                : t('dashboard.roi.nextMovePending')}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                {t('dashboard.roi.pills.leads', { count: totalLeads })}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                {t('dashboard.roi.pills.scored', { count: analyzedVisible })}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                {t('dashboard.roi.pills.qualified', { count: qualifiedLeads })}
              </span>
            </div>
          </div>
        </div>
      )}

      {!isLoading && (
        <div className="mb-5 grid gap-3 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {t('dashboard.plan.eyebrow')}
                </p>
                <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                  {t('dashboard.plan.title', {
                    plan: t(`billing.planNames.${planSlug}`, { defaultValue: planSlug }),
                  })}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {t('dashboard.plan.subtitle')}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate(ROUTES.billing)}>
                {t('dashboard.plan.openBilling')}
              </Button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 text-slate-400">
                  <CreditCard className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]">{t('dashboard.plan.cards.credits')}</p>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{creditsBalance ?? '—'}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {t('dashboard.plan.cards.creditsHint', {
                    total: entitlements?.credits_included ?? 0,
                  })}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 text-slate-400">
                  <Users className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]">{t('dashboard.plan.cards.team')}</p>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{seatsUsed}/{seatsIncluded || 0}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {t('dashboard.plan.cards.teamHint')}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 text-slate-400">
                  <Database className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]">{t('dashboard.plan.cards.crm')}</p>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{crmSlotsUsed}/{crmSlotsIncluded || 0}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {t('dashboard.plan.cards.crmHint')}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-brand-sky/15 bg-gradient-to-br from-brand-sky/5 to-sky-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-sky">
              {t('dashboard.monetization.eyebrow')}
            </p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
              {t('dashboard.monetization.title')}
            </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
              {topAction
                ? t('dashboard.monetization.topDriver', {
                  action: getBillingActionLabel(topAction.action, t),
                  credits: topAction.credits,
                })
                : t('dashboard.monetization.noDriver')}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {t('dashboard.monetization.nextPlanFit')}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {creditsBalance !== null && creditsBalance <= 10
                    ? t('dashboard.monetization.lowCredits')
                    : seatsIncluded > 0 && seatsUsed >= seatsIncluded
                      ? t('dashboard.monetization.teamLimit')
                      : crmSlotsIncluded === 0
                        ? t('dashboard.monetization.crmLocked')
                        : t('dashboard.monetization.healthy')}
                </p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {t('dashboard.monetization.ctaLabel')}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => navigate(ROUTES.billing)}>
                    {t('dashboard.monetization.openBilling')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate(ROUTES.crmIntegration)}>
                    {t('dashboard.monetization.openCrm')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isLoading && scoredLeads.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('dashboard.scoreDistribution.eyebrow', { defaultValue: 'Score distribution' })}</p>
              <h2 className="mt-1 text-base font-semibold tracking-tight text-slate-950">{t('dashboard.scoreDistribution.title', { defaultValue: 'Pipeline health' })}</h2>
              <p className="mt-0.5 text-sm text-slate-500">{t('dashboard.scoreDistribution.subtitle', { defaultValue: 'How your {{count}} scored leads are distributed across buckets.', count: scoredLeads.length })}</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#38bdf8] inline-block" />{t('dashboard.scoreDistribution.excellent', { defaultValue: 'Excellent (80+)' })}</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#34d399] inline-block" />{t('dashboard.scoreDistribution.strong', { defaultValue: 'Strong (65-79)' })}</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#f87171] inline-block" />{t('dashboard.scoreDistribution.weak', { defaultValue: 'Weak (<50)' })}</span>
            </div>
          </div>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreDistribution} barSize={40} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <Tooltip
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-lg text-xs">
                        <p className="font-semibold text-slate-800">{d.label}</p>
                        <p className="text-slate-500">{d.count} {t('dashboard.scoreDistribution.leadsLabel', { defaultValue: 'leads' })}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {scoreDistribution.map((entry) => (
                    <Cell key={entry.label} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-1 text-center">
            {scoreDistribution.map((b) => (
              <div key={b.label} className="text-xs">
                <span className="font-semibold text-slate-800">{b.count}</span>
                <span className="block text-[10px] text-slate-400">{b.label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {!isLoading && (
        <div className="mb-5 grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {t('dashboard.roiBoard.eyebrow')}
                </p>
                <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                  {t('dashboard.roiBoard.title')}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {t('dashboard.roiBoard.subtitle')}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => scrollToLeadsTable()}>
                {t('dashboard.roiBoard.openTable')}
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {roiInsightModel.topLeads.length > 0 ? roiInsightModel.topLeads.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => handleOpenLeadPage({ id: lead.id })}
                  className="flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:border-brand-sky/40 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">{lead.companyName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {lead.recommendedAction || t('dashboard.roiBoard.defaultAction')}
                    </p>
                  </div>
                  <div className="shrink-0 rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                    {t('dashboard.roiBoard.scorePill', { score: lead.score })}
                  </div>
                </button>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                  {t('dashboard.roiBoard.empty')}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-brand-sky/15 bg-gradient-to-br from-brand-sky/5 to-sky-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-sky">
              {t('dashboard.attention.eyebrow')}
            </p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
              {t('dashboard.attention.title')}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {t('dashboard.attention.subtitle')}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {t('dashboard.attention.funnelTitle')}
                </p>
                {(() => {
                  const f = roiInsightModel.funnel;
                  const max = f.imported || 1;
                  const steps = [
                    { label: t('dashboard.attention.funnel.imported'), value: f.imported, color: 'bg-slate-300' },
                    { label: t('dashboard.attention.funnel.analyzed'), value: f.analyzed, color: 'bg-brand-sky' },
                    { label: t('dashboard.attention.funnel.actionReady'), value: f.actionReady, color: 'bg-emerald-400' },
                    { label: t('dashboard.attention.funnel.qualified'), value: f.qualified, color: 'bg-violet-400' },
                  ];
                  return (
                    <div className="mt-3 space-y-2.5">
                      {steps.map((step) => (
                        <div key={step.label}>
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="uppercase tracking-[0.12em] text-slate-400">{step.label}</span>
                            <span className="font-semibold text-slate-800">{step.value}</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div
                              className={`h-full rounded-full ${step.color}`}
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.round((step.value / max) * 100)}%` }}
                              transition={{ duration: 0.6, ease: 'easeOut' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {t('dashboard.attention.listTitle')}
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  {roiInsightModel.attentionItems.length > 0 ? roiInsightModel.attentionItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    >
                      {t(`dashboard.attention.items.${item.id}`)}
                    </div>
                  )) : (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      {t('dashboard.attention.allClear')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isLoading && (
        <div className="mb-5 grid gap-3 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {t('dashboard.aiActivity.eyebrow')}
                </p>
                <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                  {t('dashboard.aiActivity.title')}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {t('dashboard.aiActivity.subtitle')}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {t('dashboard.aiActivity.summaryLabel')}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {aiTopModel
                    ? t('dashboard.aiActivity.topModel', { model: aiTopModel.label, count: aiTopModel.count })
                    : t('dashboard.aiActivity.noRunsYet')}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 text-slate-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                    {t('dashboard.aiActivity.cards.completed')}
                  </p>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                  {aiActivityModel.completed}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {t('dashboard.aiActivity.cards.completedHint', { total: aiActivityModel.totalRuns })}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 text-slate-400">
                  <XCircle className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                    {t('dashboard.aiActivity.cards.failures')}
                  </p>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                  {aiActivityModel.failed}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {aiActivityModel.running > 0
                    ? t('dashboard.aiActivity.cards.runningHint', { count: aiActivityModel.running })
                    : t('dashboard.aiActivity.cards.failuresHint')}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 text-slate-400">
                  <CreditCard className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                    {t('dashboard.aiActivity.cards.spend')}
                  </p>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                  {aiActivityModel.totalRuns > 0
                    ? formatAiRunCost(aiActivityModel.totalCost, dashboardLocale)
                    : t('dashboard.aiActivity.cards.emptyValue')}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {t('dashboard.aiActivity.cards.tokensHint', { count: aiActivityModel.totalTokens })}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 text-slate-400">
                  <Clock3 className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                    {t('dashboard.aiActivity.cards.avgLatency')}
                  </p>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                  {formatAiRunDuration(aiActivityModel.averageDurationMs, dashboardLocale) || t('dashboard.aiActivity.cards.emptyValue')}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {t('dashboard.aiActivity.cards.avgLatencyHint')}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-brand-sky/15 bg-gradient-to-br from-brand-sky/5 to-sky-50 p-4 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-sky">
                  {t('dashboard.aiActivity.listEyebrow')}
                </p>
                <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                  {t('dashboard.aiActivity.listTitle')}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {t('dashboard.aiActivity.listSubtitle')}
                </p>
              </div>
            </div>

            <div className="mt-4">
              {aiRunsLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
              ) : aiActivityModel.recentRuns.length > 0 ? (
                <div className="space-y-3">
                  {aiActivityModel.recentRuns.map((run) => (
                    <div
                      key={run.id}
                      className="rounded-2xl border border-white/70 bg-white/85 px-4 py-3 shadow-sm backdrop-blur"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-950">
                              {getBillingActionLabel(run.action, t)}
                            </span>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${AI_RUN_STATUS_STYLES[run.status] || AI_RUN_STATUS_STYLES.unknown}`}>
                              {t(`dashboard.aiActivity.status.${run.status}`, { defaultValue: run.status })}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {run.model_label} · {run.provider_label}
                          </p>
                        </div>

                        <div className="text-left md:text-right">
                          <p className="text-xs font-medium text-slate-500">
                            {formatAiRunRelativeTime(run.created_at, dashboardLocale)}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {formatAiRunTimestamp(run.created_at, dashboardLocale)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                          {t('dashboard.aiActivity.pills.duration', {
                            value: formatAiRunDuration(run.duration_ms, dashboardLocale) || t('dashboard.aiActivity.cards.emptyValue'),
                          })}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                          {t('dashboard.aiActivity.pills.tokens', { count: run.total_tokens || 0 })}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                          {t('dashboard.aiActivity.pills.cost', {
                            value: formatAiRunCost(run.estimated_cost, dashboardLocale) || t('dashboard.aiActivity.cards.emptyValue'),
                          })}
                        </span>
                        {run.lead_id && (
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                            {t('dashboard.aiActivity.pills.linkedLead')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Brain}
                  title={t('dashboard.aiActivity.empty.title')}
                  description={t('dashboard.aiActivity.empty.description')}
                  className="rounded-2xl border border-dashed border-white/70 bg-white/70 py-10"
                  action={{
                    label: t('dashboard.aiActivity.empty.cta'),
                    onClick: () => setImportDialogOpen(true),
                    variant: 'outline',
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <div id="dashboard-leads-table">
        <LeadsTable
          leads={visibleLeads}
          isLoading={isLoading}
          onSelectLead={handleSelectLead}
          onOpenLeadPage={handleOpenLeadPage}
          onLeadUpdated={handleLeadUpdated}
        />
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

import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, Brain, Check, Copy, Database, ExternalLink, Globe, Loader2, RefreshCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FOLLOW_UP_STATUS_LIST } from '@/constants/leads';
import { ROUTES } from '@/constants/routes';
import AnalysisHero from '@/components/leads/AnalysisHero';
import LeadActionsPanel from '@/components/leads/LeadActionsPanel';
import ScoreBreakdown from '@/components/leads/ScoreBreakdown';
import { dataClient } from '@/services/dataClient';
import SignalBadge from '@/components/leads/SignalBadge';
import { getLeadScores } from '@/lib/leadPresentation';

const toMetric = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

const normalizeLabel = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const NEGATIVE_SIGNAL_TOKENS = ['bankruptcy', 'closed', 'shutdown', 'layoff', 'churn', 'no_budget', 'budget_frozen'];

const inferSignalTypeFromKey = (value) => {
  const key = String(value || '').toLowerCase();
  if (NEGATIVE_SIGNAL_TOKENS.some((token) => key.includes(token))) return 'negative';
  if (['missing', 'unknown', 'unverified'].some((token) => key.includes(token))) return 'neutral';
  return 'positive';
};

const getScoreDetails = (lead) =>
  lead?.score_details && typeof lead.score_details === 'object' ? lead.score_details : {};

const getNumericScoreDetail = (details, key) => {
  const entry = details?.[key];
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    return toMetric(entry.points ?? entry.score ?? entry.value);
  }
  return toMetric(entry);
};

const getBaseIcpScore = (lead) => {
  const direct = toMetric(lead?.icp_score);
  if (direct !== null) return direct;

  const raw = toMetric(lead?.icp_raw_score);
  if (raw !== null) return raw;

  const details = getScoreDetails(lead);
  const detailScore = getNumericScoreDetail(details, 'icp_score');
  if (detailScore !== null) return detailScore;

  const detailRaw = getNumericScoreDetail(details, 'icp_raw_score');
  if (detailRaw !== null) return detailRaw;

  return null;
};

const getInternetSignals = (lead) => (Array.isArray(lead?.internet_signals) ? lead.internet_signals : []);

const getDisplaySignals = (lead) =>
  getInternetSignals(lead).map((signal) => ({
    type: inferSignalTypeFromKey(signal?.key || signal?.label),
    label: normalizeLabel(signal?.label || signal?.key || signal?.evidence),
    source: signal?.source_type || 'internet',
    evidence: signal?.evidence || signal?.key,
    confidence: signal?.confidence,
  })).filter((signal) => Boolean(signal.label));

const categoryStyle = (cat) => {
  const key = String(cat || '').toLowerCase();
  if (key.includes('excellent')) return 'bg-violet-50 text-violet-700 border-violet-200';
  if (key.includes('strong')) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (key.includes('medium')) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (key.includes('low')) return 'bg-rose-50 text-rose-600 border-rose-200';
  if (key.includes('excluded')) return 'bg-gray-50 text-gray-500 border-gray-200';
  return 'bg-slate-50 text-slate-500 border-slate-200';
};

const formatDate = (value, locale) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString(locale);
};

const ACTION_FR_LABELS = {
  contact_now: 'Contacter maintenant',
  contact_soon: 'Contacter rapidement',
  nurture: 'Nurturer',
  deprioritize: 'Déprioriser',
};

const translateForPresentation = (value, language) => {
  if (language !== 'fr') return String(value || '');
  return String(value || '')
    .replaceAll('leadership change', 'changement de direction')
    .replaceAll('market entry', 'entrée sur un nouveau marché')
    .replaceAll('restructuring', 'restructuration')
    .replaceAll('budget cuts', 'réduction de budget')
    .replaceAll('layoffs', 'licenciements')
    .replaceAll('hiring', 'recrutement')
    .replaceAll('partnership', 'partenariat');
};

export default function LeadDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { leadId } = useParams();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();

  const leadFromState = location.state?.lead || null;

  const { data: lead, isLoading, isError: leadError, refetch: refetchLead } = useQuery({
    queryKey: ['lead', leadId || leadFromState?.id],
    queryFn: async () => {
      if (!leadId) return null;
      return dataClient.leads.getById(leadId);
    },
    initialData: leadFromState && (!leadId || leadFromState.id === leadId) ? leadFromState : undefined,
  });

  const [notes, setNotes] = useState('');
  const [followUpStatus, setFollowUpStatus] = useState(FOLLOW_UP_STATUS_LIST[0]);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(null);
  const [scoring, setScoring] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [handledJobId, setHandledJobId] = useState(null);
  const [sequenceTone, setSequenceTone] = useState('consultative');
  const [sequence, setSequence] = useState(null);
  const [signalLanguage, setSignalLanguage] = useState('en');
  const [sequenceActiveJobId, setSequenceActiveJobId] = useState('');
  const [sequenceHandledJobId, setSequenceHandledJobId] = useState('');

  React.useEffect(() => {
    if (!lead) return;
    setNotes(lead.notes || '');
    setFollowUpStatus(lead.follow_up_status || FOLLOW_UP_STATUS_LIST[0]);
  }, [lead]);

  // Async job polling (matches LeadSlideOver behaviour)
  const { data: featureFlagsData = null } = useQuery({
    queryKey: ['workspaceFeatureFlags', 'lead-detail'],
    queryFn: () => dataClient.workspace.listFeatureFlags(),
    staleTime: 60_000,
  });
  const asyncJobsEnabled = useMemo(() => {
    const flags = Array.isArray(featureFlagsData?.flags) ? featureFlagsData.flags : [];
    return Boolean(flags.find((flag) => flag.flag_name === 'async_jobs')?.enabled);
  }, [featureFlagsData]);

  const { data: polledJob = null } = useQuery({
    queryKey: ['jobStatus', activeJob?.jobId],
    queryFn: () => dataClient.jobs.getStatus(activeJob.jobId),
    enabled: Boolean(activeJob?.jobId),
    staleTime: 0,
    refetchInterval: activeJob?.jobId ? 1500 : false,
  });

  const currentJob = activeJob?.jobId ? (polledJob || activeJob) : null;
  const isJobActive = currentJob && !['completed', 'failed'].includes(currentJob.status);

  React.useEffect(() => {
    if (!polledJob || !activeJob) return;
    if (polledJob.status !== 'completed' && polledJob.status !== 'failed') return;
    if (handledJobId === polledJob.id) return;
    setHandledJobId(polledJob.id);
    setActiveJob((prev) => (prev?.jobId === polledJob.id ? null : prev));
    if (polledJob.status === 'failed') {
      toast.error(polledJob.error?.message || t('leads.asyncJobFailed', { defaultValue: 'Background job failed.' }));
    } else {
      toast.success(t('leads.asyncJobCompleted', { defaultValue: 'Background job completed.' }));
      queryClient.invalidateQueries({ queryKey: ['lead', lead?.id] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    }
  }, [activeJob, handledJobId, polledJob, t, queryClient, lead?.id]);

  // Sequence generation (in-page, with tone)
  const { data: sequenceJob = null } = useQuery({
    queryKey: ['jobStatus', sequenceActiveJobId],
    queryFn: () => dataClient.jobs.getStatus(sequenceActiveJobId),
    enabled: Boolean(sequenceActiveJobId),
    staleTime: 0,
    refetchInterval: sequenceActiveJobId ? 1500 : false,
  });

  const sequenceMutation = useMutation({
    mutationFn: () =>
      dataClient.leads.generateSequence(lead.id, {
        async: asyncJobsEnabled,
        tone: sequenceTone,
        locale: i18n.language?.startsWith('fr') ? 'fr' : 'en',
      }),
    onSuccess: (data) => {
      if (!data) {
        toast.error(t('outreach.toasts.sequenceUnavailable'));
        return;
      }
      if (data?.jobId) {
        setSequenceHandledJobId('');
        setSequenceActiveJobId(data.jobId);
        toast.success(t('leads.asyncJobQueued', { defaultValue: 'Sequence queued.' }));
        return;
      }
      setSequence(data);
      toast.success(t('outreach.sequenceGenerated', { defaultValue: 'Sequence generated.' }));
    },
    onError: (error) => {
      const msg = error?.payload?.message || error?.message || null;
      toast.error(msg ? t('outreach.toasts.sequenceFailedWithMessage', { message: msg }) : t('outreach.toasts.sequenceFailed'));
    },
  });

  React.useEffect(() => {
    if (!sequenceJob) return;
    if (sequenceJob.status !== 'completed' && sequenceJob.status !== 'failed') return;
    if (sequenceHandledJobId === sequenceJob.id) return;
    setSequenceHandledJobId(sequenceJob.id);
    setSequenceActiveJobId('');
    if (sequenceJob.status === 'failed') {
      toast.error(sequenceJob.error?.message || t('leads.asyncJobFailed'));
      return;
    }
    setSequence(sequenceJob.result?.data || null);
    toast.success(t('outreach.sequenceGenerated', { defaultValue: 'Sequence generated.' }));
  }, [sequenceJob, sequenceHandledJobId, t]);

  // CRM integrations + sync status (only render section when at least one is active)
  const { data: crmIntegrations = [] } = useQuery({
    queryKey: ['crmIntegrations'],
    queryFn: () => dataClient.crm.list(),
    staleTime: 60_000,
  });
  const { data: crmSyncRecords = [], refetch: refetchCrmStatus } = useQuery({
    queryKey: ['crmSyncStatus', lead?.id],
    queryFn: () => dataClient.crm.getSyncStatus(lead.id),
    enabled: Boolean(lead?.id),
    staleTime: 30_000,
  });
  const activeCrmTypes = crmIntegrations.filter((i) => i.is_active).map((i) => i.crm_type);

  const crmSyncMutation = useMutation({
    mutationFn: ({ leadId, crmType }) => dataClient.crm.syncLead(leadId, crmType),
    onSuccess: (result, { crmType }) => {
      const label = crmType === 'hubspot' ? 'HubSpot' : 'Salesforce';
      if (result?.success) {
        toast.success(t('leads.crmSynced', { crm: label }));
      } else {
        toast.error(t('leads.crmSyncFailed', { crm: label, error: result?.error || t('common.unknown') }));
      }
      refetchCrmStatus();
    },
    onError: (err) => toast.error(t('leads.crmError', { error: err.message })),
  });

  const handleScoreIcp = async () => {
    if (!lead) return;
    setScoring(true);
    try {
      const response = await dataClient.leads.scoreIcp(lead.id);
      if (response?.data) {
        toast.success(t('leads.scoreIcpSuccess', { company: lead.company_name, score: response.data.icp_score, category: response.data.icp_category }));
        if (response.data.lead) {
          queryClient.setQueryData(['lead', lead.id], response.data.lead);
        }
        queryClient.invalidateQueries({ queryKey: ['lead', lead.id] });
        queryClient.invalidateQueries({ queryKey: ['leads'] });
      }
    } catch {
      toast.error(t('leads.scoreIcpFailed', { company: lead.company_name }));
    } finally {
      setScoring(false);
    }
  };

  const handleAnalyse = async () => {
    if (!lead) return;
    setAnalysing(true);
    try {
      await dataClient.leads.analyzeSignals(lead.id);
      toast.success(t('leads.analyseSignalsSuccess', { defaultValue: 'Signal analysis completed.' }));
      queryClient.invalidateQueries({ queryKey: ['lead', lead.id] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (err) {
      toast.error(err?.message || t('leads.analyseSignalsFailed', { defaultValue: 'Signal analysis failed.' }));
    } finally {
      setAnalysing(false);
    }
  };

  const handleDiscover = async () => {
    if (!lead) return;
    setDiscovering(true);
    try {
      const response = await dataClient.leads.discoverSignals(lead.id, { async: asyncJobsEnabled, reanalyze: false, replace: true });
      if (response?.jobId) {
        setHandledJobId(null);
        setActiveJob({ jobId: response.jobId, type: 'discover', label: t('leads.discoverWebBtn') });
        toast.success(t('leads.asyncJobQueued', { defaultValue: 'Scan en cours en arrière-plan…' }));
        return;
      }
      toast.success(t('leads.signalDiscovered'));
      queryClient.invalidateQueries({ queryKey: ['lead', lead.id] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (err) {
      toast.error(err?.message || t('common.error'));
    } finally {
      setDiscovering(false);
    }
  };

  const icebreakers = useMemo(
    () =>
      [
        { key: 'email', label: 'Email', content: lead?.generated_icebreakers?.email || lead?.generated_icebreaker },
        { key: 'linkedin', label: 'LinkedIn', content: lead?.generated_icebreakers?.linkedin },
        { key: 'call', label: t('leads.copyCall'), content: lead?.generated_icebreakers?.call },
      ].filter((item) => item.content),
    [lead, t]
  );

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success(t('toasts.copied'));
    setTimeout(() => setCopied(null), 1800);
  };

  const handleSave = async () => {
    if (!lead) return;
    setSaving(true);
    try {
      await dataClient.leads.update(lead.id, { notes, follow_up_status: followUpStatus });
      toast.success(t('toasts.leadUpdated'));
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', lead.id] });
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setSaving(false);
    }
  };


  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-sky animate-spin" />
      </div>
    );
  }

  if (leadError) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-slate-900">{t('leads.loadLeadFailed')}</h1>
        <p className="text-slate-500 mt-2 text-sm">{t('errors.networkError')}</p>
        <div className="flex gap-3 justify-center mt-6">
          <Button variant="outline" onClick={() => navigate(-1)}>{t('common.back')}</Button>
          <Button onClick={() => refetchLead()} className="gap-2">
            <RefreshCcw className="w-4 h-4" />
            {t('common.retry')}
          </Button>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h1 className="text-2xl font-bold text-slate-900">{t('errors.notFound')}</h1>
        <p className="text-slate-500 mt-2">{t('leads.leadNotFoundBody')}</p>
        <Button className="mt-6" onClick={() => navigate(-1)}>
          {t('common.back')}
        </Button>
      </div>
    );
  }

  const baseScores = getLeadScores(lead);
  const icpScore = getBaseIcpScore(lead);
  const aiScore = baseScores.aiScore;
  const scoreDetails = getScoreDetails(lead);
  const finalScore = baseScores.finalScore ?? getNumericScoreDetail(scoreDetails, 'final_score') ?? icpScore;
  const aiBoost = icpScore !== null && finalScore !== null ? finalScore - icpScore : null;
  const summaryForHero = lead.icp_summary || lead.analysis_summary;
  const signalAnalysis = lead?.score_details?.signal_analysis && typeof lead.score_details.signal_analysis === 'object'
    ? lead.score_details.signal_analysis
    : null;
  const displaySignals = getDisplaySignals(lead);

  const signalGroups = {
    positive: displaySignals.filter((s) => String(s?.type || '').toLowerCase() === 'positive'),
    negative: displaySignals.filter((s) => String(s?.type || '').toLowerCase() === 'negative'),
    neutral: displaySignals.filter((s) => String(s?.type || '').toLowerCase() === 'neutral'),
  };

  const providerStatus = lead?.auto_signal_metadata?.provider_status && typeof lead.auto_signal_metadata.provider_status === 'object'
    ? lead.auto_signal_metadata.provider_status
    : null;
  const primaryHeroAction = icebreakers[0]?.content
    ? {
        label: t('leads.heroPrimaryCopy', { defaultValue: 'Copy best outreach' }),
        onClick: () => handleCopy(icebreakers[0].content, icebreakers[0].key),
      }
    : lead.contact_email
      ? {
          label: t('leads.heroPrimaryEmail', { defaultValue: 'Email this lead' }),
          onClick: () => {
            window.location.href = `mailto:${lead.contact_email}`;
          },
        }
      : {
          label: t('leads.heroPrimaryPipeline', { defaultValue: 'Open pipeline' }),
          onClick: () => navigate(ROUTES.pipeline),
        };
  const secondaryHeroAction = lead.website_url
    ? {
        label: t('leads.heroSecondaryWebsite', { defaultValue: 'Open website' }),
        onClick: () => {
          window.open(/^https?:\/\//i.test(lead.website_url) ? lead.website_url : `https://${lead.website_url}`, '_blank', 'noopener,noreferrer');
        },
      }
    : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-4 mb-6 sticky top-20 bg-white z-10 py-3 -mx-6 px-6 border-b border-slate-100">
        <Button variant="ghost" size="sm" className="gap-2 mt-1" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
          {t('common.back')}
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900">{lead.company_name}</h1>
            {lead.final_category && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${categoryStyle(lead.final_category)}`}>
                {lead.final_category}
              </span>
            )}
            {lead.llm_enriched && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-gradient-to-r from-brand-sky/5 to-brand-sky/10 border border-brand-sky/20 text-brand-sky">
                <Brain className="w-3 h-3" />
                {t('leads.aiSignalsActive')}
              </span>
            )}
          </div>
          {lead.website_url && (
            <a
              href={/^https?:\/\//i.test(lead.website_url) ? lead.website_url : `https://${lead.website_url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-sky hover:underline inline-flex items-center gap-1 mt-0.5"
            >
              <Globe className="w-3 h-3" />
              {lead.website_url}
              <ExternalLink className="w-3 h-3 opacity-60" />
            </a>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {lead.industry && <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px]">{lead.industry}</span>}
            {lead.country && <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px]">{lead.country}</span>}
            {lead.company_size && <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px]">{lead.company_size} emp.</span>}
            {lead.source_list && <span className="px-2 py-0.5 rounded-md bg-brand-sky/5 text-brand-sky text-[11px]">{lead.source_list}</span>}
          </div>
        </div>

      </div>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {t('leads.heroPrimaryAction', { defaultValue: "AimLead's call" })}
            </p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-5xl font-semibold tracking-tight text-slate-900 tabular-nums">{finalScore ?? '-'}</span>
              <span className="pb-2 text-sm text-slate-400">/100</span>
              {lead.final_category ? (
                <span className={`mb-2 text-xs font-semibold px-2.5 py-1 rounded-full border ${categoryStyle(lead.final_category)}`}>
                  {lead.final_category}
                </span>
              ) : null}
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 whitespace-pre-line">
              {summaryForHero || t('leads.whyItMatters.default', { defaultValue: 'Review the score, strongest signals, and recommended action before outreach.' })}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 min-w-56">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{t('leads.nextBestAction', { defaultValue: 'Next best action' })}</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{lead.final_recommended_action || t('leads.primaryActionFallback')}</p>
            <p className="mt-1 text-xs text-slate-500">{t('leads.lastAnalyzedLabel')} · {formatDate(lead.last_analyzed_at, i18n.language) || '—'}</p>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <AnalysisHero
          lead={lead}
          t={t}
          primaryAction={primaryHeroAction}
          secondaryAction={secondaryHeroAction}
        />
      </div>

      {/* Async job progress indicator */}
      {currentJob ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-xl border border-brand-sky/20 bg-brand-sky/5 p-3"
        >
          <div className="flex items-center justify-between gap-3 text-sm">
            <div>
              <p className="font-semibold text-slate-800">{activeJob?.label || t('leads.asyncJobRunning', { defaultValue: 'Background job running' })}</p>
              <p className="text-slate-600">{currentJob.message || t('leads.asyncJobQueued', { defaultValue: 'Background job queued.' })}</p>
            </div>
            <span className="rounded-md border border-brand-sky/20 bg-white px-2 py-1 text-xs font-medium text-brand-sky">
              {Math.max(0, Math.min(100, Number(currentJob.progress || 0)))}%
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-sky to-brand-sky-2 transition-all"
              style={{ width: `${Math.max(8, Math.min(100, Number(currentJob.progress || 0)))}%` }}
            />
          </div>
        </motion.div>
      ) : null}

      {/* Lead actions — same set as the slide-over (deterministic ICP free, AI actions cost credits) */}
      <div className="mb-6">
        <LeadActionsPanel
          variant="full"
          onScoreIcp={handleScoreIcp}
          onAnalyse={handleAnalyse}
          onDiscover={handleDiscover}
          scoring={scoring}
          analysing={analysing}
          discovering={discovering}
          disabled={isJobActive}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-1 space-y-4">
          {/* Snapshot (prioritized) */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm">{t('leads.leadSnapshot')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{t('common.contact')}</p>
                <p className="text-slate-900 font-medium">{lead.contact_name || 'N/A'}</p>
                <p className="text-xs text-slate-500">{lead.contact_role || 'N/A'}</p>
                {lead.contact_email && (
                  <a href={`mailto:${lead.contact_email}`} className="text-xs text-brand-sky hover:underline break-all">
                    {lead.contact_email}
                  </a>
                )}
              </div>
              {[
                [t('common.industry'), lead.industry],
                [t('common.country'), lead.country],
                [t('common.size'), lead.company_size ? `${lead.company_size} ${i18n.language === 'fr' ? 'employés' : 'employees'}` : null],
                [t('leads.clientType'), lead.client_type],
                [t('leads.lastAnalyzedLabel'), formatDate(lead.last_analyzed_at, i18n.language)],
              ].filter(([, v]) => v).map(([label, value]) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-slate-500">{label}</span>
                  <span className="text-slate-800 font-medium text-right max-w-[60%] truncate">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Score breakdown (moved up front under snapshot) */}
          <ScoreBreakdown
            lead={lead}
            finalScore={finalScore}
            icpScore={icpScore}
            aiScore={aiScore}
            aiBoost={aiBoost}
            scoreDetails={scoreDetails}
          />

          {/* Follow-up */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm">{t('leads.crmNotes')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={followUpStatus} onValueChange={setFollowUpStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOW_UP_STATUS_LIST.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                placeholder={t('leads.internalNotes')}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
              />
              <Button onClick={handleSave} disabled={saving} className="w-full bg-gradient-to-r from-brand-sky to-brand-sky-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.save')}
              </Button>
            </CardContent>
          </Card>

          {/* CRM sync card — only shown when at least one CRM is configured */}
          {activeCrmTypes.length > 0 ? (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Database className="w-4 h-4 text-slate-400" />
                  CRM
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {activeCrmTypes.map((crmType) => {
                  const lastSync = crmSyncRecords.filter((r) => r.crm_type === crmType && r.status === 'success').at(0);
                  const label = crmType === 'hubspot' ? 'HubSpot' : 'Salesforce';
                  const isSyncing = crmSyncMutation.isPending && crmSyncMutation.variables?.crmType === crmType;
                  return (
                    <div key={crmType} className="flex items-center justify-between gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => crmSyncMutation.mutate({ leadId: lead.id, crmType })}
                        disabled={crmSyncMutation.isPending}
                        className="flex-1"
                      >
                        {isSyncing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Database className="w-3.5 h-3.5 mr-1.5" />}
                        {t('leads.pushToCrm', { crm: label })}
                      </Button>
                      {lastSync?.crm_object_url ? (
                        <a
                          href={lastSync.crm_object_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-sky hover:underline flex items-center gap-0.5"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : null}
                    </div>
                  );
                })}
                {crmSyncRecords.length > 0 ? (
                  <p className="text-[11px] text-slate-400">
                    {t('leads.lastCrmSync')} {new Date(crmSyncRecords[0].created_at).toLocaleString(i18n.language)}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-2 space-y-4">
          <Tabs defaultValue="outreach">
            <TabsList className="bg-slate-100">
              <TabsTrigger value="outreach">{t('outreach.title')}</TabsTrigger>
              <TabsTrigger value="signals">{t('leads.buyingSignals')}</TabsTrigger>
              <TabsTrigger value="analysis">{t('leads.analysisLabel')}</TabsTrigger>
            </TabsList>

            {/* OUTREACH TAB */}
            <TabsContent value="outreach" className="space-y-4 mt-4">
              {/* Icebreakers */}
              {icebreakers.length > 0 && icebreakers.map(({ key, label, content }) => (
                <motion.div key={key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className="shadow-sm">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          {lead.llm_enriched && <Sparkles className="w-3.5 h-3.5 text-brand-sky" />}
                          {label}
                        </CardTitle>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 h-7 text-xs"
                          onClick={() => handleCopy(content, key)}
                        >
                          {copied === key ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          {copied === key ? t('common.copied') : t('common.copy')}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{content}</pre>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
              {icebreakers.length === 0 && !sequence && (
                <Card className="shadow-sm border-dashed border-slate-200 bg-slate-50/50">
                  <CardContent className="pt-6 pb-4 text-center">
                    <Sparkles className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-500 text-sm">{t('leads.noIcebreakersYet')}</p>
                  </CardContent>
                </Card>
              )}

              {/* 3-touch sequence generator */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-brand-sky" />
                        {t('outreach.sequence.title')}
                      </CardTitle>
                      <p className="text-xs text-slate-500 mt-0.5">{t('outreach.sequence.fromLeadPage', { defaultValue: t('outreach.sequence.subtitle') })}</p>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      {t('outreach.sequence.creditCost')}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="flex-1 min-w-36">
                      <label className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-sky inline-block" />
                        {t('outreach.sequence.toneLabel', { defaultValue: 'Sequence tone' })}
                      </label>
                      <Select value={sequenceTone} onValueChange={setSequenceTone}>
                        <SelectTrigger className="h-9 text-sm border-slate-300 focus:ring-brand-sky">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            { key: 'consultative', emoji: '🤝' },
                            { key: 'direct', emoji: '⚡' },
                            { key: 'friendly', emoji: '😊' },
                            { key: 'premium', emoji: '💎' },
                            { key: 'challenger', emoji: '🎯' },
                          ].map(({ key, emoji }) => (
                            <SelectItem key={key} value={key}>
                              <span className="flex items-center gap-2">
                                <span>{emoji}</span>
                                <span>{t(`outreach.sequence.tones.${key}`, { defaultValue: key })}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      className="gap-2 h-9 bg-brand-sky hover:bg-brand-sky/90"
                      onClick={() => sequenceMutation.mutate()}
                      disabled={sequenceMutation.isPending || Boolean(sequenceActiveJobId)}
                    >
                      {sequenceMutation.isPending || sequenceActiveJobId ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('outreach.generating', { defaultValue: 'Generating…' })}</>
                      ) : (
                        <><Sparkles className="w-3.5 h-3.5" /> {t('outreach.generateSequence')}</>
                      )}
                    </Button>
                  </div>
                  {/* Tone help text */}
                  {t(`outreach.sequence.toneHelp.${sequenceTone}`, { defaultValue: '' }) && (
                    <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                      {t(`outreach.sequence.toneHelp.${sequenceTone}`, { defaultValue: '' })}
                    </p>
                  )}
                  {/* Sequence job progress */}
                  {sequenceActiveJobId && sequenceJob && !['completed', 'failed'].includes(sequenceJob.status) && (
                    <div className="pt-1">
                      <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5">
                        <Loader2 className="w-3 h-3 animate-spin text-brand-sky" />
                        {sequenceJob.progress?.message || t('outreach.sequence.writing')}
                      </div>
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-brand-sky to-violet-500 rounded-full"
                          animate={{ width: `${sequenceJob.progress?.pct ?? 30}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Sequence result */}
              {sequence && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  <div className="bg-gradient-to-r from-brand-sky/5 to-transparent rounded-xl border border-brand-sky/10 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{sequence.sequence_name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{sequence.objective}</p>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-slate-400 hover:text-slate-600 flex-shrink-0" onClick={() => setSequence(null)}>
                        ✕
                      </Button>
                    </div>
                    {sequence.personalization_hooks?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {sequence.personalization_hooks.map((hook, i) => (
                          <span key={i} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-brand-sky/10 text-brand-sky border border-brand-sky/20">{hook}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {sequence.touches?.map((touch, i) => {
                    const CHANNEL_META = {
                      email: { label: 'Email', bg: 'bg-sky-50', color: 'text-sky-700', border: 'border-sky-200' },
                      email_followup: { label: t('outreach.channels.emailFollowup', { defaultValue: 'Follow-up' }), bg: 'bg-indigo-50', color: 'text-indigo-700', border: 'border-indigo-200' },
                      linkedin: { label: 'LinkedIn', bg: 'bg-blue-50', color: 'text-blue-700', border: 'border-blue-200' },
                    };
                    const meta = CHANNEL_META[touch.channel] || CHANNEL_META.email;
                    const fullText = [touch.subject && `${t('outreach.sequence.subjectLabel')}: ${touch.subject}`, touch.body, touch.cta && `→ ${touch.cta}`].filter(Boolean).join('\n\n');
                    return (
                      <Card key={i} className="shadow-sm border-slate-100">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-400 tabular-nums">J{touch.day}</span>
                              <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-lg border ${meta.bg} ${meta.color} ${meta.border}`}>
                                {meta.label}
                              </span>
                            </div>
                            <button
                              onClick={() => handleCopy(fullText, `seq-${i}`)}
                              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors px-2 py-1 rounded-lg hover:bg-slate-50"
                            >
                              {copied === `seq-${i}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                              {copied === `seq-${i}` ? t('common.copied') : t('common.copy')}
                            </button>
                          </div>
                          {touch.subject && <p className="text-sm font-semibold text-slate-800 mt-1">{touch.subject}</p>}
                        </CardHeader>
                        <CardContent className="pt-0 space-y-2">
                          <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{touch.body}</p>
                          {touch.cta && <p className="text-xs font-semibold text-brand-sky border-t border-slate-100 pt-2">→ {touch.cta}</p>}
                        </CardContent>
                      </Card>
                    );
                  })}
                </motion.div>
              )}
            </TabsContent>

            {/* SIGNALS TAB */}
            <TabsContent value="signals" className="mt-4">
              {signalAnalysis ? (
                <Card className="shadow-sm mb-3">
                  <CardContent className="pt-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {t('leads.signalAnalysisTitle', { defaultValue: 'Signal analysis' })}
                      </p>
                      <div className="inline-flex rounded-md border border-slate-200 overflow-hidden">
                        {['en', 'fr'].map((lang) => (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => setSignalLanguage(lang)}
                            className={`px-2.5 py-1 text-xs font-semibold ${signalLanguage === lang ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}
                          >
                            {lang.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-2">
                      <div className="rounded-lg border border-slate-200 p-2.5"><p className="text-[11px] text-slate-500">AI Score</p><p className="text-sm font-semibold text-slate-800">{signalAnalysis.ai_score ?? lead.ai_score ?? '—'}</p></div>
                      <div className="rounded-lg border border-slate-200 p-2.5"><p className="text-[11px] text-slate-500">AI Boost</p><p className="text-sm font-semibold text-slate-800">{signalAnalysis.ai_boost ?? '—'}</p></div>
                      <div className="rounded-lg border border-slate-200 p-2.5"><p className="text-[11px] text-slate-500">{t('leads.confidenceShort', { defaultValue: 'Confidence' })}</p><p className="text-sm font-semibold text-slate-800">{signalAnalysis.confidence ?? lead.ai_confidence ?? '—'}</p></div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-600 mb-1.5">{t('leads.positiveSignals')}</p>
                        <ul className="text-sm text-slate-700 list-disc pl-4 space-y-1">
                          {(signalAnalysis.positives || []).map((entry, idx) => <li key={`p-${idx}`}>{translateForPresentation(entry, signalLanguage)}</li>)}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-600 mb-1.5">{t('leads.negativeSignals')}</p>
                        <ul className="text-sm text-slate-700 list-disc pl-4 space-y-1">
                          {(signalAnalysis.negatives || []).map((entry, idx) => <li key={`n-${idx}`}>{translateForPresentation(entry, signalLanguage)}</li>)}
                        </ul>
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="text-xs text-slate-500">{t('leads.suggestedAction', { defaultValue: 'Suggested action' })}</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {signalLanguage === 'fr'
                          ? (ACTION_FR_LABELS[signalAnalysis.action] || signalAnalysis.action || '—')
                          : (signalAnalysis.action || '—')}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-500">Icebreaker</p>
                        {signalAnalysis.icebreaker ? (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleCopy(signalAnalysis.icebreaker, 'signal-icebreaker')}>
                            {copied === 'signal-icebreaker' ? t('common.copied') : t('common.copy')}
                          </Button>
                        ) : null}
                      </div>
                      <p className="text-sm text-slate-700">{translateForPresentation(signalAnalysis.icebreaker, signalLanguage)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-1.5">{t('leads.buyingSignals')}</p>
                      <ul className="text-sm text-slate-700 list-disc pl-4 space-y-1">
                        {(signalAnalysis.signals || []).map((entry, idx) => <li key={`s-${idx}`}>{translateForPresentation(entry, signalLanguage)}</li>)}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              {providerStatus ? (
                <Card className="shadow-sm mb-3">
                  <CardContent className="pt-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                      {t('leads.signalProviders', { defaultValue: 'Signal providers' })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(providerStatus).map(([provider, status]) => (
                        <span
                          key={provider}
                          className={`text-xs px-2.5 py-1 rounded-full border ${
                            status === 'ok'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : status === 'skipped'
                                ? 'bg-slate-50 text-slate-500 border-slate-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {provider}: {status}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              {displaySignals.length > 0 ? (
                <div className="space-y-3">
                  {['positive', 'negative', 'neutral'].map((type) => {
                    const items = signalGroups[type] || [];
                    if (items.length === 0) return null;
                    const styles = {
                      positive: 'bg-emerald-50 border-emerald-200 text-emerald-800',
                      negative: 'bg-rose-50 border-rose-200 text-rose-800',
                      neutral: 'bg-slate-50 border-slate-200 text-slate-700',
                    };
                    const labels = { positive: t('leads.positiveSignals'), negative: t('leads.negativeSignals'), neutral: t('leads.neutralSignals') };

                    return (
                      <div key={type} className={`rounded-xl border p-4 ${styles[type]}`}>
                        <p className="text-xs font-semibold mb-2">{labels[type]} ({items.length})</p>
                        <div className="flex flex-wrap gap-2">
                          {items.map((signal, index) => (
                            <SignalBadge key={`${type}-${index}`} signal={signal} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Card className="shadow-sm">
                  <CardContent className="pt-6">
                    <p className="text-slate-500 text-sm text-center py-6">
                      {t('leads.noSignalsYet')}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ANALYSIS TAB */}
            <TabsContent value="analysis" className="mt-4">
              <Card className="shadow-sm">
                <CardContent className="pt-6">
                  {lead.analysis_summary ? (
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                      <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{lead.analysis_summary}</p>
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm text-center py-6">{t('leads.noAnalysisSummaryYet')}</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

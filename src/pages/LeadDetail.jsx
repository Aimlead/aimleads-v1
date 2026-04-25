import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  Brain,
  Check,
  Copy,
  Database,
  ExternalLink,
  Globe,
  Linkedin,
  Loader2,
  Mail,
  Phone,
  RefreshCcw,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FOLLOW_UP_STATUS_LIST } from '@/constants/leads';
import { ROUTES } from '@/constants/routes';
import ScoreBreakdown from '@/components/leads/ScoreBreakdown';
import { dataClient } from '@/services/dataClient';
import SignalBadge from '@/components/leads/SignalBadge';
import { getDeterministicIcpSummary, getLeadScores } from '@/lib/leadPresentation';

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
  getInternetSignals(lead)
    .map((signal) => ({
      type: inferSignalTypeFromKey(signal?.key || signal?.label),
      label: normalizeLabel(signal?.label || signal?.key || signal?.evidence),
      source: signal?.source_type || 'internet',
      evidence: signal?.evidence || signal?.key,
      confidence: signal?.confidence,
    }))
    .filter((signal) => Boolean(signal.label));

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

const SIGNAL_PHRASE_FR_MAP = new Map([
  ['leadership change', 'changement de direction'],
  ['market entry', 'entrée sur un nouveau marché'],
  ['restructuring', 'restructuration'],
  ['budget cuts', 'réductions budgétaires'],
  ['layoffs', 'licenciements'],
  ['hiring', 'recrutement'],
  ['partnership', 'partenariat'],
  ['product launch', 'lancement produit'],
  ['gtm shift', 'changement go-to-market'],
  ['contact now', 'contacter maintenant'],
  ['contact soon', 'contacter rapidement'],
  ['nurture', 'nurturer'],
  ['deprioritize', 'déprioriser'],
]);

const translateForPresentation = (value, language) => {
  const source = String(value || '');
  if (language !== 'fr' || !source) return source;

  let translated = source;
  for (const [needle, replacement] of SIGNAL_PHRASE_FR_MAP.entries()) {
    translated = translated.replaceAll(needle, replacement);
  }
  return translated;
};

const ScoreRing = ({ value = 0, label = 'Score' }) => {
  const normalized = Math.max(0, Math.min(100, Number(value) || 0));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (normalized / 100) * circumference;

  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} stroke="rgba(255,255,255,0.2)" strokeWidth="10" fill="none" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          stroke="url(#scoreRingGradient)"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
        <defs>
          <linearGradient id="scoreRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#fb7185" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <p className="text-4xl font-bold tracking-tight">{Math.round(normalized)}</p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-white/70">{label}</p>
      </div>
    </div>
  );
};

export default function LeadDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { leadId } = useParams();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();

  const leadFromState = location.state?.lead || null;

  const {
    data: lead,
    isLoading,
    isError: leadError,
    refetch: refetchLead,
  } = useQuery({
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
  const [activeJob, setActiveJob] = useState(null);
  const [handledJobId, setHandledJobId] = useState(null);
  const [sequenceTone, setSequenceTone] = useState('consultative');
  const [sequence, setSequence] = useState(null);
  const [signalLanguage, setSignalLanguage] = useState('en');
  const [sequenceActiveJobId, setSequenceActiveJobId] = useState('');
  const [sequenceHandledJobId, setSequenceHandledJobId] = useState('');
  const [signalAnalysisError, setSignalAnalysisError] = useState('');

  const JOB_POLL_TIMEOUT_MS = 10 * 60 * 1000;

  React.useEffect(() => {
    if (!activeJob?.jobId) return;
    const timerId = setTimeout(() => {
      setActiveJob(null);
      toast.error(t('leads.asyncJobTimeout', { defaultValue: 'Analysis job timed out. Please try again.' }));
    }, JOB_POLL_TIMEOUT_MS);
    return () => clearTimeout(timerId);
  }, [activeJob?.jobId, t]);

  React.useEffect(() => {
    if (!sequenceActiveJobId) return;
    const timerId = setTimeout(() => {
      setSequenceActiveJobId('');
      toast.error(t('leads.asyncJobTimeout', { defaultValue: 'Sequence job timed out. Please try again.' }));
    }, JOB_POLL_TIMEOUT_MS);
    return () => clearTimeout(timerId);
  }, [sequenceActiveJobId, t]);

  React.useEffect(() => {
    if (!lead) return;
    setNotes(lead.notes || '');
    setFollowUpStatus(lead.follow_up_status || FOLLOW_UP_STATUS_LIST[0]);
  }, [lead]);

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

  const currentJob = polledJob || activeJob;
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
        toast.success(
          t('leads.scoreIcpSuccess', {
            company: lead.company_name,
            score: response.data.icp_score,
            category: response.data.icp_category,
          })
        );
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
    setSignalAnalysisError('');
    try {
      await dataClient.leads.analyzeSignals(lead.id);
      toast.success(t('leads.analyseSignalsSuccess', { defaultValue: 'Signal analysis completed.' }));
      queryClient.invalidateQueries({ queryKey: ['lead', lead.id] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (err) {
      const message = err?.message || t('leads.analyseSignalsFailed', { defaultValue: 'Signal analysis failed.' });
      setSignalAnalysisError(message);
      toast.error(message);
    } finally {
      setAnalysing(false);
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
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-sky" />
      </div>
    );
  }

  if (leadError) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-rose-400" />
        <h1 className="text-xl font-bold text-slate-900">{t('leads.loadLeadFailed')}</h1>
        <p className="mt-2 text-sm text-slate-500">{t('errors.networkError')}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>{t('common.back')}</Button>
          <Button onClick={() => refetchLead()} className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            {t('common.retry')}
          </Button>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <h1 className="text-2xl font-bold text-slate-900">{t('errors.notFound')}</h1>
        <p className="mt-2 text-slate-500">{t('leads.leadNotFoundBody')}</p>
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
  const signalAnalysis =
    lead?.score_details?.signal_analysis && typeof lead.score_details.signal_analysis === 'object'
      ? lead.score_details.signal_analysis
      : null;
  const displaySignals = getDisplaySignals(lead);
  const icpAnalysisText = getDeterministicIcpSummary(lead);
  const icpCriteriaSource =
    (scoreDetails?.criteria_breakdown && typeof scoreDetails.criteria_breakdown === 'object' && scoreDetails.criteria_breakdown)
    || (scoreDetails?.icp_criteria && typeof scoreDetails.icp_criteria === 'object' && scoreDetails.icp_criteria)
    || scoreDetails;

  const signalGroups = {
    positive: (Array.isArray(signalAnalysis?.positives) ? signalAnalysis.positives : []).map((label) => ({ label })),
    negative: (Array.isArray(signalAnalysis?.negatives) ? signalAnalysis.negatives : []).map((label) => ({ label })),
    neutral: (Array.isArray(signalAnalysis?.neutrals) ? signalAnalysis.neutrals : []).map((label) => ({ label })),
  };
  const fallbackNeutralSignals = signalGroups.neutral.length > 0
    ? signalGroups.neutral
    : (Array.isArray(signalAnalysis?.signals) ? signalAnalysis.signals : []).map((label) => ({ label }));
  if (signalGroups.neutral.length === 0 && fallbackNeutralSignals.length > 0) {
    signalGroups.neutral = fallbackNeutralSignals;
  }

  const providerStatus =
    lead?.auto_signal_metadata?.provider_status && typeof lead.auto_signal_metadata.provider_status === 'object'
      ? lead.auto_signal_metadata.provider_status
      : null;

  const importantIcpCriteria = Object.entries(icpCriteriaSource)
    .filter(
      ([key, value]) =>
        value
        && typeof value === 'object'
        && [
          'industrie',
          'roles',
          'typeClient',
          'structure',
          'geo',
          'industry',
          'role',
          'client_type',
          'company_size',
          'geography',
        ].includes(key)
    )
    .map(([key, value]) => ({
      key,
      label: key.replace(/_/g, ' '),
      match: value.match || value.evaluated_value || '—',
      points: Number(value.points),
    }))
    .filter((criterion) => Number.isFinite(criterion.points))
    .sort((a, b) => b.points - a.points);

  const linkedinUrl = lead?.linkedin_url || lead?.linkedin || '';
  const phone = lead?.phone || lead?.contact_phone || '';
  const nextAction = signalAnalysis?.action || lead?.follow_up_status || '—';

  return (
    <div className="space-y-6">
      <div className="sticky top-20 z-10 -mx-6 border-b border-slate-100 bg-white/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <Button variant="ghost" size="sm" className="gap-2 h-9" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            {t('common.back')}
          </Button>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
              <span>{t('leads.lastAnalyzedLabel')}</span>
              <span className="font-semibold text-slate-700">{formatDate(lead.last_analyzed_at, i18n.language) || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ──── Main score header ─────────────────────────────── */}
      <section className="rounded-3xl border border-slate-900/10 bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-800 p-8 shadow-lg">
        <div className="grid gap-8 lg:grid-cols-[120px,1fr]">
          <div className="flex justify-center lg:justify-start">
            <ScoreRing value={finalScore || 0} label={t('common.score', { defaultValue: 'Score' })} />
          </div>
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-300/80 mb-2">{t('leads.scorecard', { defaultValue: 'Lead scorecard' })}</p>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <h1 className="text-3xl font-bold tracking-tight text-white">{lead.company_name}</h1>
                  {lead.final_category ? (
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${categoryStyle(lead.final_category)}`}>
                      {lead.final_category}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-slate-300/90 font-medium">
                  {lead.contact_name
                    ? lead.contact_role
                      ? `${lead.contact_name} · ${lead.contact_role}`
                      : lead.contact_name
                    : t('common.notAvailable', { defaultValue: 'N/A' })}
                </p>
              </div>
              {lead.llm_enriched ? (
                <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 flex-shrink-0">
                  <Brain className="h-4 w-4 text-amber-300" />
                  <span className="text-xs font-semibold text-amber-200">{t('leads.aiSignalsActive')}</span>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {[lead.industry, lead.country, lead.client_type, lead.company_size ? `${lead.company_size} emp.` : null]
                .filter(Boolean)
                .map((item) => (
                  <span key={item} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-200">
                    {item}
                  </span>
                ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:gap-4">
              <div className="rounded-xl border border-white/15 bg-white/8 backdrop-blur-sm p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-300/70 font-semibold mb-2">ICP Score</p>
                <p className="text-3xl font-bold text-white">{icpScore ?? '—'}</p>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/8 backdrop-blur-sm p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-300/70 font-semibold mb-2">AI Score</p>
                <p className="text-3xl font-bold text-white">{aiScore ?? '—'}</p>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/8 backdrop-blur-sm p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-300/70 font-semibold mb-2">{t('leads.suggestedAction', { defaultValue: 'Action' })}</p>
                <p className="text-sm font-bold text-emerald-300">
                  {signalLanguage === 'fr' ? ACTION_FR_LABELS[nextAction] || nextAction : nextAction}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {currentJob ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-brand-sky/30 bg-gradient-to-r from-brand-sky/10 to-brand-sky-2/10 p-4 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between gap-4 mb-2">
            <div>
              <p className="font-semibold text-slate-800 text-sm">
                {activeJob?.label || t('leads.asyncJobRunning', { defaultValue: 'Background job running' })}
              </p>
              <p className="text-slate-600 text-xs mt-0.5">{currentJob.message || t('leads.asyncJobQueued', { defaultValue: 'Background job queued.' })}</p>
            </div>
            <span className="rounded-lg border border-brand-sky/30 bg-white/70 px-2.5 py-1 text-xs font-semibold text-brand-sky flex-shrink-0">
              {Math.max(0, Math.min(100, Number(currentJob.progress || 0)))}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-sky to-brand-sky-2 transition-all duration-300"
              style={{ width: `${Math.max(8, Math.min(100, Number(currentJob.progress || 0)))}%` }}
            />
          </div>
        </motion.div>
      ) : null}

      {/* ──── Actions section ─────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/60 bg-gradient-to-br from-slate-50/50 to-white p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Zap className="h-4 w-4 text-brand-sky" />
          {t('common.actions', { defaultValue: 'Actions' })}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Primary actions */}
          <Button size="sm" className="bg-brand-sky hover:bg-brand-sky/90 text-white font-medium h-10 gap-2" onClick={() => sequenceMutation.mutate()} disabled={sequenceMutation.isPending || Boolean(sequenceActiveJobId)}>
            {sequenceMutation.isPending || sequenceActiveJobId ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {t('outreach.generateSequence')}
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium h-10 gap-2" onClick={handleScoreIcp} disabled={scoring || isJobActive}>
            {scoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
            {t('leads.scoreIcpBtn', { defaultValue: 'Analyze ICP' })}
          </Button>
          <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white font-medium h-10 gap-2" onClick={handleAnalyse} disabled={analysing || isJobActive}>
            {analysing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            {t('leads.analyseSignalsBtn', { defaultValue: 'Analyze signals' })}
          </Button>

          {/* Communication actions */}
          <Button size="sm" variant="outline" className="h-10 gap-2 border-slate-200" asChild disabled={!lead.contact_email}>
            <a href={lead.contact_email ? `mailto:${lead.contact_email}` : undefined}>
              <Mail className="h-4 w-4 text-red-500" />
              Email
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-10 gap-2 border-slate-200"
            disabled={!phone}
            onClick={() => {
              if (!phone) return;
              window.location.href = `tel:${phone}`;
            }}
          >
            <Phone className="h-4 w-4 text-amber-600" />
            Call
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-10 gap-2 border-slate-200"
            disabled={!linkedinUrl}
            onClick={() => {
              if (!linkedinUrl) return;
              const withProtocol = /^https?:\/\//i.test(linkedinUrl) ? linkedinUrl : `https://${linkedinUrl}`;
              window.open(withProtocol, '_blank', 'noopener,noreferrer');
            }}
          >
            <Linkedin className="h-4 w-4 text-blue-600" />
            LinkedIn
          </Button>

          {/* CRM actions */}
          {activeCrmTypes.length > 0 ? (
            activeCrmTypes.map((crmType) => {
              const label = crmType === 'hubspot' ? 'HubSpot' : 'Salesforce';
              const isSyncing = crmSyncMutation.isPending && crmSyncMutation.variables?.crmType === crmType;
              return (
                <Button
                  key={crmType}
                  size="sm"
                  variant="outline"
                  className="h-10 gap-2 border-slate-200"
                  onClick={() => crmSyncMutation.mutate({ leadId: lead.id, crmType })}
                  disabled={crmSyncMutation.isPending}
                >
                  {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4 text-orange-600" />}
                  {t('leads.pushToCrm', { crm: label })}
                </Button>
              );
            })
          ) : (
            <Button size="sm" variant="outline" className="h-10 gap-2 border-slate-200" onClick={() => navigate(ROUTES.crmIntegration)}>
              <Database className="h-4 w-4 text-slate-400" />
              Configure CRM
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-5">
          <ScoreBreakdown
            lead={lead}
            finalScore={finalScore}
            icpScore={icpScore}
            aiScore={aiScore}
            aiBoost={aiBoost}
            scoreDetails={scoreDetails}
          />

          <Card className="shadow-sm border-slate-200/60">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4 text-brand-sky" />
                {t('leads.icpAnalysis', { defaultValue: 'ICP fit' })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {icpAnalysisText ? (
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{icpAnalysisText}</p>
              ) : (
                <p className="text-sm text-slate-500 italic">{t('leads.noAnalysisSummaryYet')}</p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200/60">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                {t('leads.importantIcpCriteria', { defaultValue: 'Important ICP criteria' })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {importantIcpCriteria.length > 0 ? (
                importantIcpCriteria.map((criterion) => (
                  <div key={criterion.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100/80 bg-gradient-to-r from-slate-50/40 to-white p-3 hover:border-slate-200 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium capitalize text-slate-800">{criterion.label}</p>
                      <p className="text-xs text-slate-500 truncate">{criterion.match}</p>
                    </div>
                    <span
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold flex-shrink-0 ${
                        criterion.points >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {criterion.points > 0 ? '+' : ''}
                      {criterion.points}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 italic text-center py-2">{t('leads.noAnalysisSummaryYet')}</p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200/60">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Mail className="h-4 w-4 text-red-500" />
                {t('leads.crmNotes')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{t('leads.followUpStatus', { defaultValue: 'Status' })}</label>
                <Select value={followUpStatus} onValueChange={setFollowUpStatus}>
                  <SelectTrigger className="h-9">
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
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{t('leads.internalNotes')}</label>
                <Textarea
                  placeholder={t('leads.internalNotesPlaceholder', { defaultValue: 'Add internal notes...' })}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={5}
                  className="resize-none"
                />
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full bg-gradient-to-r from-brand-sky to-brand-sky-2 hover:from-brand-sky/90 hover:to-brand-sky-2/90 font-medium h-10">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                {t('common.save')}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          {analysing ? (
            <Card className="border-brand-sky/30 shadow-sm bg-brand-sky/5">
              <CardContent className="flex items-center gap-3 pt-5 text-sm text-brand-sky font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('leads.analyseSignalsBtnLoading', { defaultValue: 'Analyzing signals…' })}
              </CardContent>
            </Card>
          ) : null}

          {signalAnalysisError ? (
            <Card className="border-rose-200 shadow-sm bg-rose-50">
              <CardContent className="pt-5 text-sm text-rose-700 font-medium">{signalAnalysisError}</CardContent>
            </Card>
          ) : null}

          <Card className="shadow-sm border-slate-200/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="h-4 w-4 text-brand-sky" />
                  {t('leads.signalAnalysisTitle', { defaultValue: 'AI signal analysis' })}
                </CardTitle>
                <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                  {['en', 'fr'].map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setSignalLanguage(lang)}
                      className={`px-2.5 py-1 text-xs font-bold transition-colors ${signalLanguage === lang ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      {lang.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3">
                  <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">AI Score</p>
                  <p className="text-lg font-bold text-slate-800 mt-1">{signalAnalysis?.ai_score ?? lead.ai_score ?? '—'}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3">
                  <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">AI Boost</p>
                  <p className="text-lg font-bold text-slate-800 mt-1">{signalAnalysis?.ai_boost ?? aiBoost ?? '—'}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3">
                  <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">Confidence</p>
                  <p className="text-lg font-bold text-slate-800 mt-1">{signalAnalysis?.confidence ?? lead.ai_confidence ?? '—'}</p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3">
                <p className="text-xs text-slate-500 uppercase font-semibold tracking-wide mb-1">{t('leads.suggestedAction', { defaultValue: 'Suggested action' })}</p>
                <p className="text-sm font-bold text-slate-800">
                  {signalLanguage === 'fr'
                    ? ACTION_FR_LABELS[signalAnalysis?.action] || signalAnalysis?.action || '—'
                    : signalAnalysis?.action || '—'}
                </p>
              </div>

              {signalAnalysis?.icebreaker ? (
                <div className="rounded-lg border border-brand-sky/20 bg-brand-sky/5 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-brand-sky uppercase tracking-wide">Icebreaker</p>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleCopy(signalAnalysis.icebreaker, 'signal-icebreaker')}>
                      {copied === 'signal-icebreaker' ? <Check className="h-3 w-3 mr-1 text-emerald-600" /> : <Copy className="h-3 w-3 mr-1" />}
                      {copied === 'signal-icebreaker' ? t('common.copied') : t('common.copy')}
                    </Button>
                  </div>
                  <p className="text-sm text-slate-700">{translateForPresentation(signalAnalysis.icebreaker, signalLanguage)}</p>
                </div>
              ) : null}

              {providerStatus ? (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(providerStatus).map(([provider, status]) => (
                    <span
                      key={provider}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${
                        status === 'ok'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : status === 'skipped'
                            ? 'border-slate-200 bg-slate-50 text-slate-500'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}
                    >
                      {provider}: {t(`leads.signalProviderStatus.${status}`, { defaultValue: status })}
                    </span>
                  ))}
                </div>
              ) : null}

              {signalAnalysis ? (
                <div className="space-y-2">
                  {['positive', 'negative', 'neutral'].map((type) => {
                    const items = signalGroups[type] || [];
                    if (items.length === 0) return null;
                    const labels = {
                      positive: t('leads.positiveSignals'),
                      negative: t('leads.negativeSignals'),
                      neutral: t('leads.neutralSignals'),
                    };
                    const colors = {
                      positive: 'border-emerald-200 bg-emerald-50',
                      negative: 'border-rose-200 bg-rose-50',
                      neutral: 'border-slate-200 bg-slate-50',
                    };
                    return (
                      <div key={type} className={`rounded-lg border ${colors[type]} p-3`}>
                        <p className="mb-2 text-xs font-bold text-slate-600 uppercase tracking-wide">
                          {labels[type]} ({items.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {items.map((signal, index) => (
                            <SignalBadge key={`${type}-${index}`} signal={{ ...signal, type }} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {signalAnalysis?.sources?.length > 0 || signalAnalysis?.website ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
                      {signalAnalysis?.sources?.length > 0 ? <p><span className="font-bold">Sources:</span> {signalAnalysis.sources.join(', ')}</p> : null}
                      {signalAnalysis?.website ? <p><span className="font-bold">Website:</span> {signalAnalysis.website}</p> : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic text-center py-4">No AI buying signals detected yet</p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200/60">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Mail className="h-4 w-4 text-brand-sky" />
                {t('outreach.icebreakers', { defaultValue: 'Outreach / icebreakers' })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {icebreakers.length > 0 ? (
                icebreakers.map(({ key, label, content }) => (
                  <div key={key} className="rounded-lg border border-slate-100 bg-gradient-to-br from-slate-50/40 to-white p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-600">{label}</p>
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => handleCopy(content, key)}>
                        {copied === key ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        {copied === key ? t('common.copied') : t('common.copy')}
                      </Button>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{content}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 italic text-center py-4">{t('leads.noIcebreakersYet')}</p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200/60">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand-sky" />
                {t('outreach.sequence.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  {t('outreach.sequence.toneLabel', { defaultValue: 'Sequence tone' })}
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select value={sequenceTone} onValueChange={setSequenceTone}>
                    <SelectTrigger className="h-9 text-sm flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['consultative', 'direct', 'friendly', 'premium', 'challenger'].map((key) => (
                        <SelectItem key={key} value={key}>
                          {t(`outreach.sequence.tones.${key}`, { defaultValue: key })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-9 gap-2 bg-brand-sky hover:bg-brand-sky/90"
                    onClick={() => sequenceMutation.mutate()}
                    disabled={sequenceMutation.isPending || Boolean(sequenceActiveJobId)}
                  >
                    {sequenceMutation.isPending || sequenceActiveJobId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Generate
                  </Button>
                </div>
              </div>

              {sequenceActiveJobId && sequenceJob && !['completed', 'failed'].includes(sequenceJob.status) ? (
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin text-brand-sky" />
                  {sequenceJob.progress?.message || t('outreach.sequence.writing')}
                </div>
              ) : null}

              {sequence ? (
                <div className="space-y-3 rounded-xl border border-brand-sky/20 bg-brand-sky/5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{sequence.sequence_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{sequence.objective}</p>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSequence(null)}>✕</Button>
                  </div>
                  {sequence.touches?.map((touch, i) => {
                    const fullText = [
                      touch.subject && `${t('outreach.sequence.subjectLabel')}: ${touch.subject}`,
                      touch.body,
                      touch.cta && `→ ${touch.cta}`,
                    ]
                      .filter(Boolean)
                      .join('\n\n');
                    return (
                      <div key={i} className="rounded-lg border border-white bg-white p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">J{touch.day} · {touch.channel || 'email'}</p>
                          <button
                            onClick={() => handleCopy(fullText, `seq-${i}`)}
                            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
                          >
                            {copied === `seq-${i}` ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                            {copied === `seq-${i}` ? t('common.copied') : t('common.copy')}
                          </button>
                        </div>
                        {touch.subject ? <p className="text-sm font-bold text-slate-800 mb-2">{touch.subject}</p> : null}
                        <p className="whitespace-pre-wrap text-sm text-slate-600">{touch.body}</p>
                        {touch.cta ? <p className="mt-3 border-t border-slate-100 pt-2 text-xs font-bold text-brand-sky">→ {touch.cta}</p> : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {lead.website_url ? (
            <Card className="shadow-sm border-slate-200/60">
              <CardContent className="flex items-center justify-between gap-3 py-4 px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <Globe className="h-5 w-5 text-slate-400 flex-shrink-0" />
                  <span className="truncate text-sm text-slate-700 font-medium">{lead.website_url}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const href = /^https?:\/\//i.test(lead.website_url) ? lead.website_url : `https://${lead.website_url}`;
                    window.open(href, '_blank', 'noopener,noreferrer');
                  }}
                  className="h-8 gap-1.5 flex-shrink-0"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {crmSyncRecords.length > 0 ? (
        <p className="text-xs text-slate-400">
          {t('leads.lastCrmSync')} {new Date(crmSyncRecords[0].created_at).toLocaleString(i18n.language)}
        </p>
      ) : null}

      {/* TODO: enable direct call provider integration once telephony handler is available in this page context. */}
    </div>
  );
}

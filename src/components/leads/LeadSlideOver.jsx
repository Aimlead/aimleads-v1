import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
  Copy,
  Database,
  ExternalLink,
  Globe,
  Linkedin,
  Loader2,
  Mail,
  Phone,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ROUTES } from '@/constants/routes';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { FOLLOW_UP_STATUS_LIST } from '@/constants/leads';
import { getDeterministicIcpSummary, getLeadScores } from '@/lib/leadPresentation';
import { dataClient } from '@/services/dataClient';
import SignalBadge from './SignalBadge';
import StatusBadge from './StatusBadge';

const IMPORTANT_ICP_KEYS = ['industrie', 'roles', 'typeClient', 'structure', 'geo', 'industry', 'role', 'client_type', 'company_size', 'geography'];

const normalizeInternetSignalConfidence = (value, fallback = 80) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const percentage = parsed <= 1 ? parsed * 100 : parsed;
  return Math.max(0, Math.min(100, Math.round(percentage)));
};

const toSignalArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => key)
      .filter(Boolean);
  }
  return [];
};

const getIntentSignalsFromLead = (lead) => {
  const payload = lead?.intent_signals || lead?.intentSignals || {};
  return {
    pre_call: toSignalArray(payload.pre_call || payload.preCall || payload.pre || payload.precall),
    post_contact: toSignalArray(payload.post_contact || payload.postContact || payload.post),
    negative: toSignalArray(payload.negative || payload.negatives || payload.negative_signals),
  };
};

const getInternetSignalsFromLead = (lead) => {
  const payload = lead?.internet_signals || lead?.internetSignals || [];
  if (!Array.isArray(payload)) return [];
  return payload
    .map((entry) => ({
      key: String(entry?.key || '').trim(),
      evidence: String(entry?.evidence || entry?.url || '').trim(),
      confidence: normalizeInternetSignalConfidence(entry?.confidence),
      found_at: entry?.found_at || entry?.foundAt || undefined,
      source_type: entry?.source_type || null,
    }))
    .filter((entry) => Boolean(entry.key));
};

const formatDate = (value, locale) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
};

const PROVIDER_STATUS_FR = {
  ok: null,
  no_results: 'aucun résultat',
  skipped: 'non configuré',
};

const buildDiscoverToast = (response, t) => {
  const discovered = Number(response?.discovered_signals || 0);
  const news = Number(response?.news_signals || 0);
  const webResearch = Number(response?.web_research_signals || 0);
  const hunterEmail = response?.hunter_email;
  const providerStatus = response?.provider_status || {};
  const total = discovered + news + webResearch + (hunterEmail ? 1 : 0);
  if (total === 0) {
    const skipped = Object.entries(providerStatus)
      .filter(([, s]) => s !== 'ok')
      .map(([provider, status]) => `${provider}: ${PROVIDER_STATUS_FR[status] || status}`)
      .join(', ');
    return skipped
      ? t('leads.noSignalsFoundWithReasons', { reasons: skipped })
      : t('leads.noNewSignals');
  }
  const parts = [];
  if (discovered > 0) parts.push(`Web: ${discovered}`);
  if (news > 0) parts.push(`News: ${news}`);
  if (webResearch > 0) parts.push(`Claude: ${webResearch}`);
  if (hunterEmail) parts.push(`Email: ${hunterEmail}`);
  return t('leads.signalsDetectedSummary', { count: total, details: parts.join(', ') });
};

const getScoreBarColor = (score) => {
  if (score === null || score === undefined) return 'bg-slate-200';
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 65) return 'bg-sky-500';
  if (score >= 45) return 'bg-amber-400';
  return 'bg-rose-400';
};

const getCategoryBadge = (category) => {
  switch (String(category || '').toLowerCase()) {
    case 'excellent': return { label: 'Excellent', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'strong': return { label: 'Fort', cls: 'bg-sky-50 text-sky-700 border-sky-200' };
    case 'medium': return { label: 'Moyen', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'low': return { label: 'Faible', cls: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'excluded': return { label: 'Exclu', cls: 'bg-slate-100 text-slate-500 border-slate-200' };
    default: return null;
  }
};

const MATCH_META = {
  parfait: { label: 'Parfait', cls: 'bg-emerald-50 text-emerald-700' },
  partiel: { label: 'Partiel', cls: 'bg-amber-50 text-amber-700' },
  aucun: { label: 'Aucun', cls: 'bg-slate-100 text-slate-500' },
  exclu: { label: 'Exclu', cls: 'bg-rose-50 text-rose-700' },
};

function CriterionRow({ criterion }) {
  const isPositive = criterion.points > 0;
  const isZero = criterion.points === 0;
  const match = MATCH_META[criterion.matchType] || { label: criterion.matchType, cls: 'bg-slate-100 text-slate-500' };

  const barPct = isZero
    ? 0
    : isPositive
      ? Math.min(100, Math.round((criterion.points / Math.max(criterion.maxPoints, 1)) * 100))
      : Math.min(100, Math.round((Math.abs(criterion.points) / Math.max(Math.abs(criterion.minPoints), 1)) * 100));

  return (
    <div className="px-3 py-2.5 border-b border-slate-50 last:border-b-0">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium text-slate-800 truncate">{criterion.label}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${match.cls}`}>
            {match.label}
          </span>
        </div>
        <span className={`text-sm font-semibold tabular-nums shrink-0 ${isPositive ? 'text-emerald-700' : isZero ? 'text-slate-400' : 'text-rose-600'}`}>
          {criterion.points > 0 ? '+' : ''}{criterion.points}
        </span>
      </div>
      {criterion.evaluatedValue && criterion.evaluatedValue !== '—' ? (
        <p className="text-[11px] text-slate-400 mb-1.5">{criterion.evaluatedValue}</p>
      ) : null}
      <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${isPositive ? 'bg-emerald-400' : isZero ? 'bg-slate-200' : 'bg-rose-400'}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
    </div>
  );
}

const signalTypeClass = (type) => {
  const key = String(type || '').toLowerCase();
  if (key === 'positive') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (key === 'negative') return 'text-rose-700 bg-rose-50 border-rose-200';
  return 'text-slate-700 bg-slate-50 border-slate-200';
};

export default function LeadSlideOver({ lead, open, onOpenChange, onLeadUpdated }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(null);
  const [followUpStatus, setFollowUpStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [intentSignals, setIntentSignals] = useState({ pre_call: [], post_contact: [], negative: [] });
  const [internetSignals, setInternetSignals] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savingAndAnalyzing, setSavingAndAnalyzing] = useState(false);
  const [scoringIcp, setScoringIcp] = useState(false);
  const [icpSummary, setIcpSummary] = useState(getDeterministicIcpSummary(lead));
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [handledJobId, setHandledJobId] = useState(null);

  const { data: crmSyncRecords = [], refetch: refetchCrmStatus } = useQuery({
    queryKey: ['crmSyncStatus', lead?.id],
    queryFn: () => dataClient.crm.getSyncStatus(lead.id),
    enabled: Boolean(lead?.id) && open,
    staleTime: 30_000,
  });

  const { data: crmIntegrations = [] } = useQuery({
    queryKey: ['crmIntegrations'],
    queryFn: () => dataClient.crm.list(),
    enabled: open,
    staleTime: 60_000,
  });

  const { data: featureFlagsData = null } = useQuery({
    queryKey: ['workspaceFeatureFlags', 'lead-slideover'],
    queryFn: () => dataClient.workspace.listFeatureFlags(),
    enabled: open,
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

  const crmSyncMutation = useMutation({
    mutationFn: ({ leadId, crmType }) => dataClient.crm.syncLead(leadId, crmType),
    onSuccess: (result, { crmType }) => {
      if (result?.success) {
        toast.success(t('leads.crmSynced', { crm: crmType === 'hubspot' ? 'HubSpot' : 'Salesforce' }));
      } else {
        toast.error(t('leads.crmSyncFailed', { crm: crmType === 'hubspot' ? 'HubSpot' : 'Salesforce', error: result?.error || t('common.unknown') }));
      }
      refetchCrmStatus();
      queryClient.invalidateQueries({ queryKey: ['crmIntegrations'] });
    },
    onError: (err) => {
      toast.error(t('leads.crmError', { error: err.message }));
    },
  });

  const activeCrmTypes = crmIntegrations.filter((i) => i.is_active).map((i) => i.crm_type);
  const initialRef = useRef({ followUpStatus: '', notes: '', intentSignals: {} });

  React.useEffect(() => {
    if (lead) {
      const fs = lead.follow_up_status || FOLLOW_UP_STATUS_LIST[0];
      const n = lead.notes || '';
      const is = getIntentSignalsFromLead(lead);
      const nets = getInternetSignalsFromLead(lead);
      setFollowUpStatus(fs);
      setNotes(n);
      setIntentSignals(is);
      setInternetSignals(nets);
      setIcpSummary(getDeterministicIcpSummary(lead));
      initialRef.current = { followUpStatus: fs, notes: n, intentSignals: is };
    }
  }, [lead]);

  React.useEffect(() => {
    if (!polledJob || !activeJob) return;
    if (polledJob.status !== 'completed' && polledJob.status !== 'failed') return;
    if (handledJobId === polledJob.id) return;

    setHandledJobId(polledJob.id);
    setActiveJob((previous) => (previous?.jobId === polledJob.id ? null : previous));

    if (polledJob.status === 'failed') {
      toast.error(polledJob.error?.message || t('leads.asyncJobFailed', { defaultValue: 'Background job failed.' }));
      return;
    }

    const result = polledJob.result?.data;
    if (result?.lead) {
      setIntentSignals(getIntentSignalsFromLead(result.lead));
      setInternetSignals(getInternetSignalsFromLead(result.lead));
    }

    onLeadUpdated?.();

    if (activeJob.type === 'save_and_reanalyze') {
      const score = result?.analysis?.final_score ?? result?.lead?.final_score ?? result?.lead?.icp_score;
      const signalMsg = buildDiscoverToast(result, t);
      toast.success(t('leads.saveAndReanalyzeSuccess', { score: score ?? '-', details: signalMsg }));
      return;
    }

    toast.success(t('leads.asyncJobCompleted', { defaultValue: 'Background job completed.' }));
  }, [activeJob, handledJobId, onLeadUpdated, polledJob, t]);

  const isDirty = useMemo(() => {
    const init = initialRef.current;
    if (followUpStatus !== init.followUpStatus) return true;
    if (notes !== init.notes) return true;
    if (JSON.stringify(intentSignals) !== JSON.stringify(init.intentSignals)) return true;
    return false;
  }, [followUpStatus, notes, intentSignals]);

  const handleOpenChange = (next) => {
    if (!next && isDirty) {
      setShowUnsavedDialog(true);
      return;
    }
    onOpenChange(next);
  };

  const handleDiscardAndClose = () => {
    setShowUnsavedDialog(false);
    onOpenChange(false);
  };

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success(t('toasts.copied'));
    setTimeout(() => setCopied(null), 2000);
  };

  const persistLeadEdits = async (extra = {}) => {
    if (!lead) return;
    await dataClient.leads.update(lead.id, {
      follow_up_status: followUpStatus,
      notes,
      intent_signals: intentSignals,
      internet_signals: internetSignals,
      ...extra,
    });
  };

  const handleSave = async () => {
    if (!lead) return;
    setSaving(true);
    try {
      await persistLeadEdits();
      toast.success(t('toasts.leadUpdated'));
      onLeadUpdated?.();
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setSaving(false);
    }
  };

  const runSignalDiscovery = async ({ reanalyze = false } = {}) => {
    await persistLeadEdits();
    const response = await dataClient.leads.discoverSignals(lead.id, {
      async: asyncJobsEnabled,
      reanalyze,
      replace: true,
      signals: internetSignals,
      intent_signals: intentSignals,
    });
    if (response?.lead) {
      setIntentSignals(getIntentSignalsFromLead(response.lead));
      setInternetSignals(getInternetSignalsFromLead(response.lead));
    }
    onLeadUpdated?.();
    return response;
  };

  const handleSaveAndAnalyze = async () => {
    if (!lead) return;
    setSavingAndAnalyzing(true);
    try {
      const response = await runSignalDiscovery({ reanalyze: true });
      if (response?.jobId) {
        setHandledJobId(null);
        setActiveJob({
          jobId: response.jobId,
          type: 'save_and_reanalyze',
          label: t('leads.saveAndReanalyze', { defaultValue: 'Save and reanalyze' }),
        });
        toast.success(t('leads.asyncJobQueued', { defaultValue: 'Background job queued. You can keep working while AimLeads finishes it.' }));
        return;
      }
      const score = response?.analysis?.final_score ?? response?.lead?.final_score ?? response?.lead?.icp_score;
      const signalMsg = buildDiscoverToast(response, t);
      toast.success(t('leads.saveAndReanalyzeSuccess', { score: score ?? '-', details: signalMsg }));
    } catch (error) {
      console.warn('Save and analyze failed', error);
      toast.error(t('leads.saveAndReanalyzeFailed'));
    } finally {
      setSavingAndAnalyzing(false);
    }
  };

  const handleScoreIcp = async () => {
    if (!lead) return;
    setScoringIcp(true);
    try {
      const response = await dataClient.leads.scoreIcp(lead.id);
      if (response?.data) {
        const { icp_score, icp_category, summary, improvement_tips } = response.data;
        const summaryText = summary
          ? `${summary}${improvement_tips?.length ? `\n\nPistes d'amélioration :\n${improvement_tips.map((tip, i) => `${i + 1}. ${tip}`).join('\n')}` : ''}`
          : null;
        setIcpSummary(summaryText);
        queryClient.invalidateQueries({ queryKey: ['lead', lead.id] });
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        toast.success(t('leads.scoreIcpSuccess', { company: lead.company_name, score: icp_score, category: icp_category }));
        onLeadUpdated?.();
      }
    } catch {
      toast.error(t('leads.scoreIcpFailed', { company: lead.company_name }));
    } finally {
      setScoringIcp(false);
    }
  };

  if (!lead) return null;

  const { finalScore, icpScore, aiScore, aiBoost, hasSignals } = getLeadScores(lead);
  const scoreDetails = lead?.score_details && typeof lead.score_details === 'object' ? lead.score_details : {};
  const signalAnalysis = lead?.score_details?.signal_analysis && typeof lead.score_details.signal_analysis === 'object'
    ? lead.score_details.signal_analysis
    : null;
  const icpCriteriaSource =
    (scoreDetails?.criteria_breakdown && typeof scoreDetails.criteria_breakdown === 'object' && scoreDetails.criteria_breakdown)
    || (scoreDetails?.icp_criteria && typeof scoreDetails.icp_criteria === 'object' && scoreDetails.icp_criteria)
    || scoreDetails;

  const groupedSignals = {
    positive: (lead.signals || []).filter((signal) => String(signal?.type || '').toLowerCase() === 'positive'),
    negative: (lead.signals || []).filter((signal) => String(signal?.type || '').toLowerCase() === 'negative'),
    neutral: (lead.signals || []).filter((signal) => String(signal?.type || '').toLowerCase() === 'neutral'),
  };

  const importantIcpCriteria = Object.entries(icpCriteriaSource)
    .filter(([key, value]) => IMPORTANT_ICP_KEYS.includes(key) && value && typeof value === 'object')
    .map(([key, value]) => ({
      key,
      label: t(`leads.icpCriteria.${key}`, { defaultValue: key.replace(/_/g, ' ') }),
      matchType: value.match || 'aucun',
      evaluatedValue: value.evaluated_value || null,
      points: Number(value.points),
      maxPoints: Number(value.weights?.parfait ?? Math.max(Number(value.points) || 0, 15)),
      minPoints: Number(value.weights?.aucun ?? Math.min(Number(value.points) || 0, -10)),
    }))
    .filter((item) => Number.isFinite(item.points))
    .sort((a, b) => b.points - a.points);

  const criteriaRawSum = importantIcpCriteria.reduce((sum, c) => sum + c.points, 0);

  const openFullLeadPage = () => {
    onOpenChange(false);
    navigate(`/leads/${lead.id}`, { state: { lead } });
  };

  const contactPhone = lead.contact_phone || lead.phone || lead.phone_number || null;
  const contactEmail = lead.contact_email || lead.email || null;
  const linkedinUrl = lead.contact_linkedin || lead.linkedin_url || null;
  const websiteUrl = lead.website_url ? (/^https?:\/\//i.test(lead.website_url) ? lead.website_url : `https://${lead.website_url}`) : null;
  const scorePercent = Number.isFinite(Number(finalScore)) ? Math.max(0, Math.min(100, Number(finalScore))) : 0;
  const currentJob = polledJob || activeJob;
  const isJobActive = currentJob && !['completed', 'failed'].includes(currentJob.status);

  const intentSignalTotal = intentSignals.pre_call.length + intentSignals.post_contact.length + intentSignals.negative.length;
  const categoryBadge = getCategoryStyle(lead.final_category || lead.category);
  const barColor = getScoreBarColor(finalScore);

  const finalRecommendedAction = lead.final_recommended_action || lead.recommended_action || null;

  function getCategoryStyle(category) {
    const badge = getCategoryBadge(category);
    return badge ? { label: badge.label, cls: `border ${badge.cls}` } : null;
  }

  return (
    <>
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('leads.unsavedChangesTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('leads.unsavedChangesDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('leads.stayAndReview')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscardAndClose} className="bg-rose-600 hover:bg-rose-700">
              {t('leads.discardChanges')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent className="w-full sm:max-w-[520px] p-0 flex flex-col overflow-hidden" style={{ background: '#f8f7f5' }}>
          {/* Header */}
          <SheetHeader className="border-b px-5 py-4 bg-white" style={{ borderColor: '#e8e5df' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <SheetTitle className="text-lg truncate" style={{ color: '#1a1200' }}>{lead.company_name}</SheetTitle>
                  <StatusBadge status={lead.status || 'To Analyze'} />
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  {[lead.contact_name, lead.contact_role].filter(Boolean).join(' · ') || t('common.contact')}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {lead.source_list ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[11px] font-medium">
                      <Tag className="w-3 h-3" />
                      {lead.source_list}
                    </span>
                  ) : null}
                  {lead.industry ? <span className="rounded-md border px-2 py-0.5 text-[11px] text-slate-600 bg-white" style={{ borderColor: '#e8e5df' }}>{lead.industry}</span> : null}
                  {lead.country ? <span className="rounded-md border px-2 py-0.5 text-[11px] text-slate-600 bg-white" style={{ borderColor: '#e8e5df' }}>{lead.country}</span> : null}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={openFullLeadPage} className="shrink-0 text-xs">
                <ExternalLink className="w-3.5 h-3.5 mr-1" />
                Détail
              </Button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

            {/* ── Score Hero ─────────────────────────────────────── */}
            <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: '#e8e5df' }}>
              <div className="px-4 pt-4 pb-3">
                {/* Score + category row */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">Score final</p>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-5xl font-bold tabular-nums leading-none" style={{ color: '#1a1200' }}>
                        {finalScore ?? '—'}
                      </span>
                      <span className="text-slate-400 text-sm">/100</span>
                    </div>
                  </div>
                  <div className="text-right space-y-1.5 pt-0.5">
                    {categoryBadge ? (
                      <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md ${categoryBadge.cls}`}>
                        {categoryBadge.label}
                      </span>
                    ) : null}
                    {lead.saas_grade ? (
                      <p className="text-xs text-slate-400">{lead.saas_grade}</p>
                    ) : null}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: '#f0ede8' }}>
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${scorePercent}%` }} />
                </div>

                {/* Score decomposition */}
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 text-xs">ICP</span>
                    <span className="font-semibold text-slate-800 tabular-nums">{icpScore ?? '—'}</span>
                  </div>
                  {aiBoost !== null ? (
                    <>
                      <span className="text-slate-300 text-xs">+</span>
                      <div className="flex items-center gap-1 rounded-md px-1.5 py-0.5" style={{ background: aiBoost >= 0 ? '#f0fdf4' : '#fff1f2', border: `1px solid ${aiBoost >= 0 ? '#bbf7d0' : '#fecdd3'}` }}>
                        <Zap className="w-3 h-3" style={{ color: aiBoost >= 0 ? '#16a34a' : '#e11d48' }} />
                        <span className="text-xs font-semibold tabular-nums" style={{ color: aiBoost >= 0 ? '#15803d' : '#be123c' }}>
                          {aiBoost >= 0 ? '+' : ''}{aiBoost}
                        </span>
                        <span className="text-[10px]" style={{ color: aiBoost >= 0 ? '#16a34a' : '#e11d48' }}>signaux</span>
                      </div>
                      <span className="text-slate-300 text-xs">=</span>
                      <span className="font-bold text-slate-900 tabular-nums">{finalScore}</span>
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-400 italic">— aucun signal d'intention analysé</span>
                  )}
                </div>

                {/* Recommended action */}
                {finalRecommendedAction ? (
                  <div className="mt-2.5 flex items-center gap-1.5 text-xs font-medium" style={{ color: '#92400e' }}>
                    <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                    <span>{finalRecommendedAction}</span>
                  </div>
                ) : null}

                {/* Last analyzed */}
                {formatDate(lead.last_analyzed_at, i18n.language) ? (
                  <p className="text-[10px] text-slate-400 mt-2">
                    Analysé le {formatDate(lead.last_analyzed_at, i18n.language)}
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-2 italic">Pas encore analysé</p>
                )}
              </div>

              {/* Quick actions */}
              <div className="border-t px-4 py-2.5 flex items-center gap-1.5" style={{ borderColor: '#f0ede8', background: '#faf9f7' }}>
                <Button size="sm" variant="outline" disabled={!contactPhone} onClick={() => window.open(`tel:${contactPhone}`)} className="h-8 gap-1 px-2 text-[11px]">
                  <Phone className="w-3.5 h-3.5" />Call
                </Button>
                <Button size="sm" variant="outline" disabled={!contactEmail} onClick={() => { window.location.href = `mailto:${contactEmail}`; }} className="h-8 gap-1 px-2 text-[11px]">
                  <Mail className="w-3.5 h-3.5" />Email
                </Button>
                <Button size="sm" variant="outline" disabled={!linkedinUrl} onClick={() => window.open(linkedinUrl, '_blank', 'noopener,noreferrer')} className="h-8 gap-1 px-2 text-[11px]">
                  <Linkedin className="w-3.5 h-3.5" />LinkedIn
                </Button>
                <div className="flex-1" />
                <Button
                  size="sm"
                  onClick={handleSaveAndAnalyze}
                  disabled={savingAndAnalyzing || isJobActive}
                  className="h-8 gap-1.5 px-3 text-[11px] font-semibold text-white"
                  style={{ background: '#1a1200' }}
                >
                  {savingAndAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Analyser
                </Button>
              </div>
            </section>

            {/* No score alert */}
            {finalScore === null && !isJobActive ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-900">Cliquez sur <strong>Analyser</strong> pour obtenir le score ICP et les signaux d'intention pour ce lead.</p>
              </div>
            ) : null}

            {/* Job progress */}
            {currentJob ? (
              <section className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-semibold text-slate-800">{activeJob?.label || 'Analyse en cours'}</p>
                    <p className="text-slate-600 text-xs">{currentJob.message || 'Traitement en arrière-plan...'}</p>
                  </div>
                  <span className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs font-medium text-sky-700">
                    {Math.max(0, Math.min(100, Number(currentJob.progress || 0)))}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80">
                  <div className="h-full rounded-full bg-sky-400 transition-all" style={{ width: `${Math.max(8, Math.min(100, Number(currentJob.progress || 0)))}%` }} />
                </div>
              </section>
            ) : null}

            {/* Tabs */}
            <Tabs defaultValue="overview" className="space-y-3">
              <TabsList className="grid w-full grid-cols-4 h-9">
                <TabsTrigger value="overview" className="text-xs">Infos</TabsTrigger>
                <TabsTrigger value="scorecard" className="text-xs">Score ICP</TabsTrigger>
                <TabsTrigger value="signals" className="text-xs">Signaux</TabsTrigger>
                <TabsTrigger value="actions" className="text-xs">Actions</TabsTrigger>
              </TabsList>

              {/* ── Overview Tab ────────────────────────────────────── */}
              <TabsContent value="overview" className="space-y-3 m-0">
                <div className="rounded-xl border bg-white p-3 text-sm space-y-2" style={{ borderColor: '#e8e5df' }}>
                  {[
                    [t('common.contact'), lead.contact_name || '—'],
                    [t('common.role'), lead.contact_role || '—'],
                    [t('common.size'), lead.company_size ? `${lead.company_size} emp.` : '—'],
                    [t('leads.clientType'), lead.client_type || '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 text-xs">{label}</span>
                      <span className="font-medium text-slate-800 text-xs text-right">{value}</span>
                    </div>
                  ))}
                  {websiteUrl ? (
                    <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="pt-1 inline-flex items-center gap-1 text-sky-600 hover:underline text-xs">
                      <Globe className="w-3.5 h-3.5" />{lead.website_url}
                    </a>
                  ) : null}
                </div>

                <div className="rounded-xl border bg-white p-3" style={{ borderColor: '#e8e5df' }}>
                  <p className="text-xs font-semibold text-slate-700 mb-2">{t('leads.followUp')}</p>
                  <Select value={followUpStatus} onValueChange={setFollowUpStatus}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FOLLOW_UP_STATUS_LIST.map((status) => (
                        <SelectItem key={status} value={status} className="text-xs">{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea placeholder={t('common.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-2 text-sm" />
                </div>
              </TabsContent>

              {/* ── Scorecard Tab ────────────────────────────────────── */}
              <TabsContent value="scorecard" className="space-y-3 m-0">
                {icpSummary ? (
                  <div className="rounded-xl border bg-white p-3" style={{ borderColor: '#e8e5df' }}>
                    <p className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-slate-400" />
                      Analyse ICP
                    </p>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{icpSummary}</p>
                  </div>
                ) : null}

                {/* Criteria breakdown */}
                <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: '#e8e5df' }}>
                  <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: '#f0ede8', background: '#faf9f7' }}>
                    <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">Critères ICP</p>
                    {lead.icp_raw_score != null ? (
                      <span className="text-[10px] text-slate-400">Brut : {lead.icp_raw_score}/110</span>
                    ) : importantIcpCriteria.length > 0 ? (
                      <span className="text-[10px] text-slate-400">Brut : {criteriaRawSum}/110</span>
                    ) : null}
                  </div>

                  {importantIcpCriteria.length > 0 ? (
                    <>
                      {importantIcpCriteria.map((criterion) => (
                        <CriterionRow key={criterion.key} criterion={criterion} />
                      ))}
                      <div className="px-3 py-2 border-t flex items-center justify-between" style={{ borderColor: '#f0ede8', background: '#faf9f7' }}>
                        <span className="text-[10px] text-slate-500">
                          Somme brute : <strong className="text-slate-700">{criteriaRawSum} pts</strong>
                          <span className="text-slate-400"> (max 110)</span>
                        </span>
                        <span className="text-[10px] font-semibold text-slate-700">
                          Score ICP : {icpScore ?? '—'}/100
                        </span>
                      </div>
                      <div className="px-3 py-1.5 border-t" style={{ borderColor: '#f0ede8' }}>
                        <p className="text-[10px] text-slate-400 italic">
                          Le score brut est normalisé sur 100 (base : 110 points maximum)
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="p-4 text-center">
                      <p className="text-xs text-slate-400">Aucun critère ICP calculé — lancez une analyse pour obtenir le détail.</p>
                    </div>
                  )}
                </div>

                {/* Signal boost recap (only if signals) */}
                {hasSignals && aiBoost !== null ? (
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#e8e5df', background: aiBoost >= 0 ? '#f0fdf4' : '#fff1f2' }}>
                    <div className="px-3 py-2 border-b" style={{ borderColor: aiBoost >= 0 ? '#bbf7d0' : '#fecdd3' }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: aiBoost >= 0 ? '#15803d' : '#be123c' }}>
                        Ajustement signaux
                      </p>
                    </div>
                    <div className="px-3 py-2.5 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Score ICP (base)</span>
                        <span className="font-semibold text-slate-800">{icpScore ?? '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Boost signaux</span>
                        <span className="font-semibold" style={{ color: aiBoost >= 0 ? '#15803d' : '#be123c' }}>
                          {aiBoost >= 0 ? '+' : ''}{aiBoost}
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-1" style={{ borderColor: aiBoost >= 0 ? '#bbf7d0' : '#fecdd3' }}>
                        <span className="font-semibold text-slate-700">Score final</span>
                        <span className="font-bold text-slate-900">{finalScore ?? '—'}/100</span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </TabsContent>

              {/* ── Signals Tab ────────────────────────────────────── */}
              <TabsContent value="signals" className="space-y-3 m-0">
                {/* AI signal analysis — only if signals exist */}
                {hasSignals && signalAnalysis ? (
                  <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: '#e8e5df' }}>
                    <div className="px-3 py-2 border-b flex items-center gap-1.5" style={{ borderColor: '#f0ede8', background: '#faf9f7' }}>
                      <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                      <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">Analyse signaux IA</p>
                    </div>
                    <div className="p-3 space-y-2.5 text-xs text-slate-700">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg border p-2" style={{ borderColor: '#e8e5df' }}>
                          <p className="text-[10px] text-slate-400 uppercase mb-0.5">Score signaux</p>
                          <p className="font-semibold text-sm">{aiScore ?? '—'}/100</p>
                        </div>
                        <div className="rounded-lg border p-2" style={{ borderColor: '#e8e5df' }}>
                          <p className="text-[10px] text-slate-400 uppercase mb-0.5">Confiance</p>
                          <p className="font-semibold text-sm">{signalAnalysis.confidence ?? lead.ai_confidence ?? '—'}%</p>
                        </div>
                      </div>
                      {signalAnalysis?.suggested_action || signalAnalysis?.action ? (
                        <div className="flex items-start gap-1.5 rounded-lg border px-2.5 py-2" style={{ borderColor: '#e8e5df', background: '#faf9f7' }}>
                          <TrendingUp className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <p><span className="font-semibold">Action :</span> {signalAnalysis.suggested_action || signalAnalysis.action}</p>
                        </div>
                      ) : null}
                      {Array.isArray(signalAnalysis?.positives) && signalAnalysis.positives.length > 0 ? (
                        <p><span className="font-semibold text-emerald-700">Positifs :</span> {signalAnalysis.positives.join(', ')}</p>
                      ) : null}
                      {Array.isArray(signalAnalysis?.negatives) && signalAnalysis.negatives.length > 0 ? (
                        <p><span className="font-semibold text-rose-600">Négatifs :</span> {signalAnalysis.negatives.join(', ')}</p>
                      ) : null}
                      {signalAnalysis?.icebreaker ? (
                        <p className="italic text-slate-500">{signalAnalysis.icebreaker}</p>
                      ) : null}
                    </div>
                  </div>
                ) : !hasSignals ? (
                  <div className="rounded-xl border border-dashed bg-white p-4 text-center space-y-2" style={{ borderColor: '#e8e5df' }}>
                    <Sparkles className="w-6 h-6 text-slate-300 mx-auto" />
                    <p className="text-xs text-slate-500">Aucun signal d'intention analysé pour ce lead.</p>
                    <p className="text-[11px] text-slate-400">Cliquez sur <strong>Analyser</strong> pour lancer la découverte de signaux internet et l'analyse IA.</p>
                    <Button size="sm" onClick={handleSaveAndAnalyze} disabled={savingAndAnalyzing || isJobActive} className="mt-1 gap-1.5">
                      {savingAndAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      Analyser maintenant
                    </Button>
                  </div>
                ) : null}

                {/* Signals badges */}
                {lead.signals?.length > 0 ? (
                  ['positive', 'negative', 'neutral'].map((type) => {
                    const items = groupedSignals[type] || [];
                    if (items.length === 0) return null;
                    const title = type === 'positive' ? t('leads.positiveSignals') : type === 'negative' ? t('leads.negativeSignals') : t('leads.neutralSignals');
                    return (
                      <div key={type} className={`rounded-lg border px-3 py-2 ${signalTypeClass(type)}`}>
                        <p className="text-xs font-semibold mb-1.5">{title} ({items.length})</p>
                        <div className="flex flex-wrap gap-1.5">
                          {items.map((signal, index) => <SignalBadge key={`${type}-${index}`} signal={signal} />)}
                        </div>
                      </div>
                    );
                  })
                ) : null}

                {/* Signal counts */}
                <div className="rounded-lg border bg-white px-3 py-2.5 text-xs text-slate-600 space-y-1.5" style={{ borderColor: '#e8e5df' }}>
                  <div className="flex items-center justify-between">
                    <span>Signaux d'intention (manuel)</span>
                    <span className="font-semibold text-slate-800">{intentSignalTotal}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Signaux internet</span>
                    <span className="font-semibold text-slate-800">{internetSignals.length}</span>
                  </div>
                </div>
              </TabsContent>

              {/* ── Actions Tab ────────────────────────────────────── */}
              <TabsContent value="actions" className="space-y-3 m-0">
                <div className="rounded-xl border bg-white p-3 space-y-2" style={{ borderColor: '#e8e5df' }}>
                  <p className="text-xs font-semibold text-slate-700">Actions d'analyse</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={handleScoreIcp} disabled={scoringIcp || isJobActive} className="text-xs">
                      {scoringIcp ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                      {t('leads.scoreIcpButton', { defaultValue: 'Score ICP' })}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleSaveAndAnalyze} disabled={savingAndAnalyzing || isJobActive} className="text-xs">
                      {savingAndAnalyzing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                      {t('leads.saveAndReanalyze', { defaultValue: 'Réanalyser' })}
                    </Button>
                  </div>
                </div>

                {activeCrmTypes.length === 0 && finalScore !== null ? (
                  <div className="rounded-xl border border-dashed p-3" style={{ borderColor: '#e8e5df', background: '#faf9f7' }}>
                    <div className="flex items-start gap-3">
                      <Database className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{t('leads.crmEmptyTitle', { defaultValue: 'Envoyer dans votre CRM' })}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{t('leads.crmEmptyBody', { defaultValue: 'Connectez HubSpot ou Salesforce.' })}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => { onOpenChange(false); navigate(ROUTES.crmIntegration); }} className="shrink-0 h-7 text-xs">
                        Configurer
                      </Button>
                    </div>
                  </div>
                ) : null}

                {activeCrmTypes.length > 0 ? (
                  <div className="rounded-xl border bg-white p-3 space-y-2" style={{ borderColor: '#e8e5df' }}>
                    <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Database className="w-4 h-4 text-slate-400" />CRM
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {activeCrmTypes.map((crmType) => {
                        const lastSync = crmSyncRecords.filter((r) => r.crm_type === crmType && r.status === 'success').at(0);
                        const label = crmType === 'hubspot' ? 'HubSpot' : 'Salesforce';
                        const isSyncing = crmSyncMutation.isPending && crmSyncMutation.variables?.crmType === crmType;
                        return (
                          <div key={crmType} className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => crmSyncMutation.mutate({ leadId: lead.id, crmType })} disabled={crmSyncMutation.isPending} className="text-xs">
                              {isSyncing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Database className="w-3.5 h-3.5 mr-1.5" />}
                              {t('leads.pushToCrm', { crm: label })}
                            </Button>
                            {lastSync?.crm_object_url ? (
                              <a href={lastSync.crm_object_url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 hover:underline flex items-center gap-0.5">
                                Voir <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </TabsContent>
            </Tabs>
          </div>

          {/* Footer */}
          <div className="border-t bg-white px-4 py-3 flex gap-2" style={{ borderColor: '#e8e5df' }}>
            <Button variant="outline" onClick={handleSaveAndAnalyze} disabled={savingAndAnalyzing || isJobActive} className="flex-1 text-xs">
              {savingAndAnalyzing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
              {t('leads.analyzeNow', { defaultValue: 'Analyser' })}
            </Button>
            <Button onClick={handleSave} disabled={saving || savingAndAnalyzing || isJobActive} className="flex-1 text-xs">
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
              {isDirty ? t('leads.saveChangesCta') : t('common.save')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

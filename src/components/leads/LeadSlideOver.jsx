import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Copy, Database, ExternalLink, Loader2, Linkedin, Mail, Phone, Sparkles, Tag, Target } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FOLLOW_UP_STATUS_LIST } from '@/constants/leads';
import { getLeadScores } from '@/lib/leadPresentation';
import { dataClient } from '@/services/dataClient';
import AnalysisHero from './AnalysisHero';
import LeadActionsPanel from './LeadActionsPanel';
import ScoreBreakdown from './ScoreBreakdown';
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
  return parsed.toLocaleString(locale);
};

const signalTypeClass = (type) => {
  const key = String(type || '').toLowerCase();
  if (key === 'positive') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (key === 'negative') return 'text-rose-700 bg-rose-50 border-rose-200';
  return 'text-slate-700 bg-slate-50 border-slate-200';
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
  const [icpSummary, setIcpSummary] = useState(lead?.icp_summary || null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [handledJobId, setHandledJobId] = useState(null);

  // CRM sync status for this lead
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

  const activeCrmTypes = crmIntegrations
    .filter((i) => i.is_active)
    .map((i) => i.crm_type);

  // Track initial values to detect unsaved changes
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
      setIcpSummary(lead.icp_summary || null);
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

  const icebreakers = [
    { key: 'email', label: 'Email', icon: Mail, content: lead.generated_icebreakers?.email || lead.generated_icebreaker },
    { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, content: lead.generated_icebreakers?.linkedin },
    { key: 'call', label: t('leads.copyCall'), icon: Phone, content: lead.generated_icebreakers?.call },
  ].filter((item) => item.content);

  const { finalScore, icpScore, aiScore, aiBoost } = getLeadScores(lead);
  const scoreDetails = lead?.score_details && typeof lead.score_details === 'object' ? lead.score_details : {};
  const currentJob = polledJob || activeJob;
  const isJobActive = currentJob && !['completed', 'failed'].includes(currentJob.status);

  const signalAnalysis = lead?.score_details?.signal_analysis && typeof lead.score_details.signal_analysis === 'object'
    ? lead.score_details.signal_analysis
    : null;
  const importantIcpCriteria = Object.entries(scoreDetails)
    .filter(([key, value]) => IMPORTANT_ICP_KEYS.includes(key) && value && typeof value === 'object')
    .map(([key, value]) => ({
      key,
      label: t(`leads.icpCriteria.${key}`, { defaultValue: key.replace(/_/g, ' ') }),
      match: value.match || value.evaluated_value || '—',
      points: Number(value.points),
    }))
    .filter((item) => Number.isFinite(item.points))
    .sort((a, b) => b.points - a.points);

  const groupedSignals = {
    positive: (lead.signals || []).filter((signal) => String(signal?.type || '').toLowerCase() === 'positive'),
    negative: (lead.signals || []).filter((signal) => String(signal?.type || '').toLowerCase() === 'negative'),
    neutral: (lead.signals || []).filter((signal) => String(signal?.type || '').toLowerCase() === 'neutral'),
  };

  const openFullLeadPage = () => {
    onOpenChange(false);
    navigate(`/leads/${lead.id}`, { state: { lead } });
  };

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
          label: t('leads.openFullPage', { defaultValue: 'Full page' }),
          onClick: openFullLeadPage,
        };

  const secondaryHeroAction = {
    label: t('leads.openFullPage', { defaultValue: 'Full page' }),
    onClick: openFullLeadPage,
  };

  return (
    <>
    <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('leads.unsavedChangesTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('leads.unsavedChangesDescription')}
          </AlertDialogDescription>
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
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className="text-xl truncate">{lead.company_name}</SheetTitle>
              {lead.website_url && (
                <a
                  href={/^https?:\/\//i.test(lead.website_url) ? lead.website_url : `https://${lead.website_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-brand-sky hover:underline truncate block"
                >
                  {lead.website_url}
                </a>
              )}
              {lead.source_list ? (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-brand-sky/5 px-2 py-0.5 text-[11px] font-medium text-brand-sky border border-brand-sky/15">
                  <Tag className="w-3 h-3" />
                  {lead.source_list}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openFullLeadPage}
              >
                {t('leads.openFullPage')}
              </Button>
              <StatusBadge status={lead.status || 'To Analyze'} />
            </div>
          </div>
        </SheetHeader>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('leads.leadSnapshot')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{t('common.contact')}</p>
                <p className="text-slate-900 font-medium">{lead.contact_name || 'N/A'}</p>
                <p className="text-slate-500">{lead.contact_role || 'N/A'}</p>
              </div>
              {[
                [t('common.industry'), lead.industry],
                [t('common.country'), lead.country],
                [t('common.size'), lead.company_size ? `${lead.company_size} ${i18n.language === 'fr' ? 'employés' : 'employees'}` : null],
                [t('leads.clientType'), lead.client_type],
                [t('leads.lastAnalyzedLabel'), formatDate(lead.last_analyzed_at, i18n.language)],
              ]
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-medium text-slate-800 text-right">{value}</span>
                  </div>
                ))}
            </CardContent>
          </Card>
          <ScoreBreakdown
            lead={lead}
            finalScore={finalScore}
            icpScore={icpScore}
            aiScore={aiScore}
            aiBoost={aiBoost}
            scoreDetails={scoreDetails}
          />
        </div>

        <div className="mb-4">
          <AnalysisHero
            lead={lead}
            t={t}
            compact
            primaryAction={primaryHeroAction}
            secondaryAction={secondaryHeroAction}
          />
        </div>

        {finalScore === null && !isJobActive && (
          <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-xl border border-sky-200 bg-sky-50">
            <AlertTriangle className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-sky-800">
                {t('leads.noScoreYet', { defaultValue: 'Not yet scored' })}
              </p>
              <p className="text-xs text-sky-700 mt-0.5">
                {t('leads.noScoreYetBody', { defaultValue: 'Click Analyze to run AI scoring and get an ICP fit score for this lead.' })}
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleSaveAndAnalyze}
              disabled={savingAndAnalyzing}
              className="shrink-0 h-7 text-xs bg-sky-500 hover:bg-sky-600 text-white border-0 gap-1.5"
            >
              {savingAndAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {t('leads.analyzeNow', { defaultValue: 'Analyze now' })}
            </Button>
          </div>
        )}

        <div className="mb-4 rounded-xl border border-slate-200 p-4 space-y-4 bg-slate-50/40">
          {currentJob ? (
            <div className="rounded-xl border border-brand-sky/20 bg-brand-sky/5 p-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-semibold text-slate-800">
                    {activeJob?.label || t('leads.asyncJobRunning', { defaultValue: 'Background job running' })}
                  </p>
                  <p className="text-slate-600">
                    {currentJob.message || t('leads.asyncJobQueued', { defaultValue: 'Background job queued.' })}
                  </p>
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
            </div>
          ) : null}

          {/* Action buttons — deterministic ICP (free) + AI actions (credit-cost) */}
          <div className="space-y-2">
            <LeadActionsPanel
              variant="compact"
              onScoreIcp={handleScoreIcp}
              onAnalyse={handleSaveAndAnalyze}
              scoring={scoringIcp}
              analysing={savingAndAnalyzing}
              disabled={isJobActive}
            />
            <Button variant="ghost" size="sm" onClick={handleSave} disabled={saving || isJobActive} className="w-full text-xs text-slate-500">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              {isDirty ? t('leads.saveChangesCta') : t('leads.saveDraft')}
            </Button>
          </div>
        </div>

        {lead.signals?.length > 0 && (
          <div className="mb-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">{t('leads.computedSignals')}</p>

            {['positive', 'negative', 'neutral'].map((type) => {
              const items = groupedSignals[type] || [];
              if (items.length === 0) return null;
              const title = type === 'positive' ? t('leads.positiveSignals') : type === 'negative' ? t('leads.negativeSignals') : t('leads.neutralSignals');

              return (
                <div key={type} className={`rounded-lg border px-3 py-2 ${signalTypeClass(type)}`}>
                  <p className="text-xs font-semibold mb-1">{title} ({items.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {items.map((signal, index) => (
                      <SignalBadge key={`${type}-${index}`} signal={signal} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {icebreakers.length > 0 && (
          <Tabs defaultValue={icebreakers[0].key} className="mb-4">
            <TabsList className="w-full">
              {icebreakers.map(({ key, label, icon: Icon }) => (
                <TabsTrigger key={key} value={key} className="flex-1 gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            {icebreakers.map(({ key, content }) => (
              <TabsContent key={key} value={key}>
                <div className="bg-slate-50 rounded-xl p-4 relative">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2 h-7 gap-1"
                    onClick={() => handleCopy(content, key)}
                    aria-label="Copier dans le presse-papier"
                  >
                    {copied === key ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                  <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed pr-8">{content}</pre>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}

        <Tabs defaultValue="icp" className="mb-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="icp">ICP Analysis</TabsTrigger>
            <TabsTrigger value="criteria">Important ICP Criteria</TabsTrigger>
            <TabsTrigger value="ai">AI Signal Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="icp" className="mt-3">
            <div className="rounded-xl border border-brand-sky/20 bg-brand-sky/4 p-4">
              <p className="text-xs font-semibold text-brand-sky mb-1.5 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />
                ICP Analysis
              </p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {icpSummary || t('leads.noAnalysisSummaryYet')}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="criteria" className="mt-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
              {importantIcpCriteria.length > 0 ? importantIcpCriteria.map((criterion) => (
                <div key={criterion.key} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{criterion.label}</p>
                    <p className="text-xs text-slate-500">{criterion.match}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-md ${criterion.points >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                    {criterion.points > 0 ? '+' : ''}{criterion.points}
                  </span>
                </div>
              )) : (
                <p className="text-sm text-slate-500">{t('leads.noSignalsYet')}</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="ai" className="mt-3">
            <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
              <p className="text-xs font-semibold text-violet-700">AI Signal Analysis</p>
              {signalAnalysis ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-slate-200 bg-white p-2"><p className="text-[11px] text-slate-500">AI Score</p><p className="text-sm font-semibold">{signalAnalysis.ai_score ?? '—'}</p></div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2"><p className="text-[11px] text-slate-500">AI Boost</p><p className="text-sm font-semibold">{signalAnalysis.ai_boost ?? '—'}</p></div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2"><p className="text-[11px] text-slate-500">{t('leads.confidenceShort', { defaultValue: 'Confidence' })}</p><p className="text-sm font-semibold">{signalAnalysis.confidence ?? '—'}</p></div>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{lead.analysis_summary || t('leads.noAnalysisSummaryYet')}</p>
                </>
              ) : (
                <p className="text-sm text-slate-600">{t('leads.noAnalysisSummaryYet')}</p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="border-t border-slate-100 pt-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">{t('leads.followUp')}</p>
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

          <Textarea placeholder={t('common.notes')} value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />

          <Button onClick={handleSave} disabled={saving || savingAndAnalyzing || isJobActive} className="w-full relative">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : isDirty ? t('leads.saveChangesCta') : t('common.save')}
          </Button>
        </div>

        {/* CRM empty-state CTA — shown once the lead is scored but no CRM is configured */}
        {activeCrmTypes.length === 0 && finalScore !== null && (
          <div className="border-t border-slate-100 pt-4">
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-3">
              <div className="flex items-start gap-3">
                <Database className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    {t('leads.crmEmptyTitle', { defaultValue: 'Envoyer ce lead dans votre CRM' })}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('leads.crmEmptyBody', { defaultValue: 'Connectez HubSpot ou Salesforce pour synchroniser les leads scorés en un clic.' })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(ROUTES.crmIntegration);
                  }}
                  className="shrink-0 h-7 text-xs"
                >
                  {t('leads.crmEmptyCta', { defaultValue: 'Configurer' })}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* CRM Sync section — only shown when at least one CRM is configured */}
        {activeCrmTypes.length > 0 && (
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-slate-400" />
              CRM
            </p>
            <div className="flex flex-wrap gap-2">
              {activeCrmTypes.map((crmType) => {
                const lastSync = crmSyncRecords
                  .filter((r) => r.crm_type === crmType && r.status === 'success')
                  .at(0);
                const label = crmType === 'hubspot' ? 'HubSpot' : 'Salesforce';
                const isSyncing =
                  crmSyncMutation.isPending &&
                  crmSyncMutation.variables?.crmType === crmType;

                return (
                  <div key={crmType} className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => crmSyncMutation.mutate({ leadId: lead.id, crmType })}
                      disabled={crmSyncMutation.isPending}
                    >
                      {isSyncing ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Database className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      {t('leads.pushToCrm', { crm: label })}
                    </Button>
                    {lastSync?.crm_object_url && (
                      <a
                        href={lastSync.crm_object_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                      >
                        {t('leads.viewInCrm', { crm: label })}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
            {crmSyncRecords.length > 0 && (
              <p className="text-xs text-slate-400">
                {t('leads.lastCrmSync')}{' '}
                {new Date(crmSyncRecords[0].created_at).toLocaleString(i18n.language)}
                {crmSyncRecords[0].status === 'failed' && (
                  <span className="text-red-400 ml-1">— {t('common.error').toLowerCase()}</span>
                )}
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
    </>
  );
}

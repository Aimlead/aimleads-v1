import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, Brain, Check, Copy, ExternalLink, Globe, Loader2, RefreshCcw, Sparkles } from 'lucide-react';
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

const extractSignalLabel = (item) => {
  if (typeof item === 'string') return normalizeLabel(item);
  if (!item || typeof item !== 'object') return '';
  return normalizeLabel(item.label || item.key || item.signal);
};

const normalizeIntentSignalPayload = (value) => {
  const normalized = {
    pre_call: [],
    post_contact: [],
    negative: [],
  };

  const pushUnique = (bucket, item) => {
    const label = extractSignalLabel(item);
    if (!label || normalized[bucket].includes(label)) return;
    normalized[bucket].push(label);
  };

  if (Array.isArray(value)) {
    value.forEach((item) => {
      const explicitType = String(item?.type || '').toLowerCase();
      const inferredType = explicitType || inferSignalTypeFromKey(item?.key || item?.signal || item?.label || item);
      pushUnique(inferredType === 'negative' ? 'negative' : 'pre_call', item);
    });
    return normalized;
  }

  if (!value || typeof value !== 'object') return normalized;

  const appendBucket = (bucket, payload) => {
    if (!Array.isArray(payload)) return;
    payload.forEach((item) => pushUnique(bucket, item));
  };

  appendBucket('pre_call', value.pre_call || value.preCall || value.pre || value.precall);
  appendBucket('post_contact', value.post_contact || value.postContact || value.post);
  appendBucket('negative', value.negative || value.negatives || value.negative_signals);

  return normalized;
};

const getIntentSignals = (lead) => {
  const payload = normalizeIntentSignalPayload(lead?.intent_signals);

  return [
    ...(Array.isArray(payload.pre_call) ? payload.pre_call : []).map((label) => ({
      type: 'positive',
      label: normalizeLabel(label),
      source: 'intent',
      evidence: 'pre_call',
    })),
    ...(Array.isArray(payload.post_contact) ? payload.post_contact : []).map((label) => ({
      type: 'positive',
      label: normalizeLabel(label),
      source: 'intent',
      evidence: 'post_contact',
    })),
    ...(Array.isArray(payload.negative) ? payload.negative : []).map((label) => ({
      type: 'negative',
      label: normalizeLabel(label),
      source: 'intent',
      evidence: 'negative',
    })),
  ];
};

const getInternetSignals = (lead) => (Array.isArray(lead?.internet_signals) ? lead.internet_signals : []);

const getDisplaySignals = (lead) => {
  const legacySignals = Array.isArray(lead?.signals) ? lead.signals : [];
  if (legacySignals.length > 0) return legacySignals;

  return [
    ...getIntentSignals(lead),
    ...getInternetSignals(lead).map((signal) => ({
      type: inferSignalTypeFromKey(signal?.key || signal?.label),
      label: normalizeLabel(signal?.label || signal?.key || signal?.evidence),
      source: signal?.source_type || 'internet',
      evidence: signal?.evidence || signal?.key,
      confidence: signal?.confidence,
    })),
  ].filter((signal) => Boolean(signal.label));
};

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
      if (leadFromState && (!leadId || leadFromState.id === leadId)) return leadFromState;
      if (!leadId) return null;
      return dataClient.leads.getById(leadId);
    },
  });

  const [notes, setNotes] = useState('');
  const [followUpStatus, setFollowUpStatus] = useState(FOLLOW_UP_STATUS_LIST[0]);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(null);

  React.useEffect(() => {
    if (!lead) return;
    setNotes(lead.notes || '');
    setFollowUpStatus(lead.follow_up_status || FOLLOW_UP_STATUS_LIST[0]);
  }, [lead]);

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
  const scoreDetailEntries = Object.entries(scoreDetails).filter(([, entry]) =>
    entry && typeof entry === 'object' && !Array.isArray(entry) && toMetric(entry.points) !== null
  );
  const displaySignals = getDisplaySignals(lead);

  const signalGroups = {
    positive: displaySignals.filter((s) => String(s?.type || '').toLowerCase() === 'positive'),
    negative: displaySignals.filter((s) => String(s?.type || '').toLowerCase() === 'negative'),
    neutral: displaySignals.filter((s) => String(s?.type || '').toLowerCase() === 'neutral'),
  };

  const internetSignals = getInternetSignals(lead);
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

      <div className="mb-6">
        <AnalysisHero
          lead={lead}
          t={t}
          primaryAction={primaryHeroAction}
          secondaryAction={secondaryHeroAction}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-1 space-y-4">
          {/* Score Card */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm">{t('leads.scoreBreakdownTitle', { defaultValue: 'Score breakdown' })}</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: t('leads.icpScore'), value: icpScore },
                  { label: t('leads.aiScore'), value: aiScore, sub: lead.ai_confidence ? `${lead.ai_confidence}% ${t('leads.confidenceShort')}` : null },
                  {
                    label: t('leads.aiBoost'),
                    value: aiBoost === null ? null : aiBoost > 0 ? `+${aiBoost}` : aiBoost,
                    color: aiBoost > 0 ? 'text-emerald-700' : aiBoost < 0 ? 'text-rose-700' : 'text-slate-900',
                  },
                  { label: t('leads.aiAdjustment'), value: lead.llm_score_adjustment != null ? (lead.llm_score_adjustment > 0 ? `+${lead.llm_score_adjustment}` : lead.llm_score_adjustment) : '—', color: lead.llm_score_adjustment > 0 ? 'text-brand-sky' : lead.llm_score_adjustment < 0 ? 'text-rose-700' : 'text-slate-500' },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">{item.label}</p>
                    <p className={`text-base font-semibold ${item.color || 'text-slate-900'}`}>
                      {item.value ?? 'n/a'}
                    </p>
                    {item.sub && <p className="text-[10px] text-slate-400">{item.sub}</p>}
                  </div>
                ))}
              </div>

              <div className="mt-3 text-xs text-slate-600 space-y-1">
                <p>{t('leads.categoryLabel')}: <span className="text-slate-800 font-medium">{lead.final_category || lead.icp_category || 'N/A'}</span></p>
                <p>{t('leads.suggestedAction')}: <span className="text-emerald-700 font-medium">{lead.final_recommended_action || 'N/A'}</span></p>
                {lead.suggested_action && (
                  <p className="text-brand-sky font-medium">{t('leads.aiSuggestion')}: {lead.suggested_action}</p>
                )}
                {scoreDetailEntries.length > 0 && (
                  <p className="text-[11px] text-slate-500">
                    {t('leads.icpSections')}: {scoreDetailEntries.map(([key, entry]) => `${key} ${entry?.points > 0 ? '+' : ''}${entry?.points ?? 0}`).join(' · ')}
                  </p>
                )}
                <p className="text-[11px] text-slate-400">{t('leads.finalScoreFormula')}</p>
              </div>
            </CardContent>
          </Card>

          {/* Snapshot */}
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
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-2 space-y-4">
          <Tabs defaultValue="outreach">
            <TabsList className="bg-slate-100">
              <TabsTrigger value="outreach">{t('outreach.title')}</TabsTrigger>
              <TabsTrigger value="signals">{t('leads.buyingSignals')}</TabsTrigger>
              <TabsTrigger value="analysis">{t('leads.analysisLabel')}</TabsTrigger>
              {internetSignals.length > 0 && (
                <TabsTrigger value="internet">{t('leads.internetSignals')} ({internetSignals.length})</TabsTrigger>
              )}
            </TabsList>

            {/* OUTREACH TAB */}
            <TabsContent value="outreach" className="space-y-4 mt-4">
              {icebreakers.length === 0 ? (
                <Card className="shadow-sm">
                  <CardContent className="pt-6">
                    <p className="text-slate-500 text-sm text-center py-6">
                      {t('leads.noIcebreakersYet')}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                icebreakers.map(({ key, label, content }) => (
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
                            {copied === key ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            {copied === key ? t('common.copied') : t('common.copy')}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{content}</pre>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))
              )}
            </TabsContent>

            {/* SIGNALS TAB */}
            <TabsContent value="signals" className="mt-4">
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
                    <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{lead.analysis_summary}</pre>
                  ) : (
                    <p className="text-slate-500 text-sm text-center py-6">{t('leads.noAnalysisSummaryYet')}</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* INTERNET SIGNALS TAB */}
            {internetSignals.length > 0 && (
              <TabsContent value="internet" className="mt-4">
                <Card className="shadow-sm">
                  <CardContent className="pt-6">
                    <div className="space-y-2">
                      {internetSignals.slice(0, 20).map((signal, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                          <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                            String(signal.key || '').includes('bankruptcy') || String(signal.key || '').includes('closed')
                              ? 'bg-rose-500'
                              : 'bg-emerald-500'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-700">{signal.key?.replace(/_/g, ' ')}</p>
                            {signal.evidence && (
                              <a
                                href={signal.evidence}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-sky hover:underline truncate block"
                              >
                                {signal.evidence}
                              </a>
                            )}
                            {signal.confidence && <p className="text-slate-400">{t('leads.confidenceLabel')}: {signal.confidence}%</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </div>
  );
}

import React, { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, Globe, Loader2, Linkedin, Mail, Phone, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { FOLLOW_UP_STATUS_LIST } from '@/constants/leads';
import { dataClient } from '@/services/dataClient';
import ScoreGauge from './ScoreGauge';
import SignalBadge from './SignalBadge';
import StatusBadge from './StatusBadge';

const INTENT_SIGNAL_GROUPS = [
  {
    key: 'pre_call',
    label: 'Pre-call',
    items: [
      { key: 'profile_fit', label: 'Profil correspondant a la cible' },
      { key: 'compatible_activity', label: "Activite compatible avec l'offre" },
      { key: 'matching_segment', label: 'Segment correspondant' },
      { key: 'offer_related_needs', label: "Besoins lies a l'offre" },
      { key: 'recent_funding', label: 'Levee de fond recente' },
      { key: 'major_org_change', label: 'Changements organisationnels importants' },
      { key: 'recent_timing_event', label: 'Evenement recent opportun' },
      { key: 'strong_growth', label: 'Forte croissance' },
      { key: 'regulatory_need', label: 'Contrainte reglementaire pertinente' },
      { key: 'active_rfp', label: "Appel d'offre en cours" },
      { key: 'recent_role_change', label: 'Prise de poste recente' },
    ],
  },
  {
    key: 'post_contact',
    label: 'Post-contact',
    items: [
      { key: 'already_equipped', label: 'Deja equipe' },
      { key: 'budget_available', label: 'Budget disponible' },
      { key: 'clear_priority', label: 'Priorite claire' },
      { key: 'good_timing', label: 'Bon timing' },
      { key: 'decision_maker_involved', label: 'Decideur implique' },
      { key: 'actively_responding', label: 'Repond activement' },
      { key: 'good_relationship', label: 'Bon relationnel' },
    ],
  },
  {
    key: 'negative',
    label: 'Negatifs',
    items: [
      { key: 'no_budget', label: 'Aucun budget' },
      { key: 'not_concerned', label: 'Pas concerne' },
      { key: 'out_of_scope', label: 'Hors perimetre' },
      { key: 'no_decision_power', label: 'Sans pouvoir decisionnel' },
      { key: 'changed_business', label: 'A change metier' },
      { key: 'retired', label: 'A la retraite' },
      { key: 'liquidation_or_bankruptcy', label: 'Liquidation / redressement' },
      { key: 'signed_competitor', label: 'Engage avec un concurrent' },
      { key: 'closed_or_dead', label: 'Entreprise fermee / inactive' },
    ],
  },
];

const INTERNET_SIGNAL_OPTIONS = INTENT_SIGNAL_GROUPS.flatMap((group) => group.items);
const LABEL_BY_SIGNAL_KEY = Object.fromEntries(INTERNET_SIGNAL_OPTIONS.map((item) => [item.key, item.label]));

const createInternetSignalDraft = () => ({
  key: INTERNET_SIGNAL_OPTIONS[0]?.key || 'recent_funding',
  evidence: '',
  confidence: 80,
});

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
    }))
    .filter((entry) => Boolean(entry.key));
};

const toMetricValue = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

const formatFoundAt = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString();
};

const signalTypeClass = (type) => {
  const key = String(type || '').toLowerCase();
  if (key === 'positive') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (key === 'negative') return 'text-rose-700 bg-rose-50 border-rose-200';
  return 'text-slate-700 bg-slate-50 border-slate-200';
};

export default function LeadSlideOver({ lead, open, onOpenChange, onLeadUpdated }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(null);
  const [followUpStatus, setFollowUpStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [intentSignals, setIntentSignals] = useState({ pre_call: [], post_contact: [], negative: [] });
  const [internetSignals, setInternetSignals] = useState([]);
  const [internetSignalDraft, setInternetSignalDraft] = useState(createInternetSignalDraft());
  const [saving, setSaving] = useState(false);
  const [savingAndAnalyzing, setSavingAndAnalyzing] = useState(false);
  const [discoveringSignals, setDiscoveringSignals] = useState(false);
  const [showManualOverrides, setShowManualOverrides] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  // Track initial values to detect unsaved changes
  const initialRef = useRef({ followUpStatus: '', notes: '', intentSignals: {}, internetSignals: [] });

  React.useEffect(() => {
    if (lead) {
      const fs = lead.follow_up_status || 'To Contact';
      const n = lead.notes || '';
      const is = getIntentSignalsFromLead(lead);
      const nets = getInternetSignalsFromLead(lead);
      setFollowUpStatus(fs);
      setNotes(n);
      setIntentSignals(is);
      setInternetSignals(nets);
      setInternetSignalDraft(createInternetSignalDraft());
      initialRef.current = { followUpStatus: fs, notes: n, intentSignals: is, internetSignals: nets };
    }
  }, [lead]);

  const isDirty = useMemo(() => {
    const init = initialRef.current;
    if (followUpStatus !== init.followUpStatus) return true;
    if (notes !== init.notes) return true;
    if (JSON.stringify(intentSignals) !== JSON.stringify(init.intentSignals)) return true;
    if (JSON.stringify(internetSignals) !== JSON.stringify(init.internetSignals)) return true;
    return false;
  }, [followUpStatus, notes, intentSignals, internetSignals]);

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
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleIntentSignal = (groupKey, signalKey) => {
    setIntentSignals((previous) => {
      const current = Array.isArray(previous[groupKey]) ? previous[groupKey] : [];
      const exists = current.includes(signalKey);
      const nextValues = exists ? current.filter((value) => value !== signalKey) : [...current, signalKey];
      return {
        ...previous,
        [groupKey]: nextValues,
      };
    });
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

  const addInternetSignal = () => {
    const nextKey = String(internetSignalDraft.key || '').trim();
    const nextEvidence = String(internetSignalDraft.evidence || '').trim();
    const nextConfidence = Number(internetSignalDraft.confidence);

    if (!nextKey) return;

    setInternetSignals((previous) => [
      ...previous,
      {
        key: nextKey,
        evidence: nextEvidence,
        confidence: Number.isFinite(nextConfidence) ? Math.max(0, Math.min(100, nextConfidence)) : 80,
        found_at: new Date().toISOString(),
      },
    ]);

    setInternetSignalDraft((previous) => ({
      ...previous,
      evidence: '',
      confidence: 80,
    }));
  };

  const removeInternetSignalAt = (indexToRemove) => {
    setInternetSignals((previous) => previous.filter((_, index) => index !== indexToRemove));
  };

  const handleSave = async () => {
    if (!lead) return;

    setSaving(true);
    try {
      await persistLeadEdits();
      toast.success('Lead updated');
      onLeadUpdated?.();
    } catch {
      toast.error('Failed to update lead');
    } finally {
      setSaving(false);
    }
  };

  const runSignalDiscovery = async ({ reanalyze = false } = {}) => {
    await persistLeadEdits();
    const response = await dataClient.leads.discoverSignals(lead.id, {
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

  const handleAutoDiscover = async () => {
    if (!lead) return;

    setDiscoveringSignals(true);
    try {
      const response = await runSignalDiscovery({ reanalyze: false });
      const discoveredCount = Number(response?.discovered_signals || 0);

      if (discoveredCount > 0) {
        toast.success(`${discoveredCount} signal(s) internet detecte(s)`);
      } else {
        toast('Aucun nouveau signal internet detecte sur ce passage');
      }
    } catch (error) {
      console.warn('Auto-discover signals failed', error);
      toast.error('Failed to auto-detect internet signals');
    } finally {
      setDiscoveringSignals(false);
    }
  };

  const handleSaveAndAnalyze = async () => {
    if (!lead) return;

    setSavingAndAnalyzing(true);
    try {
      const response = await runSignalDiscovery({ reanalyze: true });
      const score = response?.analysis?.final_score ?? response?.lead?.final_score ?? response?.lead?.icp_score;
      const discoveredCount = Number(response?.discovered_signals || 0);

      if (discoveredCount > 0) {
        toast.success(`Signals saved + re-analyzed. Score ${score ?? '-'}. ${discoveredCount} signal(s) auto-trouves.`);
      } else {
        toast.success(`Signals saved + re-analyzed. Score ${score ?? '-'}.`);
      }
    } catch (error) {
      console.warn('Save and analyze failed', error);
      toast.error('Failed to save signals and re-analyze');
    } finally {
      setSavingAndAnalyzing(false);
    }
  };

  if (!lead) return null;

  const icebreakers = [
    { key: 'email', label: 'Email', icon: Mail, content: lead.generated_icebreakers?.email || lead.generated_icebreaker },
    { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, content: lead.generated_icebreakers?.linkedin },
    { key: 'call', label: 'Call', icon: Phone, content: lead.generated_icebreakers?.call },
  ].filter((item) => item.content);

  const icpScore = toMetricValue(lead.icp_score);
  const aiScore = toMetricValue(lead.ai_score);
  const finalScore = toMetricValue(lead.final_score) ?? icpScore;
  const aiBoost = icpScore !== null && finalScore !== null ? finalScore - icpScore : null;

  const intentCount =
    (intentSignals.pre_call?.length || 0) +
    (intentSignals.post_contact?.length || 0) +
    (intentSignals.negative?.length || 0);

  const groupedSignals = {
    positive: (lead.signals || []).filter((signal) => String(signal?.type || '').toLowerCase() === 'positive'),
    negative: (lead.signals || []).filter((signal) => String(signal?.type || '').toLowerCase() === 'negative'),
    neutral: (lead.signals || []).filter((signal) => String(signal?.type || '').toLowerCase() === 'neutral'),
  };

  return (
    <>
    <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes on this lead. Discard them or stay to save.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <AlertDialogAction onClick={handleDiscardAndClose} className="bg-rose-600 hover:bg-rose-700">
            Discard changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="text-xl">{lead.company_name}</SheetTitle>
              {lead.website_url && (
                <a
                  href={`https://${lead.website_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-brand-sky hover:underline"
                >
                  {lead.website_url}
                </a>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  navigate(`/leads/${lead.id}`, { state: { lead } });
                }}
              >
                Full Page
              </Button>
              <StatusBadge status={lead.status || 'To Analyze'} />
            </div>
          </div>
        </SheetHeader>

        <div className="rounded-xl border border-slate-200 p-4 mb-4 bg-white">
          <div className="flex items-center gap-5">
            <ScoreGauge score={finalScore} size="small" />
            <div className="flex-1 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">ICP Base</p>
                <p className="text-base font-semibold text-slate-900">{icpScore ?? 'n/a'}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">AI Score</p>
                <p className="text-base font-semibold text-slate-900">
                  {aiScore ?? 'n/a'}
                  {lead.ai_confidence !== null && lead.ai_confidence !== undefined ? (
                    <span className="text-xs font-normal text-slate-500"> ({lead.ai_confidence}% conf)</span>
                  ) : null}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">AI Boost</p>
                <p className={`text-base font-semibold ${aiBoost > 0 ? 'text-emerald-700' : aiBoost < 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                  {aiBoost === null ? 'n/a' : aiBoost > 0 ? `+${aiBoost}` : aiBoost}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Final</p>
                <p className="text-base font-semibold text-slate-900">{finalScore ?? 'n/a'}</p>
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs text-slate-600 space-y-1">
            <p>
              ICP Profile: <span className="font-medium text-slate-800">{lead.icp_profile_name || 'Active profile'}</span>
            </p>
            {lead.final_recommended_action ? (
              <p>
                Action SDR: <span className="font-medium text-emerald-700">{lead.final_recommended_action}</span>
                {lead.final_category ? <span className="text-slate-500"> ({lead.final_category})</span> : null}
              </p>
            ) : null}
            <p className="text-[11px] text-slate-500">Model: Final = ICP base + AI reinforcement (intent + internet evidence)</p>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-slate-200 p-4 space-y-4 bg-slate-50/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Signals & Evidence</p>
              <p className="text-xs text-slate-500 mt-1">
                Auto-detection internet = mode par defaut. Les signaux manuels servent uniquement a corriger/renforcer.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600">Intent: {intentCount}</span>
              <span className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600">Internet: {internetSignals.length}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-slate-500">Auto-discovered</p>
              <p className="font-semibold text-slate-800">{internetSignals.length} signal(s)</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-slate-500">Manual intent</p>
              <p className="font-semibold text-slate-800">{intentCount} selection(s)</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-slate-500">Mode</p>
              <p className="font-semibold text-slate-800">ICP + AI reinforcement</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                Force un nouveau scan du site pour trouver des signaux internet frais.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAutoDiscover}
                disabled={discoveringSignals || savingAndAnalyzing || saving}
                className="gap-1.5"
              >
                {discoveringSignals ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                Re-scan website
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Select
                value={internetSignalDraft.key}
                onValueChange={(value) => setInternetSignalDraft((previous) => ({ ...previous, key: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Signal" />
                </SelectTrigger>
                <SelectContent>
                  {INTERNET_SIGNAL_OPTIONS.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                value={internetSignalDraft.evidence}
                onChange={(event) =>
                  setInternetSignalDraft((previous) => ({
                    ...previous,
                    evidence: event.target.value,
                  }))
                }
                placeholder="URL de preuve (article, post LinkedIn, communique...)"
              />

              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={internetSignalDraft.confidence}
                  onChange={(event) =>
                    setInternetSignalDraft((previous) => ({
                      ...previous,
                      confidence: event.target.value,
                    }))
                  }
                  placeholder="Confidence 0-100"
                />
                <Button type="button" variant="outline" onClick={addInternetSignal}>
                  Add
                </Button>
              </div>
            </div>

            {internetSignals.length > 0 ? (
              <div className="space-y-2">
                {internetSignals.map((entry, index) => {
                  const label = LABEL_BY_SIGNAL_KEY[entry.key] || entry.key;
                  const foundAt = formatFoundAt(entry.found_at);
                  return (
                    <div
                      key={`${entry.key}-${index}`}
                      className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800">{label}</p>
                        <p className="text-[11px] text-slate-500 break-all">
                          {entry.evidence || 'No evidence URL'} | confidence {entry.confidence}%
                        </p>
                        {foundAt ? <p className="text-[11px] text-slate-400 mt-0.5">Found: {foundAt}</p> : null}
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeInternetSignalAt(index)}>
                        Remove
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Aucune preuve internet ajoutee.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <button
              type="button"
              className="w-full flex items-center justify-between text-sm font-medium text-slate-700"
              onClick={() => setShowManualOverrides((previous) => !previous)}
            >
              Manual overrides (advanced)
              {showManualOverrides ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showManualOverrides ? (
              <Tabs defaultValue="pre_call" className="space-y-3 mt-3">
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="pre_call">Pre-call</TabsTrigger>
                  <TabsTrigger value="post_contact">Post-contact</TabsTrigger>
                  <TabsTrigger value="negative">Negatifs</TabsTrigger>
                </TabsList>

                {INTENT_SIGNAL_GROUPS.map((group) => (
                  <TabsContent key={group.key} value={group.key} className="space-y-2">
                    <p className="text-xs text-slate-500">Selection manuelle: {(intentSignals[group.key] || []).length}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.items.map((item) => {
                        const selected = (intentSignals[group.key] || []).includes(item.key);
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => toggleIntentSignal(group.key, item.key)}
                            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                              selected
                                ? 'bg-brand-sky text-white border-brand-sky'
                                : 'bg-white text-slate-700 border-slate-300 hover:border-brand-sky/40 hover:text-brand-sky'
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSaveAndAnalyze} disabled={savingAndAnalyzing || saving || discoveringSignals} className="gap-2">
              {savingAndAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Save + Re-analyze
            </Button>
            <Button variant="outline" onClick={handleSave} disabled={saving || savingAndAnalyzing || discoveringSignals}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Draft'}
            </Button>
          </div>
        </div>

        {lead.signals?.length > 0 && (
          <div className="mb-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Computed Signals</p>

            {['positive', 'negative', 'neutral'].map((type) => {
              const items = groupedSignals[type] || [];
              if (items.length === 0) return null;
              const title = type === 'positive' ? 'Positifs' : type === 'negative' ? 'Negatifs' : 'Neutres';

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
                  >
                    {copied === key ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                  <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed pr-8">{content}</pre>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}

        {lead.analysis_summary && (
          <div className="mb-4">
            <p className="text-sm font-semibold text-slate-700 mb-2">Analysis</p>
            <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-4 whitespace-pre-wrap">{lead.analysis_summary}</p>
          </div>
        )}

        <div className="border-t border-slate-100 pt-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Follow-up</p>
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

          <Textarea placeholder="Notes..." value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />

          <Button onClick={handleSave} disabled={saving || savingAndAnalyzing || discoveringSignals} className="w-full relative">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : isDirty ? 'Save changes ●' : 'Save'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}








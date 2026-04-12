import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Database, KeyRound, Loader2, Save, ShieldCheck, Target, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/lib/AuthContext';
import { dataClient } from '@/services/dataClient';

const DEFAULT_SCORING_SETTINGS = {
  blendWeights: { icp: 60, ai: 40 },
  icpThresholds: { excellent: 80, strong: 50, medium: 20 },
  finalThresholds: { excellent: 80, strong: 50, medium: 20 },
};

const SCORING_PRESETS = [
  {
    key: 'balanced',
    label: 'Balanced',
    description: 'Stable blend for mixed outbound pipelines.',
    blendWeights: { icp: 60, ai: 40 },
  },
  {
    key: 'icp_first',
    label: 'ICP-first',
    description: 'Stricter fit before intent boosting.',
    blendWeights: { icp: 80, ai: 20 },
  },
  {
    key: 'intent_first',
    label: 'Intent-first',
    description: 'More reactive to internet buying signals.',
    blendWeights: { icp: 45, ai: 55 },
  },
];


const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toNumberOrFallback = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const normalizeThresholds = (rawThresholds = DEFAULT_SCORING_SETTINGS.icpThresholds) => {
  const excellent = clamp(Math.round(toNumberOrFallback(rawThresholds.excellent, 80)), 0, 100);
  const strong = clamp(Math.round(toNumberOrFallback(rawThresholds.strong, 50)), 0, excellent);
  const medium = clamp(Math.round(toNumberOrFallback(rawThresholds.medium, 20)), 0, strong);

  return { excellent, strong, medium };
};

const normalizeBlendWeights = (rawBlend = DEFAULT_SCORING_SETTINGS.blendWeights) => {
  const icpRaw = clamp(toNumberOrFallback(rawBlend.icp, 60), 0, 100);
  const aiRaw = clamp(toNumberOrFallback(rawBlend.ai, 40), 0, 100);
  const sum = icpRaw + aiRaw;

  if (sum <= 0) {
    return { icp: 60, ai: 40 };
  }

  const icp = Math.round((icpRaw / sum) * 100);
  const ai = 100 - icp;

  return { icp, ai };
};

const getCategoryLabel = (score, thresholds) => {
  const value = Number(score);
  if (!Number.isFinite(value)) return 'n/a';

  if (value >= thresholds.excellent) return 'Excellent';
  if (value >= thresholds.strong) return 'Strong';
  if (value >= thresholds.medium) return 'Medium';
  return 'Low';
};

const createScoringSettingsFromProfile = (profile) => {
  const meta = profile?.weights?.meta || {};

  const rawIcpThresholds = meta.icpThresholds || meta.thresholds?.icp || DEFAULT_SCORING_SETTINGS.icpThresholds;
  const rawFinalThresholds = meta.finalThresholds || meta.thresholds?.final || DEFAULT_SCORING_SETTINGS.finalThresholds;

  return {
    blendWeights: normalizeBlendWeights(meta.finalScoreWeights || DEFAULT_SCORING_SETTINGS.blendWeights),
    icpThresholds: normalizeThresholds(rawIcpThresholds),
    finalThresholds: normalizeThresholds(rawFinalThresholds),
  };
};

const ScoringNumberInput = ({ label, value, onChange, disabled, min = 0, max = 100 }) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <Input
      type="number"
      min={min}
      max={max}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  </div>
);

export default function Settings() {
  const { user, appPublicSettings } = useAuth();
  const queryClient = useQueryClient();
  const [isSavingScoring, setIsSavingScoring] = useState(false);
  const [scoringDirty, setScoringDirty] = useState(false);
  const [scoringForm, setScoringForm] = useState(DEFAULT_SCORING_SETTINGS);

  const { data: icpProfiles = [] } = useQuery({
    queryKey: ['icpConfig'],
    queryFn: () => dataClient.icp.list(),
  });

  const { data: integrationStatus = {} } = useQuery({
    queryKey: ['integrationStatus'],
    queryFn: () => dataClient.workspace.getIntegrationStatus(),
    staleTime: 60_000,
  });

  const activeIcpProfile = useMemo(
    () => icpProfiles.find((profile) => profile.is_active) || icpProfiles[0] || null,
    [icpProfiles]
  );

  const runtimeStatus = integrationStatus.runtime || {};
  const supabaseStatus = integrationStatus.supabase || {};
  const securityStatus = integrationStatus.security || {};

  const readinessGroups = useMemo(() => {
    const critical = [];
    const optional = [];
    const info = [];

    if (runtimeStatus.dataProvider && runtimeStatus.dataProvider !== 'supabase') {
      critical.push('Data provider is not Supabase yet.');
    }

    if (runtimeStatus.authProvider && runtimeStatus.authProvider !== 'supabase') {
      critical.push('Auth provider is not Supabase yet.');
    }

    if (!integrationStatus.claude) {
      critical.push('Anthropic is not configured, so AI reinforcement is degraded.');
    }

    if (!supabaseStatus.configured) {
      critical.push('Supabase runtime keys are not fully configured.');
    }

    if (runtimeStatus.fallbackReason) {
      critical.push(`Backend is currently falling back: ${runtimeStatus.fallbackReason}.`);
    }

    if (!securityStatus.publicBetaReady) {
      critical.push('Public beta contract is not fully met yet from the current runtime/security config.');
    }

    if (securityStatus.circuit_breaker_open) {
      critical.push('Le circuit breaker LLM est ouvert — le scoring IA est temporairement suspendu. Il se réouvre automatiquement après 60 secondes.');
    }

    if (runtimeStatus.demoBootstrapEnabled) {
      optional.push('Demo bootstrap is still enabled.');
    }

    if (runtimeStatus.apiDocsEnabled) {
      optional.push('API docs are still exposed.');
    }

    if (!securityStatus.trustedOriginsConfigured) {
      optional.push('Trusted origins / CORS are not fully configured for production cookies.');
    }

    if (appPublicSettings?.mode) {
      info.push(`Frontend mode: ${appPublicSettings.mode}.`);
    }
    info.push(`Front fallback: ${dataClient.debug.allowApiFallback ? 'enabled' : 'disabled'}.`);

    return { critical, optional, info };
  }, [appPublicSettings?.mode, integrationStatus.claude, runtimeStatus, securityStatus, securityStatus.circuit_breaker_open, supabaseStatus.configured]);

  const normalizedBlendPreview = useMemo(
    () => normalizeBlendWeights(scoringForm.blendWeights),
    [scoringForm.blendWeights]
  );

  const normalizedIcpThresholdPreview = useMemo(
    () => normalizeThresholds(scoringForm.icpThresholds),
    [scoringForm.icpThresholds]
  );

  const normalizedFinalThresholdPreview = useMemo(
    () => normalizeThresholds(scoringForm.finalThresholds),
    [scoringForm.finalThresholds]
  );

  const previewCategories = useMemo(
    () => ({
      icp55: getCategoryLabel(55, normalizedIcpThresholdPreview),
      icp80: getCategoryLabel(80, normalizedIcpThresholdPreview),
      final45: getCategoryLabel(45, normalizedFinalThresholdPreview),
      final70: getCategoryLabel(70, normalizedFinalThresholdPreview),
    }),
    [normalizedIcpThresholdPreview, normalizedFinalThresholdPreview]
  );

  useEffect(() => {
    const next = createScoringSettingsFromProfile(activeIcpProfile);
    setScoringForm(next);
    setScoringDirty(false);
  }, [activeIcpProfile]);

  const invalidateWorkspaceData = () => {
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['icpConfig'] });
  };

  const updateBlendWeight = (key, rawValue) => {
    setScoringDirty(true);
    setScoringForm((previous) => ({
      ...previous,
      blendWeights: {
        ...previous.blendWeights,
        [key]: rawValue,
      },
    }));
  };

  const updateThreshold = (groupKey, thresholdKey, rawValue) => {
    setScoringDirty(true);
    setScoringForm((previous) => ({
      ...previous,
      [groupKey]: {
        ...previous[groupKey],
        [thresholdKey]: rawValue,
      },
    }));
  };

  const applyPreset = (presetKey) => {
    const preset = SCORING_PRESETS.find((entry) => entry.key === presetKey);
    if (!preset) return;

    setScoringDirty(true);
    setScoringForm((previous) => ({
      ...previous,
      blendWeights: { ...preset.blendWeights },
    }));
  };

  const resetScoringForm = () => {
    setScoringForm(createScoringSettingsFromProfile(activeIcpProfile));
    setScoringDirty(false);
  };

  const saveScoringSettings = async () => {
    if (!activeIcpProfile) {
      toast.error('No active ICP profile found. Create an ICP profile first.');
      return;
    }

    setIsSavingScoring(true);

    try {
      const normalizedBlend = normalizeBlendWeights(scoringForm.blendWeights);
      const normalizedIcpThresholds = normalizeThresholds(scoringForm.icpThresholds);
      const normalizedFinalThresholds = normalizeThresholds(scoringForm.finalThresholds);

      const nextWeights = {
        ...(activeIcpProfile.weights || {}),
        meta: {
          ...(activeIcpProfile.weights?.meta || {}),
          finalScoreWeights: normalizedBlend,
          icpThresholds: normalizedIcpThresholds,
          finalThresholds: normalizedFinalThresholds,
          thresholds: {
            icp: normalizedIcpThresholds,
            final: normalizedFinalThresholds,
          },
        },
      };

      await dataClient.icp.saveActive(
        {
          ...activeIcpProfile,
          weights: nextWeights,
        },
        user?.id || user?.email
      );

      setScoringForm({
        blendWeights: normalizedBlend,
        icpThresholds: normalizedIcpThresholds,
        finalThresholds: normalizedFinalThresholds,
      });
      setScoringDirty(false);
      invalidateWorkspaceData();

      toast.success('Scoring settings saved. New analyses now use these weights and thresholds.');
    } catch (error) {
      console.warn('Failed to save scoring settings', error);
      toast.error(error?.message || 'Failed to save scoring settings');
    } finally {
      setIsSavingScoring(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">Configuration center for ICP, integrations, and workspace options</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-sky/10 to-brand-mint/10 flex items-center justify-center">
                <Target className="w-5 h-5 text-brand-sky" />
              </div>
              <div>
                <CardTitle>ICP Profile</CardTitle>
                <CardDescription>Manage your Ideal Customer Profile and scoring criteria</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 mb-4">Adjust target industries, roles, company size, geography and score weights.</p>
            <Button asChild className="bg-gradient-to-r from-brand-sky to-brand-sky-2 hover:from-brand-sky-2 hover:to-brand-navy-2">
              <Link to={ROUTES.icp}>Configure ICP Profile</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-100 to-blue-100 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <CardTitle>API Keys</CardTitle>
                <CardDescription>Etat réel des connexions nécessaires au scoring et à l'enrichissement</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              {
                key: 'claude',
                label: 'Claude (Anthropic)',
                description: 'Scoring IA, web research, enrichissement signaux',
              },
              {
                key: 'hunter',
                label: 'Hunter.io',
                description: 'Recherche et vérification d\'email',
              },
              {
                key: 'newsApi',
                label: 'NewsAPI',
                description: 'Signaux d\'intention — actualités entreprise',
              },
            ].map(({ key, label, description }, i, arr) => (
              <div
                key={key}
                className={`flex items-center justify-between py-3 ${i < arr.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">{label}</p>
                  <p className="text-xs text-slate-500">{description}</p>
                </div>
                <Badge variant={integrationStatus[key] ? 'default' : 'secondary'} className={integrationStatus[key] ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : ''}>
                  {integrationStatus[key] ? 'Connecté' : 'Non configuré'}
                </Badge>
              </div>
            ))}
            <p className="text-[11px] text-slate-400 pt-1">
              Pour configurer : <code className="bg-slate-100 px-1 rounded text-[10px]">ANTHROPIC_API_KEY</code>,{' '}
              <code className="bg-slate-100 px-1 rounded text-[10px]">HUNTER_API_KEY</code>,{' '}
              <code className="bg-slate-100 px-1 rounded text-[10px]">NEWS_API_KEY</code>
            </p>
            <p className="text-[11px] text-slate-400">
              Hunter et NewsAPI restent optionnels. Anthropic est le connecteur critique pour le scoring IA.
            </p>
          </CardContent>
        </Card>

        {import.meta.env.DEV && <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                <Database className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <CardTitle>Runtime & Backend</CardTitle>
                <CardDescription>Lecture directe du mode actif, de l'auth et de la readiness infra</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Data Provider</p>
                <p className="text-sm font-semibold text-slate-800">{runtimeStatus.activeProvider || runtimeStatus.dataProvider || 'unknown'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Auth Provider</p>
                <p className="text-sm font-semibold text-slate-800">{runtimeStatus.authProvider || 'unknown'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Supabase Keys</p>
                <p className="text-sm font-semibold text-slate-800">{supabaseStatus.configured ? 'Configured' : 'Incomplete'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Node Env</p>
                <p className="text-sm font-semibold text-slate-800">{runtimeStatus.nodeEnv || 'unknown'}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">CSRF</p>
                <p className="text-sm font-semibold text-slate-800">
                  {securityStatus.csrfProtectionEnabled ? securityStatus.csrfMode || 'enabled' : 'disabled'}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Security Headers</p>
                <p className="text-sm font-semibold text-slate-800">
                  {securityStatus.cspEnabled ? 'CSP enabled' : 'CSP missing'}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-500" />
                <p className="text-xs font-semibold text-slate-700">Beta readiness</p>
              </div>
              {readinessGroups.critical.length === 0 ? (
                <p className="text-sm text-emerald-700">No critical runtime blockers detected from the current configuration.</p>
              ) : (
                readinessGroups.critical.map((flag) => (
                  <p key={flag} className="text-sm text-rose-700">• {flag}</p>
                ))
              )}
            </div>

            {readinessGroups.optional.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <p className="text-xs font-semibold text-slate-700">Optional hardening</p>
                </div>
                {readinessGroups.optional.map((flag) => (
                  <p key={flag} className="text-sm text-amber-700">• {flag}</p>
                ))}
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
              <p className="text-xs font-semibold text-slate-700">Technical info</p>
              {readinessGroups.info.map((flag) => (
                <p key={flag} className="text-sm text-slate-600">• {flag}</p>
              ))}
            </div>
          </CardContent>
        </Card>}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-100 to-lime-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <CardTitle>Team & Permissions</CardTitle>
                <CardDescription>Member roles and workspace access model</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-slate-600">Invite flow, role changes, ownership transfer, and safe member removal are available from the Team page.</p>
            <p className="text-xs text-slate-500">Use Team for access management. Use this page to confirm runtime and connector readiness.</p>
          </CardContent>
        </Card>

        {import.meta.env.DEV && <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-200 to-slate-100 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-slate-700" />
              </div>
              <div>
                <CardTitle>Workspace Mode</CardTitle>
                <CardDescription>Current frontend mode and backend connectivity policy</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-slate-700">
              <ShieldCheck className="inline w-4 h-4 mr-1.5" />
              Mode: <span className="font-semibold">{appPublicSettings?.mode || 'mock'}</span>
            </p>
            <p className="text-sm text-slate-500">
              In API mode, data stays strictly backend-sourced. Use mock mode only for local product exploration.
            </p>
            <p className="text-xs text-slate-500">
              Front fallback: <span className="font-semibold">{dataClient.debug.allowApiFallback ? 'enabled' : 'disabled'}</span>
            </p>
          </CardContent>
        </Card>}
      </div>

      <Card className="mt-6 border-amber-200 bg-amber-50/40">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Scoring Settings</CardTitle>
              <CardDescription>
                Tune ICP/AI blend weights and qualification thresholds without touching code.
              </CardDescription>
            </div>
            <div className="text-xs text-slate-500">
              Active profile: <span className="font-semibold">{activeIcpProfile?.name || 'n/a'}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <ScoringNumberInput
              label="ICP Weight (%)"
              value={scoringForm.blendWeights.icp}
              onChange={(value) => updateBlendWeight('icp', value)}
              disabled={isSavingScoring}
            />
            <ScoringNumberInput
              label="AI Weight (%)"
              value={scoringForm.blendWeights.ai}
              onChange={(value) => updateBlendWeight('ai', value)}
              disabled={isSavingScoring}
            />
          </div>

          <p className="text-xs text-slate-500">
            Normalized blend used by analysis: ICP <span className="font-semibold">{normalizedBlendPreview.icp}%</span> + AI{' '}
            <span className="font-semibold">{normalizedBlendPreview.ai}%</span>.
          </p>

          <div className="rounded-md border border-amber-200 bg-white/70 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700">Quick presets</p>
            <div className="flex flex-wrap gap-2">
              {SCORING_PRESETS.map((preset) => (
                <Button
                  key={preset.key}
                  size="sm"
                  variant="outline"
                  disabled={isSavingScoring}
                  onClick={() => applyPreset(preset.key)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {SCORING_PRESETS.map((preset) => `${preset.label}: ${preset.description}`).join(' | ')}
            </p>
          </div>

          <div className="rounded-md border border-amber-200 bg-white/70 p-3 text-xs text-slate-600 space-y-1">
            <p>
              ICP thresholds: Excellent &ge; <span className="font-semibold">{normalizedIcpThresholdPreview.excellent}</span>, Strong &ge; <span className="font-semibold">{normalizedIcpThresholdPreview.strong}</span>, Medium &ge; <span className="font-semibold">{normalizedIcpThresholdPreview.medium}</span>.
            </p>
            <p>
              Final thresholds: Excellent &ge; <span className="font-semibold">{normalizedFinalThresholdPreview.excellent}</span>, Strong &ge; <span className="font-semibold">{normalizedFinalThresholdPreview.strong}</span>, Medium &ge; <span className="font-semibold">{normalizedFinalThresholdPreview.medium}</span>.
            </p>
            <p>
              Preview categories: ICP 55 =&gt; <span className="font-semibold">{previewCategories.icp55}</span>, ICP 80 =&gt; <span className="font-semibold">{previewCategories.icp80}</span>, Final 45 =&gt; <span className="font-semibold">{previewCategories.final45}</span>, Final 70 =&gt; <span className="font-semibold">{previewCategories.final70}</span>.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800">ICP Category Thresholds</h3>
              <div className="grid gap-3 grid-cols-3">
                <ScoringNumberInput
                  label="Excellent >="
                  value={scoringForm.icpThresholds.excellent}
                  onChange={(value) => updateThreshold('icpThresholds', 'excellent', value)}
                  disabled={isSavingScoring}
                />
                <ScoringNumberInput
                  label="Strong >="
                  value={scoringForm.icpThresholds.strong}
                  onChange={(value) => updateThreshold('icpThresholds', 'strong', value)}
                  disabled={isSavingScoring}
                />
                <ScoringNumberInput
                  label="Medium >="
                  value={scoringForm.icpThresholds.medium}
                  onChange={(value) => updateThreshold('icpThresholds', 'medium', value)}
                  disabled={isSavingScoring}
                />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800">Final Category Thresholds (ICP + AI)</h3>
              <div className="grid gap-3 grid-cols-3">
                <ScoringNumberInput
                  label="Excellent >="
                  value={scoringForm.finalThresholds.excellent}
                  onChange={(value) => updateThreshold('finalThresholds', 'excellent', value)}
                  disabled={isSavingScoring}
                />
                <ScoringNumberInput
                  label="Strong >="
                  value={scoringForm.finalThresholds.strong}
                  onChange={(value) => updateThreshold('finalThresholds', 'strong', value)}
                  disabled={isSavingScoring}
                />
                <ScoringNumberInput
                  label="Medium >="
                  value={scoringForm.finalThresholds.medium}
                  onChange={(value) => updateThreshold('finalThresholds', 'medium', value)}
                  disabled={isSavingScoring}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={resetScoringForm} disabled={isSavingScoring || !scoringDirty}>
              Reset
            </Button>
            <Button onClick={saveScoringSettings} disabled={isSavingScoring || !scoringDirty} className="gap-2">
              {isSavingScoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save scoring settings
            </Button>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}










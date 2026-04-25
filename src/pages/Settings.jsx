import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, CreditCard, Database, KeyRound, Loader2, Save, ShieldCheck, Target, Users, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
    labelKey: 'settings.scoring.presets.balanced.label',
    descriptionKey: 'settings.scoring.presets.balanced.description',
    blendWeights: { icp: 60, ai: 40 },
  },
  {
    key: 'icp_first',
    labelKey: 'settings.scoring.presets.icpFirst.label',
    descriptionKey: 'settings.scoring.presets.icpFirst.description',
    blendWeights: { icp: 80, ai: 20 },
  },
  {
    key: 'intent_first',
    labelKey: 'settings.scoring.presets.intentFirst.label',
    descriptionKey: 'settings.scoring.presets.intentFirst.description',
    blendWeights: { icp: 45, ai: 55 },
  },
];

const getLocale = (language) => (String(language || '').toLowerCase().startsWith('fr') ? 'fr-FR' : 'en-GB');
const formatNumber = (value, locale) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? new Intl.NumberFormat(locale).format(parsed) : '0';
};
const formatRunway = (days, t) => {
  if (!days) return t('billing.runwayNoUsage');
  if (days >= 365) return t('billing.runwayLong');
  return t('billing.runwayDays', { count: days });
};

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

const getCategoryLabel = (score, thresholds, t) => {
  const value = Number(score);
  if (!Number.isFinite(value)) return 'n/a';

  if (value >= thresholds.excellent) return t('settings.scoring.categories.excellent');
  if (value >= thresholds.strong) return t('settings.scoring.categories.strong');
  if (value >= thresholds.medium) return t('settings.scoring.categories.medium');
  return t('settings.scoring.categories.low');
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
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [isSavingScoring, setIsSavingScoring] = useState(false);
  const [scoringDirty, setScoringDirty] = useState(false);
  const [scoringForm, setScoringForm] = useState(DEFAULT_SCORING_SETTINGS);
  const [savingFlagName, setSavingFlagName] = useState('');
  const [isLoadingMockDemo, setIsLoadingMockDemo] = useState(false);
  const [isGrantingCredits, setIsGrantingCredits] = useState(false);
  const locale = getLocale(i18n.language);

  const { data: icpProfiles = [] } = useQuery({
    queryKey: ['icpConfig'],
    queryFn: () => dataClient.icp.list(),
  });

  const { data: integrationStatus = {} } = useQuery({
    queryKey: ['integrationStatus'],
    queryFn: () => dataClient.workspace.getIntegrationStatus(),
    staleTime: 60_000,
  });

  const { data: creditsData = null } = useQuery({
    queryKey: ['workspaceCreditsSettings'],
    queryFn: () => dataClient.workspace.getCredits({ limit: 10 }),
    staleTime: 60_000,
  });

  const { data: featureFlagsData = null } = useQuery({
    queryKey: ['workspaceFeatureFlags'],
    queryFn: () => dataClient.workspace.listFeatureFlags(),
    staleTime: 30_000,
  });

  const { data: devCheckup = null, isError: devCheckupError } = useQuery({
    queryKey: ['devCheckup'],
    queryFn: () => dataClient.dev.checkup(),
    enabled: import.meta.env.DEV,
    retry: 1,
    staleTime: 60_000,
  });

  const activeIcpProfile = useMemo(
    () => icpProfiles.find((profile) => profile.is_active) || icpProfiles[0] || null,
    [icpProfiles]
  );

  const runtimeStatus = integrationStatus.runtime || {};
  const supabaseStatus = integrationStatus.supabase || {};
  const securityStatus = integrationStatus.security || {};
  const usage = creditsData?.usage || {};
  const entitlements = creditsData?.entitlements || {};
  const planSlug = creditsData?.plan?.plan_slug ?? entitlements?.plan_slug ?? 'free';
  const planName = t(`billing.planNames.${planSlug}`, {
    defaultValue: entitlements?.plan_name || planSlug,
  });
  const balance = creditsData?.balance ?? null;
  const seatsIncluded = entitlements?.seats_included ?? usage?.seats_included ?? 1;
  const seatsUsed = usage?.seats_used ?? 1;
  const seatsRemaining = usage?.seats_remaining ?? Math.max(0, seatsIncluded - seatsUsed);
  const pendingInvites = usage?.pending_invites ?? 0;
  const crmSlotsIncluded = usage?.crm_slots_included ?? entitlements?.crm_integrations ?? 0;
  const crmSlotsUsed = usage?.crm_slots_used ?? 0;
  const crmSlotsRemaining = usage?.crm_slots_remaining ?? Math.max(0, crmSlotsIncluded - crmSlotsUsed);
  const runwayDays = usage?.projected_runway_days ?? null;
  const featureFlags = featureFlagsData?.flags || [];
  const canManageFeatureFlags = Boolean(featureFlagsData?.can_manage);

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
      icp55: getCategoryLabel(55, normalizedIcpThresholdPreview, t),
      icp80: getCategoryLabel(80, normalizedIcpThresholdPreview, t),
      final45: getCategoryLabel(45, normalizedFinalThresholdPreview, t),
      final70: getCategoryLabel(70, normalizedFinalThresholdPreview, t),
    }),
    [normalizedIcpThresholdPreview, normalizedFinalThresholdPreview, t]
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
      toast.error(t('settings.scoring.noActiveProfile'));
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

      toast.success(t('settings.scoring.toasts.saved'));
    } catch (error) {
      console.warn('Failed to save scoring settings', error);
      toast.error(error?.message || t('settings.scoring.toasts.failed'));
    } finally {
      setIsSavingScoring(false);
    }
  };

  const updateFeatureFlag = async (flagName, nextEnabled) => {
    setSavingFlagName(flagName);
    try {
      const updated = await dataClient.workspace.updateFeatureFlag(flagName, nextEnabled);
      queryClient.setQueryData(['workspaceFeatureFlags'], (previous) => {
        if (!previous?.flags) return previous;
        return {
          ...previous,
          flags: previous.flags.map((flag) =>
            flag.flag_name === flagName
              ? {
                  ...flag,
                  ...updated,
                }
              : flag
          ),
        };
      });
      toast.success(
        nextEnabled
          ? t('settings.featureFlags.toasts.enabled', { flag: updated.label || flagName })
          : t('settings.featureFlags.toasts.disabled', { flag: updated.label || flagName })
      );
    } catch (error) {
      console.warn('Failed to update feature flag', error);
      toast.error(error?.message || t('settings.featureFlags.toasts.failed'));
    } finally {
      setSavingFlagName('');
    }
  };

  const handleLoadMockDemo = async () => {
    setIsLoadingMockDemo(true);
    try {
      const result = await dataClient.workspace.loadSampleData();
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(
        result?.already_seeded
          ? t('onboarding.toasts.sampleAlreadyReady', { defaultValue: 'Les données de démonstration sont déjà chargées.' })
          : t('onboarding.toasts.sampleLoaded', { defaultValue: '{{count}} leads de démonstration chargés.', count: result?.inserted || 0 })
      );
    } catch (error) {
      console.warn('Failed to load mock demo data', error);
      toast.error(error?.message || t('onboarding.toasts.sampleLoadFailed', { defaultValue: 'Impossible de charger les données de démonstration.' }));
    } finally {
      setIsLoadingMockDemo(false);
    }
  };

  const handleGrantCredits = async () => {
    setIsGrantingCredits(true);
    try {
      const result = await dataClient.workspace.grantCredits({ amount: 150, description: 'Manual top-up from settings' });
      queryClient.invalidateQueries({ queryKey: ['workspaceCreditsSettings'] });
      toast.success(`+150 credits added. New balance: ${result?.new_balance ?? '—'}`);
    } catch (error) {
      console.warn('Failed to grant credits', error);
      toast.error(error?.message || 'Failed to add credits.');
    } finally {
      setIsGrantingCredits(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1160px]">
      <div className="mb-8 rounded-xl border border-[#e6e4df] bg-white px-5 py-4 shadow-sm">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          {t('settings.eyebrow', { defaultValue: 'Contrôle workspace' })}
        </p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#1a1200]">{t('settings.pageTitle')}</h1>
        <p className="text-slate-500 mt-1">{t('settings.pageSubtitle')}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-sky/10 to-brand-mint/10 flex items-center justify-center">
                <Target className="w-5 h-5 text-brand-sky" />
              </div>
              <div>
                <CardTitle>{t('settings.cards.icp.title')}</CardTitle>
                <CardDescription>{t('settings.cards.icp.description')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 mb-4">{t('settings.cards.icp.body')}</p>
            <Button asChild className="bg-gradient-to-r from-brand-sky to-brand-sky-2 hover:from-brand-sky-2 hover:to-brand-navy-2">
              <Link to={ROUTES.icp}>{t('settings.cards.icp.action')}</Link>
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
                <CardTitle>{t('settings.cards.api.title')}</CardTitle>
                <CardDescription>{t('settings.cards.api.description')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              {
                key: 'claude',
                label: t('settings.cards.api.providers.claude.label'),
                description: t('settings.cards.api.providers.claude.description'),
              },
              {
                key: 'hunter',
                label: t('settings.cards.api.providers.hunter.label'),
                description: t('settings.cards.api.providers.hunter.description'),
              },
              {
                key: 'newsApi',
                label: t('settings.cards.api.providers.newsApi.label'),
                description: t('settings.cards.api.providers.newsApi.description'),
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
                  {integrationStatus[key] ? t('settings.cards.api.connected') : t('settings.cards.api.notConfigured')}
                </Badge>
              </div>
            ))}
            <p className="text-[11px] text-slate-400 pt-1">
              {t('settings.cards.api.configureHint')} <code className="bg-slate-100 px-1 rounded text-[10px]">ANTHROPIC_API_KEY</code>,{' '}
              <code className="bg-slate-100 px-1 rounded text-[10px]">HUNTER_API_KEY</code>,{' '}
              <code className="bg-slate-100 px-1 rounded text-[10px]">NEWS_API_KEY</code>
            </p>
            <p className="text-[11px] text-slate-400">
              {t('settings.cards.api.footer')}
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
                <CardTitle>{t('settings.cards.team.title')}</CardTitle>
                <CardDescription>{t('settings.cards.team.description')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {t('settings.livePlan.teamCapacityLabel')}
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {t('team.seats.summary', {
                  used: seatsUsed,
                  pending: pendingInvites,
                  total: seatsIncluded,
                })}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {seatsRemaining > 0
                  ? t('team.seats.remaining', { count: seatsRemaining })
                  : t('team.seats.limitReached')}
              </p>
            </div>
            <p className="text-sm text-slate-600">{t('settings.livePlan.teamBody')}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to={ROUTES.team}>{t('settings.livePlan.manageTeam')}</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link to={ROUTES.crmIntegration}>{t('settings.livePlan.manageCrm')}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {import.meta.env.DEV && <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-200 to-slate-100 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-slate-700" />
              </div>
              <div>
              <CardTitle>{t('settings.dev.workspaceMode.title', { defaultValue: 'Mode workspace' })}</CardTitle>
              <CardDescription>{t('settings.dev.workspaceMode.description', { defaultValue: 'Mode frontend actuel et politique de connexion backend' })}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-slate-700">
              <ShieldCheck className="inline w-4 h-4 mr-1.5" />
              {t('settings.dev.workspaceMode.mode', { defaultValue: 'Mode' })}: <span className="font-semibold">{appPublicSettings?.mode || 'mock'}</span>
            </p>
            <p className="text-sm text-slate-500">
              {t('settings.dev.workspaceMode.apiPolicy', { defaultValue: 'En mode API, les données restent servies par le backend. Le mode mock sert à explorer le produit localement.' })}
            </p>
            <p className="text-xs text-slate-500">
              {t('settings.dev.workspaceMode.fallback', { defaultValue: 'Fallback front' })}: <span className="font-semibold">{dataClient.debug.allowApiFallback ? t('common.enabled') : t('common.disabled')}</span>
            </p>
          </CardContent>
        </Card>}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <CardTitle>{t('settings.cards.billing.title')}</CardTitle>
                <CardDescription>{t('settings.cards.billing.description')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {t('settings.livePlan.planLabel')}
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{planName}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {balance === null
                    ? t('settings.livePlan.balanceLoading')
                    : t('settings.livePlan.balanceSummary', {
                        count: formatNumber(balance, locale),
                      })}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {t('settings.livePlan.runwayLabel')}
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{formatRunway(runwayDays, t)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {t('settings.livePlan.crmSummary', {
                    used: crmSlotsUsed,
                    total: crmSlotsIncluded,
                    remaining: crmSlotsRemaining,
                  })}
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600">{t('settings.livePlan.billingBody')}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to={ROUTES.billing}>{t('settings.livePlan.manageBilling')}</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link to={ROUTES.pricing}>{t('settings.livePlan.comparePlans')}</Link>
              </Button>
              <Button
                variant="outline"
                onClick={handleGrantCredits}
                disabled={isGrantingCredits}
                className="gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                {isGrantingCredits ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                {t('settings.livePlan.grantCredits', { defaultValue: '+ 150 crédits' })}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {import.meta.env.DEV && <Card className="mt-6 border-blue-300 bg-blue-50 min-h-[260px]">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-200 to-cyan-200 flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-blue-700" />
            </div>
            <div>
              <CardTitle className="text-blue-900">{t('settings.dev.mockData.title', { defaultValue: 'Outils dev - Données mock' })}</CardTitle>
              <CardDescription className="text-blue-700">{t('settings.dev.mockData.description', { defaultValue: 'Chargez un set de démonstration sans Internet.' })}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 flex h-full flex-col justify-between">
          <div className="space-y-3">
            {devCheckupError && dataClient.mode !== 'mock' && (
              <div className="rounded-lg border border-orange-300 bg-orange-50 p-3">
                <p className="text-sm font-semibold text-orange-900">
                  {t('settings.dev.mockData.backendUnavailableTitle', { defaultValue: 'Backend indisponible' })}
                </p>
                <p className="text-xs text-orange-800 mt-1">
                  {t('settings.dev.mockData.backendUnavailableBody', { defaultValue: 'Le checkup backend local ne répond pas, mais les données mock frontend restent disponibles.' })}
                </p>
              </div>
            )}
          </div>
          <div>
            <Button
              onClick={handleLoadMockDemo}
              disabled={isLoadingMockDemo}
              className={`w-full font-semibold py-2 px-4 text-base gap-2 ${
                'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
              title={t('settings.dev.mockData.buttonTitle', { defaultValue: 'Charger des leads de démonstration' })}
            >
              {isLoadingMockDemo ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t('settings.dev.mockData.loading', { defaultValue: 'Chargement...' })}
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5" />
                  {t('settings.dev.mockData.import', { defaultValue: 'Importer les leads de démo' })}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>}

      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-100 to-violet-100 flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-sky-700" />
            </div>
            <div>
              <CardTitle>{t('settings.featureFlags.title')}</CardTitle>
              <CardDescription>{t('settings.featureFlags.subtitle')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">{t('settings.featureFlags.body')}</p>
          {!canManageFeatureFlags ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              {t('settings.featureFlags.readOnly')}
            </div>
          ) : null}

          <div className="space-y-3">
            {featureFlags.map((flag) => {
              const isSaving = savingFlagName === flag.flag_name;
              return (
                <div
                  key={flag.flag_name}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{flag.label}</p>
                        <Badge variant={flag.enabled ? 'default' : 'secondary'}>
                          {flag.enabled ? t('common.enabled') : t('common.disabled')}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {flag.category}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600">{flag.description}</p>
                      <p className="text-xs text-slate-400">
                        {t('settings.featureFlags.defaultState', {
                          state: flag.default_enabled ? t('common.enabled') : t('common.disabled'),
                        })}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                      <Checkbox
                        checked={Boolean(flag.enabled)}
                        disabled={!canManageFeatureFlags || isSaving}
                        onCheckedChange={(checked) => updateFeatureFlag(flag.flag_name, Boolean(checked))}
                        aria-label={t('settings.featureFlags.toggleAria', { flag: flag.label })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 border-amber-200 bg-amber-50/40">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>{t('settings.scoring.title')}</CardTitle>
              <CardDescription>
                {t('settings.scoring.subtitle')}
              </CardDescription>
            </div>
            <div className="text-xs text-slate-500">
              {t('settings.scoring.activeProfile')} <span className="font-semibold">{activeIcpProfile?.name || 'n/a'}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <ScoringNumberInput
              label={t('settings.scoring.fields.icpWeight')}
              value={scoringForm.blendWeights.icp}
              onChange={(value) => updateBlendWeight('icp', value)}
              disabled={isSavingScoring}
            />
            <ScoringNumberInput
              label={t('settings.scoring.fields.aiWeight')}
              value={scoringForm.blendWeights.ai}
              onChange={(value) => updateBlendWeight('ai', value)}
              disabled={isSavingScoring}
            />
          </div>

          <p className="text-xs text-slate-500">
            {t('settings.scoring.blendSummary', {
              icp: normalizedBlendPreview.icp,
              ai: normalizedBlendPreview.ai,
            })}
          </p>

          <div className="rounded-md border border-amber-200 bg-white/70 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700">{t('settings.scoring.quickPresets')}</p>
            <div className="flex flex-wrap gap-2">
              {SCORING_PRESETS.map((preset) => (
                <Button
                  key={preset.key}
                  size="sm"
                  variant="outline"
                  disabled={isSavingScoring}
                  onClick={() => applyPreset(preset.key)}
                >
                  {t(preset.labelKey)}
                </Button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {SCORING_PRESETS.map((preset) => `${t(preset.labelKey)}: ${t(preset.descriptionKey)}`).join(' | ')}
            </p>
          </div>

          <div className="rounded-md border border-amber-200 bg-white/70 p-3 text-xs text-slate-600 space-y-1">
            <p>
              {t('settings.scoring.icpThresholdPreview', {
                excellent: normalizedIcpThresholdPreview.excellent,
                strong: normalizedIcpThresholdPreview.strong,
                medium: normalizedIcpThresholdPreview.medium,
              })}
            </p>
            <p>
              {t('settings.scoring.finalThresholdPreview', {
                excellent: normalizedFinalThresholdPreview.excellent,
                strong: normalizedFinalThresholdPreview.strong,
                medium: normalizedFinalThresholdPreview.medium,
              })}
            </p>
            <p>
              {t('settings.scoring.previewCategories', {
                icp55: previewCategories.icp55,
                icp80: previewCategories.icp80,
                final45: previewCategories.final45,
                final70: previewCategories.final70,
              })}
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800">{t('settings.scoring.icpCategoryThresholds')}</h3>
              <div className="grid gap-3 grid-cols-3">
                <ScoringNumberInput
                  label={t('settings.scoring.fields.excellent')}
                  value={scoringForm.icpThresholds.excellent}
                  onChange={(value) => updateThreshold('icpThresholds', 'excellent', value)}
                  disabled={isSavingScoring}
                />
                <ScoringNumberInput
                  label={t('settings.scoring.fields.strong')}
                  value={scoringForm.icpThresholds.strong}
                  onChange={(value) => updateThreshold('icpThresholds', 'strong', value)}
                  disabled={isSavingScoring}
                />
                <ScoringNumberInput
                  label={t('settings.scoring.fields.medium')}
                  value={scoringForm.icpThresholds.medium}
                  onChange={(value) => updateThreshold('icpThresholds', 'medium', value)}
                  disabled={isSavingScoring}
                />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800">{t('settings.scoring.finalCategoryThresholds')}</h3>
              <div className="grid gap-3 grid-cols-3">
                <ScoringNumberInput
                  label={t('settings.scoring.fields.excellent')}
                  value={scoringForm.finalThresholds.excellent}
                  onChange={(value) => updateThreshold('finalThresholds', 'excellent', value)}
                  disabled={isSavingScoring}
                />
                <ScoringNumberInput
                  label={t('settings.scoring.fields.strong')}
                  value={scoringForm.finalThresholds.strong}
                  onChange={(value) => updateThreshold('finalThresholds', 'strong', value)}
                  disabled={isSavingScoring}
                />
                <ScoringNumberInput
                  label={t('settings.scoring.fields.medium')}
                  value={scoringForm.finalThresholds.medium}
                  onChange={(value) => updateThreshold('finalThresholds', 'medium', value)}
                  disabled={isSavingScoring}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={resetScoringForm} disabled={isSavingScoring || !scoringDirty}>
              {t('settings.scoring.actions.reset')}
            </Button>
            <Button onClick={saveScoringSettings} disabled={isSavingScoring || !scoringDirty} className="gap-2">
              {isSavingScoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('settings.scoring.actions.save')}
            </Button>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}





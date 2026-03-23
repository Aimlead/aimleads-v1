import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Copy, Database, KeyRound, Loader2, Puzzle, RefreshCw, Save, Settings2, ShieldCheck, Target, Users } from 'lucide-react';
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

const buildSchemaFixSql = (unsupportedUserColumns = [], unsupportedLeadColumns = []) => {
  const userColumns = Array.isArray(unsupportedUserColumns) ? unsupportedUserColumns : [];
  const leadColumns = Array.isArray(unsupportedLeadColumns) ? unsupportedLeadColumns : [];
  const lines = [];

  if (userColumns.includes('supabase_auth_id')) {
    lines.push(
      '-- users.supabase_auth_id fix',
      'alter table if exists users add column if not exists supabase_auth_id text;',
      'create unique index if not exists idx_users_supabase_auth_id on users(supabase_auth_id);',
      'alter table if exists users alter column password_hash drop not null;',
      ''
    );
  }

  if (leadColumns.includes('internet_signals') || leadColumns.includes('auto_signal_metadata')) {
    lines.push(
      '-- leads signal columns fix',
      'alter table if exists leads',
      '  add column if not exists internet_signals jsonb,',
      '  add column if not exists auto_signal_metadata jsonb;',
      ''
    );
  }

  if (lines.length === 0) {
    return '-- No schema fix required based on current diagnostics.';
  }

  return lines.join('\n').trim();
};
const formatValue = (value) => {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'number') return String(Math.round(value * 100) / 100);
  return String(value);
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
  const [busyAction, setBusyAction] = useState('');
  const [checkup, setCheckup] = useState(null);
  const [isSavingScoring, setIsSavingScoring] = useState(false);
  const [scoringDirty, setScoringDirty] = useState(false);
  const [scoringForm, setScoringForm] = useState(DEFAULT_SCORING_SETTINGS);
  const showDeveloperTools = useMemo(() => {
    if (import.meta.env.DEV) return true;
    if (typeof window === 'undefined') return false;

    const hostname = String(window.location.hostname || '').trim().toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
  }, []);

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

  const runCheckup = async () => {
    const result = await dataClient.dev.checkup();
    setCheckup(result);
    return result;
  };

  const unsupportedUserColumns = useMemo(
    () => (Array.isArray(checkup?.schema_diagnostics?.unsupported_user_columns) ? checkup.schema_diagnostics.unsupported_user_columns : []),
    [checkup]
  );

  const unsupportedLeadColumns = useMemo(
    () => (Array.isArray(checkup?.schema_diagnostics?.unsupported_lead_columns) ? checkup.schema_diagnostics.unsupported_lead_columns : []),
    [checkup]
  );

  const hasSchemaMismatch = unsupportedUserColumns.length > 0 || unsupportedLeadColumns.length > 0;
  const schemaFixSql = useMemo(
    () => buildSchemaFixSql(unsupportedUserColumns, unsupportedLeadColumns),
    [unsupportedUserColumns, unsupportedLeadColumns]
  );

  const copySchemaFixSql = async () => {
    try {
      if (!navigator?.clipboard?.writeText) {
        toast.error('Clipboard API unavailable in this browser.');
        return;
      }
      await navigator.clipboard.writeText(schemaFixSql);
      toast.success('SQL fix copied. Paste it in Supabase SQL Editor and run.');
    } catch (error) {
      toast.error('Unable to copy SQL fix.');
      console.warn('copySchemaFixSql failed', error);
    }
  };

  useEffect(() => {
    if (dataClient.mode !== 'api') return;
    runCheckup().catch(() => {});
  }, []);

  const runAction = async (actionKey, action) => {
    setBusyAction(actionKey);
    try {
      const result = await action();
      invalidateWorkspaceData();
      if (result?.checkup) {
        setCheckup(result.checkup);
      } else {
        await runCheckup();
      }
      return result;
    } catch (error) {
      const message = error?.message || 'Action failed';
      toast.error(message);
      console.warn(`Dev action failed (${actionKey})`, error);
      throw error;
    } finally {
      setBusyAction('');
    }
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
        <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
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
                <CardDescription>Clés API actives pour le scoring et l'enrichissement</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                <Puzzle className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <CardTitle>Integrations</CardTitle>
                <CardDescription>Connect CRM, enrichment, and outbound tools</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500">Coming next: HubSpot, Pipedrive, and webhook connectors.</p>
          </CardContent>
        </Card>

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
          <CardContent>
            <p className="text-sm text-slate-500">Invite flow and role changes now live from the Team page. Seat limits and safe offboarding still need a dedicated platform flow.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-200 to-slate-100 flex items-center justify-center">
                <Settings2 className="w-5 h-5 text-slate-700" />
              </div>
              <div>
                <CardTitle>Runtime Mode</CardTitle>
                <CardDescription>Current data mode and backend connectivity</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-slate-700">
              <ShieldCheck className="inline w-4 h-4 mr-1.5" />
              Mode: <span className="font-semibold">{appPublicSettings?.mode || 'mock'}</span>
            </p>
            <p className="text-sm text-slate-500">
              In API mode, data stays strictly backend-sourced. Use mock data only with VITE_DATA_MODE=mock.
            </p>
            <p className="text-xs text-slate-500">
              Front fallback: <span className="font-semibold">{dataClient.debug.allowApiFallback ? 'enabled' : 'disabled'}</span>
            </p>
          </CardContent>
        </Card>
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
              <div className="grid gap-3 md:grid-cols-3">
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
              <div className="grid gap-3 md:grid-cols-3">
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

      {showDeveloperTools ? (
        <Card className="mt-6 border-brand-sky/20 bg-brand-sky/5/40">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-sky/10 to-brand-sky/20 flex items-center justify-center">
              <Database className="w-5 h-5 text-brand-sky" />
            </div>
            <div>
              <CardTitle>Dev Tools</CardTitle>
              <CardDescription>One-click test data actions for your current workspace</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">
            Useful to recover the Mantra dataset and rerun scoring without terminal commands.
          </p>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={Boolean(busyAction)}
              onClick={() =>
                runAction('demo', async () => {
                  const result = await dataClient.dev.loadDemo();
                  toast.success(`Demo data ready. Total leads in workspace: ${result?.total ?? 'n/a'}`);
                  return result;
                })
              }
            >
              {busyAction === 'demo' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Load Demo Data
            </Button>

            <Button
              className="bg-gradient-to-r from-brand-sky to-brand-mint hover:from-brand-sky-2 hover:to-brand-mint"
              disabled={Boolean(busyAction)}
              onClick={() =>
                runAction('mantra', async () => {
                  const result = await dataClient.dev.loadMantra();
                  toast.success(
                    `Mantra loaded: ${result?.imported ?? 0} imported, ${result?.analyzed ?? 0} analyzed (total ${result?.total_tagged ?? 0}).`
                  );
                  return result;
                })
              }
            >
              {busyAction === 'mantra' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Load Mantra (174)
            </Button>

            <Button
              variant="secondary"
              disabled={Boolean(busyAction)}
              onClick={() =>
                runAction('reanalyze', async () => {
                  const result = await dataClient.dev.reanalyze();
                  toast.success(`Re-analysis done: ${result?.analyzed ?? 0} leads updated.`);
                  return result;
                })
              }
            >
              {busyAction === 'reanalyze' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Re-analyze Workspace
            </Button>

            <Button
              variant="outline"
              disabled={Boolean(busyAction)}
              onClick={() =>
                runAction('checkup', async () => {
                  const result = await runCheckup();
                  toast.success('Checkup refreshed.');
                  return { checkup: result };
                })
              }
            >
              {busyAction === 'checkup' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Run Checkup
            </Button>
          </div>

          {checkup ? (
            <div className="rounded-lg border border-brand-sky/15 bg-white/80 p-4 text-sm text-slate-700 space-y-2">
              <p>
                Provider actif: <span className="font-semibold">{formatValue(checkup.runtime_provider)}</span>
                {' '}| Configure: <span className="font-semibold">{formatValue(checkup.configured_provider || checkup.runtime_provider)}</span>
                {' '}| Active ICP: <span className="font-semibold">{formatValue(checkup.active_icp?.name)}</span>
              </p>
              {String(checkup.runtime_provider || '').includes('fallback') ? (
                <p className="text-amber-700">
                  Backend en fallback local: Supabase indisponible au runtime. Verifie SUPABASE_URL / key / reseau.
                </p>
              ) : null}

              {unsupportedUserColumns.length > 0 ? (
                <p className="text-amber-700">
                  Schema users incomplet ({unsupportedUserColumns.join(', ')}). Lance la migration
                  <span className="font-semibold"> 20260318_auth_native_supabase.sql</span>.
                </p>
              ) : null}

              {unsupportedLeadColumns.length > 0 ? (
                <p className="text-amber-700">
                  Schema leads incomplet ({unsupportedLeadColumns.join(', ')}). Verifie schema.sql + migrations.
                </p>
              ) : null}

              {hasSchemaMismatch ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <p className="text-amber-800 font-medium">Supabase fix required: copy and run SQL in SQL Editor.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={copySchemaFixSql} className="gap-2">
                      <Copy className="w-4 h-4" />
                      Copy SQL fix
                    </Button>
                  </div>
                  <pre className="text-xs text-slate-700 bg-white/70 rounded border p-2 overflow-x-auto">{schemaFixSql}</pre>
                </div>
              ) : null}

              <p>
                Leads workspace: <span className="font-semibold">{formatValue(checkup.counts?.workspace_leads_total)}</span> | Mantra tagged:{' '}
                <span className="font-semibold">{formatValue(checkup.counts?.mantra_tagged_total)}</span> | Mantra analyzed:{' '}
                <span className="font-semibold">{formatValue(checkup.counts?.mantra_analyzed_total)}</span>
              </p>
              <p>
                Avg Mantra ICP: <span className="font-semibold">{formatValue(checkup.averages?.mantra_icp_score_avg)}</span> | Avg Mantra AI:{' '}
                <span className="font-semibold">{formatValue(checkup.averages?.mantra_ai_score_avg)}</span> | Avg Mantra Final:{' '}
                <span className="font-semibold">{formatValue(checkup.averages?.mantra_final_score_avg)}</span>
              </p>
              {Array.isArray(checkup.warnings) && checkup.warnings.length > 0 ? (
                <div className="text-amber-700">
                  {checkup.warnings.map((warning) => (
                    <p key={warning}>- {warning}</p>
                  ))}
                </div>
              ) : (
                <p className="text-emerald-700">No coherence warning detected.</p>
              )}
            </div>
          ) : null}

          <p className="text-xs text-slate-500">
            Available only outside production. Actions apply to the currently logged-in workspace.
          </p>
        </CardContent>
        </Card>
      ) : null}
    </div>
  );
}










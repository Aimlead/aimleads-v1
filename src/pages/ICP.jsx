import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, Building2, Edit, Globe, Loader2, MapPin, Plus, Save, Sliders, Sparkles, Target, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from 'react-i18next';
import { createDefaultIcpFormData } from '@/lib/icpProfile';
import { dataClient } from '@/services/dataClient';

const SECTION_DEFAULTS = {
  industrie: { weight: 100, scores: { parfait: 30, partiel: 15, aucun: -30, exclu: -100 } },
  roles: { weight: 100, scores: { parfait: 25, partiel: 10, exclu: -100, aucun: -25 } },
  typeClient: { weight: 100, scores: { parfait: 25, partiel: 10, aucun: -40 } },
  structure: { weight: 100, scores: { parfait: 15, partiel: 10, aucun: -20 } },
  geo: { weight: 100, scores: { parfait: 15, partiel: 5, aucun: -10 } },
};

const getIcpGenerationErrorMessage = (error, t) => {
  const message = String(error?.message || '').toLowerCase();

  if (message.includes('credit balance is too low') || message.includes('credit') || message.includes('billing')) {
    return t('icp.errors.credit');
  }

  if (message.includes('anthropic_api_key') || message.includes('api key') || message.includes('not configured')) {
    return t('icp.errors.apiKey');
  }

  if (message.includes('circuit breaker')) {
    return t('icp.errors.circuitBreaker');
  }

  return error?.message || t('icp.errors.generic');
};

function TagInput({ label, values = [], onChange, placeholder, disabled, variant = 'default' }) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');

  const variantStyles = {
    default: 'bg-brand-sky/5 text-brand-sky border-brand-sky/20',
    secondary: 'bg-sky-50 text-sky-700 border-sky-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  const addTag = () => {
    const next = inputValue.trim();
    if (!next || values.includes(next)) return;
    onChange([...values, next]);
    setInputValue('');
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-slate-700">{label}</Label>
      <div className="flex gap-2">
        <Input
          value={inputValue}
          disabled={disabled}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder}
          className="flex-1 h-9"
        />
        <Button type="button" variant="outline" size="sm" disabled={disabled || !inputValue.trim()} onClick={addTag} className="h-9">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {values.map((value) => (
            <span
              key={value}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${variantStyles[variant]}`}
            >
              {value}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(values.filter((item) => item !== value))}
                  className="hover:opacity-60 transition-opacity"
                  aria-label={t('icp.removeTag', { defaultValue: 'Remove {{value}}', value })}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function WeightSlider({ label, value, onChange, disabled, description }) {
  const { t } = useTranslation();
  const color = value >= 80 ? 'text-emerald-600' : value >= 50 ? 'text-amber-600' : 'text-rose-500';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-slate-700">{label}</Label>
        <span className={`text-sm font-bold tabular-nums ${color}`}>{value}%</span>
      </div>
      {description && <p className="text-xs text-slate-500">{description}</p>}
      <Slider
        value={[value]}
        min={0}
        max={150}
        step={5}
        disabled={disabled}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{t('icp.weightScale.ignored')}</span>
        <span>{t('icp.weightScale.normal')}</span>
        <span>{t('icp.weightScale.critical')}</span>
      </div>
    </div>
  );
}

function SectionCard({ icon: Icon, title, color, children }) {
  return (
    <Card className="border border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className={`w-7 h-7 rounded-lg ${color} flex items-center justify-center`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

export default function ICP() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(createDefaultIcpFormData());
  const [genOpen, setGenOpen] = useState(false);
  const [genDescription, setGenDescription] = useState('');
  const [generateError, setGenerateError] = useState('');

  const generateMutation = useMutation({
    mutationFn: (description) => dataClient.icp.generateIcp(description),
    onSuccess: (data) => {
      if (!data) {
        const message = t('icp.toasts.generateUnavailable');
        setGenerateError(message);
        toast.error(message);
        return;
      }
      setGenerateError('');
      setFormData((previous) => ({
        ...previous,
        name: data.name || previous.name,
        description: data.description || previous.description,
        weights: {
          ...createDefaultIcpFormData().weights,
          ...data.weights,
        },
      }));
      setEditing(true);
      setGenOpen(false);
      setGenDescription('');
      toast.success(t('icp.toasts.generated', { name: data.name }));
    },
    onError: (error) => {
      const message = getIcpGenerationErrorMessage(error, t);
      setGenerateError(message);
      toast.error(message);
    },
  });

  const { data: icpProfiles = [], isLoading } = useQuery({
    queryKey: ['icpConfig'],
    queryFn: () => dataClient.icp.list(),
  });

  const activeProfile = useMemo(
    () => icpProfiles.find((profile) => profile.is_active) || icpProfiles[0] || null,
    [icpProfiles]
  );

  useEffect(() => {
    if (activeProfile) {
      const defaults = createDefaultIcpFormData().weights;
      const merged = {
        name: activeProfile.name || t('icp.defaults.profileName'),
        description: activeProfile.description || '',
        id: activeProfile.id,
        weights: {
          industrie: { ...defaults.industrie, ...activeProfile.weights?.industrie },
          roles: { ...defaults.roles, ...activeProfile.weights?.roles },
          typeClient: { ...defaults.typeClient, ...activeProfile.weights?.typeClient },
          structure: { ...defaults.structure, ...activeProfile.weights?.structure },
          geo: { ...defaults.geo, ...activeProfile.weights?.geo },
          meta: { ...defaults.meta, ...activeProfile.weights?.meta },
        },
      };
      // Ensure weight fields exist (migration from old profiles without weight)
      for (const section of ['industrie', 'roles', 'typeClient', 'structure', 'geo']) {
        if (!Number.isFinite(merged.weights[section].weight)) {
          merged.weights[section].weight = 100;
        }
      }
      setFormData(merged);
      return;
    }

    setFormData(createDefaultIcpFormData());
  }, [activeProfile]);

  const updateWeights = (path, value) => {
    const keys = path.split('.');
    setFormData((previous) => {
      const next = { ...previous, weights: JSON.parse(JSON.stringify(previous.weights)) };
      let cursor = next.weights;
      for (let index = 0; index < keys.length - 1; index += 1) {
        cursor = cursor[keys[index]];
      }
      cursor[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const handleSave = async () => {
    const thresholds = formData.weights.meta?.finalThresholds;
    if (thresholds) {
      const { excellent = 80, strong = 50, medium = 20 } = thresholds;
      if (excellent <= strong || strong <= medium) {
        toast.error(t('icp.toasts.thresholdOrder'));
        return;
      }
    }
    setSaving(true);
    try {
      await dataClient.icp.saveActive(formData);
      toast.success(t('icp.toasts.savedDetailed'));
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['icpConfig'] });
      queryClient.invalidateQueries({ queryKey: ['icpProfilesQuickSwitch'] });
    } catch (error) {
      console.warn('Failed to save ICP profile', error);
      toast.error(t('icp.toasts.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset to saved state
    if (activeProfile) {
      const defaults = createDefaultIcpFormData().weights;
      const merged = {
        name: activeProfile.name || t('icp.defaults.profileName'),
        description: activeProfile.description || '',
        id: activeProfile.id,
        weights: {
          industrie: { ...defaults.industrie, ...activeProfile.weights?.industrie },
          roles: { ...defaults.roles, ...activeProfile.weights?.roles },
          typeClient: { ...defaults.typeClient, ...activeProfile.weights?.typeClient },
          structure: { ...defaults.structure, ...activeProfile.weights?.structure },
          geo: { ...defaults.geo, ...activeProfile.weights?.geo },
          meta: { ...defaults.meta, ...activeProfile.weights?.meta },
        },
      };
      for (const section of ['industrie', 'roles', 'typeClient', 'structure', 'geo']) {
        if (!Number.isFinite(merged.weights[section].weight)) {
          merged.weights[section].weight = 100;
        }
      }
      setFormData(merged);
    }
    setEditing(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-sky animate-spin" />
      </div>
    );
  }

  const icpWeight = formData.weights.meta?.finalScoreWeights?.icp ?? 60;
  const aiWeight = 100 - icpWeight;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{t('icp.title')}</h1>
          <p className="text-slate-500 mt-1">{t('icp.subtitle')}</p>
          {editing && (
            <p className="text-xs text-amber-600 mt-1 font-medium">
              {t('icp.unsavedChanges')}
            </p>
          )}
        </div>

        {!editing ? (
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant="outline"
              onClick={() => setGenOpen(true)}
              className="gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">{t('icp.actions.generateWithAi')}</span>
              <span className="sm:hidden">{t('icp.actions.generateShort')}</span>
            </Button>
            <Button onClick={() => setEditing(true)} className="gap-2 bg-gradient-to-r from-brand-sky to-brand-sky-2">
              <Edit className="w-4 h-4" />
              <span className="hidden sm:inline">{t('icp.actions.editProfile')}</span>
              <span className="sm:hidden">{t('common.edit')}</span>
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2 bg-gradient-to-r from-brand-sky to-brand-sky-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('icp.saveProfile')}
            </Button>
          </div>
        )}
      </div>

      {/* ── AI Generate Dialog ──────────────────────────── */}
      <Dialog open={genOpen} onOpenChange={(open) => {
        setGenOpen(open);
        if (!open) setGenerateError('');
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-sky" />
              {t('icp.dialog.title')}
            </DialogTitle>
            <DialogDescription>
              {t('icp.dialog.description')}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={genDescription}
            onChange={(e) => setGenDescription(e.target.value)}
            placeholder={t('icp.dialog.placeholder')}
            rows={5}
            className="resize-none"
          />
          <p className="text-xs text-slate-500">
            {t('icp.dialog.hint')}
          </p>
          {generateError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
              {generateError}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => generateMutation.mutate(genDescription)}
              disabled={genDescription.trim().length < 20 || generateMutation.isPending}
              className="gap-2 bg-gradient-to-r from-brand-sky to-brand-sky-2"
            >
              {generateMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Sparkles className="w-4 h-4" />}
              {t('icp.dialog.generate')}
              {!generateMutation.isPending && <span className="text-[10px] opacity-70 font-normal">{t('icp.dialog.creditCost')}</span>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="criteria">
        <TabsList className="mb-6 bg-slate-100">
          <TabsTrigger value="criteria" className="gap-2">
            <Target className="w-4 h-4" />
            {t('icp.tabs.criteria')}
          </TabsTrigger>
          <TabsTrigger value="weights" className="gap-2">
            <Sliders className="w-4 h-4" />
            {t('icp.tabs.weights')}
          </TabsTrigger>
        </TabsList>

        {/* ── CRITERIA TAB ─────────────────────────────────── */}
        <TabsContent value="criteria" className="space-y-4">
          {/* Profile Info */}
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('icp.sections.profileInformation')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('icp.profileName')}</Label>
                <Input
                  value={formData.name}
                  disabled={!editing}
                  onChange={(event) => setFormData((previous) => ({ ...previous, name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('icp.description')}</Label>
                <Input
                  value={formData.description}
                  disabled={!editing}
                  onChange={(event) => setFormData((previous) => ({ ...previous, description: event.target.value }))}
                  placeholder={t('icp.placeholders.profileDescription')}
                />
              </div>
            </CardContent>
          </Card>

          {/* Industries */}
          <SectionCard icon={Building2} title={t('icp.industries')} color="bg-violet-500">
            <TagInput
              label={t('icp.labels.primaryIndustries')}
              values={formData.weights.industrie.primaires}
              onChange={(value) => updateWeights('industrie.primaires', value)}
              placeholder={t('icp.placeholders.industries')}
              disabled={!editing}
              variant="default"
            />
            <TagInput
              label={t('icp.labels.secondaryIndustries')}
              values={formData.weights.industrie.secondaires}
              onChange={(value) => updateWeights('industrie.secondaires', value)}
              placeholder={t('icp.placeholders.secondaryIndustries')}
              disabled={!editing}
              variant="secondary"
            />
            <TagInput
              label={t('icp.labels.excludedIndustries')}
              values={formData.weights.industrie.exclusions || []}
              onChange={(value) => updateWeights('industrie.exclusions', value)}
              placeholder={t('icp.placeholders.excludedIndustries')}
              disabled={!editing}
              variant="danger"
            />
          </SectionCard>

          {/* Roles */}
          <SectionCard icon={Users} title={t('icp.targetRoles')} color="bg-blue-500">
            <TagInput
              label={t('icp.labels.exactRoles')}
              values={formData.weights.roles.exacts}
              onChange={(value) => updateWeights('roles.exacts', value)}
              placeholder={t('icp.placeholders.exactRoles')}
              disabled={!editing}
              variant="default"
            />
            <TagInput
              label={t('icp.labels.similarRoles')}
              values={formData.weights.roles.proches}
              onChange={(value) => updateWeights('roles.proches', value)}
              placeholder={t('icp.placeholders.similarRoles')}
              disabled={!editing}
              variant="secondary"
            />
            <TagInput
              label={t('icp.labels.excludedRoles')}
              values={formData.weights.roles.exclusions}
              onChange={(value) => updateWeights('roles.exclusions', value)}
              placeholder={t('icp.placeholders.excludedRoles')}
              disabled={!editing}
              variant="danger"
            />
          </SectionCard>

          {/* Company Size */}
          <SectionCard icon={Target} title={t('icp.companySize')} color="bg-amber-500">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('icp.labels.primaryMinEmployees')}</Label>
                <Input
                  type="number"
                  disabled={!editing}
                  value={formData.weights.structure.primaire.min}
                  onChange={(event) => updateWeights('structure.primaire.min', Number(event.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('icp.labels.primaryMaxEmployees')}</Label>
                <Input
                  type="number"
                  disabled={!editing}
                  value={formData.weights.structure.primaire.max}
                  onChange={(event) => updateWeights('structure.primaire.max', Number(event.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('icp.labels.secondaryMinEmployees')}</Label>
                <Input
                  type="number"
                  disabled={!editing}
                  value={formData.weights.structure.secondaire.min}
                  onChange={(event) => updateWeights('structure.secondaire.min', Number(event.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('icp.labels.secondaryMaxEmployees')}</Label>
                <Input
                  type="number"
                  disabled={!editing}
                  value={formData.weights.structure.secondaire.max}
                  onChange={(event) => updateWeights('structure.secondaire.max', Number(event.target.value))}
                />
              </div>
            </div>
          </SectionCard>

          {/* Geography */}
          <SectionCard icon={Globe} title={t('icp.geography')} color="bg-emerald-500">
            <TagInput
              label={t('icp.labels.primaryCountries')}
              values={formData.weights.geo.primaire}
              onChange={(value) => updateWeights('geo.primaire', value)}
              placeholder={t('icp.placeholders.primaryCountries')}
              disabled={!editing}
              variant="default"
            />
            <TagInput
              label={t('icp.labels.secondaryCountries')}
              values={formData.weights.geo.secondaire}
              onChange={(value) => updateWeights('geo.secondaire', value)}
              placeholder={t('icp.placeholders.secondaryCountries')}
              disabled={!editing}
              variant="secondary"
            />
          </SectionCard>

          {/* Client Type */}
          <SectionCard icon={MapPin} title={t('icp.labels.clientTypeSection')} color="bg-pink-500">
            <TagInput
              label={t('icp.labels.primaryClientType')}
              values={formData.weights.typeClient.primaire || []}
              onChange={(value) => updateWeights('typeClient.primaire', value)}
              placeholder={t('icp.placeholders.primaryClientType')}
              disabled={!editing}
              variant="default"
            />
            <TagInput
              label={t('icp.labels.secondaryClientType')}
              values={formData.weights.typeClient.secondaire || []}
              onChange={(value) => updateWeights('typeClient.secondaire', value)}
              placeholder={t('icp.placeholders.secondaryClientType')}
              disabled={!editing}
              variant="secondary"
            />
          </SectionCard>
        </TabsContent>

        {/* ── WEIGHTS TAB ──────────────────────────────────── */}
        <TabsContent value="weights" className="space-y-4">
          {/* Section importance weights */}
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sliders className="w-5 h-5 text-violet-600" />
                {t('icp.sections.criterionImportance')}
              </CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                {t('icp.sections.criterionImportanceBody')}
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <WeightSlider
                label={t('icp.industries')}
                value={formData.weights.industrie.weight ?? 100}
                onChange={(v) => updateWeights('industrie.weight', v)}
                disabled={!editing}
                description={t('icp.sections.weightDescriptions.industry')}
              />
              <WeightSlider
                label={t('icp.targetRoles')}
                value={formData.weights.roles.weight ?? 100}
                onChange={(v) => updateWeights('roles.weight', v)}
                disabled={!editing}
                description={t('icp.sections.weightDescriptions.roles')}
              />
              <WeightSlider
                label={t('icp.labels.clientTypeSection')}
                value={formData.weights.typeClient.weight ?? 100}
                onChange={(v) => updateWeights('typeClient.weight', v)}
                disabled={!editing}
                description={t('icp.sections.weightDescriptions.clientType')}
              />
              <WeightSlider
                label={t('icp.companySize')}
                value={formData.weights.structure.weight ?? 100}
                onChange={(v) => updateWeights('structure.weight', v)}
                disabled={!editing}
                description={t('icp.sections.weightDescriptions.companySize')}
              />
              <WeightSlider
                label={t('icp.geography')}
                value={formData.weights.geo.weight ?? 100}
                onChange={(v) => updateWeights('geo.weight', v)}
                disabled={!editing}
                description={t('icp.sections.weightDescriptions.geography')}
              />
            </CardContent>
          </Card>

          {/* AI vs ICP blend */}
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="w-5 h-5 text-brand-sky" />
                {t('icp.sections.blendTitle')}
              </CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                {t('icp.sections.blendBody')}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-violet-50 border border-violet-200 p-3 sm:p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-violet-600 font-semibold mb-1">{t('icp.labels.icpWeight')}</p>
                  <p className="text-3xl font-bold text-violet-700">{icpWeight}%</p>
                </div>
                <div className="rounded-xl bg-brand-sky/5 border border-brand-sky/20 p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-brand-sky font-semibold mb-1">{t('icp.labels.aiWeight')}</p>
                  <p className="text-3xl font-bold text-brand-sky">{aiWeight}%</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{t('icp.labels.moreIcp')}</span>
                  <span>{t('icp.labels.moreAi')}</span>
                </div>
                <Slider
                  value={[icpWeight]}
                  min={20}
                  max={80}
                  step={5}
                  disabled={!editing}
                  onValueChange={([v]) => {
                    updateWeights('meta.finalScoreWeights.icp', v);
                    updateWeights('meta.finalScoreWeights.ai', 100 - v);
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Score thresholds */}
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('icp.sections.scoreThresholds')}</CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                {t('icp.sections.scoreThresholdsBody')}
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-emerald-700 font-semibold">{t('icp.labels.excellentThreshold')}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    disabled={!editing}
                    value={formData.weights.meta?.finalThresholds?.excellent ?? 80}
                    onChange={(event) => updateWeights('meta.finalThresholds.excellent', Number(event.target.value))}
                    className="border-emerald-200 focus:border-emerald-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-blue-700 font-semibold">{t('icp.labels.strongThreshold')}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    disabled={!editing}
                    value={formData.weights.meta?.finalThresholds?.strong ?? 50}
                    onChange={(event) => updateWeights('meta.finalThresholds.strong', Number(event.target.value))}
                    className="border-blue-200 focus:border-blue-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-amber-700 font-semibold">{t('icp.labels.mediumThreshold')}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    disabled={!editing}
                    value={formData.weights.meta?.finalThresholds?.medium ?? 20}
                    onChange={(event) => updateWeights('meta.finalThresholds.medium', Number(event.target.value))}
                    className="border-amber-200 focus:border-amber-400"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3">
                {t('icp.sections.thresholdHint')}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

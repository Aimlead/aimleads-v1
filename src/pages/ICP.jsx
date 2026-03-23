import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, Building2, Edit, Globe, Loader2, MapPin, Plus, Save, Sliders, Sparkles, Target, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { dataClient } from '@/services/dataClient';
import { useAuth } from '@/lib/AuthContext';

const SECTION_DEFAULTS = {
  industrie: { weight: 100, scores: { parfait: 30, partiel: 15, aucun: -30, exclu: -100 } },
  roles: { weight: 100, scores: { parfait: 25, partiel: 10, exclu: -100, aucun: -25 } },
  typeClient: { weight: 100, scores: { parfait: 25, partiel: 10, aucun: -40 } },
  structure: { weight: 100, scores: { parfait: 15, partiel: 10, aucun: -20 } },
  geo: { weight: 100, scores: { parfait: 15, partiel: 5, aucun: -10 } },
};

const createDefaultFormData = () => ({
  name: 'My ICP',
  description: '',
  weights: {
    industrie: {
      primaires: [],
      secondaires: [],
      exclusions: [],
      weight: 100,
      scores: { parfait: 30, partiel: 15, aucun: -30, exclu: -100 },
    },
    roles: {
      exclusions: [],
      exacts: [],
      proches: [],
      weight: 100,
      scores: { parfait: 25, partiel: 10, exclu: -100, aucun: -25 },
    },
    typeClient: {
      primaire: ['B2B'],
      secondaire: [],
      weight: 100,
      scores: { parfait: 25, partiel: 10, aucun: -40 },
    },
    structure: {
      primaire: { min: 50, max: 5000 },
      secondaire: { min: 30, max: 10000 },
      weight: 100,
      scores: { parfait: 15, partiel: 10, aucun: -20 },
    },
    geo: {
      primaire: [],
      secondaire: [],
      weight: 100,
      scores: { parfait: 15, partiel: 5, aucun: -10 },
    },
    meta: {
      minScore: 0,
      maxScore: 100,
      finalScoreWeights: { icp: 60, ai: 40 },
      icpThresholds: { excellent: 80, strong: 50, medium: 20 },
      finalThresholds: { excellent: 80, strong: 50, medium: 20 },
      thresholds: {
        icp: { excellent: 80, strong: 50, medium: 20 },
        final: { excellent: 80, strong: 50, medium: 20 },
      },
    },
  },
});

function TagInput({ label, values = [], onChange, placeholder, disabled, variant = 'default' }) {
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
        <span>0% (ignored)</span>
        <span>100% (normal)</span>
        <span>150% (critical)</span>
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(createDefaultFormData());
  const [genOpen, setGenOpen] = useState(false);
  const [genDescription, setGenDescription] = useState('');

  const generateMutation = useMutation({
    mutationFn: (description) => dataClient.icp.generateIcp(description),
    onSuccess: (data) => {
      if (!data) {
        toast.error('Génération impossible — vérifiez que ANTHROPIC_API_KEY est configuré.');
        return;
      }
      setFormData((previous) => ({
        ...previous,
        name: data.name || previous.name,
        description: data.description || previous.description,
        weights: {
          ...createDefaultFormData().weights,
          ...data.weights,
        },
      }));
      setEditing(true);
      setGenOpen(false);
      setGenDescription('');
      toast.success(`ICP "${data.name}" généré — vérifiez et sauvegardez.`);
    },
    onError: () => toast.error('Génération échouée. Réessayez.'),
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
      const defaults = createDefaultFormData().weights;
      const merged = {
        name: activeProfile.name || 'My ICP',
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

    setFormData(createDefaultFormData());
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
        toast.error('Thresholds must be in descending order: Excellent > Strong > Medium');
        return;
      }
    }
    setSaving(true);
    try {
      await dataClient.icp.saveActive(formData, user?.email);
      toast.success('ICP profile saved. Re-analyze leads to apply the new weights.');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['icpConfig'] });
      queryClient.invalidateQueries({ queryKey: ['icpProfilesQuickSwitch'] });
    } catch (error) {
      console.warn('Failed to save ICP profile', error);
      toast.error('Failed to save ICP profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset to saved state
    if (activeProfile) {
      const defaults = createDefaultFormData().weights;
      const merged = {
        name: activeProfile.name || 'My ICP',
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
      <div className="flex items-start gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-slate-900">ICP Profile</h1>
          <p className="text-slate-500 mt-1">
            Define your Ideal Customer Profile and tune scoring weights
          </p>
          {editing && (
            <p className="text-xs text-amber-600 mt-1 font-medium">
              ⚠ Unsaved changes — click Save to apply to scoring
            </p>
          )}
        </div>

        {!editing ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setGenOpen(true)}
              className="gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Générer avec l'IA
            </Button>
            <Button onClick={() => setEditing(true)} className="gap-2 bg-gradient-to-r from-brand-sky to-brand-sky-2">
              <Edit className="w-4 h-4" />
              Edit Profile
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2 bg-gradient-to-r from-brand-sky to-brand-sky-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Profile
            </Button>
          </div>
        )}
      </div>

      {/* ── AI Generate Dialog ──────────────────────────── */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-sky" />
              Générer un ICP avec l'IA
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            Décrivez votre client idéal en langage naturel. Claude remplira automatiquement les industries, rôles, taille d'entreprise et géographie.
          </p>
          <Textarea
            value={genDescription}
            onChange={(e) => setGenDescription(e.target.value)}
            placeholder="Ex : PME SaaS B2B française de 50 à 500 employés, décideur IT (CTO, DSI, RSSI), secteurs finance ou industrie, budget annuel > 50 k€, déjà équipée d'un CRM…"
            rows={5}
            className="resize-none"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={() => generateMutation.mutate(genDescription)}
              disabled={genDescription.trim().length < 20 || generateMutation.isPending}
              className="gap-2 bg-gradient-to-r from-brand-sky to-brand-sky-2"
            >
              {generateMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Sparkles className="w-4 h-4" />}
              Générer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="criteria">
        <TabsList className="mb-6 bg-slate-100">
          <TabsTrigger value="criteria" className="gap-2">
            <Target className="w-4 h-4" />
            Criteria
          </TabsTrigger>
          <TabsTrigger value="weights" className="gap-2">
            <Sliders className="w-4 h-4" />
            Scoring Weights
          </TabsTrigger>
        </TabsList>

        {/* ── CRITERIA TAB ─────────────────────────────────── */}
        <TabsContent value="criteria" className="space-y-4">
          {/* Profile Info */}
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Profile Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Profile Name</Label>
                <Input
                  value={formData.name}
                  disabled={!editing}
                  onChange={(event) => setFormData((previous) => ({ ...previous, name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={formData.description}
                  disabled={!editing}
                  onChange={(event) => setFormData((previous) => ({ ...previous, description: event.target.value }))}
                  placeholder="Short description of this profile"
                />
              </div>
            </CardContent>
          </Card>

          {/* Industries */}
          <SectionCard icon={Building2} title="Industries" color="bg-violet-500">
            <TagInput
              label="Primary Industries (+30 pts)"
              values={formData.weights.industrie.primaires}
              onChange={(value) => updateWeights('industrie.primaires', value)}
              placeholder="e.g. SaaS, FinTech, Cybersecurity"
              disabled={!editing}
              variant="default"
            />
            <TagInput
              label="Secondary Industries (+15 pts)"
              values={formData.weights.industrie.secondaires}
              onChange={(value) => updateWeights('industrie.secondaires', value)}
              placeholder="e.g. Consulting, MarTech"
              disabled={!editing}
              variant="secondary"
            />
            <TagInput
              label="Excluded Industries (eliminates lead)"
              values={formData.weights.industrie.exclusions || []}
              onChange={(value) => updateWeights('industrie.exclusions', value)}
              placeholder="e.g. Hospitals, Public sector"
              disabled={!editing}
              variant="danger"
            />
          </SectionCard>

          {/* Roles */}
          <SectionCard icon={Users} title="Contact Roles" color="bg-blue-500">
            <TagInput
              label="Exact Roles (+25 pts)"
              values={formData.weights.roles.exacts}
              onChange={(value) => updateWeights('roles.exacts', value)}
              placeholder="e.g. CEO, CTO, VP Sales"
              disabled={!editing}
              variant="default"
            />
            <TagInput
              label="Similar Roles (+10 pts)"
              values={formData.weights.roles.proches}
              onChange={(value) => updateWeights('roles.proches', value)}
              placeholder="e.g. Director, Head of, Manager"
              disabled={!editing}
              variant="secondary"
            />
            <TagInput
              label="Excluded Roles (eliminates lead)"
              values={formData.weights.roles.exclusions}
              onChange={(value) => updateWeights('roles.exclusions', value)}
              placeholder="e.g. Intern, Student, HR"
              disabled={!editing}
              variant="danger"
            />
          </SectionCard>

          {/* Company Size */}
          <SectionCard icon={Target} title="Company Size" color="bg-amber-500">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min employees (primary)</Label>
                <Input
                  type="number"
                  disabled={!editing}
                  value={formData.weights.structure.primaire.min}
                  onChange={(event) => updateWeights('structure.primaire.min', Number(event.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Max employees (primary)</Label>
                <Input
                  type="number"
                  disabled={!editing}
                  value={formData.weights.structure.primaire.max}
                  onChange={(event) => updateWeights('structure.primaire.max', Number(event.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Min employees (secondary)</Label>
                <Input
                  type="number"
                  disabled={!editing}
                  value={formData.weights.structure.secondaire.min}
                  onChange={(event) => updateWeights('structure.secondaire.min', Number(event.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Max employees (secondary)</Label>
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
          <SectionCard icon={Globe} title="Geography" color="bg-emerald-500">
            <TagInput
              label="Primary Countries (+15 pts)"
              values={formData.weights.geo.primaire}
              onChange={(value) => updateWeights('geo.primaire', value)}
              placeholder="e.g. France, Germany"
              disabled={!editing}
              variant="default"
            />
            <TagInput
              label="Secondary Countries (+5 pts)"
              values={formData.weights.geo.secondaire}
              onChange={(value) => updateWeights('geo.secondaire', value)}
              placeholder="e.g. Belgium, Spain"
              disabled={!editing}
              variant="secondary"
            />
          </SectionCard>

          {/* Client Type */}
          <SectionCard icon={MapPin} title="Client Type" color="bg-pink-500">
            <TagInput
              label="Primary Client Type (B2B / B2C / B2B2C)"
              values={formData.weights.typeClient.primaire || []}
              onChange={(value) => updateWeights('typeClient.primaire', value)}
              placeholder="e.g. B2B"
              disabled={!editing}
              variant="default"
            />
            <TagInput
              label="Secondary Client Type"
              values={formData.weights.typeClient.secondaire || []}
              onChange={(value) => updateWeights('typeClient.secondaire', value)}
              placeholder="e.g. B2B2C"
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
                Criterion Importance
              </CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                Adjust how much each criterion contributes to the ICP score. 100% = default weight, 150% = critical, 0% = ignored.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <WeightSlider
                label="Industry"
                value={formData.weights.industrie.weight ?? 100}
                onChange={(v) => updateWeights('industrie.weight', v)}
                disabled={!editing}
                description="How important is the industry match? Primary = +30pts × weight"
              />
              <WeightSlider
                label="Contact Role"
                value={formData.weights.roles.weight ?? 100}
                onChange={(v) => updateWeights('roles.weight', v)}
                disabled={!editing}
                description="How important is the contact's role? Exact = +25pts × weight"
              />
              <WeightSlider
                label="Client Type (B2B/B2C)"
                value={formData.weights.typeClient.weight ?? 100}
                onChange={(v) => updateWeights('typeClient.weight', v)}
                disabled={!editing}
                description="How important is the business model match? Match = +25pts × weight"
              />
              <WeightSlider
                label="Company Size"
                value={formData.weights.structure.weight ?? 100}
                onChange={(v) => updateWeights('structure.weight', v)}
                disabled={!editing}
                description="How important is headcount matching? Primary = +15pts × weight"
              />
              <WeightSlider
                label="Geography"
                value={formData.weights.geo.weight ?? 100}
                onChange={(v) => updateWeights('geo.weight', v)}
                disabled={!editing}
                description="How important is the country? Primary = +15pts × weight"
              />
            </CardContent>
          </Card>

          {/* AI vs ICP blend */}
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="w-5 h-5 text-brand-sky" />
                AI vs ICP Blend
              </CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                Final Score = ICP base score + AI signal boost. Adjust how much weight each side gets.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-violet-50 border border-violet-200 p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-violet-600 font-semibold mb-1">ICP Weight</p>
                  <p className="text-3xl font-bold text-violet-700">{icpWeight}%</p>
                </div>
                <div className="rounded-xl bg-brand-sky/5 border border-brand-sky/20 p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-brand-sky font-semibold mb-1">AI Weight</p>
                  <p className="text-3xl font-bold text-brand-sky">{aiWeight}%</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>More ICP rules-based</span>
                  <span>More AI-driven</span>
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
              <CardTitle className="text-base">Score Thresholds</CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                Define at what score a lead becomes Excellent, Strong Fit, or Medium Fit.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-emerald-700 font-semibold">Excellent ≥</Label>
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
                  <Label className="text-blue-700 font-semibold">Strong Fit ≥</Label>
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
                  <Label className="text-amber-700 font-semibold">Medium Fit ≥</Label>
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
                Leads below the Medium threshold are marked as Low Fit or Excluded.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

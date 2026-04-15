import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, Building2, Edit, Globe, Loader2, MapPin, Plus, Save, Sliders, Sparkles, Target, Users, X } from 'lucide-react';
import { SkeletonCard } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { dataClient } from '@/services/dataClient';

const SECTION_DEFAULTS = {
  industrie: { weight: 100, scores: { parfait: 30, partiel: 15, aucun: -30, exclu: -100 } },
  roles: { weight: 100, scores: { parfait: 25, partiel: 10, exclu: -100, aucun: -25 } },
  typeClient: { weight: 100, scores: { parfait: 25, partiel: 10, aucun: -40 } },
  structure: { weight: 100, scores: { parfait: 15, partiel: 10, aucun: -20 } },
  geo: { weight: 100, scores: { parfait: 15, partiel: 5, aucun: -10 } },
};

const getIcpGenerationErrorMessage = (error) => {
  const message = String(error?.message || '').toLowerCase();

  if (message.includes('credit balance is too low') || message.includes('credit') || message.includes('billing')) {
    return 'Génération impossible : crédits Anthropic insuffisants. Recharge le compte puis réessaie.';
  }

  if (message.includes('anthropic_api_key') || message.includes('api key') || message.includes('not configured')) {
    return 'Génération impossible : la clé Anthropic n’est pas configurée côté backend.';
  }

  if (message.includes('circuit breaker')) {
    return 'La génération IA est momentanément désactivée après plusieurs échecs. Attends un instant puis réessaie.';
  }

  return error?.message || 'Génération échouée. Vérifie Anthropic et réessaie.';
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
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(createDefaultFormData());
  const [genOpen, setGenOpen] = useState(false);
  const [genDescription, setGenDescription] = useState('');
  const [generateError, setGenerateError] = useState('');

  const generateMutation = useMutation({
    mutationFn: (description) => dataClient.icp.generateIcp(description),
    onSuccess: (data) => {
      if (!data) {
        setGenerateError('Génération impossible : vérifie la configuration Anthropic côté backend.');
        toast.error('Génération impossible — vérifiez que ANTHROPIC_API_KEY est configuré.');
        return;
      }
      setGenerateError('');
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
    onError: (error) => {
      const message = getIcpGenerationErrorMessage(error);
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
        toast.error('Les seuils doivent être en ordre décroissant : Excellent > Strong > Medium');
        return;
      }
    }
    setSaving(true);
    try {
      await dataClient.icp.saveActive(formData);
      toast.success('Profil ICP sauvegardé. Réanalysez vos leads pour appliquer les nouveaux poids.');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['icpConfig'] });
      queryClient.invalidateQueries({ queryKey: ['icpProfilesQuickSwitch'] });
    } catch (error) {
      console.warn('Failed to save ICP profile', error);
      toast.error('Échec de la sauvegarde du profil ICP');
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
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex justify-between items-start gap-4 mb-6">
          <div className="space-y-2 flex-1">
            <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse" />
            <div className="h-4 w-72 bg-slate-100 rounded animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-28 bg-slate-100 rounded-lg animate-pulse" />
            <div className="h-9 w-28 bg-slate-100 rounded-lg animate-pulse" />
          </div>
        </div>
        {[1, 2, 3].map((i) => <SkeletonCard key={i} className="h-32" />)}
      </div>
    );
  }

  const icpWeight = formData.weights.meta?.finalScoreWeights?.icp ?? 60;
  const aiWeight = 100 - icpWeight;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Profil ICP</h1>
          <p className="text-slate-500 mt-1">
            Définissez votre profil client idéal et ajustez les poids de scoring
          </p>
          {editing && (
            <p className="text-xs text-amber-600 mt-1 font-medium">
              ⚠ Modifications non sauvegardées — cliquez sur Sauvegarder pour appliquer
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
              <span className="hidden sm:inline">Générer avec l'IA</span>
              <span className="sm:hidden">IA</span>
            </Button>
            <Button onClick={() => setEditing(true)} className="gap-2 bg-gradient-to-r from-brand-sky to-brand-sky-2">
              <Edit className="w-4 h-4" />
              <span className="hidden sm:inline">Modifier le profil</span>
              <span className="sm:hidden">Modifier</span>
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel}>
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2 bg-gradient-to-r from-brand-sky to-brand-sky-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Sauvegarder
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
              Générer un ICP avec l'IA
            </DialogTitle>
            <DialogDescription>
              Décrivez votre client idéal en langage naturel. Claude remplira automatiquement les industries, rôles, taille d'entreprise et géographie.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={genDescription}
            onChange={(e) => setGenDescription(e.target.value)}
            placeholder="Ex : PME SaaS B2B française de 50 à 500 employés, décideur IT (CTO, DSI, RSSI), secteurs finance ou industrie, budget annuel > 50 k€, déjà équipée d'un CRM…"
            rows={5}
            className="resize-none"
          />
          <p className="text-xs text-slate-500">
            Si la génération échoue, vérifie d’abord Anthropic : clé backend, crédits disponibles, ou circuit breaker temporaire.
          </p>
          {generateError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
              {generateError}
            </div>
          ) : null}
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
              {!generateMutation.isPending && <span className="text-[10px] opacity-70 font-normal">3 crédits</span>}
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
                  placeholder="Brève description de ce profil"
                />
              </div>
            </CardContent>
          </Card>

          {/* Industries */}
          <SectionCard icon={Building2} title="Secteurs" color="bg-violet-500">
            <TagInput
              label="Secteurs primaires (+30 pts)"
              values={formData.weights.industrie.primaires}
              onChange={(value) => updateWeights('industrie.primaires', value)}
              placeholder="ex. SaaS, FinTech, Cybersécurité"
              disabled={!editing}
              variant="default"
            />
            <TagInput
              label="Secteurs secondaires (+15 pts)"
              values={formData.weights.industrie.secondaires}
              onChange={(value) => updateWeights('industrie.secondaires', value)}
              placeholder="ex. Conseil, MarTech"
              disabled={!editing}
              variant="secondary"
            />
            <TagInput
              label="Secteurs exclus (élimine le lead)"
              values={formData.weights.industrie.exclusions || []}
              onChange={(value) => updateWeights('industrie.exclusions', value)}
              placeholder="ex. Hôpitaux, Secteur public"
              disabled={!editing}
              variant="danger"
            />
          </SectionCard>

          {/* Roles */}
          <SectionCard icon={Users} title="Rôles du contact" color="bg-blue-500">
            <TagInput
              label="Rôles exacts (+25 pts)"
              values={formData.weights.roles.exacts}
              onChange={(value) => updateWeights('roles.exacts', value)}
              placeholder="ex. CEO, CTO, VP Sales"
              disabled={!editing}
              variant="default"
            />
            <TagInput
              label="Rôles similaires (+10 pts)"
              values={formData.weights.roles.proches}
              onChange={(value) => updateWeights('roles.proches', value)}
              placeholder="ex. Directeur, Head of, Responsable"
              disabled={!editing}
              variant="secondary"
            />
            <TagInput
              label="Rôles exclus (élimine le lead)"
              values={formData.weights.roles.exclusions}
              onChange={(value) => updateWeights('roles.exclusions', value)}
              placeholder="ex. Stagiaire, Étudiant, RH"
              disabled={!editing}
              variant="danger"
            />
          </SectionCard>

          {/* Company Size */}
          <SectionCard icon={Target} title="Taille de l'entreprise" color="bg-amber-500">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Employés min (primaire)</Label>
                <Input
                  type="number"
                  disabled={!editing}
                  value={formData.weights.structure.primaire.min}
                  onChange={(event) => updateWeights('structure.primaire.min', Number(event.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Employés max (primaire)</Label>
                <Input
                  type="number"
                  disabled={!editing}
                  value={formData.weights.structure.primaire.max}
                  onChange={(event) => updateWeights('structure.primaire.max', Number(event.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Employés min (secondaire)</Label>
                <Input
                  type="number"
                  disabled={!editing}
                  value={formData.weights.structure.secondaire.min}
                  onChange={(event) => updateWeights('structure.secondaire.min', Number(event.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Employés max (secondaire)</Label>
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
          <SectionCard icon={Globe} title="Géographie" color="bg-emerald-500">
            <TagInput
              label="Pays primaires (+15 pts)"
              values={formData.weights.geo.primaire}
              onChange={(value) => updateWeights('geo.primaire', value)}
              placeholder="ex. France, Allemagne"
              disabled={!editing}
              variant="default"
            />
            <TagInput
              label="Pays secondaires (+5 pts)"
              values={formData.weights.geo.secondaire}
              onChange={(value) => updateWeights('geo.secondaire', value)}
              placeholder="ex. Belgique, Espagne"
              disabled={!editing}
              variant="secondary"
            />
          </SectionCard>

          {/* Client Type */}
          <SectionCard icon={MapPin} title="Type de client" color="bg-pink-500">
            <TagInput
              label="Type de client primaire (B2B / B2C / B2B2C)"
              values={formData.weights.typeClient.primaire || []}
              onChange={(value) => updateWeights('typeClient.primaire', value)}
              placeholder="ex. B2B"
              disabled={!editing}
              variant="default"
            />
            <TagInput
              label="Type de client secondaire"
              values={formData.weights.typeClient.secondaire || []}
              onChange={(value) => updateWeights('typeClient.secondaire', value)}
              placeholder="ex. B2B2C"
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
                Importance des critères
              </CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                Ajustez l'impact de chaque critère sur le score ICP. 100% = poids par défaut, 150% = critique, 0% = ignoré.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <WeightSlider
                label="Secteur"
                value={formData.weights.industrie.weight ?? 100}
                onChange={(v) => updateWeights('industrie.weight', v)}
                disabled={!editing}
                description="Importance du secteur ? Primaire = +30pts × poids"
              />
              <WeightSlider
                label="Rôle du contact"
                value={formData.weights.roles.weight ?? 100}
                onChange={(v) => updateWeights('roles.weight', v)}
                disabled={!editing}
                description="Importance du rôle du contact ? Exact = +25pts × poids"
              />
              <WeightSlider
                label="Type de client (B2B/B2C)"
                value={formData.weights.typeClient.weight ?? 100}
                onChange={(v) => updateWeights('typeClient.weight', v)}
                disabled={!editing}
                description="Importance du modèle business ? Match = +25pts × poids"
              />
              <WeightSlider
                label="Taille de l'entreprise"
                value={formData.weights.structure.weight ?? 100}
                onChange={(v) => updateWeights('structure.weight', v)}
                disabled={!editing}
                description="Importance de la taille ? Primaire = +15pts × poids"
              />
              <WeightSlider
                label="Géographie"
                value={formData.weights.geo.weight ?? 100}
                onChange={(v) => updateWeights('geo.weight', v)}
                disabled={!editing}
                description="Importance du pays ? Primaire = +15pts × poids"
              />
            </CardContent>
          </Card>

          {/* AI vs ICP blend */}
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="w-5 h-5 text-brand-sky" />
                Équilibre IA / ICP
              </CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                Score final = score ICP de base + boost signal IA. Ajustez le poids de chaque côté.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-violet-50 border border-violet-200 p-3 sm:p-4 text-center">
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
                  <span>Plus basé sur les règles ICP</span>
                  <span>Plus piloté par l'IA</span>
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
              <CardTitle className="text-base">Seuils de score</CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                Définissez à partir de quel score un lead devient Excellent, Strong Fit ou Medium Fit.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                Les leads en dessous du seuil Medium sont marqués Low Fit. Les exclusions ne viennent que des règles d'exclusion strictes.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

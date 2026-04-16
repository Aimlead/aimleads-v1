import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Database, Loader2, Sparkles, Target, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import QuickIcpSetup from '@/components/onboarding/QuickIcpSetup';
import ImportCSVDialog from '@/components/leads/ImportCSVDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ACTIVATION_ANALYZE_BATCH_SIZE } from '@/constants/activation';
import { ROUTES } from '@/constants/routes';
import { getActivationSnapshot } from '@/lib/activation';
import { waitForJobCompletion } from '@/lib/jobs';
import { dataClient } from '@/services/dataClient';

export default function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const { data: leads = [], isLoading: isLoadingLeads } = useQuery({
    queryKey: ['leads'],
    queryFn: () => dataClient.leads.list('-created_at'),
  });

  const { data: icpProfiles = [], isLoading: isLoadingIcp } = useQuery({
    queryKey: ['icpProfilesQuickSwitch'],
    queryFn: () => dataClient.icp.list(),
  });

  const { data: featureFlagsData = null } = useQuery({
    queryKey: ['workspaceFeatureFlags', 'onboarding'],
    queryFn: () => dataClient.workspace.listFeatureFlags(),
    staleTime: 60_000,
  });

  const activeIcp = useMemo(
    () => icpProfiles.find((profile) => profile.is_active) || icpProfiles[0] || null,
    [icpProfiles]
  );

  const asyncJobsEnabled = Boolean(
    featureFlagsData?.flags?.find((flag) => flag.flag_name === 'async_jobs')?.enabled
  );

  const activationSnapshot = useMemo(
    () => getActivationSnapshot({ activeIcp, leads }),
    [activeIcp, leads]
  );

  const sampleDataMutation = useMutation({
    mutationFn: () => dataClient.workspace.loadSampleData(),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['leads'] }),
        queryClient.invalidateQueries({ queryKey: ['icpProfilesQuickSwitch'] }),
      ]);

      if (result?.already_seeded) {
        toast.success(t('onboarding.toasts.sampleAlreadyReady', { defaultValue: 'Des données existent déjà dans ce workspace.' }));
        return;
      }

      toast.success(
        t('onboarding.toasts.sampleLoaded', {
          defaultValue: '{{count}} leads de démonstration chargés.',
          count: result?.inserted ?? 0,
        })
      );
    },
    onError: () => {
      toast.error(t('onboarding.toasts.sampleLoadFailed', { defaultValue: 'Impossible de charger les données de démonstration.' }));
    },
  });

  const runLeadAnalysisBatch = async (leadBatch) => {
    if (leadBatch.length === 0) return { analyzedCount: 0, firstLeadId: null };

    const confirmedProfile = activeIcp || await dataClient.icp.getActive();
    if (!confirmedProfile) {
      toast.error(t('onboarding.toasts.createIcpFirst', { defaultValue: "Configurez d'abord un ICP actif." }));
      navigate(ROUTES.icp);
      return { analyzedCount: 0, firstLeadId: null };
    }

    setIsAnalyzing(true);
    try {
      let analyzedCount = 0;
      for (const lead of leadBatch) {
        const response = await dataClient.leads.reanalyze(lead.id, { async: asyncJobsEnabled });
        if (response?.jobId) {
          const jobStatus = await waitForJobCompletion(response.jobId, (jobId) => dataClient.jobs.getStatus(jobId));
          if (jobStatus.status === 'failed') {
            throw new Error(jobStatus.error?.message || 'Queued onboarding analysis failed.');
          }
        }
        analyzedCount += 1;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['leads'] }),
        queryClient.invalidateQueries({ queryKey: ['workspaceAiRuns'] }),
      ]);
      return { analyzedCount, firstLeadId: leadBatch[0]?.id || null };
    } catch (error) {
      console.warn('Onboarding analysis failed', error);
      toast.error(t('onboarding.toasts.analysisFailed', { defaultValue: "Échec de l'analyse du premier lead." }));
      return { analyzedCount: 0, firstLeadId: null };
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeFirstLead = async (leadOverride = null) => {
    const targetLead = leadOverride || activationSnapshot.leadToAnalyze || leads[0];
    if (!targetLead) {
      setImportDialogOpen(true);
      return;
    }

    const result = await runLeadAnalysisBatch([targetLead]);
    if (!result.firstLeadId) return;

    const freshLead = await dataClient.leads.getById(result.firstLeadId);
    toast.success(t('onboarding.toasts.analysisReady', { defaultValue: 'Premier résultat prêt. Ouvrez le lead pour continuer.' }));
    navigate(`/leads/${result.firstLeadId}`, {
      replace: true,
      state: freshLead ? { lead: freshLead } : undefined,
    });
  };

  const handleImportSuccess = async () => {
    await queryClient.invalidateQueries({ queryKey: ['leads'] });

    if (activeIcp?.id) {
      toast.success(
        t('onboarding.toasts.importReadyForAnalysis', {
          defaultValue: 'Import prêt. Prochaine étape: analyser votre premier lead.',
        })
      );
      return;
    }

    toast.success(
      t('onboarding.toasts.importReadyForIcp', {
        defaultValue: "Import prêt. Activez maintenant un ICP pour rendre le scoring utile.",
      })
    );
  };

  const handleAnalyzeImportedLeads = async (importResult) => {
    const importedLeads = (importResult?.createdLeads || []).slice(0, ACTIVATION_ANALYZE_BATCH_SIZE);
    if (importedLeads.length === 0) {
      navigate(ROUTES.dashboard);
      return;
    }

    setImportDialogOpen(false);
    const result = await runLeadAnalysisBatch([importedLeads[0]]);
    if (!result.firstLeadId) return;

    const freshLead = await dataClient.leads.getById(result.firstLeadId);
    toast.success(t('onboarding.toasts.importAndAnalyzeDone', { defaultValue: 'Import terminé, premier lead analysé.' }));
    navigate(`/leads/${result.firstLeadId}`, {
      replace: true,
      state: freshLead ? { lead: freshLead } : undefined,
    });
  };

  const progress = activationSnapshot.totalSteps === 0
    ? 0
    : Math.round((activationSnapshot.completedSteps / activationSnapshot.totalSteps) * 100);

  const nextActionCard = (() => {
    if (!activationSnapshot.hasActiveIcp) {
      return {
        eyebrow: t('onboarding.nextAction.icp.eyebrow', { defaultValue: 'Prochaine meilleure action' }),
        title: t('onboarding.nextAction.icp.title', { defaultValue: 'Fixer la cible avant de scorer.' }),
        description: t('onboarding.nextAction.icp.description', {
          defaultValue: "Un ICP rapide suffit pour éviter des scores vagues et des priorités incohérentes. Renseignez-le ici, puis on passe directement à l'import.",
        }),
        cta: t('onboarding.nextAction.icp.cta', { defaultValue: "Créer l'ICP rapide" }),
        onClick: () => document.getElementById('quick-icp-name')?.focus(),
      };
    }

    if (!activationSnapshot.hasImportedLeads) {
      return {
        eyebrow: t('onboarding.nextAction.import.eyebrow', { defaultValue: 'Prochaine meilleure action' }),
        title: t('onboarding.nextAction.import.title', { defaultValue: 'Chargez vos premiers leads pour voir la valeur.' }),
        description: t('onboarding.nextAction.import.description', {
          defaultValue: "Le plus rapide est d'importer un CSV propre. Si vous préférez tester d'abord, chargez la démo et on ouvrira ensuite votre premier résultat d'analyse.",
        }),
        cta: t('onboarding.nextAction.import.cta', { defaultValue: "Ouvrir l'import guidé" }),
        onClick: () => setImportDialogOpen(true),
      };
    }

    if (!activationSnapshot.hasAnalyzedLead) {
      return {
        eyebrow: t('onboarding.nextAction.analysis.eyebrow', { defaultValue: 'Prochaine meilleure action' }),
        title: t('onboarding.nextAction.analysis.title', { defaultValue: 'Lancez la première analyse pendant que le contexte est frais.' }),
        description: t('onboarding.nextAction.analysis.description', {
          defaultValue: "On vous amène directement sur le meilleur lead disponible avec score, signaux et action recommandée. C'est le vrai moment de première valeur du produit.",
        }),
        cta: t('onboarding.nextAction.analysis.cta', { defaultValue: 'Analyser le premier lead' }),
        onClick: () => handleAnalyzeFirstLead(),
      };
    }

    if (!activationSnapshot.hasFollowUpStarted) {
      return {
        eyebrow: t('onboarding.nextAction.review.eyebrow', { defaultValue: 'Prochaine meilleure action' }),
        title: t('onboarding.nextAction.review.title', { defaultValue: 'Passez de l’analyse à l’action commerciale.' }),
        description: t('onboarding.nextAction.review.description', {
          defaultValue: "Ouvrez le lead le plus prometteur et déclenchez la prochaine étape: revue, pipeline ou premier message. C'est là que le workflow devient réellement utile.",
        }),
        cta: activationSnapshot.leadToReview
          ? t('onboarding.nextAction.review.ctaLead', { defaultValue: 'Ouvrir le meilleur lead' })
          : t('onboarding.nextAction.review.ctaPipeline', { defaultValue: 'Ouvrir le pipeline' }),
        onClick: () => {
          if (activationSnapshot.leadToReview?.id) {
            navigate(`/leads/${activationSnapshot.leadToReview.id}`, {
              state: { lead: activationSnapshot.leadToReview },
            });
            return;
          }
          navigate(ROUTES.pipeline);
        },
      };
    }

    return {
      eyebrow: t('onboarding.nextAction.complete.eyebrow', { defaultValue: 'Workspace prêt' }),
      title: t('onboarding.nextAction.complete.title', { defaultValue: 'Votre premier workflow tient déjà debout.' }),
      description: t('onboarding.nextAction.complete.description', {
        defaultValue: "Vous avez franchi le minimum utile. Le bon réflexe maintenant est de passer au dashboard pour suivre les scores, lancer d'autres analyses et faire vivre le pipeline.",
      }),
      cta: t('onboarding.nextAction.complete.cta', { defaultValue: 'Aller au dashboard' }),
      onClick: () => navigate(ROUTES.dashboard),
    };
  })();

  const onboardingSteps = [
    {
      id: 'icp',
      title: t('onboarding.steps.icp.title', { defaultValue: 'Configurer votre ICP' }),
      description: activeIcp
        ? t('onboarding.steps.icp.done', { defaultValue: 'ICP actif : {{name}}', name: activeIcp.name })
        : t('onboarding.steps.icp.pending', { defaultValue: "Définissez d'abord qui AimLeads doit qualifier." }),
      completed: activationSnapshot.hasActiveIcp,
      action: (
        <Button size="sm" onClick={() => navigate(ROUTES.icp)} className="gap-2">
          <Target className="h-4 w-4" />
          {activeIcp
            ? t('onboarding.actions.reviewIcp', { defaultValue: "Voir l'ICP" })
            : t('onboarding.actions.configureIcp', { defaultValue: "Configurer l'ICP" })}
        </Button>
      ),
    },
    {
      id: 'import',
      title: t('onboarding.steps.import.title', { defaultValue: 'Importer des leads ou charger une démo' }),
      description: leads.length > 0
        ? t('onboarding.steps.import.done', { defaultValue: '{{count}} leads disponibles.', count: leads.length })
        : t('onboarding.steps.import.pending', { defaultValue: 'Importez un CSV réel ou chargez un set de démonstration propre.' }),
      completed: activationSnapshot.hasImportedLeads,
      action: (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setImportDialogOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            {t('onboarding.actions.importLeads', { defaultValue: 'Importer mes leads' })}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => sampleDataMutation.mutate()}
            disabled={sampleDataMutation.isPending || leads.length > 0}
            className="gap-2"
          >
            {sampleDataMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            {t('onboarding.actions.loadSample', { defaultValue: 'Charger une démo' })}
          </Button>
        </div>
      ),
    },
    {
      id: 'analysis',
      title: t('onboarding.steps.analysis.title', { defaultValue: 'Lancer la première analyse' }),
      description: activationSnapshot.hasAnalyzedLead
        ? t('onboarding.steps.analysis.done', { defaultValue: 'Un premier lead a déjà été scoré et enrichi.' })
        : t('onboarding.steps.analysis.pending', { defaultValue: 'Générez score, signaux et prochaine action sur un vrai lead.' }),
      completed: activationSnapshot.hasAnalyzedLead,
      action: (
        <Button
          size="sm"
          onClick={() => handleAnalyzeFirstLead()}
          disabled={isAnalyzing || !activationSnapshot.hasImportedLeads}
          className="gap-2"
        >
          {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {t('onboarding.actions.analyzeFirstLead', { defaultValue: 'Analyser le premier lead' })}
        </Button>
      ),
    },
    {
      id: 'review',
      title: t('onboarding.steps.review.title', { defaultValue: 'Passer à la revue et au suivi' }),
      description: activationSnapshot.hasFollowUpStarted
        ? t('onboarding.steps.review.done', { defaultValue: 'Le workflow commercial a déjà démarré.' })
        : t('onboarding.steps.review.pending', { defaultValue: 'Ouvrez le meilleur lead et déclenchez la prochaine action.' }),
      completed: activationSnapshot.hasFollowUpStarted,
      action: (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (activationSnapshot.leadToReview?.id) {
              navigate(`/leads/${activationSnapshot.leadToReview.id}`, {
                state: { lead: activationSnapshot.leadToReview },
              });
              return;
            }
            navigate(ROUTES.pipeline);
          }}
          disabled={!activationSnapshot.hasAnalyzedLead}
          className="gap-2"
        >
          <ArrowRight className="h-4 w-4" />
          {activationSnapshot.leadToReview
            ? t('onboarding.actions.openBestLead', { defaultValue: 'Ouvrir le meilleur lead' })
            : t('onboarding.actions.openPipeline', { defaultValue: 'Ouvrir le pipeline' })}
        </Button>
      ),
    },
  ];

  if (isLoadingLeads || isLoadingIcp) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-sky" />
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-3xl border border-brand-sky/15 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 text-white shadow-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <Badge className="w-fit bg-white/10 text-white hover:bg-white/10">
                {t('onboarding.badge', { defaultValue: 'Première mise en route' })}
              </Badge>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                {t('onboarding.title', { defaultValue: 'Activez votre workspace en quelques étapes utiles.' })}
              </h1>
              <p className="text-sm leading-6 text-slate-300 sm:text-base">
                {t('onboarding.subtitle', {
                  defaultValue: "Le but n'est pas de tout configurer. On veut juste atteindre votre première valeur: ICP actif, leads importés, première analyse exploitable.",
                })}
              </p>
            </div>

            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-300">
                  {t('onboarding.progressLabel', { defaultValue: 'Progression' })}
                </span>
                <span className="font-semibold text-white">
                  {activationSnapshot.completedSteps}/{activationSnapshot.totalSteps}
                </span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-sky to-emerald-400 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-slate-300">
                {activationSnapshot.isComplete
                  ? t('onboarding.completeSummary', { defaultValue: 'Votre workspace est prêt. Vous pouvez passer au dashboard.' })
                  : t('onboarding.nextSummary', {
                      defaultValue: 'Prochaine étape: {{step}}',
                      step: activationSnapshot.nextStep?.title || t('onboarding.fallbackStep', { defaultValue: 'continuer le setup' }),
                    })}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-5 sm:p-6">
              <Badge variant="outline" className="w-fit border-brand-sky/20 bg-brand-sky/5 text-brand-sky">
                {nextActionCard.eyebrow}
              </Badge>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                  {nextActionCard.title}
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-slate-600">
                  {nextActionCard.description}
                </p>
              </div>
              <Button onClick={nextActionCard.onClick} className="gap-2">
                <ArrowRight className="h-4 w-4" />
                {nextActionCard.cta}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="grid gap-3 p-5 sm:p-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {t('onboarding.snapshot.title', { defaultValue: 'État actuel du workspace' })}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      label: t('onboarding.snapshot.icp', { defaultValue: 'ICP actif' }),
                      value: activationSnapshot.hasActiveIcp
                        ? t('onboarding.snapshot.done', { defaultValue: 'Oui' })
                        : t('onboarding.snapshot.pending', { defaultValue: 'À faire' }),
                    },
                    {
                      label: t('onboarding.snapshot.leads', { defaultValue: 'Leads disponibles' }),
                      value: String(leads.length),
                    },
                    {
                      label: t('onboarding.snapshot.analyzed', { defaultValue: 'Leads analysés' }),
                      value: String(leads.filter((lead) => Number.isFinite(lead.final_score)).length),
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl bg-white px-3 py-3 ring-1 ring-slate-200">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{item.label}</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-950 p-4 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  {t('onboarding.snapshot.pathTitle', { defaultValue: 'Parcours de première valeur' })}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    t('onboarding.snapshot.pathIcp', { defaultValue: 'ICP rapide' }),
                    t('onboarding.snapshot.pathImport', { defaultValue: 'Import propre' }),
                    t('onboarding.snapshot.pathAnalysis', { defaultValue: 'Premier résultat' }),
                    t('onboarding.snapshot.pathAction', { defaultValue: 'Action suivante' }),
                  ].map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <QuickIcpSetup
          activeIcp={activeIcp}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['icpProfilesQuickSwitch'] });
          }}
          onOpenAdvanced={() => navigate(ROUTES.icp)}
        />

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4 text-brand-sky" />
                {t('onboarding.cards.import.title', { defaultValue: 'Importer vos leads' })}
              </CardTitle>
              <CardDescription>
                {t('onboarding.cards.import.description', { defaultValue: 'Import CSV/XLSX guidé avec aperçu, validation et prochaine action claire.' })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  {t('onboarding.cards.import.flowTitle', { defaultValue: 'Ce qui se passe ensuite' })}
                </p>
                <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                  {[
                    t('onboarding.cards.import.flowStepOne', { defaultValue: '1. Upload du fichier' }),
                    t('onboarding.cards.import.flowStepTwo', { defaultValue: '2. Vérification des colonnes' }),
                    t('onboarding.cards.import.flowStepThree', { defaultValue: '3. Import puis première analyse' }),
                  ].map((step) => (
                    <div key={step} className="rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">
                      {step}
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={() => setImportDialogOpen(true)} className="w-full gap-2">
                <Upload className="h-4 w-4" />
                {t('onboarding.actions.openImport', { defaultValue: "Ouvrir l'import guidé" })}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4 text-brand-sky" />
                {t('onboarding.cards.demo.title', { defaultValue: 'Démo propre' })}
              </CardTitle>
              <CardDescription>
                {t('onboarding.cards.demo.description', { defaultValue: 'Chargez un mini workspace crédible si vous voulez tester avant votre vrai import.' })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={() => sampleDataMutation.mutate()}
                disabled={sampleDataMutation.isPending || leads.length > 0}
                className="w-full gap-2"
              >
                {sampleDataMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                {leads.length > 0
                  ? t('onboarding.actions.sampleLocked', { defaultValue: 'Déjà des leads présents' })
                  : t('onboarding.actions.loadDemoWorkspace', { defaultValue: 'Charger la démo' })}
              </Button>

              <p className="mt-3 text-sm text-slate-500">
                {t('onboarding.cards.demo.hint', {
                  defaultValue: "Idéal pour tester le scoring, les signaux et la page résultat avant votre vrai import.",
                })}
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          {onboardingSteps.map((step, index) => (
            <Card key={step.id} className="border-slate-200 shadow-sm">
              <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${step.completed ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {step.completed ? <CheckCircle2 className="h-5 w-5" /> : <span className="text-sm font-semibold">{index + 1}</span>}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-base font-semibold text-slate-900">{step.title}</p>
                      <Badge variant="outline">
                        {step.completed
                          ? t('onboarding.doneBadge', { defaultValue: 'Terminé' })
                          : t('onboarding.nextBadge', { defaultValue: 'À faire' })}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-500">{step.description}</p>
                  </div>
                </div>
                <div className="shrink-0">{step.action}</div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {t('onboarding.footer.title', { defaultValue: 'Vous préférez continuer plus tard ?' })}
              </p>
              <p className="text-sm text-slate-500">
                {t('onboarding.footer.subtitle', { defaultValue: 'Le dashboard reste accessible à tout moment, mais ce flow vous évite les étapes mortes.' })}
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate(ROUTES.dashboard)} className="gap-2">
              <ArrowRight className="h-4 w-4" />
              {t('onboarding.actions.goToDashboard', { defaultValue: 'Aller au dashboard' })}
            </Button>
          </div>
        </section>
      </div>

      <ImportCSVDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportSuccess={handleImportSuccess}
        hasActiveIcp={Boolean(activeIcp?.id)}
        onReviewIcp={() => {
          setImportDialogOpen(false);
          navigate(ROUTES.icp);
        }}
        onFocusImportedLeads={() => navigate(ROUTES.dashboard)}
        onAnalyzeImportedLeads={handleAnalyzeImportedLeads}
      />
    </>
  );
}

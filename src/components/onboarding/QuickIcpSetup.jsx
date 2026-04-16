import React, { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Loader2, Sparkles, Target } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { buildQuickIcpPayload } from '@/lib/icpProfile';
import { dataClient } from '@/services/dataClient';

const schema = z
  .object({
    name: z.string().trim().min(2),
    description: z.string().trim().max(180).optional().or(z.literal('')),
    industries: z.string().trim().min(2),
    roles: z.string().trim().min(2),
    geography: z.string().trim().optional().or(z.literal('')),
    companySizeMin: z.coerce.number().min(1).max(100000),
    companySizeMax: z.coerce.number().min(1).max(100000),
  })
  .refine((value) => value.companySizeMax >= value.companySizeMin, {
    path: ['companySizeMax'],
    message: 'max_gte_min',
  });

export default function QuickIcpSetup({ activeIcp, onSaved, onOpenAdvanced }) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: activeIcp?.name || 'ICP Growth B2B',
      description: activeIcp?.description || '',
      industries: activeIcp?.weights?.industrie?.primaires?.join(', ') || '',
      roles: activeIcp?.weights?.roles?.exacts?.join(', ') || '',
      geography: activeIcp?.weights?.geo?.primaire?.join(', ') || 'France, Belgique, Suisse',
      companySizeMin: activeIcp?.weights?.structure?.primaire?.min || 50,
      companySizeMax: activeIcp?.weights?.structure?.primaire?.max || 500,
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values) => {
      const payload = buildQuickIcpPayload(values);
      return dataClient.icp.saveActive(activeIcp?.id ? { ...payload, id: activeIcp.id } : payload);
    },
    onSuccess: async (profile) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['icpConfig'] }),
        queryClient.invalidateQueries({ queryKey: ['icpProfilesQuickSwitch'] }),
      ]);

      toast.success(
        t('onboarding.quickIcp.toasts.saved', {
          defaultValue: 'ICP enregistré. Vous pouvez importer vos premiers leads.',
        })
      );
      onSaved?.(profile);
    },
    onError: () => {
      toast.error(
        t('onboarding.quickIcp.toasts.failed', {
          defaultValue: "Impossible d'enregistrer cet ICP rapide.",
        })
      );
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = form;

  useEffect(() => {
    reset({
      name: activeIcp?.name || 'ICP Growth B2B',
      description: activeIcp?.description || '',
      industries: activeIcp?.weights?.industrie?.primaires?.join(', ') || '',
      roles: activeIcp?.weights?.roles?.exacts?.join(', ') || '',
      geography: activeIcp?.weights?.geo?.primaire?.join(', ') || 'France, Belgique, Suisse',
      companySizeMin: activeIcp?.weights?.structure?.primaire?.min || 50,
      companySizeMax: activeIcp?.weights?.structure?.primaire?.max || 500,
    });
  }, [activeIcp, reset]);

  const fieldError = (key, fallback) => {
    const code = errors[key]?.message;
    if (!code) return null;
    return t(`onboarding.quickIcp.errors.${code}`, { defaultValue: fallback });
  };

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-sky/15 bg-brand-sky/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-sky">
            <Target className="h-3.5 w-3.5" />
            {t('onboarding.quickIcp.eyebrow', { defaultValue: 'Étape 1 — Cadrer votre cible' })}
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              {t('onboarding.quickIcp.title', { defaultValue: 'Définissez un ICP exploitable en 60 secondes.' })}
            </h2>
            <p className="max-w-md text-sm leading-6 text-slate-600">
              {t('onboarding.quickIcp.subtitle', {
                defaultValue: "On ne remplit pas toute la machine maintenant. On fixe juste les bons secteurs, rôles et tailles d'entreprise pour que le scoring parte dans la bonne direction.",
              })}
            </p>
          </div>

          <div className="space-y-3 rounded-3xl bg-slate-950 p-4 text-slate-100">
            {[
              t('onboarding.quickIcp.benefits.fit', {
                defaultValue: 'Vos premiers scores partent d’une vraie cible, pas d’un profil vide.',
              }),
              t('onboarding.quickIcp.benefits.roles', {
                defaultValue: 'Les rôles cibles filtrent immédiatement les mauvais leads.',
              }),
              t('onboarding.quickIcp.benefits.next', {
                defaultValue: 'Vous pourrez affiner tous les poids ensuite dans la page ICP complète.',
              }),
            ].map((item) => (
              <div key={item} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" />
                <p className="text-sm text-slate-200">{item}</p>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" onClick={onOpenAdvanced} className="gap-2">
            <Sparkles className="h-4 w-4" />
            {t('onboarding.quickIcp.openAdvanced', { defaultValue: 'Ouvrir la configuration ICP avancée' })}
          </Button>
        </div>

        <form onSubmit={handleSubmit((values) => saveMutation.mutate(values))} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="quick-icp-name">
                {t('onboarding.quickIcp.fields.name', { defaultValue: 'Nom du profil' })}
              </Label>
              <Input id="quick-icp-name" {...register('name')} />
              {fieldError('name', 'Ajoutez un nom de profil plus clair.') ? (
                <p className="text-xs text-rose-600">{fieldError('name', 'Ajoutez un nom de profil plus clair.')}</p>
              ) : null}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="quick-icp-description">
                {t('onboarding.quickIcp.fields.description', { defaultValue: 'Résumé rapide' })}
              </Label>
              <Textarea
                id="quick-icp-description"
                rows={3}
                {...register('description')}
                placeholder={t('onboarding.quickIcp.placeholders.description', {
                  defaultValue: 'Ex : SaaS B2B européen qui a besoin de mieux prioriser ses comptes entrants et outbound.',
                })}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="quick-icp-industries">
                {t('onboarding.quickIcp.fields.industries', { defaultValue: 'Secteurs prioritaires' })}
              </Label>
              <Input
                id="quick-icp-industries"
                {...register('industries')}
                placeholder={t('onboarding.quickIcp.placeholders.industries', {
                  defaultValue: 'SaaS, cybersécurité, fintech',
                })}
              />
              {fieldError('industries', 'Ajoutez au moins un secteur cible.') ? (
                <p className="text-xs text-rose-600">{fieldError('industries', 'Ajoutez au moins un secteur cible.')}</p>
              ) : null}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="quick-icp-roles">
                {t('onboarding.quickIcp.fields.roles', { defaultValue: 'Rôles à viser' })}
              </Label>
              <Input
                id="quick-icp-roles"
                {...register('roles')}
                placeholder={t('onboarding.quickIcp.placeholders.roles', {
                  defaultValue: 'CEO, Head of Sales, RevOps',
                })}
              />
              {fieldError('roles', 'Ajoutez au moins un rôle cible.') ? (
                <p className="text-xs text-rose-600">{fieldError('roles', 'Ajoutez au moins un rôle cible.')}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-icp-min">
                {t('onboarding.quickIcp.fields.companySizeMin', { defaultValue: 'Taille min' })}
              </Label>
              <Input id="quick-icp-min" type="number" min="1" {...register('companySizeMin')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-icp-max">
                {t('onboarding.quickIcp.fields.companySizeMax', { defaultValue: 'Taille max' })}
              </Label>
              <Input id="quick-icp-max" type="number" min="1" {...register('companySizeMax')} />
              {fieldError('companySizeMax', 'La taille max doit être supérieure ou égale à la taille min.') ? (
                <p className="text-xs text-rose-600">
                  {fieldError('companySizeMax', 'La taille max doit être supérieure ou égale à la taille min.')}
                </p>
              ) : null}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="quick-icp-geo">
                {t('onboarding.quickIcp.fields.geography', { defaultValue: 'Pays ou zones' })}
              </Label>
              <Input
                id="quick-icp-geo"
                {...register('geography')}
                placeholder={t('onboarding.quickIcp.placeholders.geography', {
                  defaultValue: 'France, Belgique, Suisse',
                })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {t('onboarding.quickIcp.footer.title', { defaultValue: 'Juste assez pour lancer un bon scoring.' })}
              </p>
              <p className="text-sm text-slate-500">
                {t('onboarding.quickIcp.footer.subtitle', {
                  defaultValue: "Le détail fin des poids et exclusions reste disponible dans l'éditeur ICP complet.",
                })}
              </p>
            </div>

            <Button type="submit" disabled={saveMutation.isPending} className="gap-2">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {activeIcp
                ? t('onboarding.quickIcp.actions.update', { defaultValue: "Mettre à jour l'ICP" })
                : t('onboarding.quickIcp.actions.create', { defaultValue: "Créer l'ICP rapide" })}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

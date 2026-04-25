import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BookOpen, LifeBuoy, ShieldAlert, Users, Wand2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';

export default function Help() {
  const { t } = useTranslation();

  const playbooks = [
    {
      title: t('help.playbooks.firstValue.title', { defaultValue: 'Reach first value quickly' }),
      description: t('help.playbooks.firstValue.description', {
        defaultValue: 'Create or activate one ICP, import a CSV, analyze the first batch, then generate a first sequence.',
      }),
      cta: { label: t('help.playbooks.firstValue.cta', { defaultValue: 'Open Dashboard' }), href: ROUTES.dashboard },
      icon: Wand2,
    },
    {
      title: t('help.playbooks.invite.title', { defaultValue: 'Invite a teammate' }),
      description: t('help.playbooks.invite.description', {
        defaultValue: 'Create the invite in Team, copy the signup link, and ask your teammate to register with the invited email.',
      }),
      cta: { label: t('help.playbooks.invite.cta', { defaultValue: 'Open Team' }), href: ROUTES.team },
      icon: Users,
    },
    {
      title: t('help.playbooks.recovery.title', { defaultValue: 'Recover account access' }),
      description: t('help.playbooks.recovery.description', {
        defaultValue: 'Use Forgot password to request a recovery email, then complete the reset from the /reset-password link.',
      }),
      cta: { label: t('help.playbooks.recovery.cta', { defaultValue: 'Reset Password' }), href: ROUTES.forgotPassword },
      icon: ShieldAlert,
    },
  ];

  const troubleshooting = [
    t('help.troubleshooting.csv', {
      defaultValue: 'CSV import: start with company_name and website_url, then add contact fields if available.',
    }),
    t('help.troubleshooting.invites', {
      defaultValue: 'Invites: the teammate must sign up with the exact invited email for automatic workspace join.',
    }),
    t('help.troubleshooting.integrations', {
      defaultValue: 'Integrations: scoring and sequence quality improve when Anthropic, Hunter, and NewsAPI are configured.',
    }),
    t('help.troubleshooting.offboarding', {
      defaultValue: 'Offboarding: safe member removal is intentionally disabled until the tenancy model is hardened.',
    }),
  ];

  return (
    <div className="mx-auto w-full max-w-[1160px] space-y-6">
      <section className="rounded-xl border border-[#e6e4df] bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              {t('help.page.eyebrow', { defaultValue: 'Support & Playbooks' })}
            </p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#1a1200]">
              {t('help.page.title', { defaultValue: 'Help Center' })}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {t('help.page.subtitle', {
                defaultValue: "Débloquez rapidement l'onboarding, l'accès au compte, et la collaboration d'équipe.",
              })}
            </p>
          </div>
          <Button asChild variant="outline" className="shrink-0 mt-1">
            <Link to={ROUTES.settings}>{t('help.page.openSettings', { defaultValue: 'Open Settings' })}</Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {playbooks.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title} className="border-slate-200">
              <CardHeader>
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" className="gap-2">
                  <Link to={item.cta.href}>
                    {item.cta.label}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-brand-sky" />
              {t('help.page.playbooksTitle', { defaultValue: 'Operational playbooks' })}
            </CardTitle>
            <CardDescription>
              {t('help.page.playbooksDescription', { defaultValue: 'Use these when setup stalls or a teammate needs a concrete next step.' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-medium text-slate-900">{t('help.cards.recovery.title', { defaultValue: 'Password reset and account recovery' })}</p>
              <p className="mt-1">{t('help.cards.recovery.body', {
                defaultValue: 'Request a reset link, open the recovery link, then choose a new password on the recovery page before returning to the workspace.',
              })}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-medium text-slate-900">{t('help.cards.firstValue.title', { defaultValue: 'First-value workflow' })}</p>
              <p className="mt-1">{t('help.cards.firstValue.body', {
                defaultValue: 'The shortest path is: activate ICP → import CSV → analyze first batch → review scores → generate one outreach sequence.',
              })}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-medium text-slate-900">{t('help.cards.lifecycle.title', { defaultValue: 'Team lifecycle' })}</p>
              <p className="mt-1">{t('help.cards.lifecycle.body', {
                defaultValue: 'Invites and role changes are live. Owner transfer and safe offboarding are still restricted until the platform tenancy model is hardened.',
              })}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>{t('help.page.troubleshootingTitle', { defaultValue: 'Troubleshooting checklist' })}</CardTitle>
            <CardDescription>{t('help.page.troubleshootingDescription', { defaultValue: 'High-signal reminders before opening a deeper support thread.' })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            {troubleshooting.map((item) => (
              <div key={item} className="rounded-xl border border-slate-200 bg-white p-3">
                {item}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

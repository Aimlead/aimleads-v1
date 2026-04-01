import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, LifeBuoy, ShieldAlert, Users, Wand2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';

const playbooks = [
  {
    title: 'Reach first value quickly',
    description: 'Create or activate one ICP, import a CSV, analyze the first batch, then generate a first sequence.',
    cta: { label: 'Open Dashboard', href: ROUTES.dashboard },
    icon: Wand2,
  },
  {
    title: 'Invite a teammate',
    description: 'Create the invite in Team, copy the signup link, and ask your teammate to register with the invited email.',
    cta: { label: 'Open Team', href: ROUTES.team },
    icon: Users,
  },
  {
    title: 'Recover account access',
    description: 'Use Forgot password to request a recovery email, then complete the reset from the /reset-password link.',
    cta: { label: 'Reset Password', href: ROUTES.forgotPassword },
    icon: ShieldAlert,
  },
];

const troubleshooting = [
  'CSV import: start with company_name and website_url, then add contact fields if available.',
  'Invites: the teammate must sign up with the exact invited email for automatic workspace join.',
  'Integrations: scoring and sequence quality improve when Anthropic, Hunter, and NewsAPI are configured.',
  'Offboarding: safe member removal is intentionally disabled until the tenancy model is hardened.',
];

export default function Help() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-sky/10 text-brand-sky">
              <LifeBuoy className="h-5 w-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Help Center</h1>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            The fastest way to unblock onboarding, account access, import quality, and team collaboration without hunting through settings.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to={ROUTES.settings}>Open Settings</Link>
        </Button>
      </div>

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
              Operational playbooks
            </CardTitle>
            <CardDescription>Use these when setup stalls or a teammate needs a concrete next step.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-medium text-slate-900">Password reset and account recovery</p>
              <p className="mt-1">Request a reset link, open the recovery link, then choose a new password on the recovery page before returning to the workspace.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-medium text-slate-900">First-value workflow</p>
              <p className="mt-1">The shortest path is: activate ICP → import CSV → analyze first batch → review scores → generate one outreach sequence.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-medium text-slate-900">Team lifecycle</p>
              <p className="mt-1">Invites and role changes are live. Owner transfer and safe offboarding are still restricted until the platform tenancy model is hardened.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Troubleshooting checklist</CardTitle>
            <CardDescription>High-signal reminders before opening a deeper support thread.</CardDescription>
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

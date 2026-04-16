import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Check, Users, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/lib/AuthContext';
import { dataClient } from '@/services/dataClient';

const plans = [
  {
    slug: 'starter',
    price: 49,
    icon: Zap,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
  },
  {
    slug: 'team',
    price: 149,
    icon: Users,
    iconBg: 'bg-brand-sky/10',
    iconColor: 'text-brand-sky',
    popular: true,
  },
  {
    slug: 'scale',
    price: 399,
    icon: Building2,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
];

export default function Pricing() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();

  const openPlanReview = async () => {
    await dataClient.public.trackEvent({
      event: 'pricing_review_requested',
      path: ROUTES.pricing,
      source: 'pricing_page',
      properties: {
        authenticated: Boolean(isAuthenticated),
      },
    }).catch(() => {});

    window.open('mailto:hello@aimlead.io?subject=AimLeads%20plan%20review', '_blank');
  };

  const openSelectedPlan = async (plan) => {
    await dataClient.public.trackEvent({
      event: 'pricing_plan_selected',
      path: ROUTES.pricing,
      source: 'pricing_page',
      properties: {
        plan: plan.slug,
      },
    }).catch(() => {});

    if (isAuthenticated) {
      navigate(ROUTES.dashboard);
      return;
    }

    const params = new URLSearchParams({
      mode: 'signup',
      plan: plan.slug,
    });
    navigate(`${ROUTES.login}?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-sky/5">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand-sky">
            {t('pricing.eyebrow')}
          </p>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">{t('pricing.title')}</h1>
          <p className="text-lg text-slate-500">{t('pricing.subtitle')}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const featureKeys = ['credits', 'seats', 'crm', 'signals', 'support', 'api'];
            return (
              <Card
                key={plan.slug}
                className={`relative shadow-sm ${
                  plan.popular ? 'border-2 border-brand-sky shadow-md shadow-brand-sky/10' : 'border border-slate-200'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-brand-sky text-white text-xs font-semibold px-3 py-1 rounded-full">
                    {t('pricing.popular')}
                  </div>
                )}

                <CardHeader>
                  <div className={`w-12 h-12 rounded-xl ${plan.iconBg} flex items-center justify-center mb-3`}>
                    <Icon className={`w-6 h-6 ${plan.iconColor}`} />
                  </div>

                  <CardTitle className="text-xl">{t(`pricing.plans.${plan.slug}.name`)}</CardTitle>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-bold text-slate-900">${plan.price}</span>
                    <span className="text-slate-500 mb-1">{t('pricing.perMonth')}</span>
                  </div>
                  <p className="text-sm text-slate-500">{t(`pricing.plans.${plan.slug}.target`)}</p>
                </CardHeader>

                <CardContent>
                  <ul className="space-y-3 mb-6">
                    {featureKeys.map((featureKey) => (
                      <li key={featureKey} className="flex items-center gap-2 text-sm text-slate-600">
                        <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        {t(`pricing.plans.${plan.slug}.features.${featureKey}`)}
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={`w-full ${plan.popular ? 'bg-gradient-to-r from-brand-sky to-brand-sky-2 hover:from-brand-sky-2 hover:to-brand-navy-2' : ''}`}
                    variant={plan.popular ? 'default' : 'outline'}
                    onClick={() => openSelectedPlan(plan)}
                  >
                    {isAuthenticated ? t('pricing.openWorkspace') : t('pricing.startPlan', {
                      plan: t(`pricing.plans.${plan.slug}.name`),
                    })}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-3 mb-10">
          {['one', 'two', 'three'].map((stepKey) => (
            <div key={stepKey} className="rounded-2xl border border-slate-200 bg-white/80 px-5 py-4 text-sm text-slate-600 shadow-sm">
              {t(`pricing.steps.${stepKey}`)}
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-brand-sky/15 bg-brand-sky/5 px-6 py-6 text-center">
          <p className="text-sm font-semibold text-slate-900">{t('pricing.reviewTitle')}</p>
          <p className="mt-2 text-sm text-slate-500">{t('pricing.reviewBody')}</p>
          <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
            <Button onClick={() => navigate(isAuthenticated ? ROUTES.billing : ROUTES.login)}>
              {isAuthenticated ? t('pricing.primaryCtaAuthenticated') : t('pricing.primaryCta')}
            </Button>
            <Button variant="outline" onClick={openPlanReview}>
              {t('pricing.secondaryCta')}
            </Button>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Button asChild variant="outline">
            <Link to={ROUTES.home}>{t('pricing.backHome')}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

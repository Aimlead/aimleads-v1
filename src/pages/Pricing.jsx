import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, Check, ChevronDown, ChevronUp, Gift, Users, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/lib/AuthContext';
import { dataClient } from '@/services/dataClient';

const FREE_PERKS = ['credits50', 'crm1', 'noCard'];

const plans = [
  {
    slug: 'starter',
    priceMonthly: 49,
    priceAnnual: 39,
    icon: Zap,
    iconBg: 'bg-gradient-to-br from-blue-500 to-blue-600',
    iconGlow: 'shadow-[0_6px_20px_-6px_rgba(37,99,235,0.5)]',
    iconColor: 'text-white',
  },
  {
    slug: 'team',
    priceMonthly: 149,
    priceAnnual: 119,
    icon: Users,
    iconBg: 'bg-gradient-to-br from-brand-sky to-brand-sky-2',
    iconGlow: 'shadow-[0_8px_24px_-6px_rgba(58,141,255,0.6)]',
    iconColor: 'text-white',
    popular: true,
  },
  {
    slug: 'scale',
    priceMonthly: 399,
    priceAnnual: 319,
    icon: Building2,
    iconBg: 'bg-gradient-to-br from-amber-500 to-orange-500',
    iconGlow: 'shadow-[0_6px_20px_-6px_rgba(245,158,11,0.5)]',
    iconColor: 'text-white',
  },
];

const FAQ_ITEMS = [
  {
    q: "C'est quoi un crédit ?",
    a: "Un crédit représente une opération IA : analyser un lead coûte 3 crédits, découvrir les signaux internet coûte 10 crédits, générer une séquence de prospection coûte 50 crédits. Les crédits se renouvellent chaque mois.",
  },
  {
    q: "Que se passe-t-il après l'essai gratuit ?",
    a: "Votre essai inclut 50 crédits et dure jusqu'à ce que vous les ayez utilisés ou 14 jours, selon ce qui arrive en premier. Aucun débit automatique — vous choisissez un plan quand vous êtes prêt.",
  },
  {
    q: "Puis-je changer de plan à tout moment ?",
    a: "Oui. Vous pouvez passer à un plan supérieur immédiatement ou rétrograder en fin de période. Contactez-nous à hello@aimlead.io pour tout changement.",
  },
  {
    q: "Est-ce que les crédits non utilisés sont reportés ?",
    a: "Non, les crédits sont mensuels et ne se reportent pas. Si vous avez régulièrement des restes importants, il vaut mieux descendre d'un plan.",
  },
  {
    q: "L'API est-elle incluse dans tous les plans ?",
    a: "L'accès API est réservé au plan Scale. Les plans Starter et Team utilisent l'interface web et les intégrations CRM natives.",
  },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-4 text-left text-sm font-medium text-slate-800 hover:text-brand-sky transition-colors gap-4"
      >
        <span>{q}</span>
        {open ? <ChevronUp className="w-4 h-4 shrink-0 text-slate-400" /> : <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />}
      </button>
      {open && <p className="pb-4 text-sm text-slate-500 leading-relaxed">{a}</p>}
    </div>
  );
}

export default function Pricing() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const [annual, setAnnual] = useState(false);

  const openPlanReview = async () => {
    await dataClient.public.trackEvent({
      event: 'pricing_review_requested',
      path: ROUTES.pricing,
      source: 'pricing_page',
      properties: { authenticated: Boolean(isAuthenticated) },
    }).catch(() => {});
    window.open('mailto:hello@aimlead.io?subject=AimLeads%20plan%20review', '_blank');
  };

  const openSelectedPlan = async (plan) => {
    await dataClient.public.trackEvent({
      event: 'pricing_plan_selected',
      path: ROUTES.pricing,
      source: 'pricing_page',
      properties: { plan: plan.slug, billing: annual ? 'annual' : 'monthly' },
    }).catch(() => {});

    if (isAuthenticated) {
      navigate(ROUTES.billing);
      return;
    }

    const params = new URLSearchParams({ mode: 'signup', plan: plan.slug });
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

          {/* Annual / Monthly toggle */}
          <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
            <button
              onClick={() => setAnnual(false)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${!annual ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Mensuel
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors flex items-center gap-2 ${annual ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Annuel
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${annual ? 'bg-emerald-400 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                −20%
              </span>
            </button>
          </div>
        </div>

        {/* Free trial banner */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-sky-50 px-5 py-4 shadow-sm"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-[0_4px_12px_-4px_rgba(52,211,153,0.5)] shrink-0">
                <Gift className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{t('pricing.freeTrial.title')}</p>
                <p className="text-xs text-slate-500 mt-0.5">{t('pricing.freeTrial.subtitle')}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              {FREE_PERKS.map((perk) => (
                <span key={perk} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-white border border-emerald-200 text-emerald-700">
                  <Check className="w-3 h-3" />
                  {t(`pricing.freeTrial.perks.${perk}`)}
                </span>
              ))}
            </div>
            <Button
              size="sm"
              className="sm:shrink-0 bg-emerald-500 hover:bg-emerald-600 text-white border-0"
              onClick={() => {
                const params = new URLSearchParams({ mode: 'signup', plan: 'free' });
                navigate(isAuthenticated ? ROUTES.dashboard : `${ROUTES.login}?${params.toString()}`);
              }}
            >
              {isAuthenticated ? t('pricing.primaryCtaAuthenticated') : t('pricing.freeTrial.cta')}
            </Button>
          </div>
        </motion.div>

        {/* Plan cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const price = annual ? plan.priceAnnual : plan.priceMonthly;
            const featureKeys = ['credits', 'seats', 'crm', 'signals', 'support', 'api'];
            return (
              <Card
                key={plan.slug}
                variant="elevated"
                className={`relative flex flex-col ${
                  plan.popular ? 'border-2 border-brand-sky/40 shadow-[0_16px_48px_-12px_rgba(58,141,255,0.3)] hover:shadow-[0_24px_56px_-12px_rgba(58,141,255,0.4)]' : ''
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-brand-sky to-brand-sky-2 text-white text-xs font-semibold px-3.5 py-1 rounded-full shadow-[0_4px_16px_-4px_rgba(58,141,255,0.6)]">
                    {t('pricing.popular')}
                  </div>
                )}

                <CardHeader>
                  <div className={`w-12 h-12 rounded-xl ${plan.iconBg} ${plan.iconGlow} ring-1 ring-white/30 flex items-center justify-center mb-3`}>
                    <Icon className={`w-6 h-6 ${plan.iconColor} drop-shadow`} />
                  </div>

                  <CardTitle className="text-xl">{t(`pricing.plans.${plan.slug}.name`)}</CardTitle>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-bold text-slate-900">{price}&nbsp;€</span>
                    <span className="text-slate-500 mb-1">{t('pricing.perMonth')}</span>
                  </div>
                  {annual && (
                    <p className="text-xs text-emerald-600 font-medium">
                      Soit {price * 12}&nbsp;€/an — économie de {(plan.priceMonthly - price) * 12}&nbsp;€
                    </p>
                  )}
                  <p className="text-sm text-slate-500">{t(`pricing.plans.${plan.slug}.target`)}</p>
                </CardHeader>

                <CardContent className="flex flex-col flex-1">
                  <ul className="space-y-3 mb-6 flex-1">
                    {featureKeys.map((featureKey) => (
                      <li key={featureKey} className="flex items-start gap-2 text-sm text-slate-600">
                        <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        {t(`pricing.plans.${plan.slug}.features.${featureKey}`)}
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full mt-auto"
                    variant={plan.popular ? 'gradient' : 'outline'}
                    onClick={() => openSelectedPlan(plan)}
                  >
                    {isAuthenticated
                      ? t('pricing.manageSubscription', { defaultValue: 'Gérer mon abonnement' })
                      : t('pricing.startTrial', { plan: t(`pricing.plans.${plan.slug}.name`), defaultValue: 'Commencer l\'essai {{plan}}' })}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Steps */}
        <div className="grid gap-4 md:grid-cols-3 mb-10">
          {['one', 'two', 'three'].map((stepKey, i) => (
            <div key={stepKey} className="rounded-2xl border border-slate-200 bg-white/80 px-5 py-4 text-sm text-slate-600 shadow-sm flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-sky/10 text-brand-sky text-xs font-bold flex items-center justify-center">{i + 1}</span>
              <span>{t(`pricing.steps.${stepKey}`)}</span>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="rounded-3xl border border-brand-sky/15 bg-brand-sky/5 px-6 py-6 text-center mb-10">
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

        {/* FAQ */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-6 py-2 mb-8">
          <h2 className="text-base font-semibold text-slate-900 py-4 border-b border-slate-100">Questions fréquentes</h2>
          {FAQ_ITEMS.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>

        <div className="mt-4 text-center">
          <Button asChild variant="outline">
            <Link to={ROUTES.home}>{t('pricing.backHome')}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

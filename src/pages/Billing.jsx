import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, ExternalLink, Gauge, Layers3, LifeBuoy, Sparkles, Users, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/AuthContext';
import { dataClient } from '@/services/dataClient';

const PLAN_OFFERS = [
  { slug: 'starter', price: 49, icon: Zap, iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
  { slug: 'team', price: 149, icon: Users, iconBg: 'bg-sky-100', iconColor: 'text-sky-600', popular: true },
  { slug: 'scale', price: 399, icon: Layers3, iconBg: 'bg-amber-100', iconColor: 'text-amber-600' },
];

const FALLBACK_ENTITLEMENTS = {
  free: {
    plan_slug: 'free',
    plan_name: 'Free',
    credits_included: 50,
    seats_included: 3,
    crm_integrations: 0,
    includes_api_access: false,
    includes_priority_support: false,
  },
};

const ACTION_LABELS = {
  analyze: 'billing.actions.analyze',
  reanalyze_llm: 'billing.actions.reanalyze',
  discover_signals: 'billing.actions.discoverSignals',
  sequence: 'billing.actions.sequence',
  icp_generate: 'billing.actions.icpGenerate',
  analytics_insights: 'billing.actions.analyticsInsights',
  grant: 'billing.actions.grant',
  trial: 'billing.actions.trial',
};

const statusToneClassName = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  trial: 'bg-amber-100 text-amber-700 border-amber-200',
  past_due: 'bg-red-100 text-red-700 border-red-200',
  canceled: 'bg-red-100 text-red-700 border-red-200',
  inactive: 'bg-slate-100 text-slate-600 border-slate-200',
};

const getLocale = (language) => (String(language || '').toLowerCase().startsWith('fr') ? 'fr-FR' : 'en-GB');

const formatDate = (value, locale) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return value;
  }
};

const formatNumber = (value, locale) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? new Intl.NumberFormat(locale).format(parsed) : '0';
};

const formatRunway = (days, t) => {
  if (!days) return t('billing.runwayNoUsage');
  if (days >= 365) return t('billing.runwayLong');
  return t('billing.runwayDays', { count: days });
};

const getActionLabel = (action, t) => {
  const key = ACTION_LABELS[action];
  return key ? t(key) : String(action || 'unknown');
};

const openSalesEmail = (subject) => {
  window.open(`mailto:hello@aimlead.io?subject=${encodeURIComponent(subject)}`, '_blank');
};

const buildEntitlementBullets = (entitlements, t, locale) => ([
  t('billing.entitlements.credits', { count: formatNumber(entitlements?.credits_included ?? 0, locale) }),
  t('billing.entitlements.seats', { count: entitlements?.seats_included ?? 1 }),
  t('billing.entitlements.crm', { count: entitlements?.crm_integrations ?? 0 }),
  entitlements?.includes_api_access ? t('billing.entitlements.apiIncluded') : t('billing.entitlements.apiNotIncluded'),
  entitlements?.includes_priority_support ? t('billing.entitlements.prioritySupport') : t('billing.entitlements.standardSupport'),
]);

function UsageProgress({ percent = 0 }) {
  const safePercent = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-sky to-brand-sky-2 transition-all duration-300"
        style={{ width: `${safePercent}%` }}
      />
    </div>
  );
}

export default function Billing() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const locale = getLocale(i18n.language);

  const [creditsData, setCreditsData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dataClient.workspace.getCredits({ limit: 30 })
      .then((res) => {
        setCreditsData(res ?? null);
      })
      .catch(() => {
        setCreditsData(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const balance = creditsData?.balance ?? null;
  const transactions = creditsData?.transactions ?? [];
  const usage = creditsData?.usage ?? {};
  const topActions = creditsData?.top_actions ?? [];
  const billingStatus = creditsData?.plan?.billing_status ?? 'trial';
  const trialEndsAt = creditsData?.plan?.trial_ends_at ?? null;
  const planSlug = creditsData?.plan?.plan_slug ?? 'free';
  const entitlements = creditsData?.entitlements || FALLBACK_ENTITLEMENTS[planSlug] || FALLBACK_ENTITLEMENTS.free;

  const isOwner = user?.role === 'owner' || user?.workspace_role === 'owner';
  const currentPlanOffer = useMemo(
    () => PLAN_OFFERS.find((plan) => plan.slug === planSlug) || null,
    [planSlug]
  );

  const statusClassName = statusToneClassName[billingStatus] || statusToneClassName.inactive;
  const usedCredits = usage?.estimated_used_credits ?? 0;
  const usagePercent = usage?.usage_percent ?? 0;
  const recentUsage = usage?.recent_30d_credits ?? 0;
  const runwayDays = usage?.projected_runway_days ?? null;
  const creditIncluded = usage?.credits_included ?? entitlements?.credits_included ?? 0;
  const seatsIncluded = entitlements?.seats_included ?? 1;
  const crmSlotsIncluded = usage?.crm_slots_included ?? entitlements?.crm_integrations ?? 0;
  const crmSlotsUsed = usage?.crm_slots_used ?? 0;
  const crmSlotsRemaining = usage?.crm_slots_remaining ?? Math.max(0, crmSlotsIncluded - crmSlotsUsed);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t('billing.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('billing.subtitle')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 self-start"
          onClick={() => openSalesEmail('AimLeads billing review')}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t('billing.contactSales')}
        </Button>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{t('billing.currentPlan')}</CardTitle>
                  <Badge className={statusClassName}>
                    {t(`billing.status.${billingStatus}`, { defaultValue: billingStatus })}
                  </Badge>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                  {t(`billing.planNames.${planSlug}`, { defaultValue: entitlements?.plan_name || planSlug })}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {currentPlanOffer
                    ? t('billing.planPriceMonthly', { price: currentPlanOffer.price })
                    : t('billing.salesManagedPlan')}
                </p>
                {billingStatus === 'trial' && trialEndsAt && (
                  <p className="mt-2 text-xs font-medium text-amber-700">
                    {t('billing.trialEndsOn', { date: formatDate(trialEndsAt, locale) })}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => openSalesEmail(`AimLeads plan change (${planSlug})`)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t('billing.managePlan')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {buildEntitlementBullets(entitlements, t, locale).map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {item}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('billing.workspaceQuota')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {t('billing.remainingCredits')}
                  </p>
                  <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
                    {balance === null ? '…' : formatNumber(balance, locale)}
                  </p>
                </div>
                <div className="rounded-xl bg-white px-3 py-2 text-right shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {t('billing.includedCredits')}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{formatNumber(creditIncluded, locale)}</p>
                </div>
              </div>
              <div className="mt-4">
                <UsageProgress percent={usagePercent} />
                <p className="mt-2 text-xs text-slate-500">
                  {t('billing.usageSummary', {
                    used: formatNumber(usedCredits, locale),
                    total: formatNumber(creditIncluded, locale),
                    percent: usagePercent,
                  })}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('billing.last30Days')}</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{formatNumber(recentUsage, locale)}</p>
                <p className="mt-1 text-xs text-slate-500">{t('billing.last30DaysHint')}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('billing.runway')}</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{formatRunway(runwayDays, t)}</p>
                <p className="mt-1 text-xs text-slate-500">{t('billing.runwayHint')}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('billing.teamSeats')}</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{seatsIncluded}</p>
                <p className="mt-1 text-xs text-slate-500">{t('billing.teamSeatsHint')}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('billing.crmSlots')}</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{crmSlotsIncluded}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {t('billing.crmSlotsUsage', {
                    used: crmSlotsUsed,
                    total: crmSlotsIncluded,
                  })}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {crmSlotsRemaining > 0
                    ? t('billing.crmSlotsRemaining', { count: crmSlotsRemaining })
                    : t('billing.crmSlotsReached')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('billing.topUsageTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {topActions.length > 0 ? (
              <div className="space-y-3">
                {topActions.map((item) => (
                  <div key={item.action} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{getActionLabel(item.action, t)}</p>
                      <p className="text-xs text-slate-500">
                        {t('billing.topUsageMeta', { credits: formatNumber(item.credits, locale), count: item.count })}
                      </p>
                    </div>
                    <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {formatNumber(item.credits, locale)} cr
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                {t('billing.noUsageYet')}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('billing.recentUsageTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length > 0 ? (
              <div className="space-y-2">
                {transactions.slice(0, 8).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{getActionLabel(tx.action, t)}</p>
                      <p className="text-xs text-slate-500">{formatDate(tx.created_at, locale)}</p>
                    </div>
                    <div className={`rounded-full px-2.5 py-1 text-xs font-semibold ${Number(tx.amount) >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {Number(tx.amount) >= 0 ? '+' : ''}{formatNumber(tx.amount, locale)} cr
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                {t('billing.noTransactions')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-800">{t('billing.availablePlans')}</h2>
            <p className="text-xs text-slate-400">{t('billing.availablePlansHint')}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {PLAN_OFFERS.map((offer) => {
            const Icon = offer.icon;
            const isCurrent = offer.slug === planSlug;
            const offerEntitlements = creditsData?.plan_catalog?.find((plan) => plan.plan_slug === offer.slug)
              || FALLBACK_ENTITLEMENTS[offer.slug]
              || {
                credits_included: offer.slug === 'starter' ? 1000 : offer.slug === 'team' ? 3500 : 10000,
                seats_included: offer.slug === 'starter' ? 3 : offer.slug === 'team' ? 10 : 25,
                crm_integrations: offer.slug === 'starter' ? 1 : offer.slug === 'team' ? 2 : 5,
                includes_api_access: offer.slug === 'scale',
                includes_priority_support: offer.slug !== 'starter',
              };

            return (
              <Card
                key={offer.slug}
                className={`relative shadow-sm ${isCurrent ? 'border-2 border-brand-sky' : 'border border-slate-200'}`}
              >
                {offer.popular && !isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-sky px-2.5 py-1 text-[10px] font-bold text-white">
                    {t('billing.popular')}
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-sky px-2.5 py-1 text-[10px] font-bold text-white">
                    {t('billing.currentPlanBadge')}
                  </div>
                )}
                <CardContent className="pt-6">
                  <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl ${offer.iconBg}`}>
                    <Icon className={`h-5 w-5 ${offer.iconColor}`} />
                  </div>
                  <p className="text-lg font-semibold text-slate-900">
                    {t(`billing.planNames.${offer.slug}`, { defaultValue: offer.slug })}
                  </p>
                  <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
                    ${offer.price}
                    <span className="ml-1 text-sm font-normal text-slate-500">{t('billing.perMonth')}</span>
                  </p>

                  <div className="mt-4 space-y-2">
                    {buildEntitlementBullets(offerEntitlements, t, locale).map((item) => (
                      <div key={item} className="flex items-start gap-2 text-sm text-slate-600">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    className="mt-5 w-full"
                    variant={isCurrent ? 'default' : 'outline'}
                    size="sm"
                    disabled={isCurrent}
                    onClick={() => !isCurrent && openSalesEmail(`AimLeads upgrade to ${offer.slug}`)}
                  >
                    {isCurrent ? t('billing.currentPlanButton') : t('billing.switchPlan', {
                      plan: t(`billing.planNames.${offer.slug}`, { defaultValue: offer.slug }),
                    })}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-slate-400" />
            {t('billing.paymentTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-4">
              <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-800">{t('billing.salesManagedTitle')}</p>
                <p className="mt-1 text-xs leading-6 text-slate-500">{t('billing.salesManagedBody')}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-4">
              <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-800">{t('billing.supportTitle')}</p>
                <p className="mt-1 text-xs leading-6 text-slate-500">
                  {isOwner ? t('billing.supportOwnerBody') : t('billing.supportMemberBody')}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-brand-sky/15 bg-brand-sky/5 px-4 py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">{t('billing.nextBestActionTitle')}</p>
                <p className="mt-1 text-sm text-slate-500">{t('billing.nextBestActionBody')}</p>
              </div>
              <Button size="sm" className="gap-1.5 self-start" onClick={() => openSalesEmail('AimLeads credits and plan review')}>
                <Sparkles className="h-3.5 w-3.5" />
                {t('billing.requestReview')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <p className="mt-4 text-xs text-slate-400">{t('common.loading')}</p>
      )}
    </div>
  );
}

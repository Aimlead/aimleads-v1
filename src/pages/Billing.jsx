import React, { useMemo } from 'react';
import { AlertTriangle, Clock3, CreditCard, ExternalLink, Rocket, Sparkles, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { dataClient } from '@/services/dataClient';

const getLocale = (language) => (String(language || '').toLowerCase().startsWith('fr') ? 'fr-FR' : 'en-US');

const formatNumber = (value, locale) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? new Intl.NumberFormat(locale).format(parsed) : '0';
};

const formatDate = (value, locale) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
};

const resolveRunwayLabel = (days, t) => {
  if (!days) return t('billing.runwayNoUsage');
  if (days >= 365) return t('billing.runwayLong');
  return t('billing.runwayDays', { count: days });
};

const formatActionLabel = (action, t) => {
  const map = {
    analyze: 'billing.actions.analyze',
    reanalyze_llm: 'billing.actions.reanalyze',
    discover_signals: 'billing.actions.discoverSignals',
    sequence: 'billing.actions.sequence',
    icp_generate: 'billing.actions.icpGenerate',
    analytics_insights: 'billing.actions.analyticsInsights',
  };
  return map[action] ? t(map[action]) : action;
};

function ProgressBar({ value = 0 }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 transition-all duration-300"
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}

export default function Billing() {
  const { t, i18n } = useTranslation();
  const locale = getLocale(i18n.language);

  const { data: creditsData = null, isLoading } = useQuery({
    queryKey: ['workspace-credits-billing'],
    queryFn: () => dataClient.workspace.getCredits({ limit: 20 }),
    enabled: typeof dataClient.workspace?.getCredits === 'function',
  });

  const usage = creditsData?.usage || {};
  const entitlements = creditsData?.entitlements || {};
  const plan = creditsData?.plan || {};
  const topActions = creditsData?.top_actions || [];
  const transactions = creditsData?.transactions || [];

  const planSlug = plan?.plan_slug ?? entitlements?.plan_slug ?? 'free';
  const planName = t(`billing.planNames.${planSlug}`, { defaultValue: entitlements?.plan_name || planSlug });

  const includedCredits = usage?.credits_included ?? entitlements?.credits_included ?? 0;
  const usedCredits = usage?.estimated_used_credits ?? 0;
  const remainingCredits = creditsData?.balance ?? usage?.remaining_credits ?? Math.max(0, includedCredits - usedCredits);
  const usagePercent = usage?.usage_percent ?? (includedCredits > 0 ? Math.round((usedCredits / includedCredits) * 100) : 0);

  const seatsIncluded = entitlements?.seats_included ?? usage?.seats_included ?? 1;
  const seatsUsed = usage?.seats_used ?? usage?.reserved_seats ?? 1;
  const crmIncluded = usage?.crm_slots_included ?? entitlements?.crm_integrations ?? 0;
  const crmUsed = usage?.crm_slots_used ?? 0;
  const projectedRunwayDays = usage?.projected_runway_days ?? null;
  const lowCredits = includedCredits > 0 && remainingCredits <= Math.max(25, Math.round(includedCredits * 0.1));

  const renewalDate = plan?.renewal_date ?? plan?.trial_ends_at ?? null;
  const manageBillingUrl = creditsData?.manage_billing_url ?? creditsData?.billing_portal_url ?? null;
  const upgradeUrl = creditsData?.upgrade_url ?? null;
  const buyCreditsUrl = creditsData?.buy_credits_url ?? null;

  const usageMetrics = useMemo(() => [
    {
      label: t('billing.last30Days'),
      value: formatNumber(usedCredits, locale),
      hint: t('billing.usageSummary', {
        used: formatNumber(usedCredits, locale),
        total: formatNumber(includedCredits, locale),
        percent: usagePercent,
      }),
    },
    {
      label: t('billing.remainingCredits'),
      value: formatNumber(remainingCredits, locale),
      hint: `${formatNumber(Math.max(0, 100 - usagePercent), locale)}% ${t('common.remaining', 'remaining')}`,
    },
    {
      label: t('billing.runway'),
      value: resolveRunwayLabel(projectedRunwayDays, t),
      hint: t('billing.runwayHint'),
    },
    {
      label: t('billing.topUsageTitle'),
      value: formatNumber(topActions.reduce((acc, item) => acc + (item?.count ?? 0), 0), locale),
      hint: t('billing.topUsageMeta', {
        credits: formatNumber(topActions.reduce((acc, item) => acc + (item?.credits ?? 0), 0), locale),
        count: topActions.reduce((acc, item) => acc + (item?.count ?? 0), 0),
      }),
    },
  ], [
    t,
    usedCredits,
    locale,
    includedCredits,
    usagePercent,
    remainingCredits,
    projectedRunwayDays,
    topActions,
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Credits / Crédits IA</h1>
        <p className="text-sm text-slate-500">
          {t('billing.subtitle', 'Track monthly AI usage, credit limits, and workspace entitlements in one place.')}
        </p>
      </header>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="grid gap-6 p-6 md:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{planName}</Badge>
              <Badge variant="outline" className="border-slate-200 text-slate-600">{plan?.billing_status || 'trial'}</Badge>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{t('billing.remainingCredits')}</p>
                <p className="mt-1 text-3xl font-bold text-slate-950">{formatNumber(remainingCredits, locale)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{t('billing.includedCredits')}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{formatNumber(includedCredits, locale)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{t('billing.runway')}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{resolveRunwayLabel(projectedRunwayDays, t)}</p>
              </div>
            </div>
            <div className="space-y-2">
              <ProgressBar value={usagePercent} />
              <p className="text-xs text-slate-500">
                {t('billing.usageSummary', {
                  used: formatNumber(usedCredits, locale),
                  total: formatNumber(includedCredits, locale),
                  percent: usagePercent,
                })}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Renewal / trial end</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{formatDate(renewalDate, locale)}</p>
            <div className="mt-4 space-y-2">
              <Button size="sm" className="w-full gap-1.5" disabled={!upgradeUrl} onClick={() => upgradeUrl && window.open(upgradeUrl, '_blank', 'noopener,noreferrer')}>
                <Rocket className="h-3.5 w-3.5" />
                Upgrade plan {!upgradeUrl && '(TODO)'}
              </Button>
              <Button size="sm" variant="outline" className="w-full gap-1.5" disabled={!buyCreditsUrl} onClick={() => buyCreditsUrl && window.open(buyCreditsUrl, '_blank', 'noopener,noreferrer')}>
                <Sparkles className="h-3.5 w-3.5" />
                Buy credits {!buyCreditsUrl && '(TODO)'}
              </Button>
              <Button size="sm" variant="outline" className="w-full gap-1.5" disabled={!manageBillingUrl} onClick={() => manageBillingUrl && window.open(manageBillingUrl, '_blank', 'noopener,noreferrer')}>
                <CreditCard className="h-3.5 w-3.5" />
                Manage billing {!manageBillingUrl && '(TODO)'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {lowCredits && (
        <Card className="border-amber-200 bg-amber-50/60 shadow-sm">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Low credits warning</p>
              <p className="text-sm text-amber-800">
                Your workspace is running low on credits. Contact sales or upgrade to avoid interruptions.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {usageMetrics.map((metric) => (
          <Card key={metric.label} className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{metric.value}</p>
              <p className="mt-1 text-xs text-slate-500">{metric.hint}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Entitlements & limits</CardTitle>
            <CardDescription>Workspace seats, CRM slots, and plan features</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
              <span className="inline-flex items-center gap-2"><Users className="h-4 w-4 text-slate-400" /> Seats</span>
              <span>{formatNumber(seatsUsed, locale)} / {formatNumber(seatsIncluded, locale)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
              <span className="inline-flex items-center gap-2"><ExternalLink className="h-4 w-4 text-slate-400" /> CRM integrations</span>
              <span>{formatNumber(crmUsed, locale)} / {formatNumber(crmIncluded, locale)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
              <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-slate-400" /> Analysis credits</span>
              <span>{formatNumber(remainingCredits, locale)} / {formatNumber(includedCredits, locale)}</span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
              API access: {entitlements?.includes_api_access ? 'Included' : 'Not included'} · Priority support: {entitlements?.includes_priority_support ? 'Included' : 'Standard'}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Top actions</CardTitle>
            <CardDescription>Most credit-consuming AI actions this cycle</CardDescription>
          </CardHeader>
          <CardContent>
            {topActions.length > 0 ? (
              <div className="space-y-2">
                {topActions.slice(0, 5).map((item) => (
                  <div key={item.action} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{formatActionLabel(item.action, t)}</p>
                      <p className="text-xs text-slate-500">{item.count ?? 0} runs</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-700">{formatNumber(item.credits ?? 0, locale)} cr</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No top actions recorded yet.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4 text-slate-400" /> Usage history</CardTitle>
          <CardDescription>Credit transactions and usage events</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length > 0 ? (
            <div className="space-y-2">
              {transactions.slice(0, 8).map((tx) => (
                <div key={tx.id || `${tx.action}-${tx.created_at}`} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{formatActionLabel(tx.action, t)}</p>
                    <p className="text-xs text-slate-500">{formatDate(tx.created_at, locale)}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-700">{formatNumber(tx.amount ?? 0, locale)} cr</span>
                </div>
              ))}
            </div>
          ) : (
            // TODO(billing): replace this placeholder when a dedicated usage-history endpoint is available.
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No usage history available yet.
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading && <p className="text-xs text-slate-400">{t('common.loading')}</p>}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { CreditCard, CheckCircle2, ExternalLink, Zap, Users, Building2, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/ui/EmptyState';
import { useAuth } from '@/lib/AuthContext';
import { dataClient } from '@/services/dataClient';

// ─── Plan catalogue ────────────────────────────────────────────────────────────
// 1 credit = $0.05 USD.  Bundles are designed so each plan stays ~35-45% GM
// after claude-sonnet-4-6 API costs (~$0.027/analyze call = 1 credit).
const PLANS = [
  {
    slug: 'starter',
    name: 'Starter',
    price: 49,
    credits: 1000,
    icon: Zap,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    features: ['1 000 credits/month', 'AI ICP scoring', 'Email icebreakers', 'CSV import', 'Basic analytics'],
  },
  {
    slug: 'team',
    name: 'Team',
    price: 149,
    credits: 3500,
    icon: Users,
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
    popular: true,
    features: ['3 500 credits/month', 'All Starter features', 'LinkedIn & call icebreakers', 'Team collaboration', 'Priority support', 'Advanced analytics'],
  },
  {
    slug: 'scale',
    name: 'Scale',
    price: 399,
    credits: 10000,
    icon: Building2,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    features: ['10 000 credits/month', 'All Team features', 'Custom ICP training', 'API access', 'Dedicated CSM'],
  },
];

// Credit cost labels (mirrors server/lib/credits.js CREDIT_COSTS)
const ACTION_LABELS = {
  analyze: 'Lead analysis',
  reanalyze_llm: 'AI re-analysis',
  discover_signals: 'Signal discovery',
  sequence: 'Outreach sequence',
  icp_generate: 'ICP generation',
  analytics_insights: 'Analytics insights',
  grant: 'Credits granted',
  trial: 'Trial credits',
};

function actionLabel(action) {
  return ACTION_LABELS[action] || action;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

// ─── Credits section ──────────────────────────────────────────────────────────
function CreditsSection({ balance, transactions, costs, plan, isOwner }) {
  const isLow = balance !== null && balance <= 10;
  const isEmpty = balance !== null && balance === 0;

  return (
    <Card className="mb-6 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">AI Credits</CardTitle>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${
            balance === null ? 'bg-slate-50 border-slate-200 text-slate-400' :
            isEmpty ? 'bg-red-50 border-red-200 text-red-600' :
            isLow ? 'bg-amber-50 border-amber-200 text-amber-700' :
            'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}>
            <Zap className="w-3 h-3" />
            <span>{balance === null ? '…' : balance} credits remaining</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Cost reference */}
        <div className="mb-4">
          <p className="text-xs font-medium text-slate-500 mb-2">Credit cost per action</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {costs && Object.entries(costs).map(([action, cost]) => (
              <div key={action} className="flex items-center justify-between bg-slate-50 rounded-lg px-2.5 py-1.5">
                <span className="text-xs text-slate-600">{actionLabel(action)}</span>
                <Badge variant="outline" className="text-[10px] ml-1 shrink-0">{cost}cr</Badge>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">1 credit ≈ $0.05 USD · based on claude-sonnet-4-6 API cost</p>
        </div>

        {/* Recent transactions */}
        {transactions && transactions.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Recent usage</p>
            <div className="space-y-1">
              {transactions.slice(0, 8).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{actionLabel(tx.action)}</p>
                    <p className="text-[11px] text-slate-400">{formatDate(tx.created_at)}</p>
                  </div>
                  <span className={`text-xs font-semibold shrink-0 ml-2 ${tx.amount >= 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                    {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} cr
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState icon={Zap} title="Aucune transaction" description="Les crédits sont débités à chaque utilisation des fonctionnalités IA." className="py-8" />
        )}

        {isOwner && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">Need more credits? Contact your account executive or <span className="font-medium text-sky-600">hello@aimlead.io</span> to top up.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function Billing() {
  const { user } = useAuth();
  const [creditsData, setCreditsData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dataClient.workspace.getCredits({ limit: 20 })
      .then((res) => {
        setCreditsData(res?.data ?? null);
      })
      .catch(() => {
        setCreditsData(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const balance = creditsData?.balance ?? null;
  const transactions = creditsData?.transactions ?? [];
  const costs = creditsData?.costs ?? {};
  const planSlug = creditsData?.plan?.plan_slug ?? 'free';
  const billingStatus = creditsData?.plan?.billing_status ?? 'trial';

  const activePlan = PLANS.find((p) => p.slug === planSlug) || null;
  const ActiveIcon = activePlan?.icon;

  // Determine if the current user is the workspace owner
  const isOwner = user?.role === 'owner' || user?.workspace_role === 'owner';

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Billing & Subscription</h1>
        <p className="text-slate-500 mt-1 text-sm">Manage your plan, AI credits, and subscription.</p>
      </div>

      {/* Current plan */}
      <Card className="mb-6 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Current Plan</CardTitle>
            {loading ? (
              <Badge className="bg-slate-100 text-slate-400 border-slate-200">Loading…</Badge>
            ) : billingStatus === 'active' ? (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>
            ) : billingStatus === 'trial' ? (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200">Trial</Badge>
            ) : (
              <Badge variant="destructive">Inactive</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {activePlan ? (
            <>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl ${activePlan.iconBg} flex items-center justify-center shrink-0`}>
                  <ActiveIcon className={`w-6 h-6 ${activePlan.iconColor}`} />
                </div>
                <div className="flex-1">
                  <p className="text-xl font-bold text-slate-900">{activePlan.name}</p>
                  <p className="text-sm text-slate-500">${activePlan.price}/month · {activePlan.credits.toLocaleString()} credits included</p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open('mailto:hello@aimlead.io?subject=Plan change', '_blank')}>
                  <ExternalLink className="w-3.5 h-3.5" />
                  Manage
                </Button>
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {activePlan.features.map((f) => (
                  <div key={f} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <Zap className="w-6 h-6 text-slate-400" />
              </div>
              <div className="flex-1">
                <p className="text-xl font-bold text-slate-900">Free / Trial</p>
                <p className="text-sm text-slate-500">50 trial credits · upgrade to unlock more</p>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open('mailto:hello@aimlead.io?subject=Upgrade plan', '_blank')}>
                <ExternalLink className="w-3.5 h-3.5" />
                Upgrade
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credits section */}
      <CreditsSection
        balance={balance}
        transactions={transactions}
        costs={costs}
        plan={creditsData?.plan}
        isOwner={isOwner}
      />

      {/* Available plans */}
      <div className="mb-6">
        <h2 className="text-base font-semibold text-slate-800 mb-1">Available Plans</h2>
        <p className="text-xs text-slate-400 mb-3">Contact <span className="font-medium">hello@aimlead.io</span> to change plan. Stripe self-serve coming soon.</p>
        <div className="grid sm:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const isCurrent = plan.slug === planSlug;
            return (
              <Card key={plan.slug} className={`relative shadow-sm ${isCurrent ? 'border-2 border-sky-500' : 'border border-slate-200'}`}>
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-sky-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full">Current</div>
                )}
                <CardContent className="pt-6 pb-4">
                  <div className={`w-10 h-10 rounded-xl ${plan.iconBg} flex items-center justify-center mb-3`}>
                    <Icon className={`w-5 h-5 ${plan.iconColor}`} />
                  </div>
                  <p className="font-bold text-slate-900">{plan.name}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">${plan.price}<span className="text-sm font-normal text-slate-500">/mo</span></p>
                  <p className="text-xs text-slate-400 mb-3">{plan.credits.toLocaleString()} credits/month</p>
                  <ul className="space-y-1.5 mb-4">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-1.5 text-xs text-slate-600">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />{f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={isCurrent ? 'default' : 'outline'}
                    size="sm"
                    disabled={isCurrent}
                    onClick={() => !isCurrent && window.open(`mailto:hello@aimlead.io?subject=Upgrade to ${plan.name}`, '_blank')}
                  >
                    {isCurrent ? 'Current Plan' : `Switch to ${plan.name}`}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Billing management note */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-slate-400" />
            Payment & Billing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3">
            <TrendingDown className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-slate-700 font-medium">Managed by your account executive</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Invoicing, payment method changes, and billing history are handled by your AimLeads account executive.
                Email <span className="font-medium text-sky-600">hello@aimlead.io</span> for any billing queries.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

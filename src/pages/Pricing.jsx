import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Check, Users, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/lib/AuthContext';
import { dataClient } from '@/services/dataClient';

const plans = [
  {
    slug: 'starter',
    name: 'Starter',
    price: 49,
    icon: Zap,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    target: 'Solo SDRs and founders validating their outbound motion',
    features: ['100 leads/month', 'AI ICP scoring', 'Email icebreakers', 'CSV import', 'Basic analytics'],
  },
  {
    slug: 'team',
    name: 'Team',
    price: 149,
    icon: Users,
    iconBg: 'bg-brand-sky/10',
    iconColor: 'text-brand-sky',
    popular: true,
    target: 'Small sales teams who need a shared qualification workflow',
    features: [
      '500 leads/month',
      'All Starter features',
      'LinkedIn and call icebreakers',
      'Team collaboration',
      'Priority support',
      'Advanced analytics',
    ],
  },
  {
    slug: 'scale',
    name: 'Scale',
    price: 399,
    icon: Building2,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    target: 'Revenue teams rolling AimLeads out across multiple operators',
    features: ['Unlimited leads', 'All Team features', 'Custom ICP training', 'API access', 'Dedicated CSM', 'White-label reports'],
  },
];

export default function Pricing() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

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
          <h1 className="text-4xl font-bold text-slate-900 mb-4">Simple, Transparent Pricing</h1>
          <p className="text-lg text-slate-500">Choose the setup that matches your sales motion, then reach first value fast.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {plans.map((plan) => {
            const Icon = plan.icon;
            return (
              <Card
                key={plan.name}
                className={`relative shadow-sm ${
                  plan.popular ? 'border-2 border-brand-sky shadow-lg shadow-brand-sky/10' : 'border border-slate-200'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-brand-sky text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}

                <CardHeader>
                  <div className={`w-12 h-12 rounded-xl ${plan.iconBg} flex items-center justify-center mb-3`}>
                    <Icon className={`w-6 h-6 ${plan.iconColor}`} />
                  </div>

                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-bold text-slate-900">${plan.price}</span>
                    <span className="text-slate-500 mb-1">/month</span>
                  </div>
                  <p className="text-sm text-slate-500">{plan.target}</p>
                </CardHeader>

                <CardContent>
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm text-slate-600">
                        <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={`w-full ${plan.popular ? 'bg-gradient-to-r from-brand-sky to-brand-sky-2 hover:from-brand-sky-2 hover:to-brand-navy-2' : ''}`}
                    variant={plan.popular ? 'default' : 'outline'}
                    onClick={() => openSelectedPlan(plan)}
                  >
                    {isAuthenticated ? 'Open Workspace' : `Start ${plan.name}`}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-3 mb-10">
          {[
            '1. Create your workspace and pick the setup that matches your sales team.',
            '2. Import leads, activate an ICP, and score your first batch in minutes.',
            '3. Invite teammates or book a strategy review when you want guided rollout help.',
          ].map((step) => (
            <div key={step} className="rounded-2xl border border-slate-200 bg-white/80 px-5 py-4 text-sm text-slate-600 shadow-sm">
              {step}
            </div>
          ))}
        </div>

        <div className="text-center">
          <Button asChild variant="outline">
            <Link to={ROUTES.home}>Back to Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

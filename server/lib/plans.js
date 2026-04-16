const PLAN_ENTITLEMENTS = {
  free: {
    plan_slug: 'free',
    plan_name: 'Free',
    credits_included: 50,
    seats_included: 3,
    crm_integrations: 0,
    includes_api_access: false,
    includes_priority_support: false,
  },
  starter: {
    plan_slug: 'starter',
    plan_name: 'Starter',
    credits_included: 1000,
    seats_included: 3,
    crm_integrations: 1,
    includes_api_access: false,
    includes_priority_support: false,
  },
  team: {
    plan_slug: 'team',
    plan_name: 'Team',
    credits_included: 3500,
    seats_included: 10,
    crm_integrations: 2,
    includes_api_access: false,
    includes_priority_support: true,
  },
  scale: {
    plan_slug: 'scale',
    plan_name: 'Scale',
    credits_included: 10000,
    seats_included: 25,
    crm_integrations: 5,
    includes_api_access: true,
    includes_priority_support: true,
  },
};

export const DEFAULT_PLAN_SLUG = 'free';

export const getPlanEntitlements = (planSlug = DEFAULT_PLAN_SLUG) => {
  const normalized = String(planSlug || DEFAULT_PLAN_SLUG).trim().toLowerCase();
  return PLAN_ENTITLEMENTS[normalized] || PLAN_ENTITLEMENTS[DEFAULT_PLAN_SLUG];
};

export const getPlanCatalog = () => Object.values(PLAN_ENTITLEMENTS);

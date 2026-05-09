const PLAN_ENTITLEMENTS = {
  free: {
    plan_slug: 'free',
    plan_name: 'Free',
    credits_included: 50,
    seats_included: 3,
    // 1 CRM slot is unlocked during free trial so users can validate the loop end-to-end.
    crm_integrations: 1,
    includes_api_access: false,
    includes_priority_support: false,
    includes_ai_sequences: true,
    includes_signal_discovery: true,
    includes_analytics: true,
  },
  starter: {
    plan_slug: 'starter',
    plan_name: 'Starter',
    credits_included: 1000,
    seats_included: 3,
    crm_integrations: 1,
    includes_api_access: false,
    includes_priority_support: false,
    includes_ai_sequences: true,
    includes_signal_discovery: true,
    includes_analytics: true,
  },
  team: {
    plan_slug: 'team',
    plan_name: 'Team',
    credits_included: 3500,
    seats_included: 10,
    crm_integrations: 2,
    includes_api_access: false,
    includes_priority_support: true,
    includes_ai_sequences: true,
    includes_signal_discovery: true,
    includes_analytics: true,
  },
  scale: {
    plan_slug: 'scale',
    plan_name: 'Scale',
    credits_included: 10000,
    seats_included: 25,
    crm_integrations: 5,
    includes_api_access: true,
    includes_priority_support: true,
    includes_ai_sequences: true,
    includes_signal_discovery: true,
    includes_analytics: true,
  },
};

// Plan tier ordering for requirePlan middleware
const PLAN_TIER = { free: 0, starter: 1, team: 2, scale: 3 };

export const getPlanTier = (planSlug) => PLAN_TIER[String(planSlug || 'free').toLowerCase()] ?? 0;

export const planMeetsMinimum = (workspacePlan, minPlan) =>
  getPlanTier(workspacePlan) >= getPlanTier(minPlan);

export const DEFAULT_PLAN_SLUG = 'free';

export const getPlanEntitlements = (planSlug = DEFAULT_PLAN_SLUG) => {
  const normalized = String(planSlug || DEFAULT_PLAN_SLUG).trim().toLowerCase();
  return PLAN_ENTITLEMENTS[normalized] || PLAN_ENTITLEMENTS[DEFAULT_PLAN_SLUG];
};

export const getPlanCatalog = () => Object.values(PLAN_ENTITLEMENTS);

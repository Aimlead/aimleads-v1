import { ROUTES } from '@/constants/routes';
import { getActivationSnapshot } from '@/lib/activation';
import { dataClient } from '@/services/dataClient';

const resolveSafeRoute = (candidate) => {
  if (!candidate || typeof candidate !== 'string') return ROUTES.dashboard;
  return candidate.startsWith('/') ? candidate : ROUTES.dashboard;
};

export const getWorkspaceActivationSnapshot = async () => {
  const [leads, icpProfiles] = await Promise.all([
    dataClient.leads.list('-created_at'),
    dataClient.icp.list(),
  ]);

  const activeIcp = (icpProfiles || []).find((profile) => profile.is_active) || icpProfiles?.[0] || null;
  return getActivationSnapshot({ activeIcp, leads: leads || [] });
};

export const resolvePostAuthRoute = async (preferredRoute) => {
  const safePreferredRoute = resolveSafeRoute(preferredRoute);
  if (safePreferredRoute !== ROUTES.dashboard) {
    return safePreferredRoute;
  }

  try {
    const snapshot = await getWorkspaceActivationSnapshot();
    return snapshot?.isComplete ? ROUTES.dashboard : ROUTES.onboarding;
  } catch {
    return ROUTES.dashboard;
  }
};

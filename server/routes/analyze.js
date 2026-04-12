import express from 'express';
import { requireAuth, wrapAsyncRoutes } from '../lib/middleware.js';
import { requireCredits, logTokenUsage } from '../lib/credits.js';
import { analyzeLead } from '../services/analyzeService.js';
import { dataStore } from '../lib/dataStore.js';
import { schemas, validateBody } from '../lib/validation.js';
import { createUserRateLimit } from '../lib/rateLimit.js';

const router = express.Router();
wrapAsyncRoutes(router);

router.use(requireAuth);

// Strict per-user rate limit for LLM analyze calls (20/hour)
const analyzeLimiter = createUserRateLimit({
  namespace: 'analyze_user',
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many AI analysis requests, please wait before trying again.',
});

router.use(analyzeLimiter);

router.post('/', requireCredits('analyze'), validateBody(schemas.analyzeSchema), async (req, res) => {
  const payload = req.validatedBody || {};
  const lead = payload.lead || null;

  if (!lead) {
    return res.status(400).json({ message: 'Lead payload is required' });
  }

  const requestedProfileId =
    payload.icp_profile_id || payload.icpProfileId || payload.icp_profile?.id || payload.icpProfile?.id;

  let icpProfile = null;

  if (requestedProfileId) {
    icpProfile = await dataStore.getIcpProfileById(req.user, requestedProfileId);
  }

  if (!icpProfile) {
    icpProfile = await dataStore.getActiveIcpProfile(req.user);
  }

  if (!icpProfile) {
    return res.status(400).json({ message: 'No active ICP profile found' });
  }

  const result = await analyzeLead({ lead, icpProfile });
  if (result._token_usage) logTokenUsage(req, 'analyze', result._token_usage);
  return res.json({ data: result });
});

export default router;




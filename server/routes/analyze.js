import express from 'express';
import { requireAuth, wrapAsyncRoutes } from '../lib/middleware.js';
import { requireCredits, logTokenUsage } from '../lib/credits.js';
import { analyzeLead } from '../services/analyzeService.js';
import { dataStore } from '../lib/dataStore.js';
import { schemas, validateBody } from '../lib/validation.js';
import { createUserRateLimit } from '../lib/rateLimit.js';
import { runAiOperation } from '../services/aiRunService.js';
import { ANALYSIS_PROMPT_VERSION } from '../services/llmService.js';
import { addBreadcrumb } from '../lib/sentry.js';
import { isFeatureFlagEnabled } from '../lib/featureFlags.js';
import { getUserWorkspaceId } from '../lib/scope.js';
import { enqueueJob } from '../lib/queue.js';

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

const shouldRunAsync = async (req) => {
  if (req.validatedBody?.async !== true) return false;
  return isFeatureFlagEnabled(getUserWorkspaceId(req.user), 'async_jobs');
};

const runAnalyzeOperation = async ({ user, lead, icpProfile }) => {
  const result = await runAiOperation({
    user,
    leadId: lead.id || null,
    action: 'analyze',
    provider: 'internal',
    promptVersion: ANALYSIS_PROMPT_VERSION,
    requestPayload: {
      lead: {
        id: lead.id || null,
        company_name: lead.company_name || null,
        website_url: lead.website_url || null,
      },
      icp_profile_id: icpProfile.id || null,
      skip_llm: false,
    },
    execute: () => analyzeLead({ lead, icpProfile }),
  });

  return result;
};

router.post('/', requireCredits('analyze'), validateBody(schemas.analyzeSchema), async (req, res) => {
  const payload = req.validatedBody || {};
  const lead = payload.lead || null;
  addBreadcrumb({
    category: 'ai',
    message: 'ai.analyze.requested',
    data: {
      user_id: req.user?.id || null,
      workspace_id: req.user?.workspace_id || null,
      lead_id: lead?.id || null,
      has_explicit_icp_profile: Boolean(payload.icp_profile_id || payload.icpProfileId || payload.icp_profile?.id || payload.icpProfile?.id),
    },
  });

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

  if (await shouldRunAsync(req)) {
    const job = enqueueJob({
      name: 'Lead analysis',
      action: 'analyze',
      workspaceId: getUserWorkspaceId(req.user),
      userId: req.user.id,
      leadId: lead.id || null,
      initialMessage: 'Queued for AI analysis',
      runningMessage: 'Analyzing lead',
      execute: async ({ setProgress }) => {
        setProgress(35, 'Loading ICP and scoring context');
        const result = await runAnalyzeOperation({ user: req.user, lead, icpProfile });
        if (result?._token_usage) logTokenUsage(req, 'analyze', result._token_usage);
        setProgress(100, 'Analysis completed');
        return { data: result };
      },
    });

    return res.status(202).json({
      data: {
        jobId: job.id,
        status: job.status,
      },
    });
  }

  const result = await runAnalyzeOperation({ user: req.user, lead, icpProfile });
  if (result._token_usage) logTokenUsage(req, 'analyze', result._token_usage);
  return res.json({ data: result });
});

export default router;

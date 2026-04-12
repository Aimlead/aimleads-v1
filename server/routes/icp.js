import express from 'express';
import { requireAuth, wrapAsyncRoutes } from '../lib/middleware.js';
import { requireCredits, logTokenUsage } from '../lib/credits.js';
import { dataStore } from '../lib/dataStore.js';
import { schemas, validateBody } from '../lib/validation.js';
import { writeAuditLog } from '../lib/auditLog.js';
import { generateIcpFromDescription, icpGeneratorAvailable } from '../services/icpGeneratorService.js';
import { createUserRateLimit } from '../lib/rateLimit.js';
import { logger } from '../lib/observability.js';

const router = express.Router();
wrapAsyncRoutes(router);

router.use(requireAuth);

// Rate limit ICP generation — 10/hour per user (LLM call)
const icpGenerateLimiter = createUserRateLimit({
  namespace: 'icp_generate_user',
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many ICP generation requests, please wait before trying again.',
});

router.get('/', async (req, res) => {
  const all = await dataStore.listIcpProfiles(req.user);

  const limit = req.query.limit ? Math.max(1, Math.min(500, Number.parseInt(req.query.limit, 10))) : null;
  const page = req.query.page ? Math.max(1, Number.parseInt(req.query.page, 10)) : 1;
  const offset = req.query.offset !== undefined ? Math.max(0, Number.parseInt(req.query.offset, 10)) : limit ? (page - 1) * limit : 0;

  if (limit) {
    const paginated = (all || []).slice(offset, offset + limit);
    return res.json({
      data: paginated,
      meta: {
        total: (all || []).length,
        limit,
        offset,
        page,
        pages: Math.ceil((all || []).length / limit),
      },
    });
  }

  return res.json({ data: all });
});

router.post('/filter', validateBody(schemas.whereSchema), async (req, res) => {
  const where = req.validatedBody.where || {};
  const filtered = await dataStore.filterIcpProfiles(req.user, where);
  return res.json({ data: filtered });
});

router.get('/active', async (req, res) => {
  const active = await dataStore.getActiveIcpProfile(req.user);
  return res.json({ data: active || null });
});

router.put('/active', validateBody(schemas.icpActiveSchema), async (req, res) => {
  const payload = req.validatedBody || {};
  const active = await dataStore.saveActiveIcpProfile(req.user, payload);

  if (!active) {
    return res.status(404).json({ message: 'ICP profile not found in your workspace' });
  }

  writeAuditLog({
    user: req.user,
    action: 'update',
    resourceType: 'icp_profile',
    resourceId: active.id,
    changes: { is_active: true, name: active.name },
  });

  return res.json({ data: active });
});

// Create a new ICP profile
router.post('/', validateBody(schemas.icpActiveSchema), async (req, res) => {
  const payload = req.validatedBody || {};
  const profile = await dataStore.createIcpProfile(req.user, payload);

  writeAuditLog({
    user: req.user,
    action: 'create',
    resourceType: 'icp_profile',
    resourceId: profile.id,
    changes: { name: profile.name },
  });

  return res.status(201).json({ data: profile });
});

// Get a specific ICP profile by ID
router.get('/:profileId', async (req, res) => {
  const profile = await dataStore.getIcpProfileById(req.user, req.params.profileId);

  if (!profile) {
    return res.status(404).json({ message: 'ICP profile not found' });
  }

  return res.json({ data: profile });
});

// Update an ICP profile
router.patch('/:profileId', validateBody(schemas.icpActiveSchema.partial()), async (req, res) => {
  const updates = req.validatedBody || {};
  const updated = await dataStore.updateIcpProfile(req.user, req.params.profileId, updates);

  if (!updated) {
    return res.status(404).json({ message: 'ICP profile not found' });
  }

  writeAuditLog({
    user: req.user,
    action: 'update',
    resourceType: 'icp_profile',
    resourceId: req.params.profileId,
    changes: updates,
  });

  return res.json({ data: updated });
});

// Delete an ICP profile
router.delete('/:profileId', async (req, res) => {
  const deleted = await dataStore.deleteIcpProfile(req.user, req.params.profileId);

  if (!deleted) {
    return res.status(404).json({ message: 'ICP profile not found' });
  }

  writeAuditLog({
    user: req.user,
    action: 'delete',
    resourceType: 'icp_profile',
    resourceId: deleted.id,
    changes: { name: deleted.name },
  });

  return res.status(200).json({ data: { id: deleted.id, deleted: true } });
});

// ─── AI: Generate ICP from natural language ───────────────────────────────────

router.post('/generate', icpGenerateLimiter, requireCredits('icp_generate'), validateBody(schemas.icpGenerateSchema), async (req, res) => {
  if (!icpGeneratorAvailable) {
    return res.status(503).json({ message: 'AI ICP generation is not available (no LLM key configured).' });
  }

  const { description } = req.validatedBody;

  const result = await generateIcpFromDescription(description);
  if (!result) {
    logger.warn('icp_generate_null', { reason: 'llm_returned_null', description_length: description.length });
    return res.status(502).json({ message: 'AI generation failed. Please try again.' });
  }
  if (result._usage) logTokenUsage(req, 'icp_generate', result._usage);

  return res.json({ data: result });
});

export default router;



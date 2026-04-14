/**
 * CRM Routes
 *
 * Endpoints for managing HubSpot / Salesforce CRM integrations
 * and syncing leads to external CRM systems.
 *
 * All routes require authentication. Token management is restricted
 * to workspace owners and admins (enforced in the service layer).
 */

import express from 'express';
import { requireAuth, wrapAsyncRoutes } from '../lib/middleware.js';
import { schemas, validateBody } from '../lib/validation.js';
import { dataStore } from '../lib/dataStore.js';
import { getUserWorkspaceId } from '../lib/scope.js';
import { writeAuditLog } from '../lib/auditLog.js';
import { createUserRateLimit } from '../lib/rateLimit.js';
import {
  listCrmIntegrations,
  upsertCrmIntegration,
  deleteCrmIntegration,
  testCrmConnection,
  syncLeadToCrm,
  getLeadSyncStatus,
} from '../services/crmService.js';

const CRM_TYPES = ['hubspot', 'salesforce'];

// 200 sync calls per hour per user — generous for manual pushes
const crmSyncLimiter = createUserRateLimit({
  namespace: 'crm_sync_user',
  windowMs: 60 * 60 * 1000,
  max: 200,
  message: 'Too many CRM sync requests. Please wait before syncing again.',
});

const router = express.Router();
wrapAsyncRoutes(router);
router.use(requireAuth);

// ─── Integration management ───────────────────────────────────────────────────

/**
 * GET /crm
 * Returns all configured CRM integrations for the workspace.
 * Tokens are masked (***last4).
 */
router.get('/', async (req, res) => {
  const workspaceId = getUserWorkspaceId(req.user);
  const integrations = await listCrmIntegrations(workspaceId);
  return res.json({ data: integrations });
});

/**
 * POST /crm
 * Save (create or update) a CRM integration.
 * Body: { crm_type, api_token, config?: { instance_url? } }
 */
router.post('/', validateBody(schemas.crmSaveSchema), async (req, res) => {
  const workspaceId = getUserWorkspaceId(req.user);
  const { crm_type, api_token, config: crmConfig } = req.validatedBody;

  const integration = await upsertCrmIntegration(workspaceId, {
    crmType: crm_type,
    apiToken: api_token,
    config: crmConfig,
  });

  await writeAuditLog({
    user: req.user,
    action: 'update',
    resourceType: 'crm_integration',
    resourceId: `${workspaceId}:${crm_type}`,
    changes: { crm_type },
  }).catch(() => {});

  return res.json({ data: integration });
});

/**
 * DELETE /crm/:crmType
 * Remove a CRM integration.
 */
router.delete('/:crmType', async (req, res) => {
  const { crmType } = req.params;

  if (!CRM_TYPES.includes(crmType)) {
    return res.status(400).json({ message: 'Invalid CRM type. Must be hubspot or salesforce.' });
  }

  const workspaceId = getUserWorkspaceId(req.user);
  await deleteCrmIntegration(workspaceId, crmType);

  await writeAuditLog({
    user: req.user,
    action: 'delete',
    resourceType: 'crm_integration',
    resourceId: `${workspaceId}:${crmType}`,
    changes: { crm_type: crmType },
  }).catch(() => {});

  return res.json({ data: { deleted: true, crm_type: crmType } });
});

// ─── Connection test ──────────────────────────────────────────────────────────

/**
 * POST /crm/test
 * Test the saved credentials for a CRM type.
 * Body: { crm_type }
 */
router.post('/test', validateBody(schemas.crmTestSchema), async (req, res) => {
  const workspaceId = getUserWorkspaceId(req.user);
  const { crm_type } = req.validatedBody;

  const result = await testCrmConnection(workspaceId, crm_type);
  return res.json({ data: result });
});

// ─── Lead sync ────────────────────────────────────────────────────────────────

/**
 * POST /crm/sync/:leadId
 * Push a single lead to the specified CRM.
 * Body: { crm_type }
 */
router.post('/sync/:leadId', crmSyncLimiter, async (req, res) => {
  const { leadId } = req.params;
  const crmType = String(req.body?.crm_type || '').trim();

  if (!CRM_TYPES.includes(crmType)) {
    return res.status(400).json({ message: 'crm_type must be hubspot or salesforce.' });
  }

  const lead = await dataStore.getLeadById(req.user, leadId);
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });

  const workspaceId = getUserWorkspaceId(req.user);
  const result = await syncLeadToCrm(workspaceId, lead, crmType);

  await writeAuditLog({
    user: req.user,
    action: 'create',
    resourceType: 'crm_sync',
    resourceId: leadId,
    changes: {
      crm_type: crmType,
      success: result.success,
      crm_object_id: result.crmObjectId || null,
    },
  }).catch(() => {});

  const statusCode = result.success ? 200 : 502;
  return res.status(statusCode).json({ data: result });
});

/**
 * POST /crm/sync-bulk
 * Push multiple leads to the specified CRM (sequential to avoid rate-limiting).
 * Body: { lead_ids: string[], crm_type }
 */
router.post('/sync-bulk', crmSyncLimiter, validateBody(schemas.crmSyncBulkSchema), async (req, res) => {
  const { lead_ids, crm_type } = req.validatedBody;
  const workspaceId = getUserWorkspaceId(req.user);

  const results = [];

  for (const leadId of lead_ids) {
    const lead = await dataStore.getLeadById(req.user, leadId);
    if (!lead) {
      results.push({ lead_id: leadId, success: false, error: 'not_found' });
      continue;
    }
    const result = await syncLeadToCrm(workspaceId, lead, crm_type);
    results.push({ lead_id: leadId, ...result });
  }

  const successCount = results.filter((r) => r.success).length;

  return res.json({
    data: {
      results,
      summary: {
        total: lead_ids.length,
        success: successCount,
        failed: lead_ids.length - successCount,
      },
    },
  });
});

/**
 * GET /crm/sync-status/:leadId
 * Returns the 10 most recent sync records for a lead.
 */
router.get('/sync-status/:leadId', async (req, res) => {
  const { leadId } = req.params;

  const lead = await dataStore.getLeadById(req.user, leadId);
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });

  const workspaceId = getUserWorkspaceId(req.user);
  const records = await getLeadSyncStatus(workspaceId, leadId);

  return res.json({ data: records });
});

export default router;

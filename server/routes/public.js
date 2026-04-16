import express from 'express';
import { optionalAuth, wrapAsyncRoutes } from '../lib/middleware.js';
import { schemas, validateBody } from '../lib/validation.js';
import { createRateLimit } from '../lib/rateLimit.js';
import { createId } from '../lib/utils.js';
import { withDb } from '../lib/db.js';
import { getDataProvider } from '../lib/config.js';
import { logger } from '../lib/observability.js';

const router = express.Router();
wrapAsyncRoutes(router);

const demoRequestLimiter = createRateLimit({
  namespace: 'public_demo_request',
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.ip,
  message: 'Too many demo requests from this IP. Please try again later.',
});

const analyticsEventLimiter = createRateLimit({
  namespace: 'public_product_event',
  windowMs: 10 * 60 * 1000,
  max: 400,
  keyGenerator: (req) => req.ip,
  message: 'Too many analytics events from this IP. Please slow down.',
});

const persistLocalRecord = async (collection, record) => {
  if (getDataProvider() !== 'local') return;

  await withDb((current) => ({
    ...current,
    [collection]: [record, ...(current[collection] || [])],
  }));
};

router.post('/demo-requests', demoRequestLimiter, validateBody(schemas.demoRequestCreateSchema), async (req, res) => {
  const payload = req.validatedBody;

  const record = {
    id: createId('demo_request'),
    full_name: payload.full_name,
    company: payload.company,
    email: payload.email,
    team_size: payload.team_size || '',
    interest: payload.interest || '',
    notes: payload.notes || '',
    source: payload.source || 'booking_modal',
    created_at: new Date().toISOString(),
    ip: req.ip,
  };

  await persistLocalRecord('demoRequests', record);

  logger.info('demo_request_created', {
    demo_request_id: record.id,
    company: record.company,
    email: record.email,
    interest: record.interest || 'unspecified',
    source: record.source,
  });

  return res.status(201).json({
    ok: true,
    data: {
      id: record.id,
      message: 'Demo request received. Our team will follow up shortly.',
    },
  });
});

router.post('/analytics-events', analyticsEventLimiter, optionalAuth, validateBody(schemas.productEventSchema), async (req, res) => {
  const payload = req.validatedBody;
  const record = {
    id: createId('product_event'),
    event: payload.event,
    path: payload.path || '',
    source: payload.source || 'web_app',
    properties: payload.properties || {},
    workspace_id: req.user?.workspace_id || null,
    user_id: req.user?.id || null,
    created_at: new Date().toISOString(),
    ip: req.ip,
  };

  await persistLocalRecord('productEvents', record);

  logger.info('product_event_tracked', {
    event: record.event,
    path: record.path,
    source: record.source,
    workspace_id: record.workspace_id,
    user_id: record.user_id,
  });

  return res.status(202).json({ ok: true });
});

export default router;

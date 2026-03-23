import express from 'express';
import { requireAuth, wrapAsyncRoutes } from '../lib/middleware.js';
import { dataStore } from '../lib/dataStore.js';

const router = express.Router();
wrapAsyncRoutes(router);

router.use(requireAuth);

router.get('/', async (req, res) => {
  const limit = req.query.limit ? Math.max(1, Math.min(500, Number.parseInt(req.query.limit, 10))) : 100;
  const offset = req.query.offset ? Math.max(0, Number.parseInt(req.query.offset, 10)) : 0;

  const entries = await dataStore.listAuditLog(req.user, { limit, offset });
  return res.json({ data: entries, meta: { limit, offset } });
});

export default router;

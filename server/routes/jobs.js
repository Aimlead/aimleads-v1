import express from 'express';
import { requireAuth, wrapAsyncRoutes } from '../lib/middleware.js';
import { getUserWorkspaceId } from '../lib/scope.js';
import { getJobStatus } from '../lib/queue.js';

const router = express.Router();
wrapAsyncRoutes(router);

router.use(requireAuth);

router.get('/:jobId/status', async (req, res) => {
  const job = getJobStatus({
    jobId: req.params.jobId,
    workspaceId: getUserWorkspaceId(req.user),
  });

  if (!job) {
    return res.status(404).json({ message: 'Job not found' });
  }

  return res.json({ data: job });
});

export default router;

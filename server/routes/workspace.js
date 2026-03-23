import express from 'express';
import { requireAuth, wrapAsyncRoutes } from '../lib/middleware.js';
import { dataStore } from '../lib/dataStore.js';

const router = express.Router();
wrapAsyncRoutes(router);

/**
 * GET /api/v1/workspace/members
 * Returns the list of workspace members for the current user's workspace.
 */
router.get('/members', requireAuth, async (req, res) => {
  const user = req.user;
  const workspaceId = user.workspace_id;

  try {
    const members = await dataStore.listWorkspaceMembers(user);
    return res.json({ data: members });
  } catch {
    // Fallback: return just the current user as the only member
    return res.json({
      data: [
        {
          user_id: user.id,
          workspace_id: workspaceId,
          email: user.email,
          full_name: user.full_name,
          role: 'owner',
          created_at: user.created_at,
        },
      ],
    });
  }
});

/**
 * GET /api/v1/workspace/integration-status
 * Returns which external API keys are configured (without exposing values).
 */
router.get('/integration-status', requireAuth, (req, res) => {
  res.json({
    claude: Boolean(process.env.ANTHROPIC_API_KEY),
    hunter: Boolean(process.env.HUNTER_API_KEY),
    newsApi: Boolean(process.env.NEWS_API_KEY),
  });
});

export default router;

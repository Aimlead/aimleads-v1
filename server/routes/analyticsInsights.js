/**
 * Analytics Insights Route — AI-narrated pipeline intelligence
 *
 * POST /analytics/insights
 * Accepts aggregated analytics data and returns AI-generated executive insights.
 */

import express from 'express';
import { requireAuth, wrapAsyncRoutes } from '../lib/middleware.js';
import { narrateAnalytics, analyticsNarratorAvailable } from '../services/analyticsNarratorService.js';
import { createUserRateLimit } from '../lib/rateLimit.js';

const router = express.Router();
wrapAsyncRoutes(router);

router.use(requireAuth);

// 20 calls/hour — relatively cheap (small prompt, 1500 tokens max)
const insightsLimiter = createUserRateLimit({
  namespace: 'analytics_insights_user',
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many analytics insight requests, please wait.',
});

/**
 * POST /analytics/insights
 *
 * Body: {
 *   totalLeads: number,
 *   dateRangeLabel: string,
 *   avgScore: number,
 *   qualifiedCount: number,
 *   rejectedCount: number,
 *   pendingCount: number,
 *   scoreDistribution: { "80-100": n, "60-79": n, ... },
 *   categoryBreakdown: { "Excellent": n, "Strong Fit": n, ... },
 *   industryBreakdown: { "SaaS": n, "Fintech": n, ... },
 *   countryBreakdown: { "France": n, "Germany": n, ... },
 *   recentTrend?: { newLeads, newLeadsChange, avgScoreChange }
 * }
 */
router.post('/insights', insightsLimiter, async (req, res) => {
  if (!analyticsNarratorAvailable) {
    return res.status(503).json({ message: 'AI analytics insights are not available (no LLM key configured).' });
  }

  const data = req.body;

  if (!data || typeof data.totalLeads !== 'number') {
    return res.status(400).json({ message: 'totalLeads (number) is required.' });
  }

  if (data.totalLeads < 5) {
    return res.status(400).json({ message: 'At least 5 leads are required to generate insights.' });
  }

  const result = await narrateAnalytics(data);
  if (!result) {
    return res.status(502).json({ message: 'Analytics narration failed. Please try again.' });
  }

  return res.json({ data: result });
});

export default router;

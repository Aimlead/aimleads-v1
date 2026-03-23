/**
 * Analytics Narrator Service — AI-generated insights from lead analytics
 *
 * Takes aggregated analytics data (score distribution, segment breakdown,
 * conversion rates, trends) and returns human-readable executive insights.
 *
 * Uses Claude tool use for guaranteed structured output.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../lib/observability.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-6';
const LLM_TIMEOUT_MS = 30000;

const hasAnthropic = Boolean(ANTHROPIC_API_KEY);
let anthropicClient = null;
if (hasAnthropic) {
  anthropicClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

const SYSTEM_PROMPT = `You are a senior B2B revenue analyst specializing in SDR pipeline intelligence.
You interpret lead scoring data and surface actionable insights for sales leaders.
Be specific, data-driven, and concise. Avoid vague statements.
Always use the narrate_analytics tool to return your structured output.`;

// ─── Tool definition ───────────────────────────────────────────────────────────

const NARRATE_ANALYTICS_TOOL = {
  name: 'narrate_analytics',
  description:
    'Analyze aggregated lead scoring data and return structured executive-level insights with actionable recommendations.',
  input_schema: {
    type: 'object',
    properties: {
      headline: {
        type: 'string',
        description:
          'One punchy headline summarizing the most important finding (max 80 chars). E.g. "SaaS France leads convert 3× above average"',
      },
      summary: {
        type: 'string',
        description: '2-3 sentence executive summary of the overall lead pipeline quality.',
      },
      top_insights: {
        type: 'array',
        description: '3-5 specific, data-backed insights.',
        minItems: 3,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short title (max 50 chars)' },
            detail: { type: 'string', description: '1-2 sentences with the actual finding and implication.' },
            type: {
              type: 'string',
              enum: ['positive', 'negative', 'neutral', 'opportunity'],
              description: 'Nature of the insight',
            },
          },
          required: ['title', 'detail', 'type'],
        },
      },
      recommendations: {
        type: 'array',
        description: '2-3 specific, actionable next steps for the SDR team.',
        minItems: 2,
        maxItems: 3,
        items: {
          type: 'string',
          description: 'Concrete action item starting with a verb (e.g. "Focus prospecting on…")',
        },
      },
      best_segment: {
        type: 'object',
        description: 'The highest-performing segment identified in the data.',
        properties: {
          label: { type: 'string', description: 'Segment description (e.g. "SaaS, 50-200 employees, France")' },
          reason: { type: 'string', description: 'Why this segment performs best.' },
        },
        required: ['label', 'reason'],
      },
      risk_flag: {
        type: 'string',
        description:
          'One key risk or concern to flag (e.g. "40% of pipeline is Low Fit — review ICP criteria"). Null if no significant risk.',
      },
    },
    required: ['headline', 'summary', 'top_insights', 'recommendations', 'best_segment'],
  },
};

// ─── Prompt builder ────────────────────────────────────────────────────────────

const buildPrompt = (analyticsData) => {
  const {
    totalLeads,
    dateRangeLabel,
    scoreDistribution,
    categoryBreakdown,
    industryBreakdown,
    countryBreakdown,
    avgScore,
    qualifiedCount,
    rejectedCount,
    pendingCount,
    recentTrend,
  } = analyticsData;

  const formatBreakdown = (obj, max = 6) =>
    Object.entries(obj ?? {})
      .sort(([, a], [, b]) => b - a)
      .slice(0, max)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n') || '  No data';

  return `Analyze this B2B lead pipeline data and provide executive insights using the narrate_analytics tool.

## PIPELINE OVERVIEW
- Period: ${dateRangeLabel ?? 'All time'}
- Total leads: ${totalLeads ?? 0}
- Average score: ${avgScore != null ? Math.round(avgScore) : 'N/A'}/100
- Qualified: ${qualifiedCount ?? 0} | Rejected: ${rejectedCount ?? 0} | Pending: ${pendingCount ?? 0}

## SCORE DISTRIBUTION
${scoreDistribution
    ? Object.entries(scoreDistribution)
        .map(([band, count]) => `  ${band}: ${count} leads`)
        .join('\n')
    : '  No data'}

## ICP CATEGORY BREAKDOWN
${formatBreakdown(categoryBreakdown)}

## TOP INDUSTRIES
${formatBreakdown(industryBreakdown)}

## TOP COUNTRIES
${formatBreakdown(countryBreakdown)}

${
  recentTrend
    ? `## RECENT TREND (last 30 days vs previous period)
  New leads: ${recentTrend.newLeads ?? 'N/A'} (${recentTrend.newLeadsChange ?? 'N/A'})
  Avg score trend: ${recentTrend.avgScoreChange ?? 'N/A'}`
    : ''
}

Provide specific, data-driven insights. Reference actual numbers from the data.`;
};

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate AI-narrated analytics insights from lead data.
 *
 * @param {Object} analyticsData - Aggregated stats from the frontend or a server-side query
 * @returns {Promise<Object|null>}
 */
export async function narrateAnalytics(analyticsData) {
  if (!hasAnthropic) {
    logger.warn('analytics_narrator_no_llm', { reason: 'ANTHROPIC_API_KEY not set' });
    return null;
  }

  if (!analyticsData?.totalLeads || analyticsData.totalLeads < 5) {
    logger.warn('analytics_narrator_insufficient_data', { totalLeads: analyticsData?.totalLeads });
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('Analytics narrator timeout')), LLM_TIMEOUT_MS);

  try {
    const prompt = buildPrompt(analyticsData);

    const message = await anthropicClient.messages.create(
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        tools: [NARRATE_ANALYTICS_TOOL],
        tool_choice: { type: 'tool', name: 'narrate_analytics' },
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: controller.signal }
    );

    const toolUse = message.content?.find(
      (b) => b.type === 'tool_use' && b.name === 'narrate_analytics'
    );

    if (!toolUse?.input) {
      logger.warn('analytics_narrator_no_output');
      return null;
    }

    logger.info('analytics_narrator_success', { totalLeads: analyticsData.totalLeads });

    return {
      ...toolUse.input,
      generated_at: new Date().toISOString(),
      data_snapshot: {
        total_leads: analyticsData.totalLeads,
        period: analyticsData.dateRangeLabel ?? 'all_time',
      },
    };
  } catch (error) {
    logger.warn('analytics_narrator_failed', { error: error?.message });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const analyticsNarratorAvailable = hasAnthropic;

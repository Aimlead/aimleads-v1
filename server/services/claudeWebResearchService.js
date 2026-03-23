/**
 * Claude Web Research Service
 * Uses Anthropic's built-in web_search tool to research B2B companies
 * before lead enrichment, providing real-time intelligence to the signal pipeline.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../lib/observability.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-6';

let anthropicClient = null;
if (ANTHROPIC_API_KEY) {
  anthropicClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

// ─── Structured extraction tool ───────────────────────────────────────────────

const EXTRACT_INTELLIGENCE_TOOL = {
  name: 'extract_company_intelligence',
  description:
    'Extract structured buying signals and findings from web research about a B2B company.',
  input_schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        description: 'Key findings about the company from web research.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short title for this finding.' },
            snippet: {
              type: 'string',
              description: 'Key excerpt or summary (1-3 sentences).',
            },
            url: {
              type: 'string',
              description: 'Source URL if available.',
            },
          },
          required: ['title', 'snippet'],
        },
        maxItems: 8,
      },
      signals: {
        type: 'array',
        description: 'Buying signals detected from the research.',
        items: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description:
                'Signal key — one of: recent_funding, strong_growth, major_org_change, recent_role_change, active_hiring, recent_timing_event, regulatory_need, active_rfp.',
            },
            evidence: {
              type: 'string',
              description: 'Concise evidence for this signal.',
            },
            confidence: {
              type: 'number',
              description: 'Confidence score 0.0–1.0.',
            },
          },
          required: ['key', 'evidence', 'confidence'],
        },
        maxItems: 6,
      },
    },
    required: ['findings', 'signals'],
  },
};

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Research a B2B company on the web using Claude + web_search tool.
 * Returns findings (for context) and signals (for the signal pipeline).
 *
 * @param {Object} lead
 * @returns {Promise<{ findings: Array, signals: Array }>}
 */
export async function researchCompanyOnWeb(lead) {
  if (!anthropicClient) return { findings: [], signals: [] };

  const companyName = lead.company_name;
  if (!companyName) return { findings: [], signals: [] };

  const websitePart = lead.website_url ? `\nWebsite: ${lead.website_url}` : '';
  const industryPart = lead.industry ? `\nIndustry: ${lead.industry}` : '';
  const countryPart = lead.country ? `\nCountry: ${lead.country}` : '';

  const userMessage = `Research this B2B company for sales intelligence:

Company: ${companyName}${websitePart}${industryPart}${countryPart}

Search the web for recent news (last 6 months): funding rounds, notable hires or departures, product launches, expansion announcements, job postings signaling growth, or any events that indicate a buying opportunity. Then call extract_company_intelligence with your structured findings.`;

  try {
    const message = await anthropicClient.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      tools: [
        { type: 'web_search_20250305', name: 'web_search', max_uses: 3 },
        EXTRACT_INTELLIGENCE_TOOL,
      ],
      messages: [{ role: 'user', content: userMessage }],
    });

    const toolUse = message.content?.find(
      (block) => block.type === 'tool_use' && block.name === 'extract_company_intelligence'
    );

    if (!toolUse?.input) {
      logger.warn('claude_web_research_no_output', { company: companyName });
      return { findings: [], signals: [] };
    }

    const rawFindings = Array.isArray(toolUse.input.findings) ? toolUse.input.findings : [];
    const rawSignals = Array.isArray(toolUse.input.signals) ? toolUse.input.signals : [];

    const findings = rawFindings.slice(0, 8).map((f) => ({
      title: String(f.title || '').slice(0, 300),
      snippet: String(f.snippet || '').slice(0, 2000),
      ...(f.url ? { url: String(f.url).slice(0, 500) } : {}),
    }));

    const signals = rawSignals.slice(0, 6).map((s) => ({
      key: String(s.key || '').slice(0, 100),
      evidence: String(s.evidence || '').slice(0, 1000),
      confidence: Math.min(1, Math.max(0, Number(s.confidence) || 0.5)),
      source_type: 'claude_web_research',
      found_at: new Date().toISOString(),
    }));

    logger.info('claude_web_research_success', {
      company: companyName,
      findings_count: findings.length,
      signals_count: signals.length,
    });

    return { findings, signals };
  } catch (error) {
    logger.warn('claude_web_research_failed', {
      company: companyName,
      error: error?.message,
    });
    return { findings: [], signals: [] };
  }
}

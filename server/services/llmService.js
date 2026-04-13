/**
 * LLM Service — Claude (tool use)
 * Used by analyzeService.js to enrich lead analysis with AI reasoning.
 *
 * Claude uses structured tool use (function calling) for guaranteed JSON output.
 * The single `analyze_lead` tool covers 4 domains:
 *   - score_lead      → score_adjustment, confidence_level
 *   - extract_signals → inferred_signals, buying_signals
 *   - enrich_company  → fit_reasoning, key_insights, risk_factors
 *   - suggest_approach→ icebreaker_email, icebreaker_linkedin, icebreaker_call, suggested_action
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../lib/observability.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Use claude-sonnet-4-6 for richer reasoning; override with LLM_MODEL env var.
// For cost/speed trade-off, set LLM_MODEL=claude-haiku-4-5-20251001
const ANTHROPIC_MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-6';
const LLM_TIMEOUT_MS = 30000;

const hasAnthropic = Boolean(ANTHROPIC_API_KEY);
const hasAnyLLM = hasAnthropic;

let anthropicClient = null;

if (hasAnthropic) {
  anthropicClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

const SYSTEM_PROMPT = `You are an expert B2B sales analyst specializing in lead qualification and outbound sales optimization.
You analyze leads against Ideal Customer Profiles (ICP) and provide precise, actionable intelligence.

Scoring guidelines:
- score_adjustment: fine-tune the ICP deterministic score in the range -15 to +15. Positive adjustments require verified contextual signals (recent funding, active hiring of SDRs/AEs, competitor displacement, product-market fit evidence). Negative adjustments require concrete disqualifiers (wrong persona, confirmed competitor signed, company in liquidation). Return 0 when evidence is ambiguous.
- confidence_level: 0-100. Score 20-40 for leads with minimal public data, 50-70 for partial profiles, 80-100 only when buying intent is clearly evidenced by multiple signals.
- Pre-call signals: choose strictly from the defined key set. Only assert signals you can directly infer from the available data — do not hallucinate.
- Buying signals: extract specific, verifiable cues (e.g. "Raised $12M Series A in 2025", "Hiring 3 SDRs in France on LinkedIn", "Recently acquired a competitor in target vertical").
- Icebreakers: must reference a concrete company fact. Never use generic openers. Be conversational, reference real context, and end with a single clear call-to-action.
- Fit reasoning: 2-3 sentences maximum. Lead with the dominant fit or misfit dimension, then explain the key qualifier.
- Risk factors: only include concrete, evidence-based risks. Do not add boilerplate like "Budget not confirmed" for every lead.

Always use the analyze_lead tool to return your structured analysis.`;

// ─── Tool definition (with prompt cache marker) ────────────────────────────────

const ANALYZE_LEAD_TOOL = {
  name: 'analyze_lead',
  description:
    'Analyze a B2B lead against an ICP profile. Returns structured scoring, inferred signals, company insights, and personalized outreach copy for the SDR.',
  input_schema: {
    type: 'object',
    properties: {
      // ── score_lead ──────────────────────────────────────────────────────────
      score_adjustment: {
        type: 'integer',
        description:
          'AI score delta on top of the deterministic ICP score. Range: -15 (poor fit) to +15 (excellent fit). Never return an absolute score.',
      },
      confidence_level: {
        type: 'integer',
        description:
          'Confidence in the analysis, 0-100. Low when data is sparse, high when profile matches clearly.',
      },
      // ── extract_signals ─────────────────────────────────────────────────────
      inferred_signals: {
        type: 'object',
        description: 'Buying signals inferred from lead data.',
        properties: {
          pre_call: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Pre-call signal keys (0-4). Valid keys: profile_fit, compatible_activity, matching_segment, offer_related_needs, recent_funding, major_org_change, recent_timing_event, strong_growth, regulatory_need, active_rfp, recent_role_change.',
          },
          negative: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Negative signal keys (0-2, only if clearly indicated). Valid keys: no_budget, not_concerned, out_of_scope, no_decision_power, changed_business, retired, liquidation_or_bankruptcy, signed_competitor, closed_or_dead.',
          },
        },
        required: ['pre_call', 'negative'],
      },
      buying_signals: {
        type: 'array',
        items: { type: 'string' },
        description: 'Human-readable buying signals identified from the lead data.',
      },
      // ── enrich_company ──────────────────────────────────────────────────────
      fit_reasoning: {
        type: 'string',
        description:
          '2-3 sentences explaining the overall fit quality between this lead and the ICP.',
      },
      key_insights: {
        type: 'array',
        items: { type: 'string' },
        description: '2-3 key insights about this lead relevant to the sales opportunity.',
        minItems: 1,
        maxItems: 3,
      },
      risk_factors: {
        type: 'array',
        items: { type: 'string' },
        description: 'Potential risk factors or objections to anticipate. Empty array if none.',
      },
      // ── suggest_approach ────────────────────────────────────────────────────
      icebreaker_email: {
        type: 'string',
        description:
          'Personalized email opening — 3-4 sentences mentioning specific company context.',
      },
      icebreaker_linkedin: {
        type: 'string',
        description: 'Personalized LinkedIn message — 1-2 sentences, conversational tone.',
      },
      icebreaker_call: {
        type: 'string',
        description: 'Personalized call opener — 1-2 sentences to start the conversation.',
      },
      suggested_action: {
        type: 'string',
        description: 'One specific next action the SDR should take with this lead.',
      },
    },
    required: [
      'score_adjustment',
      'confidence_level',
      'inferred_signals',
      'buying_signals',
      'fit_reasoning',
      'key_insights',
      'risk_factors',
      'icebreaker_email',
      'icebreaker_linkedin',
      'icebreaker_call',
      'suggested_action',
    ],
  },
};

// ─── Prompt builder ────────────────────────────────────────────────────────────

const sanitizeField = (value) => {
  if (value === null || value === undefined) return 'Unknown';
  return String(value).replace(/[`"\\]/g, ' ').replace(/\n|\r/g, ' ').trim().slice(0, 300) || 'Unknown';
};

/**
 * scoringContext: { icp_score, icp_category, icp_signals }
 * icp_signals: array of { type, label } from buildIcpSignals()
 * webResearchContext: optional string with web research findings
 */
const buildUserPrompt = (lead, icpProfile, scoringContext, webResearchContext) => {
  const icpWeights = icpProfile?.weights || {};
  const industries = icpWeights.industrie || {};
  const roles = icpWeights.roles || {};
  const geo = icpWeights.geo || {};
  const structure = icpWeights.structure || {};

  const positiveIcpLabels =
    (scoringContext.icp_signals || [])
      .filter((s) => s.type === 'positive')
      .map((s) => s.label)
      .join(', ') || 'None';
  const negativeIcpLabels =
    (scoringContext.icp_signals || [])
      .filter((s) => s.type === 'negative')
      .map((s) => s.label)
      .join(', ') || 'None';

  const webSection = webResearchContext
    ? `\n## WEB RESEARCH FINDINGS\n${webResearchContext}\n`
    : '';

  return `Analyze this B2B lead against the ICP profile using the analyze_lead tool.

## LEAD DATA
- Company: ${sanitizeField(lead.company_name)}
- Industry: ${sanitizeField(lead.industry)}
- Country: ${sanitizeField(lead.country)}
- Company size: ${sanitizeField(lead.company_size)} employees
- Client type: ${sanitizeField(lead.client_type)}
- Contact: ${sanitizeField(lead.contact_name)} — ${sanitizeField(lead.contact_role)}
- Contact email: ${sanitizeField(lead.contact_email)}
- Website: ${sanitizeField(lead.website_url)}
- Source list: ${sanitizeField(lead.source_list)}
- Notes: ${sanitizeField(lead.notes)}
- Status: ${sanitizeField(lead.status)}

## ICP PROFILE: "${sanitizeField(icpProfile?.name) || 'Active Profile'}"
${icpProfile?.description ? `Description: ${sanitizeField(icpProfile.description)}` : ''}
- Primary industries: ${(industries.primaires || []).join(', ') || 'Any'}
- Excluded industries: ${(industries.exclusions || []).join(', ') || 'None'}
- Target roles (exact): ${(roles.exacts || []).join(', ') || 'Any'}
- Target roles (similar): ${(roles.proches || []).join(', ') || 'Any'}
- Primary geography: ${(geo.primaire || []).join(', ') || 'Any'}
- Company size range: ${structure.primaire?.min || 0}–${structure.primaire?.max || 99999} employees

## ICP SCORING CONTEXT
- ICP base score: ${scoringContext.icp_score}/100
- ICP category: ${scoringContext.icp_category}
- ICP positive signals: ${positiveIcpLabels}
- ICP negative signals: ${negativeIcpLabels}
${webSection}
Call analyze_lead with your full analysis.`;
};

// ─── LLM callers ──────────────────────────────────────────────────────────────

// System prompt wrapped for prompt caching — static across all analyze calls.
// Together with the tool definition below this reaches the 1024-token minimum
// required for cache activation on claude-sonnet-4-6.
const CACHED_SYSTEM = [
  { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
];

// Tool with cache_control so the static tool schema is also cached.
const ANALYZE_LEAD_TOOL_CACHED = {
  ...ANALYZE_LEAD_TOOL,
  cache_control: { type: 'ephemeral' },
};

const callClaude = async (prompt) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('LLM timeout')), LLM_TIMEOUT_MS);
  try {
    const message = await anthropicClient.messages.create(
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 1400, // real output rarely exceeds 1100 tokens; was 2000
        system: CACHED_SYSTEM,
        tools: [ANALYZE_LEAD_TOOL_CACHED],
        tool_choice: { type: 'tool', name: 'analyze_lead' },
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: controller.signal }
    );
    // With tool_choice forced, the SDK guarantees a tool_use block — no JSON parsing needed.
    const toolUse = message.content?.find(
      (block) => block.type === 'tool_use' && block.name === 'analyze_lead'
    );
    return {
      result: toolUse?.input ?? null,
      usage: message.usage ? {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
        cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
      } : null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

// ─── Validation ────────────────────────────────────────────────────────────────

const validateLlmResult = (result) => {
  if (!result || typeof result !== 'object') return false;
  if (typeof result.score_adjustment !== 'number') return false;
  if (!Number.isFinite(result.score_adjustment)) return false;
  // Allow ±20 as buffer but reject clearly wrong values
  if (result.score_adjustment < -20 || result.score_adjustment > 20) return false;
  if (!result.fit_reasoning) return false;
  return true;
};

// ─── Circuit breaker ───────────────────────────────────────────────────────────

// Fail-open after 5 consecutive failures within a 60s window
const circuitBreaker = {
  failures: 0,
  openUntil: 0,
  MAX_FAILURES: 5,
  RECOVERY_WINDOW_MS: 60 * 1000,
  isOpen() {
    if (Date.now() < this.openUntil) return true;
    if (this.openUntil > 0) {
      this.openUntil = 0;
      this.failures = 0;
    }
    return false;
  },
  recordFailure() {
    this.failures += 1;
    if (this.failures >= this.MAX_FAILURES) {
      this.openUntil = Date.now() + this.RECOVERY_WINDOW_MS;
      logger.warn('llm_circuit_breaker_opened', {
        failures: this.failures,
        recovery_ms: this.RECOVERY_WINDOW_MS,
      });
    }
  },
  recordSuccess() {
    this.failures = 0;
    this.openUntil = 0;
  },
};

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Enrich lead analysis with LLM reasoning.
 * Returns null if no LLM is configured, circuit is open, or all calls fail.
 *
 * @param {Object} lead
 * @param {Object} icpProfile
 * @param {Object} deterministicResult - result from analyzeService deterministic scoring
 * @param {string} [webResearchContext] - optional web research findings to include in prompt
 * @returns {Promise<Object|null>}
 */
export async function enrichWithLlm(lead, icpProfile, deterministicResult, webResearchContext) {
  if (!hasAnyLLM) return null;

  if (circuitBreaker.isOpen()) {
    logger.warn('llm_circuit_breaker_skipped', { company: lead.company_name });
    return null;
  }

  const prompt = buildUserPrompt(lead, icpProfile, deterministicResult, webResearchContext);

  if (hasAnthropic) {
    try {
      const { result, usage } = await callClaude(prompt);
      if (validateLlmResult(result)) {
        circuitBreaker.recordSuccess();
        logger.info('llm_enrich_success', {
          provider: 'anthropic',
          model: ANTHROPIC_MODEL,
          company: lead.company_name,
          input_tokens: usage?.input_tokens,
          output_tokens: usage?.output_tokens,
          cache_read: usage?.cache_read_input_tokens,
          cache_creation: usage?.cache_creation_input_tokens,
        });
        return { ...result, provider: 'anthropic', _usage: { ...usage, model: ANTHROPIC_MODEL } };
      }
    } catch (error) {
      circuitBreaker.recordFailure();
      logger.warn('llm_claude_failed', { error: error?.message, company: lead.company_name });
    }
  }

  logger.warn('llm_enrich_skipped', { company: lead.company_name, hasAnthropic });
  return null;
}

export const llmAvailable = hasAnyLLM;
export const llmProviders = { anthropic: hasAnthropic };

export function getCircuitBreakerStatus() {
  return {
    isOpen: circuitBreaker.isOpen(),
    failures: circuitBreaker.failures,
    openUntil: circuitBreaker.openUntil > 0 ? new Date(circuitBreaker.openUntil).toISOString() : null,
  };
}

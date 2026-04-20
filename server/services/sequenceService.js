/**
 * Sequence Service — multi-touch outreach sequence generator
 *
 * Given a lead + ICP context, generates a complete 3-touch outreach plan:
 *   - Touch 1 (Day 1):  Cold email
 *   - Touch 2 (Day 5):  Follow-up email
 *   - Touch 3 (Day 10): LinkedIn message
 *
 * Uses Claude tool use for guaranteed structured output.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../lib/observability.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// Sequence generation is a structured copywriting task — Haiku 4.5 is sufficient
// and ~75% cheaper than Sonnet 4.6.  Override with LLM_SIMPLE_MODEL if needed.
const ANTHROPIC_MODEL = process.env.LLM_SIMPLE_MODEL || process.env.LLM_MODEL || 'claude-haiku-4-5-20251001';
const LLM_TIMEOUT_MS = 45000;
export const SEQUENCE_PROMPT_VERSION = 'sequence-v1';

const hasAnthropic = Boolean(ANTHROPIC_API_KEY);
let anthropicClient = null;
if (hasAnthropic) {
  anthropicClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

const SYSTEM_PROMPT = `You are an expert B2B outbound sales copywriter specializing in SDR sequences.
You write highly personalized, concise, and non-generic outreach messages that reference specific context.
Never use clichés like "I hope this finds you well" or "I wanted to reach out".
Always use the generate_sequence tool to return your structured output.`;

const TONE_GUIDELINES = {
  consultative: 'Consultative: ask insightful questions, position yourself as a strategic peer who is curious about their priorities. Light on pitch, heavy on diagnostic.',
  direct: 'Direct: get to the point fast, lead with concrete value, short sentences, zero filler. Suited for executives who skim.',
  friendly: 'Friendly & warm: human, casual but respectful, build rapport with a personal observation, low-pressure ask.',
  premium: 'Premium / executive: confident, polished, references industry context and credibility signals, suited for C-level or enterprise.',
  challenger: 'Challenger: respectfully challenge the status quo, surface a non-obvious insight or risk, contrast their likely current approach with a better outcome.',
};

const ALLOWED_TONES = new Set(Object.keys(TONE_GUIDELINES));

const LANGUAGE_INSTRUCTIONS = {
  fr: 'Write the entire sequence in French (fluent, native, no anglicisms unless industry-standard). Use "vous" by default.',
  en: 'Write the entire sequence in English.',
};

// ─── Tool definition ───────────────────────────────────────────────────────────

const GENERATE_SEQUENCE_TOOL = {
  name: 'generate_sequence',
  description:
    'Generate a complete 3-touch outreach sequence (email J1, follow-up J5, LinkedIn J10) personalized for a specific B2B lead.',
  input_schema: {
    type: 'object',
    properties: {
      sequence_name: {
        type: 'string',
        description: 'Short name for this sequence (e.g. "SaaS CEO France — Q1 2026")',
      },
      objective: {
        type: 'string',
        description: '1 sentence describing the goal of this sequence for this lead.',
      },
      touches: {
        type: 'array',
        description: 'The 3 outreach touches in order.',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            day: {
              type: 'integer',
              description: 'Day to send (1, 5, or 10)',
            },
            channel: {
              type: 'string',
              enum: ['email', 'email_followup', 'linkedin'],
              description: 'Outreach channel',
            },
            subject: {
              type: 'string',
              description: 'Email subject line (empty for LinkedIn). Max 60 chars. No clickbait.',
            },
            body: {
              type: 'string',
              description:
                'Message body. Email: 4-6 sentences max. LinkedIn: 2-3 sentences max. End with ONE clear call to action.',
            },
            cta: {
              type: 'string',
              description: 'The specific call to action (e.g. "15-min call this week?", "Open to a quick demo?")',
            },
          },
          required: ['day', 'channel', 'subject', 'body', 'cta'],
        },
      },
      personalization_hooks: {
        type: 'array',
        items: { type: 'string' },
        description: '2-3 specific data points used to personalize this sequence (e.g. "recent funding round", "hiring 3 SDRs")',
      },
    },
    required: ['sequence_name', 'objective', 'touches', 'personalization_hooks'],
  },
};

// ─── Prompt builder ────────────────────────────────────────────────────────────

const sanitize = (v) => String(v ?? 'Unknown').replace(/[`"\\]/g, ' ').trim().slice(0, 300);

const buildPrompt = (lead, icpProfile, analysisContext, options = {}) => {
  const icpName = sanitize(icpProfile?.name ?? 'Active ICP');
  const tone = ALLOWED_TONES.has(options.tone) ? options.tone : 'consultative';
  const locale = options.locale === 'fr' ? 'fr' : 'en';

  const signals = [
    ...(analysisContext?.buying_signals ?? []),
    ...(analysisContext?.key_insights ?? []),
  ]
    .slice(0, 5)
    .join('; ');

  return `Generate a 3-touch outreach sequence for this lead using the generate_sequence tool.

## LEAD
- Company: ${sanitize(lead.company_name)}
- Industry: ${sanitize(lead.industry)}
- Country: ${sanitize(lead.country)}
- Size: ${sanitize(lead.company_size)} employees
- Contact: ${sanitize(lead.contact_name)}, ${sanitize(lead.contact_role)}
- Website: ${sanitize(lead.website_url)}
- Notes: ${sanitize(lead.notes)}
- ICP Score: ${analysisContext?.final_score ?? 'N/A'}/100 (${analysisContext?.icp_category ?? ''})
- Fit reasoning: ${sanitize(analysisContext?.fit_reasoning ?? '')}
- Buying signals: ${signals || 'None identified'}
- Icebreaker (email): ${sanitize(analysisContext?.icebreaker_email ?? '')}

## ICP / OFFER CONTEXT
- ICP profile: "${icpName}"
${icpProfile?.description ? `- ICP description: ${sanitize(icpProfile.description)}` : ''}

## TONE
${TONE_GUIDELINES[tone]}

## LANGUAGE
${LANGUAGE_INSTRUCTIONS[locale]}

Write a 3-touch sequence: Day 1 cold email, Day 5 follow-up email, Day 10 LinkedIn.
Be specific, reference the company context, no generic copy.`;
};

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate a 3-touch outreach sequence for a lead.
 *
 * @param {Object} lead - Lead object from dataStore
 * @param {Object} icpProfile - Active ICP profile
 * @param {Object} [analysisContext] - Optional: existing analysis result for the lead
 * @returns {Promise<Object|null>}
 */
export async function generateOutreachSequence(lead, icpProfile, analysisContext = {}, options = {}) {
  if (!hasAnthropic) {
    logger.warn('sequence_generator_no_llm', { reason: 'ANTHROPIC_API_KEY not set' });
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('Sequence generator timeout')), LLM_TIMEOUT_MS);

  try {
    const prompt = buildPrompt(lead, icpProfile, analysisContext, options);

    const message = await anthropicClient.messages.create(
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 2000, // sequences are ~600-1200 tokens in practice; was 2500
        system: SYSTEM_PROMPT,
        tools: [GENERATE_SEQUENCE_TOOL],
        tool_choice: { type: 'tool', name: 'generate_sequence' },
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: controller.signal }
    );

    const toolUse = message.content?.find(
      (b) => b.type === 'tool_use' && b.name === 'generate_sequence'
    );

    if (!toolUse?.input) {
      logger.warn('sequence_generator_no_output', { company: lead.company_name });
      return null;
    }

    const usage = message.usage
      ? { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens }
      : null;

    logger.info('sequence_generator_success', {
      company: lead.company_name,
      touches: toolUse.input.touches?.length,
      input_tokens: usage?.input_tokens,
      output_tokens: usage?.output_tokens,
    });

    return {
      ...toolUse.input,
      generated_at: new Date().toISOString(),
      lead_id: lead.id,
      tone: ALLOWED_TONES.has(options.tone) ? options.tone : 'consultative',
      locale: options.locale === 'fr' ? 'fr' : 'en',
      _usage: usage ? { ...usage, model: ANTHROPIC_MODEL } : null,
    };
  } catch (error) {
    logger.warn('sequence_generator_failed', { error: error?.message, company: lead.company_name });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const sequenceGeneratorAvailable = hasAnthropic;

export const SEQUENCE_TONES = Object.freeze([...ALLOWED_TONES]);

/**
 * ICP Generator Service — natural language → structured ICP profile
 *
 * Takes a plain-language description of an ideal customer and returns
 * a fully structured ICP weights object ready to save as a profile.
 *
 * Uses Claude tool use for guaranteed JSON output.
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

const SYSTEM_PROMPT = `You are an expert B2B sales strategist helping SDR teams define their Ideal Customer Profile (ICP).
You convert a natural language description of an ideal customer into a precise, structured ICP configuration.
Always use the generate_icp_profile tool to return your structured output.`;

// ─── Tool definition ───────────────────────────────────────────────────────────

const GENERATE_ICP_TOOL = {
  name: 'generate_icp_profile',
  description:
    'Convert a natural language ICP description into a structured profile configuration with industries, roles, geography, company size, and scoring weights.',
  input_schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Short, memorable name for this ICP profile (e.g. "Mid-Market SaaS France")',
      },
      description: {
        type: 'string',
        description: '2-3 sentence description of this ideal customer profile.',
      },
      weights: {
        type: 'object',
        description: 'Full ICP weights configuration',
        properties: {
          industrie: {
            type: 'object',
            properties: {
              primaires: {
                type: 'array',
                items: { type: 'string' },
                description: 'Primary target industries (highest fit). Max 5.',
              },
              secondaires: {
                type: 'array',
                items: { type: 'string' },
                description: 'Secondary industries (partial fit). Max 5.',
              },
              exclusions: {
                type: 'array',
                items: { type: 'string' },
                description: 'Industries to exclude entirely. Max 5.',
              },
            },
            required: ['primaires', 'secondaires', 'exclusions'],
          },
          roles: {
            type: 'object',
            properties: {
              exacts: {
                type: 'array',
                items: { type: 'string' },
                description: 'Exact target job titles (perfect fit). Max 6.',
              },
              proches: {
                type: 'array',
                items: { type: 'string' },
                description: 'Similar/adjacent job titles (partial fit). Max 6.',
              },
              exclusions: {
                type: 'array',
                items: { type: 'string' },
                description: 'Job titles to exclude (e.g. interns, students). Max 3.',
              },
            },
            required: ['exacts', 'proches', 'exclusions'],
          },
          typeClient: {
            type: 'object',
            properties: {
              primaire: {
                type: 'array',
                items: { type: 'string', enum: ['B2B', 'B2C', 'B2G', 'B2B2C'] },
                description: 'Primary client type(s).',
              },
              secondaire: {
                type: 'array',
                items: { type: 'string', enum: ['B2B', 'B2C', 'B2G', 'B2B2C'] },
                description: 'Secondary client type(s).',
              },
            },
            required: ['primaire', 'secondaire'],
          },
          structure: {
            type: 'object',
            properties: {
              primaire: {
                type: 'object',
                properties: {
                  min: { type: 'integer', description: 'Minimum employees for perfect fit' },
                  max: { type: 'integer', description: 'Maximum employees for perfect fit' },
                },
                required: ['min', 'max'],
              },
              secondaire: {
                type: 'object',
                properties: {
                  min: { type: 'integer', description: 'Minimum employees for partial fit' },
                  max: { type: 'integer', description: 'Maximum employees for partial fit' },
                },
                required: ['min', 'max'],
              },
            },
            required: ['primaire', 'secondaire'],
          },
          geo: {
            type: 'object',
            properties: {
              primaire: {
                type: 'array',
                items: { type: 'string' },
                description: 'Primary target countries/regions (perfect fit). Max 5.',
              },
              secondaire: {
                type: 'array',
                items: { type: 'string' },
                description: 'Secondary target countries/regions (partial fit). Max 5.',
              },
            },
            required: ['primaire', 'secondaire'],
          },
        },
        required: ['industrie', 'roles', 'typeClient', 'structure', 'geo'],
      },
      reasoning: {
        type: 'string',
        description:
          '2-3 sentences explaining the key choices made (why these industries, why this size range, etc.).',
      },
    },
    required: ['name', 'description', 'weights', 'reasoning'],
  },
};

// ─── Default score weights (injected after Claude returns structure) ───────────

const DEFAULT_SCORE_WEIGHTS = {
  industrie: { weight: 100, scores: { parfait: 30, partiel: 15, aucun: -30, exclu: -100 } },
  roles: { weight: 100, scores: { parfait: 25, partiel: 10, exclu: -100, aucun: -25 } },
  typeClient: { weight: 100, scores: { parfait: 25, partiel: 10, aucun: -40 } },
  structure: { weight: 100, scores: { parfait: 15, partiel: 10, aucun: -20 } },
  geo: { weight: 100, scores: { parfait: 15, partiel: 5, aucun: -10 } },
  meta: {
    minScore: 0,
    maxScore: 100,
    finalScoreWeights: { icp: 60, ai: 40 },
    icpThresholds: { excellent: 80, strong: 50, medium: 20 },
    finalThresholds: { excellent: 80, strong: 50, medium: 20 },
    thresholds: {
      icp: { excellent: 80, strong: 50, medium: 20 },
      final: { excellent: 80, strong: 50, medium: 20 },
    },
  },
};

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate a structured ICP profile from a natural language description.
 *
 * @param {string} description - Plain language ICP description from the user
 * @returns {Promise<{name: string, description: string, weights: object, reasoning: string}|null>}
 */
export async function generateIcpFromDescription(description) {
  if (!hasAnthropic) {
    logger.warn('icp_generator_no_llm', { reason: 'ANTHROPIC_API_KEY not set' });
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('ICP generator timeout')), LLM_TIMEOUT_MS);

  try {
    const message = await anthropicClient.messages.create(
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        tools: [GENERATE_ICP_TOOL],
        tool_choice: { type: 'tool', name: 'generate_icp_profile' },
        messages: [
          {
            role: 'user',
            content: `Generate a structured ICP profile from this description:\n\n"${description.slice(0, 2000)}"`,
          },
        ],
      },
      { signal: controller.signal }
    );

    const toolUse = message.content?.find(
      (b) => b.type === 'tool_use' && b.name === 'generate_icp_profile'
    );

    if (!toolUse?.input) {
      logger.warn('icp_generator_no_output');
      return null;
    }

    const result = toolUse.input;

    // Merge Claude's content with default score weights
    const mergedWeights = {
      industrie: { ...DEFAULT_SCORE_WEIGHTS.industrie, ...result.weights.industrie },
      roles: { ...DEFAULT_SCORE_WEIGHTS.roles, ...result.weights.roles },
      typeClient: { ...DEFAULT_SCORE_WEIGHTS.typeClient, ...result.weights.typeClient },
      structure: { ...DEFAULT_SCORE_WEIGHTS.structure, ...result.weights.structure },
      geo: { ...DEFAULT_SCORE_WEIGHTS.geo, ...result.weights.geo },
      meta: DEFAULT_SCORE_WEIGHTS.meta,
    };

    const usage = message.usage
      ? { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens }
      : null;

    logger.info('icp_generator_success', {
      name: result.name,
      input_tokens: usage?.input_tokens,
      output_tokens: usage?.output_tokens,
    });

    return {
      name: result.name,
      description: result.description,
      weights: mergedWeights,
      reasoning: result.reasoning,
      _usage: usage ? { ...usage, model: ANTHROPIC_MODEL } : null,
    };
  } catch (error) {
    logger.warn('icp_generator_failed', { error: error?.message });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const icpGeneratorAvailable = hasAnthropic;

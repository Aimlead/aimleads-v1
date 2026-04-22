import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { logger } from '../lib/observability.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_SIGNAL_MODEL || 'claude-sonnet-4-6';

export const SIGNAL_ANALYSIS_SYSTEM_PROMPT = `You are the signal intelligence layer of AimLead.

AimLead already computes the ICP base score internally. This score is the single source of truth for ICP fit.
You must NOT re-evaluate, reinterpret, or summarize ICP.

Your role is to:
- detect relevant company signals using web research
- separate contextual signals from triggering signals
- adjust prioritization ONLY based on triggering signals
- provide concise, actionable output for a sales user

--------------------------------------------------
CORE PRINCIPLE
--------------------------------------------------

Not all signals are equal.

There are two types of signals:

1. Contextual signals (informational)
→ useful for personalization and understanding
→ do NOT justify prioritization

2. Trigger signals (actionable)
→ create a clear reason to contact the lead now
→ MUST drive prioritization

--------------------------------------------------
DEFINITION OF SIGNAL TYPES
--------------------------------------------------

Trigger signals (HIGH VALUE):
- leadership changes (CEO, CRO, Head of Sales)
- acquisitions or mergers
- new product positioning impacting sales motion
- entry into a new market or segment
- major GTM or strategic shift
- restructuring impacting commercial teams

Contextual signals (LOW / MEDIUM VALUE):
- hiring
- partnerships
- product launches without clear GTM shift
- office openings
- general growth
- ecosystem activity

IMPORTANT:
- contextual signals can be included in output
- but MUST NOT significantly increase the score

--------------------------------------------------
CRITICAL DISTINCTIONS
--------------------------------------------------

A signal is only valuable for prioritization if it creates a clear reason to contact now.

If a signal does NOT create a clear outreach trigger:
- treat it as contextual
- do NOT increase the score significantly

Even if multiple contextual signals exist:
- cap boost at +2
- avoid "contact_now"

--------------------------------------------------
LEADERSHIP RULE (HARD FIX)
--------------------------------------------------

Leadership changes:
- MUST ALWAYS be treated as positive or neutral signals
- MUST NEVER decrease the score
- MUST be considered trigger signals

Do NOT interpret leadership changes as instability.

--------------------------------------------------
FINANCIAL RULE (HARD BLOCK)
--------------------------------------------------

Ignore financial metrics:
- ARR
- growth rate
- valuation
- losses

They must NEVER:
- affect the score
- appear in negatives

Unless they directly indicate:
- layoffs
- budget cuts

--------------------------------------------------
STRICT FACT RULE
--------------------------------------------------

- Only state observable facts
- Do NOT interpret
- Do NOT speculate
- Do NOT describe timing or opportunity
- Do NOT infer intent

--------------------------------------------------
COMPETITOR RULE
--------------------------------------------------

Do NOT infer whether the company is a competitor or a buyer.

You do not have enough context.

--------------------------------------------------
IDENTITY RULE
--------------------------------------------------

- If company identity is unclear → reduce confidence
- If contact role mismatch → include as negative
- Identity issues are NOT business signals

--------------------------------------------------
SCORING LOGIC
--------------------------------------------------

Adjust score ONLY based on trigger signals.

Boost calibration:
+5 to +8 → multiple strong trigger signals
+2 to +4 → one clear trigger signal
0 to +1 → only contextual signals
-1 to -5 → real negative (e.g. layoffs, contraction)

--------------------------------------------------
OUTPUT RULES
--------------------------------------------------

- concise
- factual
- sales-oriented
- no extra commentary
- no markdown

Return ONLY valid JSON with this schema:

{
  "ai_score": 0,
  "ai_boost": 0,
  "confidence": 0,
  "signals": ["..."],
  "positives": ["..."],
  "negatives": ["..."],
  "action": "contact_now | contact_soon | nurture | deprioritize",
  "icebreaker": "..."
}`;

const outputSchema = z.object({
  ai_score: z.number().int().min(0).max(100),
  ai_boost: z.number().int().min(-10).max(10),
  confidence: z.number().int().min(0).max(100),
  signals: z.array(z.string().trim().min(1)).max(25),
  positives: z.array(z.string().trim().min(1)).max(25),
  negatives: z.array(z.string().trim().min(1)).max(25),
  action: z.enum(['contact_now', 'contact_soon', 'nurture', 'deprioritize']),
  icebreaker: z.string().trim().min(1).max(500),
}).strict();

const client = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

export const buildSignalAnalysisUserPrompt = ({ icpBaseScore, lead }) => {
  const leadJson = JSON.stringify(lead ?? {}, null, 2);
  return `Evaluate this lead using signal-based prioritization.\n\nICP_BASE_SCORE:\n${icpBaseScore}\n\nLEAD:\n${leadJson}\n\nInstructions:\n- use web research only if needed\n- find the strongest recent company-specific signals\n- ignore generic, macro, or weak signals\n- do not summarize the company\n- do not restate ICP logic\n- do not speculate\n- keep output short and actionable\n\nReturn ONLY valid JSON.`;
};

const extractRawText = (message) => {
  if (!Array.isArray(message?.content)) return '';
  return message.content
    .filter((block) => block?.type === 'text' && typeof block?.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();
};

const extractJsonCandidate = (text) => {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return '';
  return trimmed.slice(first, last + 1);
};

const extractJsonFromCodeFence = (text) => {
  const raw = String(text || '');
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!match?.[1]) return '';
  return extractJsonCandidate(match[1]);
};

const parseSignalJson = (rawText) => {
  const candidates = [extractJsonCandidate(rawText), extractJsonFromCodeFence(rawText)].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      return outputSchema.parse(parsed);
    } catch {
      // Continue; we intentionally attempt multiple extraction strategies.
    }
  }
  return null;
};

export async function runClaudeSignalAnalysis({ lead, icpBaseScore }) {
  if (!client) {
    logger.warn('signal_analysis_skipped_missing_api_key');
    return null;
  }

  const prompt = buildSignalAnalysisUserPrompt({ icpBaseScore, lead });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 750,
    temperature: 0.3,
    system: SIGNAL_ANALYSIS_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    tools: [{ name: 'web_search', type: 'web_search_20250305', max_uses: 4 }],
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
  });

  const rawText = extractRawText(message);
  const parsed = parseSignalJson(rawText);

  if (!parsed) {
    logger.warn('signal_analysis_invalid_json_response', {
      company: lead?.company_name || null,
      preview: rawText.slice(0, 280),
    });
    return null;
  }

  return {
    ...parsed,
    _meta: {
      model: MODEL,
      usage: message?.usage || null,
    },
  };
}

import { readDb, withDb } from '../lib/db.js';
import { getDataProvider, getRuntimeConfig } from '../lib/config.js';
import { getUserWorkspaceId } from '../lib/scope.js';
import { createId } from '../lib/utils.js';
import { logger } from '../lib/observability.js';
import { recordLeadAnalyzedMetric, recordLlmTokensUsedMetric } from '../lib/metrics.js';

const MODEL_PRICING_PER_MILLION = {
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
};

const toIso = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const estimateCost = ({ model, inputTokens = 0, outputTokens = 0 }) => {
  const pricing = MODEL_PRICING_PER_MILLION[String(model || '').trim()];
  if (!pricing) return null;

  const inputCost = (Number(inputTokens || 0) / 1_000_000) * pricing.input;
  const outputCost = (Number(outputTokens || 0) / 1_000_000) * pricing.output;
  const total = inputCost + outputCost;
  return Number.isFinite(total) ? Number(total.toFixed(6)) : null;
};

const buildBaseRun = ({
  user,
  workspaceId,
  leadId = null,
  action,
  provider = 'internal',
  model = null,
  promptVersion = null,
  requestPayload = null,
  metadata = null,
}) => ({
  id: createId('ai_run'),
  workspace_id: workspaceId || getUserWorkspaceId(user),
  lead_id: leadId || null,
  action,
  provider,
  model: model || null,
  prompt_version: promptVersion || null,
  status: 'running',
  duration_ms: null,
  input_tokens: null,
  output_tokens: null,
  estimated_cost: null,
  request_payload: requestPayload || null,
  response_payload: null,
  error_message: null,
  metadata: metadata || null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const createSupabaseRequester = () => {
  const config = getRuntimeConfig();
  const baseUrl = `${config.supabase.url.replace(/\/$/, '')}/rest/v1`;
  const apiKey = config.supabase.serviceRoleKey;

  return async (table, { method = 'GET', query = {}, body, returnRepresentation = true } = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      params.set(key, value);
    }

    const url = `${baseUrl}/${table}${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url, {
      method,
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Prefer: returnRepresentation ? 'return=representation' : 'return=minimal',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const message = payload?.message || payload?.error_description || `Supabase request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  };
};

export async function createAiRun(input) {
  const run = buildBaseRun(input);

  if (getDataProvider() === 'supabase') {
    const request = createSupabaseRequester();
    const rows = await request('ai_runs', {
      method: 'POST',
      body: run,
    });
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : run;
  }

  await withDb((current) => ({
    ...current,
    aiRuns: [run, ...(current.aiRuns || [])],
  }));
  return run;
}

export async function finalizeAiRun(runId, updates = {}) {
  if (!runId) return null;

  const nextModel = updates.model || null;
  const nextInputTokens = Number.isFinite(Number(updates.input_tokens)) ? Number(updates.input_tokens) : null;
  const nextOutputTokens = Number.isFinite(Number(updates.output_tokens)) ? Number(updates.output_tokens) : null;
  const estimatedCost = updates.estimated_cost !== undefined
    ? updates.estimated_cost
    : estimateCost({
        model: nextModel,
        inputTokens: nextInputTokens || 0,
        outputTokens: nextOutputTokens || 0,
      });

  const patch = {
    ...updates,
    model: nextModel,
    input_tokens: nextInputTokens,
    output_tokens: nextOutputTokens,
    estimated_cost: estimatedCost,
    updated_at: new Date().toISOString(),
  };

  if (patch.status === 'completed') {
    if (patch.input_tokens || patch.output_tokens) {
      recordLlmTokensUsedMetric({
        model: nextModel || 'unknown',
        inputTokens: patch.input_tokens || 0,
        outputTokens: patch.output_tokens || 0,
      });
    }
    if (updates.action === 'analyze') {
      recordLeadAnalyzedMetric({ action: 'analyze', model: nextModel || 'unknown' });
    }
  }

  if (getDataProvider() === 'supabase') {
    const request = createSupabaseRequester();
    const rows = await request('ai_runs', {
      method: 'PATCH',
      query: { id: `eq.${runId}` },
      body: patch,
    });
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  let updated = null;
  await withDb((current) => ({
    ...current,
    aiRuns: (current.aiRuns || []).map((run) => {
      if (run.id !== runId) return run;
      updated = { ...run, ...patch };
      return updated;
    }),
  }));

  return updated;
}

export async function listAiRunsForWorkspace(user, { limit = 50, offset = 0 } = {}) {
  const workspaceId = getUserWorkspaceId(user);
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);

  if (getDataProvider() === 'supabase') {
    const request = createSupabaseRequester();
    const rows = await request('ai_runs', {
      method: 'GET',
      query: {
        workspace_id: `eq.${workspaceId}`,
        order: 'created_at.desc',
        limit: String(safeLimit),
        offset: String(safeOffset),
      },
    });
    return Array.isArray(rows) ? rows : [];
  }

  const db = await readDb();
  return (db.aiRuns || [])
    .filter((run) => run.workspace_id === workspaceId)
    .sort((left, right) => Date.parse(String(right.created_at || '')) - Date.parse(String(left.created_at || '')))
    .slice(safeOffset, safeOffset + safeLimit);
}

export async function runAiOperation({
  user,
  workspaceId,
  leadId = null,
  action,
  provider = 'internal',
  model = null,
  promptVersion = null,
  requestPayload = null,
  metadata = null,
  execute,
}) {
  const run = await createAiRun({
    user,
    workspaceId,
    leadId,
    action,
    provider,
    model,
    promptVersion,
    requestPayload,
    metadata,
  });

  const startedAt = Date.now();

  try {
    const result = await execute(run);
    const usage = result?._token_usage || result?._usage || null;
    const derivedModel = usage?.model || result?.llm_provider_model || result?.model || model || null;
    await finalizeAiRun(run.id, {
      action,
      status: 'completed',
      model: derivedModel,
      duration_ms: Date.now() - startedAt,
      input_tokens: usage?.input_tokens ?? null,
      output_tokens: usage?.output_tokens ?? null,
      response_payload: result ? {
        success: true,
        final_score: result.final_score ?? null,
        final_category: result.final_category ?? null,
        final_recommended_action: result.final_recommended_action ?? null,
        llm_enriched: result.llm_enriched ?? null,
        mode: result.mode ?? null,
        generated: Boolean(result.sequence_name || result.name || result.reasoning),
      } : null,
    });
    return result;
  } catch (error) {
    await finalizeAiRun(run.id, {
      action,
      status: 'failed',
      duration_ms: Date.now() - startedAt,
      error_message: String(error?.message || 'Unknown AI operation failure'),
      response_payload: {
        success: false,
        code: error?.code || null,
        status: error?.status || null,
      },
    }).catch((finalizeError) => {
      logger.warn('ai_run_finalize_failed', {
        run_id: run.id,
        error: finalizeError?.message,
      });
    });
    throw error;
  }
}

export const AI_PROMPT_VERSIONS = {
  analyze: 'lead-analyze-v2',
  sequence: 'sequence-v1',
  icp_generate: 'icp-generator-v1',
  discover_signals: 'discover-signals-v1',
};

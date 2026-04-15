/**
 * Credits system — workspace-level credit pool.
 *
 * Local provider: in-memory Map (reset on restart — dev only).
 * Supabase provider: workspaces.credit_balance + credit_transactions table,
 *   with atomic RPC functions (deduct_credits, grant_credits).
 *
 * Usage in routes:
 *   import { requireCredits, CREDIT_COSTS } from '../lib/credits.js';
 *   router.post('/expensive', requireAuth, requireCredits('discover_signals'), handler);
 */

import { getDataProvider, getRuntimeConfig } from './config.js';
import { getUserWorkspaceId } from './scope.js';
import { logger } from './observability.js';

// ─────────────────────────────────────────────────────────────────
// Credit costs per action (must match SQL migration comments)
// ─────────────────────────────────────────────────────────────────
export const CREDIT_COSTS = {
  analyze: 1,
  reanalyze_llm: 3,
  discover_signals: 10,
  sequence: 3,
  icp_generate: 3,
  analytics_insights: 2,
  // token_log: 0 — internal usage tracking only, never charged
};

const TRIAL_CREDITS = 50;

// ─────────────────────────────────────────────────────────────────
// Local provider (in-memory — dev/test only)
// ─────────────────────────────────────────────────────────────────
const localBalances = new Map(); // workspaceId → integer balance

const localGetBalance = (workspaceId) => {
  if (!localBalances.has(workspaceId)) {
    localBalances.set(workspaceId, TRIAL_CREDITS);
  }
  return localBalances.get(workspaceId);
};

const localDeduct = (workspaceId, amount) => {
  const balance = localGetBalance(workspaceId);
  if (balance < amount) {
    return { success: false, error: 'insufficient_credits', balance };
  }
  const newBalance = balance - amount;
  localBalances.set(workspaceId, newBalance);
  return { success: true, balance: newBalance, deducted: amount };
};

const localGrant = (workspaceId, amount) => {
  const balance = localGetBalance(workspaceId);
  const newBalance = balance + amount;
  localBalances.set(workspaceId, newBalance);
  return { success: true, balance: newBalance, granted: amount };
};

// ─────────────────────────────────────────────────────────────────
// Supabase helpers
// ─────────────────────────────────────────────────────────────────
const getSupabaseBase = () => {
  const config = getRuntimeConfig();
  return config.supabase.url.replace(/\/$/, '');
};

const getServiceHeaders = () => {
  const config = getRuntimeConfig();
  const key = config.supabase.serviceRoleKey;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
};

const supabaseRpc = async (funcName, body) => {
  const url = `${getSupabaseBase()}/rest/v1/rpc/${funcName}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: getServiceHeaders(),
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { /* noop */ }
  }

  if (!response.ok) {
    const error = new Error(payload?.message || `RPC ${funcName} failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return payload;
};

const supabaseGetBalance = async (workspaceId) => {
  const url = `${getSupabaseBase()}/rest/v1/workspaces?id=eq.${encodeURIComponent(workspaceId)}&select=credit_balance`;
  const response = await fetch(url, { headers: getServiceHeaders() });
  if (!response.ok) return 0;
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  return Number(rows[0]?.credit_balance ?? 0);
};

const supabaseGetWorkspacePlan = async (workspaceId) => {
  const url = `${getSupabaseBase()}/rest/v1/workspaces?id=eq.${encodeURIComponent(workspaceId)}&select=plan_slug,billing_status,trial_ends_at`;
  const response = await fetch(url, { headers: getServiceHeaders() });
  if (!response.ok) return {};
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) return {};
  return {
    plan_slug: rows[0]?.plan_slug ?? 'free',
    billing_status: rows[0]?.billing_status ?? 'trial',
    trial_ends_at: rows[0]?.trial_ends_at ?? null,
  };
};

const supabaseGetTransactions = async (workspaceId, limit = 20, offset = 0) => {
  const url = `${getSupabaseBase()}/rest/v1/credit_transactions?workspace_id=eq.${encodeURIComponent(workspaceId)}&order=created_at.desc&limit=${limit}&offset=${offset}`;
  const response = await fetch(url, { headers: getServiceHeaders() });
  if (!response.ok) return [];
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
};

// ─────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────
const isSupabase = () => getDataProvider() === 'supabase';

/**
 * Get current credit balance for a workspace.
 */
export const getBalance = async (workspaceId) => {
  if (!workspaceId) return 0;
  if (isSupabase()) return supabaseGetBalance(workspaceId);
  return localGetBalance(workspaceId);
};

/**
 * Atomically deduct credits from a workspace.
 * Returns { success, balance, deducted } or { success: false, error, balance }.
 * Fails open on unexpected errors (logs but does not block the user).
 */
export const deductCredits = async (workspaceId, userId, action, amount, metadata = {}) => {
  if (!workspaceId) return { success: false, error: 'no_workspace', balance: 0 };

  try {
    if (isSupabase()) {
      return await supabaseRpc('deduct_credits', {
        p_workspace_id: workspaceId,
        p_user_id: userId || null,
        p_action: action,
        p_amount: amount,
        p_description: `Action: ${action}`,
        p_metadata: metadata,
      });
    }
    return localDeduct(workspaceId, amount);
  } catch (error) {
    logger.error('credits_deduct_error', { workspaceId, action, amount, error: error.message });
    // Fail open — credit system errors should not block users unexpectedly.
    // Log for investigation but allow the request through.
    return { success: true, balance: 0, deducted: amount, warn: 'credit_system_error' };
  }
};

/**
 * Grant credits to a workspace (trial, admin grant, future Stripe webhook).
 */
export const grantCredits = async (workspaceId, amount, action = 'grant', description = null, metadata = {}) => {
  if (!workspaceId || !amount || amount <= 0) return { success: false, error: 'invalid_params' };

  try {
    if (isSupabase()) {
      return await supabaseRpc('grant_credits', {
        p_workspace_id: workspaceId,
        p_amount: amount,
        p_action: action,
        p_description: description,
        p_metadata: metadata,
      });
    }
    return localGrant(workspaceId, amount);
  } catch (error) {
    logger.error('credits_grant_error', { workspaceId, amount, action, error: error.message });
    return { success: false, error: error.message };
  }
};

/**
 * Get paginated transaction history for a workspace.
 * Returns [] in local mode (no persistence).
 */
export const getTransactionHistory = async (workspaceId, { limit = 20, offset = 0 } = {}) => {
  if (!workspaceId || !isSupabase()) return [];
  return supabaseGetTransactions(workspaceId, limit, offset);
};

/**
 * Get workspace plan info (plan_slug, billing_status, trial_ends_at).
 * Returns defaults in local mode.
 */
export const getWorkspacePlan = async (workspaceId) => {
  if (!workspaceId) return { plan_slug: 'free', billing_status: 'trial', trial_ends_at: null };
  if (isSupabase()) return supabaseGetWorkspacePlan(workspaceId);
  return { plan_slug: 'free', billing_status: 'trial', trial_ends_at: null };
};

/**
 * Fire-and-forget token usage log.
 * Inserts a zero-amount credit_transaction with action='token_log' so we can track
 * actual Claude API consumption per action without affecting credit balance.
 *
 * @param {Object} req - Express request (needs req.user)
 * @param {string} parentAction - e.g. 'analyze', 'sequence'
 * @param {{ input_tokens: number, output_tokens: number, cache_read_input_tokens?: number, cache_creation_input_tokens?: number, model: string }} usage
 */
export const logTokenUsage = (req, parentAction, usage) => {
  if (!usage?.input_tokens && !usage?.output_tokens) return;
  const workspaceId = getUserWorkspaceId(req?.user);
  const userId = String(req?.user?.id || '');
  if (!workspaceId) return;

  const total = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);

  // Fire-and-forget — never block the HTTP response
  deductCredits(workspaceId, userId, 'token_log', 0, {
    parent_action: parentAction,
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    total_tokens: total,
    model: usage.model ?? 'unknown',
  }).catch((err) => {
    logger.warn('token_log_failed', { parentAction, error: err?.message });
  });
};

// ─────────────────────────────────────────────────────────────────
// Express middleware factory
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// Internal: check billing status for a workspace
// Returns null if allowed, or an error object { status, message, code, ... }
// ─────────────────────────────────────────────────────────────────
const checkBillingStatus = async (workspaceId) => {
  if (!workspaceId || !isSupabase()) return null;

  try {
    const plan = await getWorkspacePlan(workspaceId);
    const { billing_status, trial_ends_at } = plan;

    // Active paid subscription → always allow
    if (billing_status === 'active') return null;

    // Trial → check expiry
    if (billing_status === 'trial' || !billing_status) {
      if (trial_ends_at && new Date(trial_ends_at) < new Date()) {
        return {
          status: 402,
          message: 'Your trial has expired. Please upgrade to a paid plan to continue.',
          code: 'TRIAL_EXPIRED',
          trial_ends_at,
        };
      }
      return null;
    }

    // Canceled or past due → block
    if (billing_status === 'canceled' || billing_status === 'past_due') {
      return {
        status: 402,
        message: 'Your subscription is inactive. Please update your billing details.',
        code: 'SUBSCRIPTION_INACTIVE',
        billing_status,
      };
    }

    return null;
  } catch (err) {
    // Fail open — billing check errors must not block users
    logger.warn('billing_status_check_error', { workspaceId, error: err?.message });
    return null;
  }
};

/**
 * requireActiveBilling — standalone middleware that blocks expired trials and
 * inactive subscriptions. Use on routes that don't consume credits but should
 * still be gated by billing status (e.g. analytics, exports).
 *
 * No-op in local/dev mode (DATA_PROVIDER != supabase).
 */
export const requireActiveBilling = async (req, res, next) => {
  const workspaceId = getUserWorkspaceId(req.user);
  const billingError = await checkBillingStatus(workspaceId);
  if (billingError) {
    return res.status(billingError.status).json(billingError);
  }
  return next();
};

/**
 * requireCredits(action) — deducts CREDIT_COSTS[action] credits before the handler runs.
 * Also checks billing status (trial expiry, subscription inactive) before deducting.
 * Returns 402 with { code: 'INSUFFICIENT_CREDITS', balance, required } if not enough credits.
 *
 * Usage:
 *   router.post('/expensive', requireAuth, requireCredits('discover_signals'), handler);
 */
export const requireCredits = (action) => async (req, res, next) => {
  const amount = CREDIT_COSTS[action];
  if (!amount) {
    // Unknown action — let it through (don't block on config errors)
    return next();
  }

  const workspaceId = getUserWorkspaceId(req.user);
  const userId = String(req.user?.id || '');

  // Check billing status before deducting credits
  const billingError = await checkBillingStatus(workspaceId);
  if (billingError) {
    return res.status(billingError.status).json(billingError);
  }

  const result = await deductCredits(workspaceId, userId, action, amount, {
    path: req.path,
    method: req.method,
  });

  if (!result.success) {
    return res.status(402).json({
      message: 'Insufficient credits to perform this action.',
      code: 'INSUFFICIENT_CREDITS',
      balance: result.balance ?? 0,
      required: amount,
      action,
    });
  }

  req.creditsDeducted = amount;
  req.creditsBalance = result.balance;
  return next();
};

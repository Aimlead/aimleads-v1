/**
 * CRM Service — dispatcher + database layer
 *
 * Owns all DB operations for crm_integrations and crm_sync_records tables.
 * Dispatches sync calls to the appropriate CRM-specific service
 * (HubSpot or Salesforce) based on the workspace's configured crm_type.
 *
 * Uses the same Supabase service-role REST pattern as dataStore.js.
 * Access control is enforced at the Express auth layer — the service role
 * is used here solely because RLS would require passing auth tokens.
 */

import crypto from 'node:crypto';
import { createId } from '../lib/utils.js';
import { logger } from '../lib/observability.js';
import { getRuntimeConfig } from '../lib/config.js';
import { upsertLeadAsContact, testHubSpotConnection } from './hubspotService.js';
import { upsertLeadAsSfLead, testSalesforceConnection } from './salesforceService.js';

// ─── Supabase helper ──────────────────────────────────────────────────────────

/**
 * Minimal Supabase REST client for the CRM tables.
 * Mirrors the pattern in dataStore.js (createSupabaseClient → request).
 * Kept local to avoid coupling with the complex schema-fallback logic in dataStore.
 */
async function supabaseRequest(table, { method = 'GET', query = {}, body } = {}) {
  const config = getRuntimeConfig();
  const baseUrl = `${config.supabase.url.replace(/\/$/, '')}/rest/v1`;
  const apiKey = config.supabase.serviceRoleKey;

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
      Prefer: 'return=representation',
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
    const message =
      payload?.message || payload?.error_description || `Supabase error (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

// ─── Token encryption (AES-256-GCM) ──────────────────────────────────────────
// Tokens are encrypted at rest using a derived key from CRM_ENCRYPTION_KEY or
// SESSION_SECRET. Encrypted tokens are prefixed with "enc:" to allow
// backwards-compatible migration of plaintext tokens already in the database.

const ENC_PREFIX = 'enc:';
const SALT = 'aimleads-crm-token-salt-v1';

function getCrmEncryptionKey() {
  const secret = String(process.env.CRM_ENCRYPTION_KEY || process.env.SESSION_SECRET || '').trim();
  if (!secret || secret === 'aimleads-dev-only-secret-do-not-use-in-production') return null;
  return crypto.scryptSync(secret, SALT, 32);
}

function encryptToken(plaintext) {
  if (!plaintext) return plaintext;
  const key = getCrmEncryptionKey();
  if (!key) return plaintext; // No key in dev — store plaintext

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENC_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptToken(stored) {
  if (!stored) return stored;
  if (!stored.startsWith(ENC_PREFIX)) return stored; // Legacy plaintext — return as-is

  const key = getCrmEncryptionKey();
  if (!key) {
    logger.warn('crm_token_decrypt_no_key', {});
    return null; // Cannot decrypt without key
  }

  try {
    const parts = stored.slice(ENC_PREFIX.length).split(':');
    if (parts.length !== 3) return null;

    const [ivB64, authTagB64, ciphertextB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (err) {
    logger.warn('crm_token_decrypt_failed', { error: err.message });
    return null;
  }
}

// ─── Token masking ────────────────────────────────────────────────────────────

function maskToken(integration) {
  if (!integration) return integration;
  // Mask the plaintext token (after decryption), never expose encrypted value
  const token = String(integration.api_token || '');
  return {
    ...integration,
    api_token: token.length > 4 ? `***${token.slice(-4)}` : '***',
  };
}

/**
 * Returns an integration with its token decrypted (for internal use only).
 * Never pass the result of this function directly to HTTP clients — use maskToken first.
 */
function withDecryptedToken(integration) {
  if (!integration) return integration;
  return {
    ...integration,
    api_token: decryptToken(integration.api_token),
  };
}

// ─── crm_integrations CRUD ───────────────────────────────────────────────────

/**
 * Returns the raw integration with the token decrypted (for internal use only).
 * Never expose the result of this function directly to HTTP clients.
 */
export async function getCrmIntegration(workspaceId, crmType) {
  const rows = await supabaseRequest('crm_integrations', {
    query: {
      workspace_id: `eq.${workspaceId}`,
      crm_type: `eq.${crmType}`,
      limit: '1',
    },
  });
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  return row ? withDecryptedToken(row) : null;
}

/**
 * Returns all integrations for a workspace with tokens masked.
 */
export async function listCrmIntegrations(workspaceId) {
  const rows = await supabaseRequest('crm_integrations', {
    query: { workspace_id: `eq.${workspaceId}` },
  });
  return (rows || []).map(maskToken);
}

/**
 * Creates or updates a CRM integration for a workspace.
 * Returns the saved record with the token masked.
 */
export async function upsertCrmIntegration(workspaceId, { crmType, apiToken, config: crmConfig = {} }) {
  const existing = await getCrmIntegration(workspaceId, crmType);
  const now = new Date().toISOString();

  // Encrypt token before persisting
  const encryptedToken = encryptToken(apiToken);

  if (existing) {
    const rows = await supabaseRequest('crm_integrations', {
      method: 'PATCH',
      query: { id: `eq.${existing.id}` },
      body: {
        api_token: encryptedToken,
        config: crmConfig,
        is_active: true,
        updated_at: now,
      },
    });
    const updated = Array.isArray(rows) ? rows[0] : rows;
    // Return masked plaintext token (decrypt then mask)
    return maskToken({ ...updated, api_token: apiToken });
  }

  const rows = await supabaseRequest('crm_integrations', {
    method: 'POST',
    body: {
      id: createId('crm'),
      workspace_id: workspaceId,
      crm_type: crmType,
      api_token: encryptedToken,
      config: crmConfig,
      is_active: true,
      created_at: now,
      updated_at: now,
    },
  });
  const created = Array.isArray(rows) ? rows[0] : rows;
  // Return masked plaintext token
  return maskToken({ ...created, api_token: apiToken });
}

/**
 * Removes a CRM integration for a workspace.
 */
export async function deleteCrmIntegration(workspaceId, crmType) {
  await supabaseRequest('crm_integrations', {
    method: 'DELETE',
    query: {
      workspace_id: `eq.${workspaceId}`,
      crm_type: `eq.${crmType}`,
    },
  });
  return { deleted: true };
}

// ─── Connection test ──────────────────────────────────────────────────────────

/**
 * Tests the connection for a configured CRM.
 * Updates last_tested_at on success.
 */
export async function testCrmConnection(workspaceId, crmType) {
  const integration = await getCrmIntegration(workspaceId, crmType);
  if (!integration) return { success: false, error: 'not_configured' };

  let success = false;
  try {
    if (crmType === 'hubspot') {
      success = await testHubSpotConnection(integration.api_token);
    } else if (crmType === 'salesforce') {
      success = await testSalesforceConnection(
        integration.api_token,
        integration.config?.instance_url
      );
    }
  } catch (err) {
    logger.warn('crm_test_connection_error', { crm_type: crmType, error: err.message });
    return { success: false, error: err.message };
  }

  if (success) {
    await supabaseRequest('crm_integrations', {
      method: 'PATCH',
      query: { id: `eq.${integration.id}` },
      body: { last_tested_at: new Date().toISOString() },
    }).catch((err) => {
      logger.warn('crm_test_timestamp_update_failed', { error: err.message });
    });
  }

  return { success };
}

// ─── Lead sync ────────────────────────────────────────────────────────────────

/**
 * Syncs a single AimLeads lead to the specified CRM.
 * Writes a crm_sync_records row regardless of outcome.
 * Updates last_synced_at on success.
 *
 * @returns {Promise<{success: boolean, crmObjectId?: string, crmObjectType?: string, crmObjectUrl?: string, syncRecord: Object, error?: string}>}
 */
export async function syncLeadToCrm(workspaceId, lead, crmType) {
  const integration = await getCrmIntegration(workspaceId, crmType);

  if (!integration || !integration.is_active) {
    return { success: false, error: 'not_configured' };
  }

  let result;
  try {
    if (crmType === 'hubspot') {
      result = await upsertLeadAsContact(integration.api_token, lead);
    } else if (crmType === 'salesforce') {
      result = await upsertLeadAsSfLead(
        integration.api_token,
        integration.config?.instance_url,
        lead
      );
    } else {
      result = { success: false, error: `unsupported_crm:${crmType}` };
    }
  } catch (err) {
    logger.warn('crm_sync_unexpected_error', { crm_type: crmType, lead_id: lead.id, error: err.message });
    result = { success: false, error: err.message };
  }

  const now = new Date().toISOString();
  const syncRecord = {
    id: createId('sync'),
    workspace_id: workspaceId,
    lead_id: lead.id,
    crm_type: crmType,
    crm_object_id: result.crmObjectId || null,
    crm_object_type: result.crmObjectType || null,
    crm_object_url: result.crmObjectUrl || null,
    direction: 'push',
    status: result.success ? 'success' : 'failed',
    synced_at: result.success ? now : null,
    error_message: result.success ? null : String(result.error || 'unknown').slice(0, 500),
    created_at: now,
  };

  // Write sync record — fire-and-forget style, errors are non-fatal
  supabaseRequest('crm_sync_records', { method: 'POST', body: syncRecord })
    .catch((err) => logger.warn('crm_sync_record_write_failed', { error: err.message, lead_id: lead.id }));

  if (result.success) {
    supabaseRequest('crm_integrations', {
      method: 'PATCH',
      query: { id: `eq.${integration.id}` },
      body: { last_synced_at: now },
    }).catch((err) => logger.warn('crm_last_synced_update_failed', { error: err.message }));
  }

  return { ...result, syncRecord };
}

/**
 * Returns the 10 most recent sync records for a lead.
 */
export async function getLeadSyncStatus(workspaceId, leadId) {
  const rows = await supabaseRequest('crm_sync_records', {
    query: {
      workspace_id: `eq.${workspaceId}`,
      lead_id: `eq.${leadId}`,
      order: 'created_at.desc',
      limit: '10',
    },
  });
  return rows || [];
}

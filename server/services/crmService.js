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

// ─── Token masking ────────────────────────────────────────────────────────────

function maskToken(integration) {
  if (!integration) return integration;
  const token = String(integration.api_token || '');
  return {
    ...integration,
    api_token: token.length > 4 ? `***${token.slice(-4)}` : '***',
  };
}

// ─── crm_integrations CRUD ───────────────────────────────────────────────────

/**
 * Returns the raw (unmasked) integration row for internal use.
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
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
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

  if (existing) {
    const rows = await supabaseRequest('crm_integrations', {
      method: 'PATCH',
      query: { id: `eq.${existing.id}` },
      body: {
        api_token: apiToken,
        config: crmConfig,
        is_active: true,
        updated_at: now,
      },
    });
    const updated = Array.isArray(rows) ? rows[0] : rows;
    return maskToken(updated);
  }

  const rows = await supabaseRequest('crm_integrations', {
    method: 'POST',
    body: {
      id: createId('crm'),
      workspace_id: workspaceId,
      crm_type: crmType,
      api_token: apiToken,
      config: crmConfig,
      is_active: true,
      created_at: now,
      updated_at: now,
    },
  });
  const created = Array.isArray(rows) ? rows[0] : rows;
  return maskToken(created);
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

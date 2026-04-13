/**
 * Salesforce Service — CRM Lead sync
 *
 * Syncs AimLeads leads to Salesforce as Lead objects.
 * Uses the Salesforce REST API v59.0 with a session/access token
 * and the customer's instance URL (e.g. https://myco.salesforce.com).
 *
 * Upsert logic: SOQL query by Email first, PATCH if found, POST if not.
 *
 * Custom Salesforce fields used (must be created in the Salesforce org):
 *   - AimLeads_Score__c     (Number)  : AimLeads final score 0-100
 *   - AimLeads_Category__c  (Text)    : e.g. "Excellent", "Strong"
 *
 * SECURITY: The instance_url is supplied by the user — SSRF validation is
 * mandatory before every outbound request to prevent internal network access.
 *
 * Graceful degradation: never throws to the caller — returns { success: false, error } instead.
 */

import { logger } from '../lib/observability.js';
import { validateOutboundUrl } from '../lib/ssrf.js';

const TIMEOUT_MS = 10_000;
const SF_API_VERSION = 'v59.0';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Splits "Jean-Pierre Dupont" into { first: 'Jean-Pierre', last: 'Dupont' }.
 */
function splitName(fullName) {
  if (!fullName || typeof fullName !== 'string') return null;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(' ');
  if (!first || !last) return null;
  return { first, last };
}

/**
 * Low-level authenticated fetch to the Salesforce REST API.
 * SSRF-validates the instanceUrl on every call because it comes from user input.
 * Returns { ok, status, payload } — never throws.
 */
async function fetchSalesforce(token, instanceUrl, path, { method = 'GET', body } = {}) {
  // SSRF protection — critical: instanceUrl is user-supplied
  let ssrfCheck;
  try {
    ssrfCheck = await validateOutboundUrl(instanceUrl);
  } catch {
    ssrfCheck = { safe: false, reason: 'ssrf_validation_error' };
  }

  if (!ssrfCheck.safe) {
    logger.warn('salesforce_ssrf_blocked', { reason: ssrfCheck.reason, instanceUrl });
    return { ok: false, status: 0, payload: null, error: 'ssrf_blocked' };
  }

  const base = instanceUrl.replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${base}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    // 204 No Content (PATCH success)
    if (res.status === 204) return { ok: true, status: 204, payload: null };

    let payload = null;
    try {
      const text = await res.text();
      if (text) payload = JSON.parse(text);
    } catch {
      // non-JSON body
    }

    if (!res.ok) {
      const sfMessage =
        Array.isArray(payload) ? payload[0]?.message : payload?.error_description;
      logger.warn('salesforce_http_error', { status: res.status, message: sfMessage });
      return { ok: false, status: res.status, payload };
    }

    return { ok: true, status: res.status, payload };
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.warn('salesforce_timeout', { path });
    } else {
      logger.warn('salesforce_fetch_error', { path, error: err?.message });
    }
    return { ok: false, status: 0, payload: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Builds the Salesforce Lead body from an AimLeads lead.
 * Company and LastName are required fields in Salesforce.
 */
function buildLeadBody(lead) {
  const nameParts = splitName(lead.contact_name);
  const company = lead.company_name || 'Unknown';

  // LastName is required — fall back to company name if no last name is parseable
  const lastName = nameParts ? nameParts.last : company;
  const firstName = nameParts ? nameParts.first : undefined;

  return {
    Company: company,
    LastName: lastName,
    ...(firstName ? { FirstName: firstName } : {}),
    ...(lead.contact_email ? { Email: lead.contact_email } : {}),
    ...(lead.contact_role ? { Title: lead.contact_role } : {}),
    ...(lead.website_url ? { Website: lead.website_url } : {}),
    ...(lead.industry ? { Industry: lead.industry } : {}),
    ...(lead.company_size ? { NumberOfEmployees: Number(lead.company_size) } : {}),
    ...(lead.country ? { Country: lead.country } : {}),
    LeadSource: 'AimLeads',
    // Custom fields — must be created in the Salesforce org
    ...(lead.final_score != null ? { AimLeads_Score__c: lead.final_score } : {}),
    ...(lead.final_category ? { AimLeads_Category__c: lead.final_category } : {}),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Verifies the token and instance URL by hitting the Salesforce limits endpoint.
 * @returns {Promise<boolean>}
 */
export async function testSalesforceConnection(token, instanceUrl) {
  if (!token || !instanceUrl) return false;
  const result = await fetchSalesforce(
    token,
    instanceUrl,
    `/services/data/${SF_API_VERSION}/limits`
  );
  return result.ok;
}

/**
 * Upserts an AimLeads lead as a Salesforce Lead.
 * Queries by Email first; updates if found, creates if not.
 *
 * @param {string} token       - Salesforce access/session token
 * @param {string} instanceUrl - Customer Salesforce instance URL
 * @param {Object} lead        - AimLeads lead object
 * @returns {Promise<{success: boolean, crmObjectId?: string, crmObjectType?: string, crmObjectUrl?: string, error?: string}>}
 */
export async function upsertLeadAsSfLead(token, instanceUrl, lead) {
  if (!token || !instanceUrl) return { success: false, error: 'no_token_or_instance' };

  // Step 1: query for an existing Lead by email
  if (lead.contact_email) {
    const escaped = lead.contact_email.replace(/'/g, "\\'");
    const soql = `SELECT Id FROM Lead WHERE Email='${escaped}' LIMIT 1`;
    const queryPath = `/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(soql)}`;
    const queryResult = await fetchSalesforce(token, instanceUrl, queryPath);

    if (queryResult.ok && queryResult.payload?.records?.length > 0) {
      const sfId = queryResult.payload.records[0].Id;
      const updatePath = `/services/data/${SF_API_VERSION}/sobjects/Lead/${sfId}`;
      const updateResult = await fetchSalesforce(token, instanceUrl, updatePath, {
        method: 'PATCH',
        body: buildLeadBody(lead),
      });

      if (updateResult.ok) {
        logger.info('salesforce_lead_updated', { sf_id: sfId, lead_id: lead.id });
        return {
          success: true,
          crmObjectId: sfId,
          crmObjectType: 'lead',
          crmObjectUrl: `${instanceUrl.replace(/\/$/, '')}/lightning/r/Lead/${sfId}/view`,
        };
      }

      return {
        success: false,
        error: `update_failed:${updateResult.status}`,
      };
    }
  }

  // Step 2: create a new Lead
  const createPath = `/services/data/${SF_API_VERSION}/sobjects/Lead`;
  const createResult = await fetchSalesforce(token, instanceUrl, createPath, {
    method: 'POST',
    body: buildLeadBody(lead),
  });

  if (createResult.ok) {
    const sfId = createResult.payload?.id;
    logger.info('salesforce_lead_created', { sf_id: sfId, lead_id: lead.id });
    return {
      success: true,
      crmObjectId: sfId,
      crmObjectType: 'lead',
      crmObjectUrl: `${instanceUrl.replace(/\/$/, '')}/lightning/r/Lead/${sfId}/view`,
    };
  }

  return {
    success: false,
    error: `create_failed:${createResult.status}`,
  };
}

/**
 * HubSpot Service — CRM contact sync
 *
 * Syncs AimLeads leads to HubSpot as Contact objects.
 * Uses the HubSpot CRM v3 API with a Private App token.
 *
 * Upsert logic: search by email first, PATCH if found, POST if not.
 * This ensures idempotent pushes — pushing the same lead twice
 * updates the contact rather than creating a duplicate.
 *
 * Custom HubSpot properties used (must be pre-created in the HubSpot account):
 *   - aimlead_score      (number)  : AimLeads final score 0-100
 *   - aimlead_category   (string)  : e.g. "Excellent", "Strong"
 *   - aimlead_analysis   (string)  : AI analysis summary (truncated to 1000 chars)
 *
 * Graceful degradation: never throws to the caller — returns { success: false, error } instead.
 */

import { logger } from '../lib/observability.js';

const HUBSPOT_BASE_URL = 'https://api.hubapi.com';
const TIMEOUT_MS = 10_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Splits "Jean-Pierre Dupont" into { first: 'Jean-Pierre', last: 'Dupont' }.
 * Returns null if name cannot be split meaningfully.
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
 * Low-level authenticated fetch to the HubSpot API.
 * Returns { ok, status, payload } — never throws.
 */
async function fetchHubSpot(token, path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let payload = null;
    try {
      const text = await res.text();
      if (text) payload = JSON.parse(text);
    } catch {
      // non-JSON body
    }

    if (!res.ok) {
      logger.warn('hubspot_http_error', { status: res.status, message: payload?.message });
      return { ok: false, status: res.status, payload };
    }

    return { ok: true, status: res.status, payload };
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.warn('hubspot_timeout', { path });
    } else {
      logger.warn('hubspot_fetch_error', { path, error: err?.message });
    }
    return { ok: false, status: 0, payload: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Builds the HubSpot contact properties object from an AimLeads lead.
 */
function buildContactProperties(lead) {
  const nameParts = splitName(lead.contact_name);

  return {
    ...(nameParts ? { firstname: nameParts.first, lastname: nameParts.last } : {}),
    ...(lead.contact_email ? { email: lead.contact_email } : {}),
    ...(lead.contact_role ? { jobtitle: lead.contact_role } : {}),
    ...(lead.company_name ? { company: lead.company_name } : {}),
    ...(lead.website_url ? { website: lead.website_url } : {}),
    // Custom AimLeads properties — must be pre-created in the HubSpot account
    ...(lead.final_score != null ? { aimlead_score: String(lead.final_score) } : {}),
    ...(lead.final_category ? { aimlead_category: lead.final_category } : {}),
    ...(lead.analysis_summary
      ? { aimlead_analysis: String(lead.analysis_summary).slice(0, 1000) }
      : {}),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Verifies that the token is valid by hitting a lightweight endpoint.
 * @returns {Promise<boolean>}
 */
export async function testHubSpotConnection(token) {
  if (!token) return false;
  const result = await fetchHubSpot(token, '/crm/v3/owners?limit=1');
  return result.ok;
}

/**
 * Upserts an AimLeads lead as a HubSpot Contact.
 * Searches by email first; updates if found, creates if not.
 *
 * @param {string} token - HubSpot Private App token
 * @param {Object} lead  - AimLeads lead object
 * @returns {Promise<{success: boolean, crmObjectId?: string, crmObjectType?: string, crmObjectUrl?: string, error?: string}>}
 */
export async function upsertLeadAsContact(token, lead) {
  if (!token) return { success: false, error: 'no_token' };

  const properties = buildContactProperties(lead);

  // Step 1: search for an existing contact by email
  if (lead.contact_email) {
    const searchResult = await fetchHubSpot(token, '/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: {
        filterGroups: [
          {
            filters: [
              { propertyName: 'email', operator: 'EQ', value: lead.contact_email },
            ],
          },
        ],
        limit: 1,
      },
    });

    if (searchResult.ok && searchResult.payload?.results?.length > 0) {
      const existing = searchResult.payload.results[0];
      // Step 2a: update existing contact
      const updateResult = await fetchHubSpot(
        token,
        `/crm/v3/objects/contacts/${existing.id}`,
        { method: 'PATCH', body: { properties } }
      );

      if (updateResult.ok) {
        logger.info('hubspot_contact_updated', { contact_id: existing.id, lead_id: lead.id });
        return {
          success: true,
          crmObjectId: existing.id,
          crmObjectType: 'contact',
          crmObjectUrl: `https://app.hubspot.com/contacts/${existing.id}`,
        };
      }

      return {
        success: false,
        error: `update_failed:${updateResult.status}`,
      };
    }
  }

  // Step 2b: create new contact
  const createResult = await fetchHubSpot(token, '/crm/v3/objects/contacts', {
    method: 'POST',
    body: { properties },
  });

  if (createResult.ok) {
    const id = createResult.payload?.id;
    logger.info('hubspot_contact_created', { contact_id: id, lead_id: lead.id });
    return {
      success: true,
      crmObjectId: id,
      crmObjectType: 'contact',
      crmObjectUrl: `https://app.hubspot.com/contacts/${id}`,
    };
  }

  return {
    success: false,
    error: `create_failed:${createResult.status}`,
  };
}

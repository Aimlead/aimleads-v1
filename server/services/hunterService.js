/**
 * Hunter.io Service — professional email discovery
 *
 * Finds the professional email of a lead's contact using the Hunter.io API.
 * Called during the discover-signals pipeline to auto-populate contact_email.
 *
 * Endpoints used:
 *   - email-finder  : when first + last name are available (more accurate)
 *   - domain-search : fallback when only company domain is known
 *
 * Graceful degradation: returns null if HUNTER_API_KEY is not set or on any error.
 */

import { logger } from '../lib/observability.js';
import { validateOutboundUrl } from '../lib/ssrf.js';

const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
const BASE_URL = 'https://api.hunter.io/v2';
const TIMEOUT_MS = 5000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts the root domain from a website URL.
 * Falls back to deriving from company_name if needed.
 */
function extractDomain(lead) {
  if (lead.website_url) {
    try {
      const url = new URL(
        lead.website_url.startsWith('http') ? lead.website_url : `https://${lead.website_url}`
      );
      // Strip www. prefix
      return url.hostname.replace(/^www\./, '');
    } catch {
      // fall through
    }
  }
  return null;
}

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
 * Fetches a URL with a timeout. Returns parsed JSON or throws.
 */
async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      logger.warn('hunter_http_error', { status: res.status });
      return null;
    }
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Finds the professional email for a lead's contact using Hunter.io.
 *
 * @param {Object} lead - Lead object from dataStore
 * @returns {Promise<{email: string, score: number, source_type: 'hunter_io'}|null>}
 */
export async function findEmailForLead(lead) {
  if (!HUNTER_API_KEY) return null;

  const domain = extractDomain(lead);
  if (!domain) {
    logger.debug('hunter_skip', { reason: 'no_domain', company: lead.company_name });
    return null;
  }

  // SSRF protection: validate the domain before making outbound requests
  const ssrfCheck = await validateOutboundUrl(`https://${domain}`);
  if (!ssrfCheck.safe) {
    logger.warn('hunter_skip', { reason: `ssrf_blocked:${ssrfCheck.reason}`, company: lead.company_name });
    return null;
  }

  try {
    const nameParts = splitName(lead.contact_name);

    // Prefer email-finder (specific person) over domain-search (generic)
    if (nameParts) {
      const url = `${BASE_URL}/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(nameParts.first)}&last_name=${encodeURIComponent(nameParts.last)}&api_key=${HUNTER_API_KEY}`;
      const data = await fetchWithTimeout(url);

      if (data?.data?.email) {
        logger.info('hunter_email_finder_success', {
          company: lead.company_name,
          score: data.data.score,
        });
        return {
          email: data.data.email,
          score: data.data.score ?? 50,
          source_type: 'hunter_io',
        };
      }
    }

    // Fallback: domain-search — take the first (most common) email pattern result
    const url = `${BASE_URL}/domain-search?domain=${encodeURIComponent(domain)}&limit=1&api_key=${HUNTER_API_KEY}`;
    const data = await fetchWithTimeout(url);

    const firstEmail = data?.data?.emails?.[0];
    if (firstEmail?.value) {
      logger.info('hunter_domain_search_success', {
        company: lead.company_name,
        domain,
      });
      return {
        email: firstEmail.value,
        score: firstEmail.confidence ?? 50,
        source_type: 'hunter_io',
      };
    }

    logger.debug('hunter_no_result', { domain });
    return null;
  } catch (error) {
    logger.warn('hunter_error', { error: error?.message, company: lead.company_name });
    return null;
  }
}

export const hunterAvailable = Boolean(HUNTER_API_KEY);

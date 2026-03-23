/**
 * News Service — company news → intent signals
 *
 * Fetches recent news articles about a company using NewsAPI and returns them
 * as "findings" compatible with externalSignalExtractor.extractSignalsFromFindings().
 *
 * Signal types typically detected from news:
 *   - recent_funding    (funding announcements)
 *   - strong_growth     (expansion, hiring)
 *   - major_org_change  (acquisitions, leadership changes)
 *   - active_rfp        (tenders, procurement)
 *   - regulatory_need   (compliance news)
 *   - liquidation_or_bankruptcy (negative)
 *
 * Graceful degradation: returns [] if NEWS_API_KEY is not set or on any error.
 */

import { logger } from '../lib/observability.js';

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const BASE_URL = 'https://newsapi.org/v2/everything';
const TIMEOUT_MS = 6000;
const PAGE_SIZE = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a focused search query for the company.
 * Puts the company name in quotes for exact-ish matching.
 */
function buildQuery(lead) {
  const name = lead.company_name?.trim();
  if (!name) return null;
  // Exact phrase match, optionally narrowed by country or industry
  return `"${name}"`;
}

/**
 * Maps a NewsAPI article to the findings format expected by extractSignalsFromFindings().
 *
 * Finding shape (from externalSignalExtractor.js):
 *   { title, snippet, url, found_at, source }
 */
function articleToFinding(article) {
  return {
    title: article.title || '',
    snippet: article.description || article.content?.slice(0, 300) || '',
    url: article.url || '',
    found_at: article.publishedAt || new Date().toISOString(),
    source: article.source?.name || 'news_media',
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Fetches recent news about a company and returns findings for signal extraction.
 *
 * @param {Object} lead - Lead object from dataStore
 * @returns {Promise<Array<{title, snippet, url, found_at, source}>>}
 */
export async function fetchCompanyNewsFindings(lead) {
  if (!NEWS_API_KEY) return [];

  const query = buildQuery(lead);
  if (!query) return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      q: query,
      sortBy: 'publishedAt',
      pageSize: String(PAGE_SIZE),
      apiKey: NEWS_API_KEY,
    });

    const url = `${BASE_URL}?${params.toString()}`;
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      logger.warn('newsapi_http_error', { status: res.status, company: lead.company_name });
      return [];
    }

    const data = await res.json();

    if (!Array.isArray(data?.articles) || data.articles.length === 0) {
      logger.debug('newsapi_no_articles', { company: lead.company_name });
      return [];
    }

    // Filter out removed articles (NewsAPI returns [Removed] placeholders)
    const articles = data.articles.filter(
      (a) => a.title && !a.title.includes('[Removed]') && a.url
    );

    logger.info('newsapi_articles_found', {
      company: lead.company_name,
      count: articles.length,
    });

    return articles.map(articleToFinding);
  } catch (error) {
    if (error?.name === 'AbortError') {
      logger.warn('newsapi_timeout', { company: lead.company_name });
    } else {
      logger.warn('newsapi_error', { error: error?.message, company: lead.company_name });
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

export const newsServiceAvailable = Boolean(NEWS_API_KEY);

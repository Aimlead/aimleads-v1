const DEFAULT_TIMEOUT_MS = 3500;
const DEFAULT_MAX_PAGES = 3;
const MAX_HTML_CHARS = 280000;

const WEBSITE_PATH_CANDIDATES = ['', '/news', '/press', '/blog', '/careers', '/jobs'];

const WEBSITE_SIGNAL_RULES = [
  {
    key: 'recent_funding',
    confidence: 88,
    expressions: [
      /\bseries\s+[abcde]\b/i,
      /\bfunding round\b/i,
      /\braised\s+(?:[$€£]\s?)?\d/i,
      /\blevee?\s+de\s+fonds?\b/i,
      /\bseed round\b/i,
    ],
  },
  {
    key: 'strong_growth',
    confidence: 84,
    expressions: [
      /\bwe are hiring\b/i,
      /\bjoin our team\b/i,
      /\bexpanding (?:our )?team\b/i,
      /\bhiring spree\b/i,
      /\bcroissance\b/i,
      /\brecrut(?:e|ement|ons)\b/i,
    ],
  },
  {
    key: 'major_org_change',
    confidence: 80,
    expressions: [
      /\breorganization\b/i,
      /\brestructuring\b/i,
      /\bmerger\b/i,
      /\bacquisition\b/i,
      /\bnew strategic plan\b/i,
      /\breorganisation\b/i,
    ],
  },
  {
    key: 'recent_role_change',
    confidence: 76,
    expressions: [
      /\bappointed\b/i,
      /\bjoins as\b/i,
      /\bnew (?:cio|cto|ciso|head of it)\b/i,
      /\bnomm[ée]\b/i,
      /\bprise de poste\b/i,
    ],
  },
  {
    key: 'active_rfp',
    confidence: 86,
    expressions: [/\brfp\b/i, /\brequest for proposal\b/i, /\bappel d[' ]offre\b/i, /\btender\b/i],
  },
  {
    key: 'regulatory_need',
    confidence: 78,
    expressions: [
      /\biso\s?27001\b/i,
      /\bsoc\s?2\b/i,
      /\bgdpr\b/i,
      /\brgpd\b/i,
      /\bnis2\b/i,
      /\bcompliance\b/i,
      /\baudit requirement\b/i,
    ],
  },
  {
    key: 'budget_available',
    confidence: 72,
    expressions: [/\bbudget approved\b/i, /\ballocated budget\b/i, /\bfunded project\b/i],
  },
  {
    key: 'clear_priority',
    confidence: 72,
    expressions: [/\btop priority\b/i, /\bstrategic priority\b/i, /\binitiative prioritaire\b/i, /\bmust deliver\b/i],
  },
  {
    key: 'liquidation_or_bankruptcy',
    confidence: 95,
    expressions: [/\bbankruptcy\b/i, /\binsolvency\b/i, /\bliquidation judiciaire\b/i, /\bredressement judiciaire\b/i],
  },
  {
    key: 'closed_or_dead',
    confidence: 95,
    expressions: [/\bceased operations\b/i, /\bcompany closed\b/i, /\bshutdown\b/i, /\bferm[ée] definitivement\b/i],
  },
];

const DECISION_MAKER_ROLE_REGEX =
  /\b(cto|cio|ciso|chief technology officer|chief information officer|head of it|it director|directeur des systemes d'information|dsi)\b/i;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const safeWebsiteUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(normalized);
    return url;
  } catch {
    return null;
  }
};

const decodeHtmlEntities = (value) =>
  String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

const stripHtmlToText = (html) => {
  const withoutScripts = String(html || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ');

  return decodeHtmlEntities(withoutScripts.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
};

const withTimeout = async (work, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
};

const buildCandidateUrls = ({ websiteUrl, maxPages = DEFAULT_MAX_PAGES }) => {
  const candidates = [];
  const seen = new Set();

  for (const path of WEBSITE_PATH_CANDIDATES) {
    if (candidates.length >= maxPages) break;
    const candidate = new URL(path || '/', websiteUrl).toString();
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    candidates.push(candidate);
  }

  return candidates;
};

const pageConfidenceBonus = (url) => {
  const lower = String(url || '').toLowerCase();
  if (lower.includes('/press') || lower.includes('/news')) return 5;
  if (lower.includes('/blog') || lower.includes('/careers') || lower.includes('/jobs')) return 2;
  return 0;
};

const extractSnippet = ({ text, index, matchLength = 24 }) => {
  if (!text || index < 0) return '';
  const start = Math.max(0, index - 70);
  const end = Math.min(text.length, index + matchLength + 110);
  return text.slice(start, end).trim();
};

const pushUniqueSignal = (signals, signal) => {
  if (!signal?.key || !signal?.evidence) return;
  const dedupeKey = `${String(signal.key).toLowerCase()}|${String(signal.evidence).toLowerCase()}`;
  if (signals.some((row) => `${String(row.key).toLowerCase()}|${String(row.evidence).toLowerCase()}` === dedupeKey)) {
    return;
  }
  signals.push(signal);
};

const roleDerivedSignals = (lead) => {
  const signals = [];
  const role = String(lead?.contact_role || '').trim();
  if (!role) return signals;

  if (DECISION_MAKER_ROLE_REGEX.test(role)) {
    pushUniqueSignal(signals, {
      key: 'decision_maker_involved',
      evidence: `crm://contact-role/${encodeURIComponent(role.toLowerCase())}`,
      confidence: 68,
      source_type: 'crm_record',
      found_at: new Date().toISOString(),
    });
  }

  return signals;
};

const analyzeWebsiteText = ({ pages }) => {
  const nowIso = new Date().toISOString();
  const findings = [];
  const signals = [];

  for (const page of pages) {
    const text = page.text || '';
    if (!text) continue;

    for (const rule of WEBSITE_SIGNAL_RULES) {
      let matched = null;
      let matchIndex = -1;

      for (const expression of rule.expressions) {
        const result = expression.exec(text);
        if (result) {
          matched = result[0];
          matchIndex = result.index;
          break;
        }
      }

      if (!matched) continue;

      const snippet = extractSnippet({
        text,
        index: matchIndex,
        matchLength: matched.length,
      });

      const confidence = clamp(rule.confidence + pageConfidenceBonus(page.url), 45, 97);
      const evidenceUrl = page.url;

      findings.push({
        title: `${rule.key} signal found`,
        snippet: snippet || matched,
        text: `${matched} ${snippet}`.trim(),
        url: evidenceUrl,
        source_type: 'official_company_site',
        confidence,
        found_at: nowIso,
      });

      pushUniqueSignal(signals, {
        key: rule.key,
        evidence: evidenceUrl,
        confidence,
        source_type: 'official_company_site',
        found_at: nowIso,
      });
    }
  }

  return { findings, signals };
};

export async function discoverInternetSignals({ lead, maxPages = DEFAULT_MAX_PAGES, fetchFn = globalThis.fetch } = {}) {
  const pages = [];
  const warnings = [];
  const websiteUrl = safeWebsiteUrl(lead?.website_url);
  const boundedMaxPages = clamp(Number(maxPages) || DEFAULT_MAX_PAGES, 1, 8);

  if (!fetchFn) {
    warnings.push('fetch_unavailable');
  }

  if (websiteUrl && fetchFn) {
    const candidates = buildCandidateUrls({ websiteUrl, maxPages: boundedMaxPages });

    for (const url of candidates) {
      try {
        const response = await withTimeout(
          (signal) =>
            fetchFn(url, {
              method: 'GET',
              redirect: 'follow',
              signal,
              headers: {
                'User-Agent': 'AimLeadsSignalBot/1.0 (+https://aimleads.local)',
                Accept: 'text/html,application/xhtml+xml',
              },
            }),
          DEFAULT_TIMEOUT_MS
        );

        if (!response?.ok) {
          warnings.push(`fetch_failed:${url}`);
          continue;
        }

        const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
        if (contentType && !contentType.includes('text/html')) {
          continue;
        }

        const html = await response.text();
        const text = stripHtmlToText(String(html || '').slice(0, MAX_HTML_CHARS));
        if (!text) continue;

        pages.push({ url, text });
      } catch {
        warnings.push(`fetch_error:${url}`);
      }
    }
  } else if (!websiteUrl) {
    warnings.push('missing_website_url');
  }

  const websiteSignals = analyzeWebsiteText({ pages });
  const crmSignals = roleDerivedSignals(lead);
  const mergedSignals = [];

  for (const signal of [...websiteSignals.signals, ...crmSignals]) {
    pushUniqueSignal(mergedSignals, signal);
  }

  return {
    pages_scanned: pages.length,
    findings: websiteSignals.findings,
    signals: mergedSignals,
    warnings,
  };
}


const SIGNAL_RULES = [
  {
    key: 'liquidation_or_bankruptcy',
    priority: 120,
    terms: ['liquidation', 'bankruptcy', 'insolvency', 'redressement judiciaire', 'cessation de paiement', 'chapter 11'],
  },
  {
    key: 'closed_or_dead',
    priority: 115,
    terms: ['ceased operations', 'out of business', 'company closed', 'ferme definitivement', 'shutdown', 'dissolved'],
  },
  {
    key: 'signed_competitor',
    priority: 90,
    terms: ['selected vendor', 'signed with', 'deployed with', 'partnered with', 'retained by', 'award contract to'],
  },
  {
    key: 'active_rfp',
    priority: 85,
    terms: ['rfp', 'appel d offre', 'request for proposal', 'tender', 'procurement notice', 'invitation to bid'],
  },
  {
    key: 'recent_funding',
    priority: 80,
    terms: ['raised', 'series a', 'series b', 'funding round', 'venture backed', 'levee de fonds', 'seed round'],
  },
  {
    key: 'major_org_change',
    priority: 74,
    terms: ['reorganization', 'restructure', 'merger', 'acquisition', 'spin off', 'new strategic plan'],
  },
  {
    key: 'recent_role_change',
    priority: 68,
    terms: ['appointed', 'joins as', 'new cio', 'new cto', 'new head of it', 'nomme', 'prise de poste'],
  },
  {
    key: 'strong_growth',
    priority: 66,
    terms: ['hypergrowth', 'rapid growth', 'expanding team', 'hiring spree', 'scale up', 'croissance forte'],
  },
  {
    key: 'regulatory_need',
    priority: 64,
    terms: ['compliance', 'regulation', 'nis2', 'iso 27001', 'gdpr', 'soc 2', 'audit requirement'],
  },
  {
    key: 'decision_maker_involved',
    priority: 62,
    terms: ['cio said', 'cto said', 'board approved', 'executive sponsor', 'decision committee', 'steering committee'],
  },
  {
    key: 'clear_priority',
    priority: 60,
    terms: ['top priority', 'strategic priority', 'priority initiative', 'must deliver this quarter'],
  },
  {
    key: 'budget_available',
    priority: 58,
    terms: ['budget approved', 'funded project', 'allocated budget', 'spending plan approved'],
  },
  {
    key: 'offer_related_needs',
    priority: 56,
    terms: ['needs automation', 'needs outbound', 'needs lead qualification', 'needs conversion uplift'],
  },
  {
    key: 'matching_segment',
    priority: 52,
    terms: ['b2b saas', 'mid market', 'enterprise it', 'security operations'],
  },
  {
    key: 'compatible_activity',
    priority: 50,
    terms: ['sales development', 'outbound program', 'go to market optimization', 'pipeline acceleration'],
  },
  {
    key: 'profile_fit',
    priority: 48,
    terms: ['target account', 'ideal customer profile', 'icp fit', 'right profile'],
  },
  {
    key: 'out_of_scope',
    priority: 78,
    terms: ['out of scope', 'not target market', 'outside target segment', 'hors perimetre'],
  },
  {
    key: 'no_budget',
    priority: 84,
    terms: ['budget freeze', 'no budget', 'spending freeze', 'budget cuts'],
  },
  {
    key: 'not_concerned',
    priority: 70,
    terms: ['not interested', 'no current need', 'no urgency', 'pas concerne'],
  },
  {
    key: 'no_decision_power',
    priority: 74,
    terms: ['no decision maker', 'no buying authority', 'cannot approve budget', 'no procurement authority'],
  },
];

const SOURCE_RELIABILITY = {
  official_company_site: 1,
  trusted_news: 0.95,
  press_release: 0.9,
  social_linkedin: 0.8,
  job_board: 0.75,
  unknown: 0.7,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const stripDiacritics = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normalizeText = (value) => stripDiacritics(String(value || '').toLowerCase()).replace(/\s+/g, ' ').trim();

const safeUrlHost = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    return url.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

const normalizeWebsiteHost = (value) =>
  String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();

const normalizeSourceType = (value) => {
  const source = normalizeText(value).replace(/[^a-z0-9]+/g, '_');
  if (SOURCE_RELIABILITY[source]) return source;
  return '';
};

const inferSourceType = ({ lead, evidence, fallback }) => {
  const explicit = normalizeSourceType(fallback);
  if (explicit) return explicit;

  const host = safeUrlHost(evidence);
  if (!host) return 'unknown';

  const websiteHost = normalizeWebsiteHost(lead?.website_url);
  if (websiteHost && (host === websiteHost || host.endsWith(`.${websiteHost}`))) {
    return 'official_company_site';
  }
  if (host.includes('linkedin.com')) return 'social_linkedin';
  if (host.includes('prnewswire') || host.includes('businesswire') || host.includes('globenewswire')) return 'press_release';
  if (host.includes('greenhouse') || host.includes('lever.co') || host.includes('indeed') || host.includes('welcometothejungle')) {
    return 'job_board';
  }
  return 'trusted_news';
};

const parseDateOrNow = (value) => {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
};

const recencyBoost = (isoDate) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 0;
  const ageMs = Date.now() - date.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 30) return 8;
  if (ageDays <= 90) return 4;
  if (ageDays <= 365) return 0;
  return -6;
};

const buildFindingText = (finding) =>
  normalizeText(
    [
      finding?.title,
      finding?.summary,
      finding?.snippet,
      finding?.text,
      finding?.content,
      finding?.description,
      finding?.label,
      finding?.signal,
    ]
      .filter(Boolean)
      .join(' ')
  );

const scoreRulesAgainstText = (text) => {
  if (!text) return [];

  const candidates = [];
  for (const rule of SIGNAL_RULES) {
    const matchedTerms = rule.terms.filter((term) => text.includes(normalizeText(term)));
    if (matchedTerms.length === 0) continue;
    const score = rule.priority + matchedTerms.length * 10;
    candidates.push({
      key: rule.key,
      score,
      matchedTerms,
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
};

const computeConfidence = ({ explicitConfidence, matchedTermsCount, sourceType, foundAt }) => {
  const numeric = Number(explicitConfidence);
  if (Number.isFinite(numeric)) return clamp(Math.round(numeric), 0, 100);

  const reliability = SOURCE_RELIABILITY[sourceType] ?? SOURCE_RELIABILITY.unknown;
  const base = 55 + Math.min(matchedTermsCount * 10, 28);
  const boosted = Math.round(base * reliability + recencyBoost(foundAt));
  return clamp(boosted, 40, 97);
};

const buildEvidence = (finding) =>
  String(finding?.evidence || finding?.url || finding?.source_url || finding?.link || finding?.title || '').trim();

const dedupeSignals = (signals) => {
  const seen = new Set();
  const rows = [];

  for (const signal of signals) {
    const key = String(signal?.key || '').toLowerCase();
    const evidence = String(signal?.evidence || '').toLowerCase();
    const dedupeKey = `${key}|${evidence}`;
    if (!key || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    rows.push(signal);
  }

  return rows;
};

export const extractSignalFromFinding = ({ finding, lead }) => {
  if (!finding || typeof finding !== 'object') return null;

  const text = buildFindingText(finding);
  const candidates = scoreRulesAgainstText(text);
  if (candidates.length === 0) return null;

  const best = candidates[0];
  const evidence = buildEvidence(finding);
  const foundAt = parseDateOrNow(
    finding.found_at || finding.foundAt || finding.published_at || finding.publishedAt || finding.date || finding.captured_at
  );
  const sourceType = inferSourceType({
    lead,
    evidence,
    fallback: finding.source_type || finding.sourceType || finding.channel || finding.provider,
  });

  return {
    key: best.key,
    evidence,
    confidence: computeConfidence({
      explicitConfidence: finding.confidence,
      matchedTermsCount: best.matchedTerms.length,
      sourceType,
      foundAt,
    }),
    source_type: sourceType,
    found_at: foundAt,
    extraction: {
      method: 'keyword_rules_v1',
      matched_terms: best.matchedTerms,
      score: best.score,
    },
  };
};

export const extractSignalsFromFindings = ({ findings = [], lead }) => {
  if (!Array.isArray(findings) || findings.length === 0) return [];
  return dedupeSignals(
    findings
      .map((finding) => extractSignalFromFinding({ finding, lead }))
      .filter(Boolean)
  );
};

/**
 * Shared utilities for scoring and analysis services.
 * Centralises constants and helpers that were previously duplicated across
 * aiSignalService, analyzeService, internetSignalDiscoveryService, and dev route.
 */

export const ICP_CATEGORY = {
  EXCELLENT: 'Excellent',
  STRONG: 'Strong Fit',
  MEDIUM: 'Medium Fit',
  LOW: 'Low Fit',
  EXCLUDED: 'Excluded',
};

export const DEFAULT_CATEGORY_THRESHOLDS = { excellent: 80, strong: 50, medium: 20 };

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

export const resolveCategoryThresholds = (raw = {}, fallback = DEFAULT_CATEGORY_THRESHOLDS) => {
  const excellent = clamp(Math.round(toNumber(raw?.excellent, fallback.excellent)), 0, 100);
  const strong = clamp(Math.round(toNumber(raw?.strong, fallback.strong)), 0, excellent);
  const medium = clamp(Math.round(toNumber(raw?.medium, fallback.medium)), 0, strong);

  return { excellent, strong, medium };
};

/**
 * Bidirectional synonym map for industry and role matching.
 * All keys and values are pre-normalized (no diacritics, lowercase).
 * Used to bridge FR/EN equivalences and common abbreviations.
 */
const TERM_SYNONYMS = {
  // Industries
  'saas': ['software as a service', 'logiciel en tant que service'],
  'software as a service': ['saas'],
  'fintech': ['financial technology', 'technologie financiere'],
  'financial technology': ['fintech'],
  'edtech': ['education technology', 'technologie educative'],
  'healthtech': ['health technology', 'medtech', 'sante numerique'],
  'medtech': ['healthtech', 'medical technology', 'sante numerique'],
  'proptech': ['real estate technology', 'immobilier numerique'],
  'insurtech': ['insurance technology', 'assurtech'],
  'legaltech': ['legal technology', 'droit numerique'],
  'telecommunications': ['telecom', 'telecoms'],
  'telecom': ['telecommunications', 'telecoms'],
  'e-commerce': ['ecommerce', 'commerce electronique', 'commerce en ligne'],
  'ecommerce': ['e-commerce', 'commerce electronique'],
  'retail': ['commerce de detail', 'distribution'],
  'logistique': ['logistics', 'supply chain'],
  'logistics': ['logistique', 'supply chain'],
  'industrie': ['manufacturing', 'industrie manufacturiere'],
  'manufacturing': ['industrie', 'industrie manufacturiere'],
  'conseil': ['consulting', 'conseil en management'],
  'consulting': ['conseil', 'conseil en management'],
  'ressources humaines': ['human resources', 'hr', 'rh'],
  'human resources': ['ressources humaines', 'rh', 'hr'],

  // C-Suite roles
  'ceo': ['directeur general', 'dg', 'pdg', 'president directeur general', 'chief executive officer', 'dirigeant'],
  'directeur general': ['ceo', 'dg', 'pdg', 'chief executive officer'],
  'dg': ['ceo', 'directeur general', 'pdg'],
  'pdg': ['ceo', 'directeur general', 'dg'],
  'cto': ['directeur technique', 'chief technology officer', 'vp engineering', 'vp technique'],
  'directeur technique': ['cto', 'chief technology officer'],
  'cfo': ['directeur financier', 'daf', 'chief financial officer', 'vp finance'],
  'directeur financier': ['cfo', 'daf', 'chief financial officer'],
  'daf': ['cfo', 'directeur financier', 'chief financial officer'],
  'cmo': ['directeur marketing', 'chief marketing officer', 'vp marketing'],
  'directeur marketing': ['cmo', 'chief marketing officer'],
  'coo': ['directeur des operations', 'chief operating officer', 'vp operations'],
  'directeur des operations': ['coo', 'chief operating officer'],
  'chro': ['drh', 'directeur des ressources humaines', 'hr director', 'chief human resources officer'],
  'drh': ['chro', 'directeur des ressources humaines', 'hr director'],
  'directeur des ressources humaines': ['drh', 'chro', 'hr director'],
  'hr director': ['drh', 'chro', 'directeur des ressources humaines'],
  'cso': ['directeur commercial', 'chief sales officer'],
  'ciso': ['rssi', 'directeur securite informatique', 'chief information security officer'],
  'rssi': ['ciso', 'directeur securite informatique'],

  // IT / Digital roles
  'dsi': ['it director', 'cio', 'directeur informatique', 'directeur des systemes d information', 'directeur si'],
  'it director': ['dsi', 'cio', 'directeur informatique'],
  'cio': ['dsi', 'it director', 'directeur informatique', 'directeur des systemes d information'],
  'directeur informatique': ['dsi', 'cio', 'it director'],
  'directeur des systemes d information': ['dsi', 'cio'],
  'directeur si': ['dsi', 'cio'],
  'cdto': ['directeur digital', 'directeur de la transformation numerique', 'chief digital transformation officer'],
  'directeur digital': ['cdto', 'chief digital officer', 'cdo'],
  'cdo': ['directeur digital', 'chief digital officer', 'cdto'],

  // Sales roles
  'vp sales': ['directeur commercial', 'vp commercial', 'head of sales', 'responsable commercial', 'directeur des ventes'],
  'directeur commercial': ['vp sales', 'head of sales', 'vp commercial', 'directeur des ventes'],
  'directeur des ventes': ['vp sales', 'directeur commercial', 'head of sales'],
  'head of sales': ['vp sales', 'directeur commercial', 'directeur des ventes'],
  'vp commercial': ['vp sales', 'directeur commercial'],

  // Marketing roles
  'vp marketing': ['directeur marketing', 'head of marketing', 'responsable marketing'],
  'head of marketing': ['vp marketing', 'directeur marketing'],
  'responsable marketing': ['vp marketing', 'head of marketing'],

  // Other common titles
  'founder': ['fondateur', 'co-founder', 'cofondateur', 'co-fondateur'],
  'fondateur': ['founder', 'cofondateur'],
  'co-founder': ['founder', 'fondateur', 'cofondateur'],
  'cofondateur': ['co-founder', 'fondateur', 'founder'],
  'partner': ['associe', 'partenaire'],
  'associe': ['partner'],
  'president': ['pdg', 'ceo', 'president directeur general'],
};

/**
 * Returns the input list expanded with all known synonyms for each entry.
 * Used so that ICP config written in French matches English lead data and vice-versa.
 * The expansion is performed on normalized text (no diacritics, lowercase).
 */
export const expandWithSynonyms = (list = []) => {
  const expanded = new Set();
  for (const entry of list) {
    const key = normalizeText(entry);
    if (!key) continue;
    expanded.add(key);
    for (const syn of TERM_SYNONYMS[key] || []) {
      expanded.add(syn);
    }
  }
  return [...expanded];
};

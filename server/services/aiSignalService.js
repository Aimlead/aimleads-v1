import { ICP_CATEGORY, DEFAULT_CATEGORY_THRESHOLDS, clamp, normalizeText, resolveCategoryThresholds } from '../lib/serviceUtils.js';

const DEFAULT_BLEND_WEIGHTS = { icp: 0.6, ai: 0.4 };
const BASELINE_AI_SCORE = 12;
const MAX_AI_BOOST = 30;
const MIN_AI_BOOST = -35;

const HARD_STOP_NEGATIVE_KEYS = new Set(['liquidation_or_bankruptcy', 'closed_or_dead']);
const PRIORITY_BLOCK_KEYS = new Set([
  'no_budget',
  'not_concerned',
  'out_of_scope',
  'no_decision_power',
  'changed_business',
  'retired',
  'liquidation_or_bankruptcy',
  'signed_competitor',
  'closed_or_dead',
]);
const URGENT_POSITIVE_KEYS = new Set([
  'active_rfp',
  'budget_available',
  'clear_priority',
  'decision_maker_involved',
  'recent_funding',
  'major_org_change',
  'recent_role_change',
]);

const INTERNET_SOURCE_RELIABILITY = {
  official_company_site: 1,
  trusted_news: 0.95,
  press_release: 0.9,
  social_linkedin: 0.8,
  job_board: 0.75,
  unknown: 0.7,
};

const PRE_CALL_SIGNAL_POINTS = {
  profile_fit: 8,
  compatible_activity: 8,
  matching_segment: 8,
  offer_related_needs: 10,
  recent_funding: 12,
  major_org_change: 10,
  recent_timing_event: 9,
  strong_growth: 11,
  regulatory_need: 12,
  active_rfp: 14,
  recent_role_change: 8,
};

const POST_CONTACT_SIGNAL_POINTS = {
  already_equipped: -8,
  budget_available: 16,
  clear_priority: 14,
  good_timing: 11,
  decision_maker_involved: 15,
  actively_responding: 13,
  good_relationship: 9,
};

const NEGATIVE_SIGNAL_POINTS = {
  no_budget: -22,
  not_concerned: -18,
  out_of_scope: -20,
  no_decision_power: -19,
  changed_business: -15,
  retired: -12,
  liquidation_or_bankruptcy: -30,
  signed_competitor: -20,
  closed_or_dead: -35,
};

const SIGNAL_LABELS = {
  profile_fit: 'Profil correspondant a la cible',
  compatible_activity: "Activite compatible avec l'offre",
  matching_segment: 'Segment correspondant',
  offer_related_needs: "Besoins lies a l'offre",
  recent_funding: 'Levee de fond recente',
  major_org_change: 'Changements organisationnels importants',
  recent_timing_event: 'Evenement recent opportun',
  strong_growth: 'Forte croissance',
  regulatory_need: 'Contrainte reglementaire pertinente',
  active_rfp: "Appel d'offre en cours",
  recent_role_change: 'Prise de poste recente',
  already_equipped: 'Deja equipe',
  budget_available: 'Budget disponible',
  clear_priority: 'Priorite claire',
  good_timing: 'Bon timing',
  decision_maker_involved: 'Decideur implique',
  actively_responding: 'Repond activement',
  good_relationship: 'Bon relationnel',
  no_budget: 'Aucun budget',
  not_concerned: 'Pas concerne',
  out_of_scope: 'Hors perimetre',
  no_decision_power: 'Sans pouvoir decisionnel',
  changed_business: 'A change metier',
  retired: 'A la retraite',
  liquidation_or_bankruptcy: 'Liquidation / redressement',
  signed_competitor: 'Engage avec un concurrent',
  closed_or_dead: 'Entreprise fermee / inactive',
};

const SIGNAL_KEY_ALIASES = {
  profil_correspondant_a_la_cible: 'profile_fit',
  activite_contexte_de_l_entreprise_compatible_avec_l_offre: 'compatible_activity',
  segment_correspondant: 'matching_segment',
  il_a_des_besoins_lies_a_mon_offre: 'offer_related_needs',
  levee_de_fond_recente: 'recent_funding',
  changements_organisationnels_importants: 'major_org_change',
  un_evenement_recent_suggere_que_le_moment_est_opportun: 'recent_timing_event',
  forte_croissance: 'strong_growth',
  entreprise_soumise_a_une_reglementation_norme_a_laquelle_repond_notre_produit: 'regulatory_need',
  appel_d_offre_en_cours: 'active_rfp',
  prise_de_poste_recente: 'recent_role_change',
  deja_equipe: 'already_equipped',
  budget_disponible: 'budget_available',
  priorite_claire: 'clear_priority',
  bon_timing: 'good_timing',
  decideur_implique: 'decision_maker_involved',
  repond_activement: 'actively_responding',
  bon_relationnel: 'good_relationship',
  aucun_budget: 'no_budget',
  pas_concerne: 'not_concerned',
  hors_perimetre: 'out_of_scope',
  entreprise_sans_pouvoir_decisionnel: 'no_decision_power',
  a_change_metier: 'changed_business',
  a_la_retraite: 'retired',
  l_entreprise_a_ferme_liquidation_redressement: 'liquidation_or_bankruptcy',
  vient_de_s_engager_avec_un_concurrent: 'signed_competitor',
  mort: 'closed_or_dead',
};

const stripDiacritics = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normalizeSignalKey = (value) =>
  normalizeText(stripDiacritics(value)).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const resolveSignalKey = (value) => {
  const normalized = normalizeSignalKey(value);
  return SIGNAL_KEY_ALIASES[normalized] || normalized;
};

const unique = (values = []) => [...new Set(values)];

const normalizeWeight = (value, fallback) => {
  if (!Number.isFinite(value)) return fallback;
  if (value > 1) return clamp(value / 100, 0, 1);
  return clamp(value, 0, 1);
};

const resolveBlendWeights = (weights = {}) => {
  const icpRaw = normalizeWeight(weights.icp, DEFAULT_BLEND_WEIGHTS.icp);
  const aiRaw = normalizeWeight(weights.ai, DEFAULT_BLEND_WEIGHTS.ai);
  const total = icpRaw + aiRaw;

  if (total <= 0) {
    return { ...DEFAULT_BLEND_WEIGHTS };
  }

  return {
    icp: icpRaw / total,
    ai: aiRaw / total,
  };
};

const pushSignal = (signals, { source = 'ai', type, points, label, evidence, key }) => {
  signals.push({ source, type, points, label, evidence, key });
};

const getCategoryFromScore = (score, thresholds = DEFAULT_CATEGORY_THRESHOLDS) => {
  // EXCLUDED is derived from hasIcpExclusion (hard ICP rule), not from score=0.
  // score=0 without exclusion means insufficient data or all-negative signals → Low Fit.
  if (score >= thresholds.excellent) return ICP_CATEGORY.EXCELLENT;
  if (score >= thresholds.strong) return ICP_CATEGORY.STRONG;
  if (score >= thresholds.medium) return ICP_CATEGORY.MEDIUM;
  return ICP_CATEGORY.LOW;
};

const getPriorityFromCategory = (category) => {
  const map = {
    [ICP_CATEGORY.EXCELLENT]: 1,
    [ICP_CATEGORY.STRONG]: 2,
    [ICP_CATEGORY.MEDIUM]: 3,
    [ICP_CATEGORY.LOW]: 4,
    [ICP_CATEGORY.EXCLUDED]: 5,
  };

  return map[category] || 4;
};

const getActionFromCategory = (category) => {
  const map = {
    [ICP_CATEGORY.EXCELLENT]: 'Reach out now',
    [ICP_CATEGORY.STRONG]: 'Contact within 48h',
    [ICP_CATEGORY.MEDIUM]: 'Nurture sequence',
    [ICP_CATEGORY.LOW]: 'Reject lead',
    [ICP_CATEGORY.EXCLUDED]: 'Block lead',
  };

  return map[category] || 'Reject lead';
};

const getStatusFromCategory = (category) => {
  if (category === ICP_CATEGORY.LOW || category === ICP_CATEGORY.EXCLUDED) {
    return 'Rejected';
  }

  return 'Qualified';
};

const getCompletenessConfidence = (lead) => {
  const requiredFields = ['industry', 'contact_role', 'client_type', 'company_size', 'country', 'website_url', 'contact_name'];
  const filled = requiredFields.filter((field) => {
    const value = lead?.[field];
    if (typeof value === 'number') return Number.isFinite(value);
    return String(value || '').trim().length > 0;
  }).length;

  return clamp(Math.round((filled / requiredFields.length) * 100), 0, 100);
};

const toSignalArray = (value) => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? resolveSignalKey(item) : resolveSignalKey(item?.key || item?.signal || item?.label)))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => resolveSignalKey(item))
      .filter(Boolean);
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => resolveSignalKey(key))
      .filter(Boolean);
  }

  return [];
};

const getIntentSignals = (lead) => {
  const payload = lead?.intent_signals || lead?.intentSignals || lead?.ai_intent_signals || {};

  const preCall = unique(toSignalArray(payload.pre_call || payload.preCall || payload.pre || payload.precall));
  const postContact = unique(toSignalArray(payload.post_contact || payload.postContact || payload.post));
  const negative = unique(toSignalArray(payload.negative || payload.negatives || payload.negative_signals));

  return {
    preCall,
    postContact,
    negative,
    total: preCall.length + postContact.length + negative.length,
  };
};

const labelForSignal = (key) => SIGNAL_LABELS[key] || String(key || '').replace(/_/g, ' ');

const resolvePointsForSignal = (key, fallbackType = 'positive') => {
  if (Object.prototype.hasOwnProperty.call(NEGATIVE_SIGNAL_POINTS, key)) return NEGATIVE_SIGNAL_POINTS[key];
  if (Object.prototype.hasOwnProperty.call(POST_CONTACT_SIGNAL_POINTS, key)) return POST_CONTACT_SIGNAL_POINTS[key];
  if (Object.prototype.hasOwnProperty.call(PRE_CALL_SIGNAL_POINTS, key)) return PRE_CALL_SIGNAL_POINTS[key];
  return fallbackType === 'negative' ? -10 : 8;
};

const scoreIntentGroup = ({ keys = [], map = {}, fallback = 8, source, evidence, signals, forceNegative = false }) => {
  let delta = 0;
  const scoredKeys = [];

  for (const rawKey of keys) {
    const key = resolveSignalKey(rawKey);
    if (!key) continue;

    const points = map[key] ?? (forceNegative ? -Math.abs(fallback) : fallback);
    delta += points;
    scoredKeys.push({ key, points, source, evidence });

    pushSignal(signals, {
      key,
      source,
      type: points >= 0 ? 'positive' : 'negative',
      points,
      label: labelForSignal(key),
      evidence,
    });
  }

  return { delta, scoredKeys };
};

const normalizeConfidence = (value, fallback = 0.7) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num > 1) return clamp(num / 100, 0, 1);
  return clamp(num, 0, 1);
};

const normalizeDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getRecencyFactor = (dateValue) => {
  const date = normalizeDate(dateValue);
  if (!date) return 0.7;

  const now = Date.now();
  const ageMs = now - date.getTime();
  if (ageMs < 0) return 1;

  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 14) return 1;
  if (ageDays <= 30) return 0.9;
  if (ageDays <= 90) return 0.75;
  if (ageDays <= 180) return 0.55;
  return 0.35;
};

const inferSourceTypeFromEvidence = (evidence) => {
  const text = normalizeText(evidence);
  if (!text) return 'unknown';
  if (text.includes('linkedin.com')) return 'social_linkedin';
  if (text.includes('job') || text.includes('indeed') || text.includes('welcome to the jungle')) return 'job_board';
  if (text.includes('press') || text.includes('communique')) return 'press_release';
  if (text.includes('news')) return 'trusted_news';
  return 'unknown';
};

const parseInternetSignalItem = (item, typeHint = null) => {
  if (typeof item === 'string') {
    const key = resolveSignalKey(item);
    return key ? { key, type: typeHint || null } : null;
  }

  if (!item || typeof item !== 'object') return null;

  const key = resolveSignalKey(item.key || item.signal || item.code || item.id || item.name || item.label);
  if (!key) return null;

  const rawType = normalizeText(item.type || item.polarity || typeHint || '');
  const type = rawType.includes('neg') ? 'negative' : rawType.includes('pos') ? 'positive' : null;
  const points = Number.isFinite(Number(item.points)) ? Number(item.points) : null;
  const confidence = normalizeConfidence(item.confidence, item.url || item.evidence ? 0.82 : 0.65);
  const evidence = item.evidence || item.url || item.source_url || item.source || item.title || null;
  const sourceType = normalizeText(item.source_type || item.sourceType || item.channel || inferSourceTypeFromEvidence(evidence));
  const foundAt =
    item.found_at ||
    item.foundAt ||
    item.published_at ||
    item.publishedAt ||
    item.date ||
    item.captured_at ||
    item.capturedAt ||
    null;
  const label = item.label || item.title || labelForSignal(key);

  return { key, type, points, confidence, evidence, sourceType, foundAt, label };
};

const getInternetSignalEntries = (lead) => {
  const payload =
    lead?.internet_signals ||
    lead?.internetSignals ||
    lead?.ai_internet_signals ||
    lead?.web_signals ||
    lead?.enrichment_signals ||
    lead?.intent_signals?.internet ||
    null;

  if (!payload) return [];

  const entries = [];
  const appendMany = (items, typeHint = null) => {
    for (const item of items || []) {
      const parsed = parseInternetSignalItem(item, typeHint);
      if (parsed) entries.push(parsed);
    }
  };

  if (Array.isArray(payload)) {
    appendMany(payload);
    return entries;
  }

  if (typeof payload !== 'object') return [];

  if (Array.isArray(payload.signals)) appendMany(payload.signals);
  if (Array.isArray(payload.entries)) appendMany(payload.entries);
  if (Array.isArray(payload.items)) appendMany(payload.items);
  if (Array.isArray(payload.positive)) appendMany(payload.positive, 'positive');
  if (Array.isArray(payload.negative)) appendMany(payload.negative, 'negative');

  const hasExplicitArrays =
    Array.isArray(payload.signals) ||
    Array.isArray(payload.entries) ||
    Array.isArray(payload.items) ||
    Array.isArray(payload.positive) ||
    Array.isArray(payload.negative);

  if (!hasExplicitArrays) {
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'boolean' && value) {
        const parsed = parseInternetSignalItem({ key });
        if (parsed) entries.push(parsed);
      } else if (Number.isFinite(Number(value))) {
        const parsed = parseInternetSignalItem({ key, points: Number(value) });
        if (parsed) entries.push(parsed);
      }
    }
  }

  return entries;
};

const scoreInternetSignals = (entries, signals) => {
  let delta = 0;
  let hardStopCount = 0;
  let verifiedEvidenceCount = 0;
  let freshEvidenceCount = 0;
  const scoredKeys = [];

  for (const entry of entries) {
    const basePoints = Number.isFinite(entry.points) ? entry.points : resolvePointsForSignal(entry.key, entry.type || 'positive');
    const reliability = INTERNET_SOURCE_RELIABILITY[entry.sourceType] ?? INTERNET_SOURCE_RELIABILITY.unknown;
    const confidence = normalizeConfidence(entry.confidence, entry.evidence ? 0.82 : 0.65);
    const recency = getRecencyFactor(entry.foundAt);

    let appliedPoints = Math.round(basePoints * reliability * confidence * recency);

    if (appliedPoints === 0 && basePoints !== 0) {
      appliedPoints = basePoints > 0 ? 1 : -1;
    }

    appliedPoints = clamp(appliedPoints, -25, 20);
    delta += appliedPoints;

    if (HARD_STOP_NEGATIVE_KEYS.has(entry.key) && appliedPoints < 0) {
      hardStopCount += 1;
    }

    if (entry.evidence) {
      verifiedEvidenceCount += 1;
    }

    if (recency >= 0.9) {
      freshEvidenceCount += 1;
    }

    scoredKeys.push({
      key: entry.key,
      points: appliedPoints,
      source: 'internet',
      evidence: entry.evidence,
      foundAt: entry.foundAt,
      sourceType: entry.sourceType,
    });

    pushSignal(signals, {
      key: entry.key,
      source: 'internet',
      type: appliedPoints >= 0 ? 'positive' : 'negative',
      points: appliedPoints,
      label: entry.label || labelForSignal(entry.key),
      evidence: entry.evidence || `signal:${entry.key}`,
    });
  }

  return {
    delta,
    count: entries.length,
    hardStopCount,
    verifiedEvidenceCount,
    freshEvidenceCount,
    scoredKeys,
  };
};

const choosePrioritizationAction = ({
  finalScore,
  hasHardStopNegative,
  hasPriorityBlockSignal,
  hasUrgentPositiveSignal,
  freshEvidenceCount,
}) => {
  if (hasHardStopNegative) return 'Reject lead now';
  if (hasPriorityBlockSignal && finalScore < 35) return 'Reject lead';
  if (hasPriorityBlockSignal) return 'Nurture sequence';
  if (hasUrgentPositiveSignal && finalScore >= 40) return 'Contact in 24h';
  if (freshEvidenceCount > 0 && finalScore >= 55) return 'Contact within 48h';
  if (finalScore >= 70) return 'Contact within 48h';
  if (finalScore >= 50) return 'Contact within 5 days';
  if (finalScore >= 25) return 'Nurture sequence';
  return 'Reject lead';
};

const getStatusFromAction = (action, category) => {
  const normalized = normalizeText(action);
  if (normalized.includes('reject') || normalized.includes('block') || category === ICP_CATEGORY.EXCLUDED) {
    return 'Rejected';
  }
  return 'Qualified';
};

export function scoreAiSignals({ lead, icpScore = 0, scoreDetails = {}, blendWeights = DEFAULT_BLEND_WEIGHTS, categoryThresholds = DEFAULT_CATEGORY_THRESHOLDS }) {
  const signals = [];

  const intent = getIntentSignals(lead);

  const manualPre = scoreIntentGroup({
    keys: intent.preCall,
    map: PRE_CALL_SIGNAL_POINTS,
    fallback: 8,
    source: 'intent-manual',
    evidence: 'pre_call',
    signals,
  });

  const manualPost = scoreIntentGroup({
    keys: intent.postContact,
    map: POST_CONTACT_SIGNAL_POINTS,
    fallback: 10,
    source: 'intent-manual',
    evidence: 'post_contact',
    signals,
  });

  const manualNeg = scoreIntentGroup({
    keys: intent.negative,
    map: NEGATIVE_SIGNAL_POINTS,
    fallback: -16,
    forceNegative: true,
    source: 'intent-manual',
    evidence: 'negative',
    signals,
  });

  const manualIntentDelta = manualPre.delta + manualPost.delta + manualNeg.delta;
  const manualScoredKeys = [...manualPre.scoredKeys, ...manualPost.scoredKeys, ...manualNeg.scoredKeys];

  const internetEntries = getInternetSignalEntries(lead);
  const internet = scoreInternetSignals(internetEntries, signals);

  const manualIntentCount = intent.total;
  const totalIntentSignals = manualIntentCount + internet.count;

  let aiScore = BASELINE_AI_SCORE + manualIntentDelta + internet.delta;

  if (totalIntentSignals === 0) {
    aiScore = BASELINE_AI_SCORE;
    pushSignal(signals, {
      source: 'intent',
      type: 'neutral',
      points: 0,
      label: 'No verified intent signals yet (internet/manual)',
      evidence: 'pending-enrichment',
    });
  }

  if (totalIntentSignals > 0 && internet.count === 0) {
    pushSignal(signals, {
      source: 'internet',
      type: 'neutral',
      points: 0,
      label: 'No internet evidence linked yet',
      evidence: 'add-web-signals',
    });
  }

  if (internet.hardStopCount > 0) {
    aiScore = Math.min(aiScore, 8);
  }

  aiScore = clamp(Math.round(aiScore), 0, 100);

  const completenessConfidence = getCompletenessConfidence(lead);
  const aiConfidence =
    totalIntentSignals === 0
      ? clamp(Math.round(18 + completenessConfidence * 0.22), 15, 45)
      : clamp(
          Math.round(
            35 +
              completenessConfidence * 0.12 +
              manualIntentCount * 4 +
              internet.count * 7 +
              internet.verifiedEvidenceCount * 6 +
              internet.freshEvidenceCount * 3
          ),
          35,
          97
        );

  const resolvedBlend = resolveBlendWeights(blendWeights);
  const resolvedThresholds = resolveCategoryThresholds(categoryThresholds);
  const hasIcpExclusion = scoreDetails.roles?.match === 'exclu' || scoreDetails.industrie?.match === 'exclu';

  if (hasIcpExclusion) {
    pushSignal(signals, {
      source: 'icp',
      type: 'negative',
      points: 0,
      label: 'Lead excluded by ICP hard rule',
      evidence: 'icp-hard-rule',
    });
  }

  const allScoredKeys = [...manualScoredKeys, ...internet.scoredKeys];
  const positiveSignalKeys = new Set(allScoredKeys.filter((signal) => signal.points > 0).map((signal) => signal.key));
  const negativeSignalKeys = new Set(allScoredKeys.filter((signal) => signal.points < 0).map((signal) => signal.key));

  const hasUrgentPositiveSignal = [...positiveSignalKeys].some((key) => URGENT_POSITIVE_KEYS.has(key));
  const hasPriorityBlockSignal = [...negativeSignalKeys].some((key) => PRIORITY_BLOCK_KEYS.has(key));
  const hasHardStopNegative = internet.hardStopCount > 0;

  const aiInfluenceScale = clamp(resolvedBlend.ai / DEFAULT_BLEND_WEIGHTS.ai, 0.35, 1.8);
  let aiBoost = clamp(Math.round((aiScore - BASELINE_AI_SCORE) * 0.5 * aiInfluenceScale), MIN_AI_BOOST, MAX_AI_BOOST);

  if (totalIntentSignals === 0) {
    aiBoost = 0;
  }

  if (hasUrgentPositiveSignal && aiBoost > 0) {
    aiBoost = Math.max(aiBoost, 8);
  }

  if (hasHardStopNegative) {
    aiBoost = Math.min(aiBoost, -35);
  } else if (hasPriorityBlockSignal) {
    aiBoost = Math.min(aiBoost, -22);
  }

  let finalScore = hasIcpExclusion ? 0 : clamp(Math.round(icpScore + aiBoost), 0, 100);

  if (!hasIcpExclusion && hasHardStopNegative) {
    finalScore = Math.min(finalScore, 10);
  } else if (!hasIcpExclusion && hasPriorityBlockSignal) {
    finalScore = Math.min(finalScore, 49);
  }

  // Hard ICP exclusion always yields EXCLUDED regardless of score.
  // Score-based category never returns EXCLUDED — that distinction is explicit here.
  const finalCategory = hasIcpExclusion
    ? ICP_CATEGORY.EXCLUDED
    : getCategoryFromScore(finalScore, resolvedThresholds);
  const finalPriority = getPriorityFromCategory(finalCategory);

  const finalRecommendedAction = hasIcpExclusion
    ? 'Block lead'
    : choosePrioritizationAction({
        finalScore,
        hasHardStopNegative,
        hasPriorityBlockSignal,
        hasUrgentPositiveSignal,
        freshEvidenceCount: internet.freshEvidenceCount,
      });

  const finalStatus = getStatusFromAction(finalRecommendedAction, finalCategory);

  const blendPercent = {
    icp: Math.round(resolvedBlend.icp * 100),
    ai: Math.round(resolvedBlend.ai * 100),
  };

  const intentComment =
    totalIntentSignals === 0
      ? 'No verified buying signals yet; this AI score is preliminary.'
      : `Intent signals used: ${totalIntentSignals} (manual ${manualIntentCount}, internet ${internet.count}, with evidence ${internet.verifiedEvidenceCount}).`;

  const aiSummary =
    `AI signal score: ${aiScore}/100 (confidence: ${aiConfidence}%). ` +
    `${intentComment} ` +
    `AI boost on ICP: ${aiBoost >= 0 ? '+' : ''}${aiBoost}. ` +
    `Final prioritization score: ${finalScore}/100 (ICP base + AI reinforcement).`;

  return {
    aiScore,
    aiConfidence,
    aiSignals: signals,
    aiSummary,
    aiBoost,
    blendWeights: blendPercent,
    categoryThresholds: resolvedThresholds,
    finalScore,
    finalCategory,
    finalPriority,
    finalRecommendedAction,
    finalStatus,
    prioritization: {
      hasUrgentPositiveSignal,
      hasPriorityBlockSignal,
      internetEvidenceCount: internet.verifiedEvidenceCount,
      internetFreshEvidenceCount: internet.freshEvidenceCount,
    },
  };
}

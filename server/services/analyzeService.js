import { scoreAiSignals } from './aiSignalService.js';
import { enrichWithLlm } from './llmService.js';
import { discoverInternetSignals } from './internetSignalDiscoveryService.js';
import { ICP_CATEGORY, DEFAULT_CATEGORY_THRESHOLDS, clamp, normalizeText, resolveCategoryThresholds } from '../lib/serviceUtils.js';

const LEAD_STATUS = {
  QUALIFIED: 'Qualified',
  REJECTED: 'Rejected',
};

const DEFAULT_SCORE_WEIGHTS = {
  industrie: { parfait: 30, partiel: 15, aucun: -30, exclu: -100 },
  roles: { parfait: 25, partiel: 10, exclu: -100, aucun: -25 },
  typeClient: { parfait: 25, partiel: 10, aucun: -40 },
  structure: { parfait: 15, partiel: 10, aucun: -20 },
  geo: { parfait: 15, partiel: 5, aucun: -10 },
};

const SCORE_LIMITS = {
  maxRaw: 110,
  minRaw: -100,
};

const listIncludesExact = (list = [], value = '') => {
  const needle = normalizeText(value);
  if (!needle) return false;
  return list.some((entry) => normalizeText(entry) === needle);
};

const listIncludesPartial = (list = [], value = '') => {
  const needle = normalizeText(value);
  if (!needle) return false;
  return list.some((entry) => {
    const e = normalizeText(entry);
    if (!e) return false;
    // Require whole-word / whole-phrase match to prevent false positives.
    // Example: 'CTO' must NOT match inside 'director' ('dire**cto**r').
    const escaped = e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(needle);
  });
};

const resolveScoringMeta = (icpProfile) => {
  const meta = icpProfile?.weights?.meta || {};

  return {
    blendWeights: meta.finalScoreWeights || { icp: 60, ai: 40 },
    icpThresholds: resolveCategoryThresholds(meta.icpThresholds || meta.thresholds?.icp),
    finalThresholds: resolveCategoryThresholds(meta.finalThresholds || meta.thresholds?.final),
  };
};

/**
 * Resolve section scores merging ICP custom weights with defaults.
 * Supports both { parfait, partiel, aucun, exclu } format and
 * numeric weight override (e.g. { weight: 40 } meaning 40% importance).
 */
const getSectionScores = (icpProfile, sectionName) => {
  const custom = icpProfile.weights?.[sectionName]?.scores || {};
  const base = DEFAULT_SCORE_WEIGHTS[sectionName];

  // Support custom section-level weight multiplier (0-100, default 100%)
  const weightMultiplier = Number(icpProfile.weights?.[sectionName]?.weight);
  const multiplier = Number.isFinite(weightMultiplier) && weightMultiplier > 0
    ? clamp(weightMultiplier / 100, 0.1, 3.0)
    : 1;

  return {
    parfait: Math.round((custom.parfait ?? base.parfait) * multiplier),
    partiel: Math.round((custom.partiel ?? base.partiel) * multiplier),
    aucun: Math.round((custom.aucun ?? base.aucun) * multiplier),
    exclu: custom.exclu ?? base.exclu, // exclusion is binary, don't multiply
  };
};

function normalizeScore(rawScore) {
  if (rawScore <= SCORE_LIMITS.minRaw) {
    return 0;
  }

  if (rawScore >= 0) {
    return Math.max(0, Math.min(100, Math.round((rawScore / SCORE_LIMITS.maxRaw) * 100)));
  }

  return Math.max(0, Math.min(100, Math.round(20 + rawScore / 5)));
}

function getCategory(score, thresholds = DEFAULT_CATEGORY_THRESHOLDS) {
  // EXCLUDED is only set via earlyExit (hard ICP rule); score=0 here means
  // insufficient data or all-negative criteria → Low Fit, not Excluded.
  if (score >= thresholds.excellent) return ICP_CATEGORY.EXCELLENT;
  if (score >= thresholds.strong) return ICP_CATEGORY.STRONG;
  if (score >= thresholds.medium) return ICP_CATEGORY.MEDIUM;
  return ICP_CATEGORY.LOW;
}

function getStatus(category) {
  if (category === ICP_CATEGORY.LOW || category === ICP_CATEGORY.EXCLUDED) {
    return LEAD_STATUS.REJECTED;
  }

  return LEAD_STATUS.QUALIFIED;
}

function getPriority(category) {
  const priorities = {
    [ICP_CATEGORY.EXCELLENT]: 1,
    [ICP_CATEGORY.STRONG]: 2,
    [ICP_CATEGORY.MEDIUM]: 3,
    [ICP_CATEGORY.LOW]: 4,
    [ICP_CATEGORY.EXCLUDED]: 5,
  };

  return priorities[category] || 4;
}

function getRecommendedAction(category) {
  const actions = {
    [ICP_CATEGORY.EXCELLENT]: 'Reach out now',
    [ICP_CATEGORY.STRONG]: 'Contact within 48h',
    [ICP_CATEGORY.MEDIUM]: 'Nurture sequence',
    [ICP_CATEGORY.LOW]: 'Reject lead',
    [ICP_CATEGORY.EXCLUDED]: 'Block lead',
  };

  return actions[category] || 'Reject lead';
}

function buildIcpSignals({ lead, icpProfile, score, details }) {
  const signals = [];

  if (listIncludesExact(icpProfile.weights?.industrie?.primaires, lead.industry)) {
    signals.push({ source: 'icp', label: `Strong industry fit: ${lead.industry}`, type: 'positive', points: 0 });
  }

  if (details.industrie?.match === 'exclu') {
    signals.push({ source: 'icp', label: 'Industry excluded by ICP', type: 'negative', points: 0 });
  }

  if (details.roles?.match === 'exclu') {
    signals.push({ source: 'icp', label: 'Role excluded by ICP', type: 'negative', points: 0 });
  }

  if (score < 20) {
    signals.push({ source: 'icp', label: 'Low ICP score', type: 'negative', points: 0 });
  }

  return signals;
}

function buildFallbackIcebreakers(lead) {
  return {
    email:
      `Hello ${lead.contact_name || 'there'},\n\n` +
      `I noticed ${lead.company_name || 'your company'} appears to be scaling quickly. We support similar teams with outbound execution and conversion performance.\n\n` +
      'Would a 15-minute chat this week make sense?',
    linkedin:
      `Hi ${lead.contact_name || ''}, impressed by the trajectory at ${lead.company_name || 'your company'}. ` +
      'Open to a quick exchange around outbound optimization?',
    call:
      `Hi ${lead.contact_name || 'there'}, I am calling regarding ${lead.company_name || 'your team'}. ` +
      'Do you have a few minutes to discuss lead qualification and reply rates?',
  };
}

function buildAnalysisSummary({
  companyName,
  icpProfileName,
  rawScore,
  normalizedScore,
  category,
  priority,
  recommendedAction,
  aiScore,
  aiConfidence,
  aiBoost,
  finalScore,
  finalCategory,
  finalRecommendedAction,
  llmReasoning,
}) {
  const base =
    `ICP Analysis: ${companyName}\n\n` +
    `ICP profile used: ${icpProfileName}\n` +
    `Raw ICP score: ${rawScore}\n` +
    `ICP normalized score: ${normalizedScore}/100\n` +
    `ICP category: ${category}\n` +
    `ICP priority: P${priority}\n` +
    `ICP recommended action: ${recommendedAction}\n\n` +
    `Signal score: ${aiScore}/100\n` +
    `Signal confidence: ${aiConfidence}%\n` +
    `Signal adjustment on ICP: ${aiBoost >= 0 ? '+' : ''}${aiBoost}\n` +
    `Final prioritization score: ${finalScore}/100 (ICP base + signal adjustment)\n` +
    `Final category suggestion: ${finalCategory}\n` +
    `Final recommended action: ${finalRecommendedAction}`;

  if (llmReasoning) {
    return `${base}\n\nAI Analysis:\n${llmReasoning}`;
  }

  return base;
}

function scoreLeadDeterministic({ lead, icpProfile }) {
  let rawScore = 0;
  const details = {};

  if (icpProfile.weights?.industrie) {
    const { primaires = [], secondaires = [], exclusions = [] } = icpProfile.weights.industrie;
    const scores = getSectionScores(icpProfile, 'industrie');
    const hasPrimaryOrSecondary = primaires.length > 0 || secondaires.length > 0;

    if (listIncludesExact(exclusions, lead.industry)) {
      return { rawScore: scores.exclu, details: { industrie: { match: 'exclu', points: scores.exclu } }, earlyExit: true };
    }

    if (!hasPrimaryOrSecondary) {
      if (lead.industry) {
        rawScore += scores.parfait;
        details.industrie = { match: 'parfait', points: scores.parfait, mode: 'all_except_excluded' };
      }
    } else if (listIncludesExact(primaires, lead.industry)) {
      rawScore += scores.parfait;
      details.industrie = { match: 'parfait', points: scores.parfait };
    } else if (listIncludesExact(secondaires, lead.industry)) {
      rawScore += scores.partiel;
      details.industrie = { match: 'partiel', points: scores.partiel };
    } else if (lead.industry) {
      rawScore += scores.aucun;
      details.industrie = { match: 'aucun', points: scores.aucun };
    }
  }

  if (icpProfile.weights?.roles && lead.contact_role) {
    const { exclusions, exacts, proches } = icpProfile.weights.roles;
    const scores = getSectionScores(icpProfile, 'roles');

    if (listIncludesPartial(exclusions, lead.contact_role)) {
      return { rawScore: scores.exclu, details: { ...details, roles: { match: 'exclu', points: scores.exclu } }, earlyExit: true };
    }

    if (listIncludesPartial(exacts, lead.contact_role)) {
      rawScore += scores.parfait;
      details.roles = { match: 'parfait', points: scores.parfait };
    } else if (listIncludesPartial(proches, lead.contact_role)) {
      rawScore += scores.partiel;
      details.roles = { match: 'partiel', points: scores.partiel };
    } else {
      rawScore += scores.aucun;
      details.roles = { match: 'aucun', points: scores.aucun };
    }
  }

  if (icpProfile.weights?.typeClient && lead.client_type) {
    const { primaire, secondaire } = icpProfile.weights.typeClient;
    const scores = getSectionScores(icpProfile, 'typeClient');

    if (listIncludesExact(primaire, lead.client_type)) {
      rawScore += scores.parfait;
      details.typeClient = { match: 'parfait', points: scores.parfait };
    } else if (listIncludesExact(secondaire, lead.client_type)) {
      rawScore += scores.partiel;
      details.typeClient = { match: 'partiel', points: scores.partiel };
    } else {
      rawScore += scores.aucun;
      details.typeClient = { match: 'aucun', points: scores.aucun };
    }
  }

  if (icpProfile.weights?.structure && lead.company_size) {
    const { primaire, secondaire } = icpProfile.weights.structure;
    const scores = getSectionScores(icpProfile, 'structure');
    const size = Number(lead.company_size);

    if (Number.isFinite(size) && size >= (primaire?.min ?? 0) && size <= (primaire?.max ?? 999999)) {
      rawScore += scores.parfait;
      details.structure = { match: 'parfait', points: scores.parfait };
    } else if (Number.isFinite(size) && size >= (secondaire?.min ?? 0) && size <= (secondaire?.max ?? 999999)) {
      rawScore += scores.partiel;
      details.structure = { match: 'partiel', points: scores.partiel };
    } else {
      rawScore += scores.aucun;
      details.structure = { match: 'aucun', points: scores.aucun };
    }
  }

  if (icpProfile.weights?.geo && lead.country) {
    const { primaire, secondaire } = icpProfile.weights.geo;
    const scores = getSectionScores(icpProfile, 'geo');

    if (listIncludesExact(primaire, lead.country)) {
      rawScore += scores.parfait;
      details.geo = { match: 'parfait', points: scores.parfait };
    } else if (listIncludesExact(secondaire, lead.country)) {
      rawScore += scores.partiel;
      details.geo = { match: 'partiel', points: scores.partiel };
    } else {
      rawScore += scores.aucun;
      details.geo = { match: 'aucun', points: scores.aucun };
    }
  }

  return { rawScore, details, earlyExit: false };
}

/**
 * Analyze a lead against an ICP profile.
 * Async — enriches with LLM if API keys are configured.
 *
 * @param {Object} opts
 * @param {Object} opts.lead
 * @param {Object} opts.icpProfile
 * @param {boolean} [opts.skipLlm=false] - set true to force deterministic-only (e.g. bulk reanalyze)
 * @returns {Promise<Object>}
 */
export async function analyzeLead({ lead, icpProfile, skipLlm = false }) {
  const { rawScore, details, earlyExit } = scoreLeadDeterministic({ lead, icpProfile });

  const clampedRawScore = Math.max(SCORE_LIMITS.minRaw, Math.min(SCORE_LIMITS.maxRaw, rawScore));
  const icpScore = normalizeScore(clampedRawScore);

  const scoringMeta = resolveScoringMeta(icpProfile);
  const icpCategory = getCategory(icpScore, scoringMeta.icpThresholds);
  const status = getStatus(icpCategory);
  const priority = getPriority(icpCategory);
  const recommendedAction = getRecommendedAction(icpCategory);

  const icpSignals = buildIcpSignals({ lead, icpProfile, score: icpScore, details });

  const profileName = icpProfile?.name || 'Active ICP profile';

  // If early exit (hard exclusion), skip LLM and score without signals
  if (earlyExit || skipLlm) {
    const ai = scoreAiSignals({
      lead,
      icpScore,
      scoreDetails: details,
      blendWeights: scoringMeta.blendWeights,
      categoryThresholds: scoringMeta.finalThresholds,
    });

    const baseResult = {
      status,
      icp_raw_score: clampedRawScore,
      icp_score: icpScore,
      category: icpCategory,
      priority,
      recommended_action: recommendedAction,
      icp_profile_id: icpProfile?.id || null,
      icp_profile_name: profileName,
      analysis_version: 'icp-rules-v4-ai-signals-v6-llm-v2',
      ai_score: ai.aiScore,
      ai_confidence: ai.aiConfidence,
      ai_signals: ai.aiSignals,
      ai_summary: ai.aiSummary,
      scoring_weights: {
        ...ai.blendWeights,
        thresholds: {
          icp: scoringMeta.icpThresholds,
          final: scoringMeta.finalThresholds,
        },
      },
      final_score: ai.finalScore,
      final_category: ai.finalCategory,
      final_priority: ai.finalPriority,
      final_recommended_action: ai.finalRecommendedAction,
      final_status: ai.finalStatus,
      signals: [...icpSignals, ...ai.aiSignals],
      score_details: details,
      generated_icebreakers: buildFallbackIcebreakers(lead),
      llm_enriched: false,
    };

    baseResult.analysis_summary = buildAnalysisSummary({
      companyName: lead.company_name,
      icpProfileName: profileName,
      rawScore: clampedRawScore,
      normalizedScore: icpScore,
      category: icpCategory,
      priority,
      recommendedAction,
      aiScore: ai.aiScore,
      aiConfidence: ai.aiConfidence,
      aiBoost: ai.aiBoost ?? 0,
      finalScore: ai.finalScore,
      finalCategory: ai.finalCategory,
      finalRecommendedAction: ai.finalRecommendedAction,
    });
    baseResult.generated_icebreaker = baseResult.generated_icebreakers.email;
    return baseResult;
  }

  // ── LLM inference + web discovery in PARALLEL ─────────────────────────────
  // Claude infers intent signals from lead data (no internet needed).
  // Web discovery only runs on first pass (when internet_signals is empty),
  // result is stored on the lead so future re-analyses are instant.
  const needsWebDiscovery =
    Boolean(lead.website_url) &&
    (!Array.isArray(lead.internet_signals) || lead.internet_signals.length === 0);

  const [llmSettled, webSettled] = await Promise.allSettled([
    enrichWithLlm(lead, icpProfile, {
      icp_score: icpScore,
      icp_category: icpCategory,
      icp_signals: icpSignals,
    }),
    needsWebDiscovery ? discoverInternetSignals({ lead }) : Promise.resolve(null),
  ]);

  const llmResult = llmSettled.status === 'fulfilled' ? llmSettled.value : null;
  const webDiscovery = webSettled.status === 'fulfilled' ? webSettled.value : null;

  // LLM inferred signals are for display only — they must NOT enter the scoring path
  // to avoid double-counting (inferred signals would boost aiBoost AND score_adjustment).
  const inferredSignals = llmResult?.inferred_signals || null;
  const discoveredWebSignals = webDiscovery?.signals?.length > 0 ? webDiscovery.signals : null;

  // Scoring uses original lead + internet-discovered signals only (no LLM inferences)
  const scoringLead = {
    ...lead,
    ...(discoveredWebSignals
      ? { internet_signals: [...(Array.isArray(lead.internet_signals) ? lead.internet_signals : []), ...discoveredWebSignals] }
      : {}),
  };

  const ai = scoreAiSignals({
    lead: scoringLead,
    icpScore,
    scoreDetails: details,
    blendWeights: scoringMeta.blendWeights,
    categoryThresholds: scoringMeta.finalThresholds,
  });

  const baseResult = {
    status,
    icp_raw_score: clampedRawScore,
    icp_score: icpScore,
    category: icpCategory,
    priority,
    recommended_action: recommendedAction,
    icp_profile_id: icpProfile?.id || null,
    icp_profile_name: profileName,
    analysis_version: 'icp-rules-v4-ai-signals-v6-llm-v2',
    ai_score: ai.aiScore,
    ai_confidence: ai.aiConfidence,
    ai_signals: ai.aiSignals,
    ai_summary: ai.aiSummary,
    scoring_weights: {
      ...ai.blendWeights,
      thresholds: {
        icp: scoringMeta.icpThresholds,
        final: scoringMeta.finalThresholds,
      },
    },
    final_score: ai.finalScore,
    final_category: ai.finalCategory,
    final_priority: ai.finalPriority,
    final_recommended_action: ai.finalRecommendedAction,
    final_status: ai.finalStatus,
    signals: [...icpSignals, ...ai.aiSignals],
    score_details: details,
    generated_icebreakers: buildFallbackIcebreakers(lead),
    inferred_intent_signals: inferredSignals,
    discovered_internet_signals: discoveredWebSignals ? scoringLead.internet_signals : null,
    llm_enriched: false,
  };

  if (llmResult) {
    // LLM fine-tunes the final score within a narrow band to prevent instability.
    // High-confidence analysis (≥60): ±8 points max.
    // Low-confidence analysis (<60): ±4 points max (data is sparse, be conservative).
    const rawAdj = Math.round(Number(llmResult.score_adjustment) || 0);
    const highConfidence = (llmResult.confidence_level ?? 0) >= 60;
    const adjustment = highConfidence ? clamp(rawAdj, -8, 8) : clamp(rawAdj, -4, 4);
    const llmFinalScore = clamp(baseResult.final_score + adjustment, 0, 100);

    // Recompute category/action if score changed meaningfully
    const llmCategory = getCategory(llmFinalScore, scoringMeta.finalThresholds);
    const llmAction = adjustment !== 0 ? getRecommendedAction(llmCategory) : baseResult.final_recommended_action;
    const llmStatus = getStatus(llmCategory);

    // Add LLM insight signals
    const llmSignals = [];
    for (const insight of llmResult.key_insights || []) {
      llmSignals.push({ source: 'llm', type: 'neutral', points: 0, label: insight });
    }
    for (const risk of llmResult.risk_factors || []) {
      llmSignals.push({ source: 'llm', type: 'negative', points: 0, label: risk });
    }
    for (const signal of llmResult.buying_signals || []) {
      llmSignals.push({ source: 'llm', type: 'positive', points: 0, label: signal });
    }

    const icebreakers = {
      email: llmResult.icebreaker_email || baseResult.generated_icebreakers.email,
      linkedin: llmResult.icebreaker_linkedin || baseResult.generated_icebreakers.linkedin,
      call: llmResult.icebreaker_call || baseResult.generated_icebreakers.call,
    };

    baseResult.final_score = llmFinalScore;
    baseResult.final_category = llmCategory;
    baseResult.final_recommended_action = llmAction;
    baseResult.final_status = llmStatus;
    baseResult.signals = [...baseResult.signals, ...llmSignals];
    baseResult.generated_icebreakers = icebreakers;
    baseResult.generated_icebreaker = icebreakers.email;
    baseResult.llm_enriched = true;
    baseResult.llm_provider = llmResult.provider;
    baseResult.llm_score_adjustment = adjustment;
    baseResult.llm_confidence = llmResult.confidence_level;
    baseResult.suggested_action = llmResult.suggested_action;
    baseResult._token_usage = llmResult._usage || null;
    baseResult.analysis_summary = buildAnalysisSummary({
      companyName: lead.company_name,
      icpProfileName: profileName,
      rawScore: clampedRawScore,
      normalizedScore: icpScore,
      category: icpCategory,
      priority,
      recommendedAction,
      aiScore: ai.aiScore,
      aiConfidence: ai.aiConfidence,
      aiBoost: ai.aiBoost ?? 0,
      finalScore: llmFinalScore,
      finalCategory: llmCategory,
      finalRecommendedAction: llmAction,
      llmReasoning: llmResult.fit_reasoning,
    });
  } else {
    baseResult.analysis_summary = buildAnalysisSummary({
      companyName: lead.company_name,
      icpProfileName: profileName,
      rawScore: clampedRawScore,
      normalizedScore: icpScore,
      category: icpCategory,
      priority,
      recommendedAction,
      aiScore: ai.aiScore,
      aiConfidence: ai.aiConfidence,
      aiBoost: ai.aiBoost ?? 0,
      finalScore: ai.finalScore,
      finalCategory: ai.finalCategory,
      finalRecommendedAction: ai.finalRecommendedAction,
    });
    baseResult.generated_icebreaker = baseResult.generated_icebreakers.email;
  }

  return baseResult;
}

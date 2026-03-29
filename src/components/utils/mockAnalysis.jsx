import { ICP_CATEGORY, LEAD_STATUS } from '@/constants/leads';
import { scoreAiSignals } from '@/services/analysis/aiSignalService';

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

const DEFAULT_CATEGORY_THRESHOLDS = {
  excellent: 80,
  strong: 50,
  medium: 20,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const normalizeText = (value) => String(value || '').trim().toLowerCase();

const listIncludesExact = (list = [], value = '') => {
  const needle = normalizeText(value);
  if (!needle) return false;
  return list.some((entry) => normalizeText(entry) === needle);
};

const listIncludesPartial = (list = [], value = '') => {
  const needle = normalizeText(value);
  if (!needle) return false;
  return list.some((entry) => {
    const normalizedEntry = normalizeText(entry);
    if (!normalizedEntry) return false;
    const escaped = normalizedEntry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(needle);
  });
};

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const resolveCategoryThresholds = (raw = {}, fallback = DEFAULT_CATEGORY_THRESHOLDS) => {
  const excellent = clamp(Math.round(toNumber(raw?.excellent, fallback.excellent)), 0, 100);
  const strong = clamp(Math.round(toNumber(raw?.strong, fallback.strong)), 0, excellent);
  const medium = clamp(Math.round(toNumber(raw?.medium, fallback.medium)), 0, strong);

  return { excellent, strong, medium };
};

const resolveScoringMeta = (icpProfile) => {
  const meta = icpProfile?.weights?.meta || {};

  return {
    blendWeights: meta.finalScoreWeights || { icp: 60, ai: 40 },
    icpThresholds: resolveCategoryThresholds(meta.icpThresholds || meta.thresholds?.icp),
    finalThresholds: resolveCategoryThresholds(meta.finalThresholds || meta.thresholds?.final),
  };
};

const getSectionScores = (icpProfile, sectionName) => {
  const custom = icpProfile.weights?.[sectionName]?.scores || {};
  const base = DEFAULT_SCORE_WEIGHTS[sectionName];
  const weightMultiplier = Number(icpProfile.weights?.[sectionName]?.weight);
  const multiplier = Number.isFinite(weightMultiplier) && weightMultiplier > 0
    ? clamp(weightMultiplier / 100, 0.1, 3.0)
    : 1;

  return {
    parfait: Math.round((custom.parfait ?? base.parfait) * multiplier),
    partiel: Math.round((custom.partiel ?? base.partiel) * multiplier),
    aucun: Math.round((custom.aucun ?? base.aucun) * multiplier),
    exclu: custom.exclu ?? base.exclu,
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
  finalScore,
  finalCategory,
  blendWeights,
}) {
  return (
    `ICP Analysis: ${companyName}\n\n` +
    `ICP profile used: ${icpProfileName}\n` +
    `Raw ICP score: ${rawScore}\n` +
    `ICP normalized score: ${normalizedScore}/100\n` +
    `ICP category: ${category}\n` +
    `ICP priority: P${priority}\n` +
    `ICP recommended action: ${recommendedAction}\n\n` +
    `Signal score: ${aiScore}/100\n` +
    `Signal confidence: ${aiConfidence}%\n` +
    `Final prioritization score: ${finalScore}/100 (ICP ${blendWeights.icp}% + AI ${blendWeights.ai}%)\n` +
    `Final category suggestion: ${finalCategory}`
  );
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

function buildGeneratedIcebreakers(lead) {
  return {
    email:
      `Hello ${lead.contact_name || 'there'},\n\n` +
      `I noticed ${lead.company_name} appears to be scaling quickly. We support similar teams with outbound execution and conversion performance.\n\n` +
      'Would a 15-minute chat this week make sense?',
    linkedin:
      `Hi ${lead.contact_name || ''}, impressed by the trajectory at ${lead.company_name}. ` +
      'Open to a quick exchange around outbound optimization?',
    call:
      `Hi ${lead.contact_name || 'there'}, I am calling regarding ${lead.company_name}. ` +
      'Do you have a few minutes to discuss lead qualification and reply rates?',
  };
}

function buildResult({ lead, rawScore, details, icpProfile }) {
  const clampedRawScore = Math.max(SCORE_LIMITS.minRaw, Math.min(SCORE_LIMITS.maxRaw, rawScore));
  const icpScore = normalizeScore(clampedRawScore);
  const scoringMeta = resolveScoringMeta(icpProfile);

  const icpCategory = getCategory(icpScore, scoringMeta.icpThresholds);
  const status = getStatus(icpCategory);
  const priority = getPriority(icpCategory);
  const recommendedAction = getRecommendedAction(icpCategory);
  const icpSignals = buildIcpSignals({ lead, icpProfile, score: icpScore, details });

  const ai = scoreAiSignals({
    lead,
    icpScore,
    scoreDetails: details,
    blendWeights: scoringMeta.blendWeights,
    categoryThresholds: scoringMeta.finalThresholds,
  });

  const profileName = icpProfile?.name || 'Active ICP profile';

  return {
    status,
    icp_raw_score: clampedRawScore,
    icp_score: icpScore,
    category: icpCategory,
    priority,
    recommended_action: recommendedAction,
    icp_profile_id: icpProfile?.id || null,
    icp_profile_name: profileName,
    analysis_version: 'icp-rules-v3-ai-signals-v6-configurable-thresholds',
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
    analysis_summary: buildAnalysisSummary({
      companyName: lead.company_name,
      icpProfileName: profileName,
      rawScore: clampedRawScore,
      normalizedScore: icpScore,
      category: icpCategory,
      priority,
      recommendedAction,
      aiScore: ai.aiScore,
      aiConfidence: ai.aiConfidence,
      finalScore: ai.finalScore,
      finalCategory: ai.finalCategory,
      blendWeights: ai.blendWeights,
    }),
    generated_icebreakers: buildGeneratedIcebreakers(lead),
  };
}

export async function mockAnalyzeLead(payload) {
  await new Promise((resolve) => setTimeout(resolve, 1200 + Math.random() * 1000));

  const { lead, icp_profile } = payload;
  let rawScore = 0;
  const details = {};

  if (icp_profile.weights?.industrie) {
    const { primaires = [], secondaires = [], exclusions = [] } = icp_profile.weights.industrie;
    const scores = getSectionScores(icp_profile, 'industrie');
    const hasPrimaryOrSecondary = primaires.length > 0 || secondaires.length > 0;

    if (listIncludesExact(exclusions, lead.industry)) {
      rawScore = scores.exclu;
      details.industrie = { match: 'exclu', points: scores.exclu };
      return buildResult({ lead, rawScore, details, icpProfile: icp_profile });
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

  if (icp_profile.weights?.roles && lead.contact_role) {
    const { exclusions, exacts, proches } = icp_profile.weights.roles;
    const scores = getSectionScores(icp_profile, 'roles');

    if (listIncludesPartial(exclusions, lead.contact_role)) {
      rawScore = scores.exclu;
      details.roles = { match: 'exclu', points: scores.exclu };
      return buildResult({ lead, rawScore, details, icpProfile: icp_profile });
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

  if (icp_profile.weights?.typeClient && lead.client_type) {
    const { primaire, secondaire } = icp_profile.weights.typeClient;
    const scores = getSectionScores(icp_profile, 'typeClient');

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

  const companySize = Number(lead.company_size);
  if (icp_profile.weights?.structure && Number.isFinite(companySize)) {
    const { primaire, secondaire } = icp_profile.weights.structure;
    const scores = getSectionScores(icp_profile, 'structure');
    const primaryMin = Number(primaire?.min ?? 0);
    const primaryMax = Number(primaire?.max ?? 999999);
    const secondaryMin = Number(secondaire?.min ?? primaryMin);
    const secondaryMax = Number(secondaire?.max ?? primaryMax);

    if (companySize >= primaryMin && companySize <= primaryMax) {
      rawScore += scores.parfait;
      details.structure = { match: 'parfait', points: scores.parfait };
    } else if (companySize >= secondaryMin && companySize <= secondaryMax) {
      rawScore += scores.partiel;
      details.structure = { match: 'partiel', points: scores.partiel };
    } else {
      rawScore += scores.aucun;
      details.structure = { match: 'aucun', points: scores.aucun };
    }
  }

  if (icp_profile.weights?.geo && lead.country) {
    const { primaire, secondaire } = icp_profile.weights.geo;
    const scores = getSectionScores(icp_profile, 'geo');

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

  return buildResult({ lead, rawScore, details, icpProfile: icp_profile });
}

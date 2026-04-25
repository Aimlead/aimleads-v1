const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const clampScore = (value) => {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const listHasMatch = (needles, haystack) => {
  const source = normalize(haystack);
  if (!source) return false;
  return asArray(needles).some((needle) => {
    const normalizedNeedle = normalize(needle);
    return normalizedNeedle && (source.includes(normalizedNeedle) || normalizedNeedle.includes(source));
  });
};

const scoreTextCriterion = ({ value, primary = [], secondary = [], exclusions = [], scores = {} }) => {
  if (listHasMatch(exclusions, value)) return scores.exclu ?? -100;
  if (listHasMatch(primary, value)) return scores.parfait ?? 0;
  if (listHasMatch(secondary, value)) return scores.partiel ?? 0;
  return scores.aucun ?? 0;
};

const scoreRangeCriterion = ({ value, primary = {}, secondary = {}, scores = {} }) => {
  const parsed = toNumber(value);
  if (parsed === null || parsed <= 0) return scores.aucun ?? 0;

  const inRange = (range) => {
    const min = toNumber(range?.min);
    const max = toNumber(range?.max);
    if (min !== null && parsed < min) return false;
    if (max !== null && parsed > max) return false;
    return min !== null || max !== null;
  };

  if (inRange(primary)) return scores.parfait ?? 0;
  if (inRange(secondary)) return scores.partiel ?? 0;
  return scores.aucun ?? 0;
};

const weighted = (points, weight) => {
  const factor = Number.isFinite(Number(weight)) ? Number(weight) / 100 : 1;
  return points * factor;
};

const normalizeRawIcp = (raw, max) => {
  const safeMax = Math.max(1, Number(max) || 1);
  return clampScore((Math.max(0, raw) / safeMax) * 100) ?? 0;
};

export const computeIcpScoreFromProfile = (lead, icpProfile) => {
  const weights = icpProfile?.weights;
  if (!weights) return null;

  const industry = weights.industrie || weights.industry || {};
  const roles = weights.roles || weights.role || {};
  const clientType = weights.typeClient || weights.client_type || {};
  const structure = weights.structure || weights.company_size || {};
  const geo = weights.geo || weights.geography || {};

  const criteria = [
    {
      key: 'industry',
      points: scoreTextCriterion({
        value: lead?.industry || lead?.company_industry,
        primary: industry.primaires || industry.primary,
        secondary: industry.secondaires || industry.secondary,
        exclusions: industry.exclusions,
        scores: industry.scores,
      }),
      weight: industry.weight,
      max: industry.scores?.parfait ?? 30,
    },
    {
      key: 'role',
      points: scoreTextCriterion({
        value: lead?.contact_role || lead?.role || lead?.title,
        primary: roles.exacts || roles.primary,
        secondary: roles.proches || roles.secondary,
        exclusions: roles.exclusions,
        scores: roles.scores,
      }),
      weight: roles.weight,
      max: roles.scores?.parfait ?? 25,
    },
    {
      key: 'client_type',
      points: scoreTextCriterion({
        value: lead?.client_type || lead?.business_model || 'B2B',
        primary: clientType.primaire || clientType.primary,
        secondary: clientType.secondaire || clientType.secondary,
        scores: clientType.scores,
      }),
      weight: clientType.weight,
      max: clientType.scores?.parfait ?? 25,
    },
    {
      key: 'company_size',
      points: scoreRangeCriterion({
        value: lead?.company_size || lead?.employee_count || lead?.employees,
        primary: structure.primaire || structure.primary,
        secondary: structure.secondaire || structure.secondary,
        scores: structure.scores,
      }),
      weight: structure.weight,
      max: structure.scores?.parfait ?? 15,
    },
    {
      key: 'geography',
      points: scoreTextCriterion({
        value: lead?.country || lead?.location,
        primary: geo.primaire || geo.primary,
        secondary: geo.secondaire || geo.secondary,
        scores: geo.scores,
      }),
      weight: geo.weight,
      max: geo.scores?.parfait ?? 15,
    },
  ];

  const raw = criteria.reduce((sum, criterion) => sum + weighted(criterion.points, criterion.weight), 0);
  const max = criteria.reduce((sum, criterion) => sum + weighted(Math.max(0, criterion.max), criterion.weight), 0);

  return {
    score: normalizeRawIcp(raw, max),
    raw,
    max,
    criteria,
    profileName: icpProfile?.name || '',
  };
};

const hasSignals = (lead) => {
  if (Array.isArray(lead?.internet_signals) && lead.internet_signals.length > 0) return true;
  if (Array.isArray(lead?.signals) && lead.signals.length > 0) return true;
  const signalAnalysis = lead?.score_details?.signal_analysis;
  return Boolean(signalAnalysis && typeof signalAnalysis === 'object');
};

export const resolveLeadScores = (lead, icpProfile = null) => {
  const computed = computeIcpScoreFromProfile(lead, icpProfile);
  const icpScore = clampScore(lead?.icp_score) ?? computed?.score ?? null;
  const aiScore = clampScore(lead?.ai_score ?? lead?.score_details?.signal_analysis?.ai_score);
  const explicitFinalScore = clampScore(lead?.final_score);
  const blend = icpProfile?.weights?.meta?.finalScoreWeights || {};
  const icpWeight = Number.isFinite(Number(blend.icp)) ? Number(blend.icp) : 60;
  const aiWeight = Number.isFinite(Number(blend.ai)) ? Number(blend.ai) : 100 - icpWeight;
  const blendedScore =
    icpScore !== null && aiScore !== null
      ? clampScore(((icpScore * icpWeight) + (aiScore * aiWeight)) / Math.max(1, icpWeight + aiWeight))
      : null;
  const finalScore = explicitFinalScore ?? blendedScore ?? icpScore ?? aiScore ?? null;

  return {
    finalScore,
    icpScore,
    aiScore,
    aiBoost: finalScore !== null && icpScore !== null ? finalScore - icpScore : null,
    hasExplicitFinalScore: explicitFinalScore !== null,
    hasSignals: hasSignals(lead),
    computedIcp: computed,
  };
};

export const getLeadScoreTier = (score) => {
  const value = clampScore(score) ?? 0;
  if (value >= 80) {
    return {
      key: 'hot',
      label: 'Hot',
      badge: 'HOT',
      dotClass: 'bg-rose-500',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
    };
  }
  if (value >= 65) {
    return {
      key: 'warm',
      label: 'Warm',
      badge: 'WARM',
      dotClass: 'bg-amber-500',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }
  if (value >= 45) {
    return {
      key: 'qualified',
      label: 'Qualified',
      badge: 'FIT',
      dotClass: 'bg-sky-500',
      className: 'border-sky-200 bg-sky-50 text-sky-700',
    };
  }
  return {
    key: 'cool',
    label: 'Cool',
    badge: 'COOL',
    dotClass: 'bg-slate-400',
    className: 'border-slate-200 bg-slate-100 text-slate-600',
  };
};

const hasContact = (lead, key) => Boolean(String(lead?.[key] || '').trim());

export const deriveLeadNextAction = (lead, score = null) => {
  const finalScore = clampScore(score) ?? resolveLeadScores(lead).finalScore ?? 0;
  const status = normalize(lead?.follow_up_status || lead?.status);
  const email = hasContact(lead, 'contact_email') || hasContact(lead, 'email');
  const phone = hasContact(lead, 'contact_phone') || hasContact(lead, 'phone') || hasContact(lead, 'phone_number');
  const linkedin = hasContact(lead, 'linkedin_url') || hasContact(lead, 'linkedin') || hasContact(lead, 'contact_linkedin');

  if (status.includes('won')) return 'Expand account';
  if (status.includes('lost') || status.includes('reject')) return 'Do not prioritize';
  if (status.includes('meeting') || status.includes('reply')) return 'Prepare follow-up';
  if (status.includes('proposal')) return 'Send proposal follow-up';
  if (finalScore >= 80 && phone) return 'Call now';
  if (finalScore >= 70 && email) return 'Send tailored email';
  if (linkedin) return 'Open LinkedIn';
  if (email) return 'Send intro email';
  if (phone) return 'Call lead';
  return 'Enrich contact data';
};

export const computeLeadPriority = (lead, icpProfile = null) => {
  const scores = resolveLeadScores(lead, icpProfile);
  const base = scores.finalScore ?? 0;
  const email = hasContact(lead, 'contact_email') || hasContact(lead, 'email');
  const phone = hasContact(lead, 'contact_phone') || hasContact(lead, 'phone') || hasContact(lead, 'phone_number');
  const reachableBoost = email || phone ? 6 : 0;
  const signalBoost = scores.hasSignals ? 5 : 0;
  const status = normalize(lead?.follow_up_status || lead?.status);
  const untouchedBoost = status.includes('contact') || status.includes('meeting') || status.includes('reply') ? 0 : 8;
  const stalePenalty = status.includes('lost') || status.includes('reject') ? -30 : 0;
  const priorityScore = clampScore(base + reachableBoost + signalBoost + untouchedBoost + stalePenalty) ?? 0;

  return {
    ...scores,
    priorityScore,
    tier: getLeadScoreTier(priorityScore),
    nextAction: deriveLeadNextAction(lead, priorityScore),
  };
};

export const getBestOutreachHook = (lead) => {
  const signalAnalysis = lead?.score_details?.signal_analysis || {};
  return String(
    signalAnalysis.icebreaker
      || lead?.generated_icebreakers?.email
      || lead?.generated_icebreaker
      || lead?.analysis_summary
      || lead?.final_recommended_action
      || lead?.recommended_action
      || ''
  ).trim();
};

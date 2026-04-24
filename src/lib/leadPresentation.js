const toMetric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeSignalLabel = (signal) => {
  if (!signal) return '';
  if (typeof signal === 'string') return signal.trim();
  return String(signal.label || signal.key || signal.signal || '').trim();
};

const ICP_MIXED_CONTENT_PATTERNS = [
  /ai signal score/i,
  /ai confidence/i,
  /ai boost/i,
  /final prioritization score/i,
  /final category suggestion/i,
  /signal analysis/i,
  /final score/i,
];

const stripMixedIcpContent = (value) => {
  const text = String(value || '').trim();
  if (!text) return null;

  const filtered = text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && !ICP_MIXED_CONTENT_PATTERNS.some((pattern) => pattern.test(line)));

  return filtered.length > 0 ? filtered.join('\n') : null;
};

const getNumeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getScoreDetailMetric = (scoreDetails, key) => {
  const entry = scoreDetails?.[key];
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    return getNumeric(entry.points ?? entry.score ?? entry.value);
  }
  return getNumeric(entry);
};

export const getDeterministicIcpSummary = (lead) => {
  const scoreDetails = lead?.score_details && typeof lead.score_details === 'object' ? lead.score_details : {};
  const preferredSummary = stripMixedIcpContent(
    lead?.icp_summary
      || scoreDetails?.icp_summary
      || scoreDetails?.icp_analysis
      || scoreDetails?.icp_analysis_text
      || lead?.analysis_summary
  );

  if (preferredSummary) return preferredSummary;

  const icpProfile = String(
    scoreDetails?.icp_profile_name
      || scoreDetails?.icp_profile
      || lead?.icp_profile_name
      || ''
  ).trim();
  const rawScore = getNumeric(lead?.icp_raw_score) ?? getScoreDetailMetric(scoreDetails, 'icp_raw_score');
  const normalizedScore = getNumeric(lead?.icp_score) ?? getScoreDetailMetric(scoreDetails, 'deterministic_score');
  const category = String(
    scoreDetails?.icp_category
      || lead?.icp_category
      || lead?.category
      || ''
  ).trim();
  const priority = String(
    scoreDetails?.icp_priority
      || lead?.icp_priority
      || lead?.priority
      || ''
  ).trim();
  const recommendedAction = String(
    scoreDetails?.icp_recommended_action
      || lead?.icp_recommended_action
      || lead?.recommended_action
      || ''
  ).trim();

  const lines = [
    icpProfile ? `ICP profile: ${icpProfile}` : null,
    rawScore !== null ? `Raw ICP score: ${rawScore}` : null,
    normalizedScore !== null ? `ICP score (normalized): ${normalizedScore}` : null,
    category ? `ICP category: ${category}` : null,
    priority ? `ICP priority: ${priority}` : null,
    recommendedAction ? `Recommended action: ${recommendedAction}` : null,
  ].filter(Boolean);

  return lines.length > 0 ? lines.join('\n') : null;
};

const hasLeadSignals = (lead) => {
  if (Array.isArray(lead?.internet_signals) && lead.internet_signals.length > 0) return true;
  const intent = lead?.intent_signals || lead?.intentSignals || {};
  const hasArr = (v) => Array.isArray(v) && v.length > 0;
  return (
    hasArr(intent.pre_call || intent.preCall) ||
    hasArr(intent.post_contact || intent.postContact) ||
    hasArr(intent.negative)
  );
};

export const getLeadScores = (lead) => {
  const icpScore = toMetric(lead?.icp_score);
  const finalScore = toMetric(lead?.final_score) ?? icpScore;
  const signals = hasLeadSignals(lead);
  const aiScore = signals ? toMetric(lead?.ai_score) : null;
  const aiBoost = signals && icpScore !== null && finalScore !== null ? finalScore - icpScore : null;

  return {
    icpScore,
    aiScore,
    finalScore,
    aiBoost,
    hasSignals: signals,
  };
};

export const getLeadAnalysisLevel = (lead) => {
  const hasAnalysis = Boolean(
    lead?.last_analyzed_at
      || lead?.analysis_summary
      || lead?.generated_icebreaker
      || lead?.generated_icebreakers?.email
      || lead?.generated_icebreakers?.linkedin
      || lead?.generated_icebreakers?.call
      || toMetric(lead?.final_score) !== null
      || toMetric(lead?.icp_score) !== null
  );

  if (!hasAnalysis) return 'pending';

  const hasInternetSignals = Array.isArray(lead?.internet_signals) && lead.internet_signals.length > 0;
  if (lead?.llm_enriched && hasInternetSignals) return 'full';
  if (lead?.llm_enriched) return 'deep';
  return 'standard';
};

export const getLeadAnalysisLevelMeta = (lead, t) => {
  const level = getLeadAnalysisLevel(lead);

  const entries = {
    pending: {
      label: t('leads.analysisLevels.pending', { defaultValue: 'Pending' }),
      description: t('leads.analysisLevels.pendingDescription', {
        defaultValue: 'No analysis has been generated for this lead yet.',
      }),
      className: 'border-slate-200 bg-slate-50 text-slate-600',
    },
    standard: {
      label: t('leads.analysisLevels.standard', { defaultValue: 'Standard' }),
      description: t('leads.analysisLevels.standardDescription', {
        defaultValue: 'Deterministic scoring based on ICP and available lead data.',
      }),
      className: 'border-sky-200 bg-sky-50 text-sky-700',
    },
    deep: {
      label: t('leads.analysisLevels.deep', { defaultValue: 'Deep' }),
      description: t('leads.analysisLevels.deepDescription', {
        defaultValue: 'Lead enriched with LLM reasoning and tailored outreach suggestions.',
      }),
      className: 'border-violet-200 bg-violet-50 text-violet-700',
    },
    full: {
      label: t('leads.analysisLevels.full', { defaultValue: 'Full' }),
      description: t('leads.analysisLevels.fullDescription', {
        defaultValue: 'Deep analysis plus external signals and web evidence.',
      }),
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
  };

  return { level, ...entries[level] };
};

export const getLeadTopSignals = (lead, limit = 3) => {
  const signals = Array.isArray(lead?.signals) ? lead.signals : [];
  const aiSignals = Array.isArray(lead?.score_details?.signal_analysis?.signals)
    ? lead.score_details.signal_analysis.signals
    : [];

  return [...signals, ...aiSignals]
    .map(normalizeSignalLabel)
    .filter(Boolean)
    .slice(0, limit);
};

export const getLeadPrimaryActionText = (lead, t) => {
  const action = String(
    lead?.final_recommended_action
      || lead?.suggested_action
      || lead?.recommended_action
      || ''
  ).trim();

  if (!action) {
    return t('leads.primaryActionFallback', { defaultValue: 'Review this lead and choose the next outreach step.' });
  }

  const lowered = action.toLowerCase();

  if (lowered.includes('reach out') || lowered.includes('contact')) {
    return t('leads.primaryActionContact', {
      defaultValue: 'Best next move: contact this lead while the fit and timing are still strong.',
    });
  }

  if (lowered.includes('nurture')) {
    return t('leads.primaryActionNurture', {
      defaultValue: 'Best next move: keep this lead warm with a structured follow-up sequence.',
    });
  }

  if (lowered.includes('reject') || lowered.includes('block')) {
    return t('leads.primaryActionReject', {
      defaultValue: 'Best next move: do not prioritize this lead until the signal quality improves.',
    });
  }

  return action;
};

export const getLeadWhyItMatters = (lead, t) => {
  const { finalScore, aiBoost } = getLeadScores(lead);
  const levelMeta = getLeadAnalysisLevelMeta(lead, t);
  const topSignals = getLeadTopSignals(lead, 2);

  if (finalScore !== null && finalScore >= 80) {
    return t('leads.whyItMatters.high', {
      defaultValue: 'High-fit lead with strong priority indicators and a credible next action.',
    });
  }

  if (aiBoost !== null && aiBoost >= 10) {
    return t('leads.whyItMatters.boosted', {
      defaultValue: 'External or behavioral signals materially improved this lead beyond the ICP baseline.',
    });
  }

  if (topSignals.length > 0) {
    return t('leads.whyItMatters.signals', {
      defaultValue: 'This lead stands out because of {{signals}}.',
      signals: topSignals.join(', '),
    });
  }

  if (levelMeta.level === 'standard') {
    return t('leads.whyItMatters.standard', {
      defaultValue: 'This initial result is enough to decide whether the lead deserves deeper follow-up.',
    });
  }

  return t('leads.whyItMatters.default', {
    defaultValue: 'Review the score, the strongest signals, and the suggested action before moving this lead forward.',
  });
};

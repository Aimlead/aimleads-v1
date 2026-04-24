const toMetric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeSignalLabel = (signal) => {
  if (!signal) return '';
  if (typeof signal === 'string') return signal.trim();
  return String(signal.label || signal.key || signal.signal || '').trim();
};

export const getLeadScores = (lead) => {
  const icpScore = toMetric(lead?.icp_score);
  const aiScore = toMetric(lead?.ai_score);
  const finalScore = toMetric(lead?.final_score) ?? icpScore;
  const aiBoost = icpScore !== null && finalScore !== null ? finalScore - icpScore : null;

  return {
    icpScore,
    aiScore,
    finalScore,
    aiBoost,
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

import { FOLLOW_UP_STATUS } from '@/constants/leads';

const toMetric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const hasLeadAnalysis = (lead) => {
  if (!lead) return false;
  return Boolean(
    lead.last_analyzed_at ||
      lead.analysis_summary ||
      lead.generated_icebreaker ||
      lead.generated_icebreakers?.email ||
      lead.generated_icebreakers?.linkedin ||
      lead.generated_icebreakers?.call ||
      toMetric(lead.final_score) !== null ||
      toMetric(lead.ai_score) !== null
  );
};

export const hasLeadOutreachAsset = (lead) => {
  if (!lead) return false;
  return Boolean(
    lead.generated_icebreaker ||
      lead.generated_icebreakers?.email ||
      lead.generated_icebreakers?.linkedin ||
      lead.generated_icebreakers?.call
  );
};

const resolveFlags = ({
  activeIcp = null,
  leads = [],
  hasImportedLeads,
  hasAnalyzedLead,
  hasOutreachAsset,
} = {}) => ({
  hasActiveIcp: Boolean(activeIcp),
  hasImportedLeads: typeof hasImportedLeads === 'boolean' ? hasImportedLeads : leads.length > 0,
  hasAnalyzedLead: typeof hasAnalyzedLead === 'boolean' ? hasAnalyzedLead : leads.some(hasLeadAnalysis),
  hasOutreachAsset: typeof hasOutreachAsset === 'boolean' ? hasOutreachAsset : leads.some(hasLeadOutreachAsset),
});

const hasFollowUpData = (lead) => {
  if (!lead) return false;

  const notes = String(lead.notes || '').trim();
  const followUpStatus = String(lead.follow_up_status || '').trim();
  return Boolean(notes) || (followUpStatus && followUpStatus !== FOLLOW_UP_STATUS.TO_CONTACT);
};

const getLeadToAnalyze = (leads = []) => {
  return leads.find((lead) => !hasLeadAnalysis(lead)) || null;
};

const getLeadToReview = (leads = []) => {
  const analyzedLeads = leads.filter(hasLeadAnalysis);
  if (analyzedLeads.length === 0) return null;
  const sortByBestScore = (left, right) =>
    (toMetric(right.final_score) ?? toMetric(right.icp_score) ?? -1) -
    (toMetric(left.final_score) ?? toMetric(left.icp_score) ?? -1);

  const untouchedLead =
    analyzedLeads
      .filter((lead) => !hasFollowUpData(lead))
      .sort(sortByBestScore)[0] || null;

  if (untouchedLead) return untouchedLead;

  return analyzedLeads
    .slice()
    .sort(sortByBestScore)[0] || null;
};

export const getActivationState = (input = {}) => {
  const state = resolveFlags(input);
  const leads = Array.isArray(input.leads) ? input.leads : [];
  const hasFollowUpStarted = leads.some(hasFollowUpData);
  const leadToAnalyze = getLeadToAnalyze(leads);
  const leadToReview = getLeadToReview(leads);

  return {
    ...state,
    hasFollowUpStarted,
    leadToAnalyze,
    leadToReview,
  };
};

export const getActivationSnapshot = (input = {}) => {
  const state = getActivationState(input);
  const steps = [
    {
      id: 'icp',
      title: 'Define your ICP',
      description: 'Create an active ICP profile before you trust the scoring.',
      completed: state.hasActiveIcp,
      actionKey: 'icp',
      actionLabel: state.hasActiveIcp ? 'Review ICP' : 'Configure ICP',
    },
    {
      id: 'import',
      title: 'Import real leads',
      description: 'Upload a CSV or spreadsheet so the workspace contains real pipeline.',
      completed: state.hasImportedLeads,
      actionKey: 'import',
      actionLabel: state.hasImportedLeads ? 'Import more leads' : 'Import CSV',
    },
    {
      id: 'analyze',
      title: 'Analyze the first lead',
      description: 'Run one real analysis to generate score, signals, and recommendations.',
      completed: state.hasAnalyzedLead,
      actionKey: 'inbox',
      actionLabel: 'Open Dashboard',
    },
    {
      id: 'follow-up',
      title: 'Start the first follow-up',
      description: 'Add notes or move one lead out of the default follow-up state.',
      completed: state.hasFollowUpStarted,
      actionKey: state.leadToReview ? 'lead' : 'pipeline',
      actionLabel: state.leadToReview ? 'Open best lead' : 'Open pipeline',
    },
  ];

  return {
    ...state,
    steps,
    totalSteps: steps.length,
    completedSteps: steps.filter((step) => step.completed).length,
    nextStep: steps.find((step) => !step.completed) || null,
    isComplete: steps.every((step) => step.completed),
  };
};

export const getPostImportAction = (input = {}) => {
  const state = resolveFlags(input);

  if (!state.hasActiveIcp) {
    return {
      actionKey: 'icp',
      title: 'Next step: define your ICP',
      description: 'Lead scoring is only meaningful when an active ICP profile is configured.',
      label: 'Configure ICP',
    };
  }

  if (!state.hasAnalyzedLead) {
    return {
      actionKey: 'inbox',
      title: 'Next step: analyze your first lead',
      description: 'Open the Dashboard and run the first analysis from the table below.',
      label: 'Open Dashboard',
    };
  }

  if (!state.hasOutreachAsset) {
    return {
      actionKey: 'pipeline',
      title: 'Next step: review AI-ready leads',
      description: 'Open Pipeline to review the first score, signals, and usable icebreakers together.',
      label: 'Open Pipeline',
    };
  }

  return {
    actionKey: 'pipeline',
    title: 'Next step: review the best leads',
    description: 'Open Pipeline to compare priority, signals, and outreach readiness on your strongest leads.',
    label: 'Open Pipeline',
  };
};

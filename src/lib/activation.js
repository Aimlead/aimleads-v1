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
      title: 'Définir votre ICP',
      description: 'Créez un profil ICP actif avant de faire confiance au scoring.',
      completed: state.hasActiveIcp,
      actionKey: 'icp',
      actionLabel: state.hasActiveIcp ? 'Revoir le profil ICP' : 'Configurer le profil ICP',
    },
    {
      id: 'import',
      title: 'Importer vos premiers leads',
      description: 'Chargez un CSV ou tableur pour alimenter le pipeline avec de vrais contacts.',
      completed: state.hasImportedLeads,
      actionKey: 'import',
      actionLabel: state.hasImportedLeads ? 'Importer plus de leads' : 'Importer un CSV',
    },
    {
      id: 'analyze',
      title: 'Analyser le premier lead',
      description: 'Lancez une vraie analyse pour générer le score, les signaux et les recommandations.',
      completed: state.hasAnalyzedLead,
      actionKey: 'inbox',
      actionLabel: 'Ouvrir le tableau de bord',
    },
    {
      id: 'follow-up',
      title: 'Démarrer le premier suivi',
      description: 'Ajoutez une note ou faites avancer un lead dans le pipeline.',
      completed: state.hasFollowUpStarted,
      actionKey: state.leadToReview ? 'lead' : 'pipeline',
      actionLabel: state.leadToReview ? 'Ouvrir le meilleur lead' : 'Ouvrir le pipeline',
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

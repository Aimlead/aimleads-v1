const toNumericScore = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getLeadPriorityScore = (lead) => {
  const finalScore = toNumericScore(lead?.final_score);
  if (finalScore !== null) return finalScore;
  return toNumericScore(lead?.icp_score);
};

export const buildDashboardInsightModel = ({
  visibleLeads = [],
  activeIcp = null,
  creditsBalance = null,
  seatsIncluded = 0,
  seatsUsed = 0,
  crmSlotsIncluded = 0,
  crmSlotsUsed = 0,
} = {}) => {
  const analyzedLeads = visibleLeads.filter((lead) => getLeadPriorityScore(lead) !== null);
  const actionReadyLeads = visibleLeads.filter((lead) => {
    const score = getLeadPriorityScore(lead);
    return lead?.status === 'Qualified' || (score !== null && score >= 65);
  });
  const qualifiedLeads = visibleLeads.filter((lead) => lead?.status === 'Qualified');

  const topLeads = [...visibleLeads]
    .map((lead) => ({
      id: lead.id,
      companyName: lead.company_name || 'Unknown company',
      recommendedAction: lead.final_recommended_action || lead.recommended_action || null,
      status: lead.status || null,
      score: getLeadPriorityScore(lead),
    }))
    .filter((lead) => lead.score !== null)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return String(left.companyName).localeCompare(String(right.companyName));
    })
    .slice(0, 3);

  const attentionItems = [];

  if (!activeIcp) {
    attentionItems.push({ id: 'icp', severity: 'warning' });
  }
  if (visibleLeads.length === 0) {
    attentionItems.push({ id: 'import', severity: 'warning' });
  } else if (analyzedLeads.length === 0) {
    attentionItems.push({ id: 'analysis', severity: 'warning' });
  }
  if (creditsBalance !== null && creditsBalance <= 10) {
    attentionItems.push({ id: 'credits', severity: 'warning' });
  }
  if (seatsIncluded > 0 && seatsUsed >= seatsIncluded) {
    attentionItems.push({ id: 'seats', severity: 'info' });
  }
  if (crmSlotsIncluded === 0) {
    attentionItems.push({ id: 'crmLocked', severity: 'info' });
  } else if (crmSlotsUsed >= crmSlotsIncluded) {
    attentionItems.push({ id: 'crmFull', severity: 'info' });
  }

  return {
    topLeads,
    attentionItems,
    funnel: {
      imported: visibleLeads.length,
      analyzed: analyzedLeads.length,
      actionReady: actionReadyLeads.length,
      qualified: qualifiedLeads.length,
    },
  };
};

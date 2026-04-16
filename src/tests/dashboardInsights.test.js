import { describe, expect, it } from 'vitest';
import { buildDashboardInsightModel, getLeadPriorityScore } from '@/lib/dashboardInsights';

describe('dashboardInsights', () => {
  it('prefers final score over icp score', () => {
    expect(getLeadPriorityScore({ final_score: 81, icp_score: 62 })).toBe(81);
    expect(getLeadPriorityScore({ final_score: null, icp_score: 62 })).toBe(62);
  });

  it('builds top leads and attention items from workspace state', () => {
    const model = buildDashboardInsightModel({
      visibleLeads: [
        { id: '1', company_name: 'Beta', status: 'Qualified', final_score: 72 },
        { id: '2', company_name: 'Alpha', status: 'To Analyze', final_score: 91 },
        { id: '3', company_name: 'Gamma', status: 'Qualified', icp_score: 84 },
      ],
      activeIcp: null,
      creditsBalance: 8,
      seatsIncluded: 2,
      seatsUsed: 2,
      crmSlotsIncluded: 0,
      crmSlotsUsed: 0,
    });

    expect(model.topLeads.map((lead) => lead.companyName)).toEqual(['Alpha', 'Gamma', 'Beta']);
    expect(model.funnel).toEqual({
      imported: 3,
      analyzed: 3,
      actionReady: 3,
      qualified: 2,
    });
    expect(model.attentionItems.map((item) => item.id)).toEqual(['icp', 'credits', 'seats', 'crmLocked']);
  });

  it('flags import and analysis when no usable pipeline exists yet', () => {
    const emptyModel = buildDashboardInsightModel({
      visibleLeads: [],
      activeIcp: { id: 'icp-1' },
      creditsBalance: 100,
      seatsIncluded: 3,
      seatsUsed: 1,
      crmSlotsIncluded: 1,
      crmSlotsUsed: 1,
    });
    expect(emptyModel.attentionItems.map((item) => item.id)).toEqual(['import', 'crmFull']);

    const unanalyzedModel = buildDashboardInsightModel({
      visibleLeads: [{ id: '1', company_name: 'Delta', status: 'To Analyze' }],
      activeIcp: { id: 'icp-1' },
      creditsBalance: 100,
      seatsIncluded: 3,
      seatsUsed: 1,
      crmSlotsIncluded: 2,
      crmSlotsUsed: 1,
    });
    expect(unanalyzedModel.attentionItems.map((item) => item.id)).toEqual(['analysis']);
  });
});

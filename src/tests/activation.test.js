import { describe, expect, it } from 'vitest';
import { FOLLOW_UP_STATUS } from '@/constants/leads';
import { getActivationState, hasLeadAnalysis, hasLeadOutreachAsset } from '@/lib/activation';

describe('activation helpers', () => {
  it('detects analyzed leads from persisted analysis fields', () => {
    expect(hasLeadAnalysis({ final_score: 82 })).toBe(true);
    expect(hasLeadAnalysis({ ai_score: 44 })).toBe(true);
    expect(hasLeadAnalysis({ last_analyzed_at: '2026-03-23T10:00:00.000Z' })).toBe(true);
    expect(hasLeadAnalysis({})).toBe(false);
  });

  it('detects outreach assets from generated icebreakers', () => {
    expect(hasLeadOutreachAsset({ generated_icebreaker: 'Hi {{contact_name}}' })).toBe(true);
    expect(hasLeadOutreachAsset({ generated_icebreakers: { email: 'Email copy' } })).toBe(true);
    expect(hasLeadOutreachAsset({ generated_icebreakers: {} })).toBe(false);
  });

  it('builds activation state from real workspace data', () => {
    const coldLead = {
      id: 'lead-1',
      company_name: 'Alpha',
      follow_up_status: FOLLOW_UP_STATUS.TO_CONTACT,
    };
    const analyzedLead = {
      id: 'lead-2',
      company_name: 'Beta',
      final_score: 91,
      follow_up_status: FOLLOW_UP_STATUS.CONTACTED,
      notes: 'Called on Monday',
    };

    const state = getActivationState({
      activeIcp: { id: 'icp-1', name: 'SaaS EU' },
      leads: [coldLead, analyzedLead],
    });

    expect(state.hasActiveIcp).toBe(true);
    expect(state.hasImportedLeads).toBe(true);
    expect(state.hasAnalyzedLead).toBe(true);
    expect(state.hasFollowUpStarted).toBe(true);
    expect(state.leadToAnalyze?.id).toBe('lead-1');
    expect(state.leadToReview?.id).toBe('lead-2');
  });
});

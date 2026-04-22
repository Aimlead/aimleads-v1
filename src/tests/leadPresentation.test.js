import { describe, expect, it } from 'vitest';
import {
  getLeadAnalysisLevel,
  getLeadPrimaryActionText,
  getLeadScores,
  getLeadWhyItMatters,
} from '@/lib/leadPresentation';

const t = (_key, options = {}) => options.defaultValue || _key;

describe('leadPresentation helpers', () => {
  it('classifies analysis depth from persisted lead data', () => {
    expect(getLeadAnalysisLevel({})).toBe('pending');
    expect(getLeadAnalysisLevel({ final_score: 61 })).toBe('standard');
    expect(getLeadAnalysisLevel({ final_score: 72, llm_enriched: true })).toBe('deep');
    expect(getLeadAnalysisLevel({ final_score: 84, llm_enriched: true, internet_signals: [{ key: 'recent_funding' }] })).toBe('full');
  });

  it('returns stable score breakdown values', () => {
    expect(getLeadScores({ icp_score: 55, ai_score: 66, final_score: 71 })).toEqual({
      icpScore: 55,
      aiScore: 66,
      finalScore: 71,
      aiBoost: 16,
    });
  });

  it('maps recommended actions to clearer CTA copy', () => {
    expect(getLeadPrimaryActionText({ final_recommended_action: 'Reach out now' }, t)).toContain('contact');
    expect(getLeadPrimaryActionText({ final_recommended_action: 'Nurture sequence' }, t)).toContain('sequence');
    expect(getLeadPrimaryActionText({ final_recommended_action: 'Reject lead' }, t)).toContain('not prioritize');
  });

  it('explains why a lead matters from score and signals', () => {
    const boostedLead = {
      final_score: 78,
      icp_score: 61,
      signals: [{ label: 'Recent funding' }],
    };

    expect(getLeadWhyItMatters(boostedLead, t)).toContain('improved');
  });
});

import { describe, expect, it } from 'vitest';
import { computeLeadPriority, resolveLeadScores } from '@/lib/leadScoring';

const icp = {
  name: 'SaaS ICP',
  weights: {
    industrie: {
      primaires: ['SaaS'],
      secondaires: ['E-commerce'],
      exclusions: ['Agency'],
      scores: { parfait: 30, partiel: 15, aucun: -30, exclu: -100 },
    },
    roles: {
      exacts: ['Head of Sales'],
      proches: ['Growth'],
      exclusions: ['Intern'],
      scores: { parfait: 25, partiel: 10, aucun: -25, exclu: -100 },
    },
    typeClient: {
      primaire: ['B2B'],
      secondaire: ['B2B2C'],
      scores: { parfait: 25, partiel: 10, aucun: -40 },
    },
    structure: {
      primaire: { min: 50, max: 500 },
      secondaire: { min: 20, max: 1000 },
      scores: { parfait: 15, partiel: 10, aucun: -20 },
    },
    geo: {
      primaire: ['France'],
      secondaire: ['Belgium'],
      scores: { parfait: 15, partiel: 5, aucun: -10 },
    },
    meta: {
      finalScoreWeights: { icp: 60, ai: 40 },
    },
  },
};

describe('leadScoring', () => {
  it('computes an ICP score from the active profile when persisted scores are missing', () => {
    const lead = {
      industry: 'B2B SaaS',
      contact_role: 'Head of Sales',
      client_type: 'B2B',
      company_size: 120,
      country: 'France',
    };

    expect(resolveLeadScores(lead, icp).icpScore).toBe(100);
  });

  it('prioritizes reachable high-fit leads with a concrete next action', () => {
    const lead = {
      industry: 'SaaS',
      contact_role: 'Head of Sales',
      company_size: 120,
      country: 'France',
      contact_phone: '+33123456789',
    };

    const priority = computeLeadPriority(lead, icp);

    expect(priority.priorityScore).toBeGreaterThanOrEqual(80);
    expect(priority.nextAction).toBe('Call now');
    expect(priority.tier.key).toBe('hot');
  });
});

import { describe, expect, it } from 'vitest';
import { buildQuickIcpPayload, createDefaultIcpFormData } from '@/lib/icpProfile';

describe('icpProfile helpers', () => {
  it('creates the baseline ICP structure', () => {
    const payload = createDefaultIcpFormData();

    expect(payload.name).toBe('My ICP');
    expect(payload.weights.industrie.primaires).toEqual([]);
    expect(payload.weights.structure.primaire.min).toBeGreaterThan(0);
    expect(payload.weights.meta.finalScoreWeights.icp).toBe(60);
  });

  it('builds a quick ICP payload from the onboarding fields', () => {
    const payload = buildQuickIcpPayload({
      name: 'ICP Growth',
      description: 'B2B SaaS and fintech accounts',
      industries: 'SaaS, Fintech',
      roles: 'CEO, Head of Sales',
      geography: 'France, Belgium',
      companySizeMin: 40,
      companySizeMax: 300,
    });

    expect(payload.name).toBe('ICP Growth');
    expect(payload.description).toContain('B2B SaaS');
    expect(payload.weights.industrie.primaires).toEqual(['SaaS', 'Fintech']);
    expect(payload.weights.roles.exacts).toEqual(['CEO', 'Head of Sales']);
    expect(payload.weights.geo.primaire).toEqual(['France', 'Belgium']);
    expect(payload.weights.structure.primaire).toEqual({ min: 40, max: 300 });
    expect(payload.weights.typeClient.primaire).toEqual(['B2B']);
  });

  it('normalizes invalid max size values without breaking the range', () => {
    const payload = buildQuickIcpPayload({
      companySizeMin: 120,
      companySizeMax: 80,
    });

    expect(payload.weights.structure.primaire.min).toBe(120);
    expect(payload.weights.structure.primaire.max).toBe(120);
  });
});

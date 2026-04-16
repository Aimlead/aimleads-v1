export const createDefaultIcpFormData = () => ({
  name: 'My ICP',
  description: '',
  weights: {
    industrie: {
      primaires: [],
      secondaires: [],
      exclusions: [],
      weight: 100,
      scores: { parfait: 30, partiel: 15, aucun: -30, exclu: -100 },
    },
    roles: {
      exclusions: [],
      exacts: [],
      proches: [],
      weight: 100,
      scores: { parfait: 25, partiel: 10, exclu: -100, aucun: -25 },
    },
    typeClient: {
      primaire: ['B2B'],
      secondaire: [],
      weight: 100,
      scores: { parfait: 25, partiel: 10, aucun: -40 },
    },
    structure: {
      primaire: { min: 50, max: 5000 },
      secondaire: { min: 30, max: 10000 },
      weight: 100,
      scores: { parfait: 15, partiel: 10, aucun: -20 },
    },
    geo: {
      primaire: [],
      secondaire: [],
      weight: 100,
      scores: { parfait: 15, partiel: 5, aucun: -10 },
    },
    meta: {
      minScore: 0,
      maxScore: 100,
      finalScoreWeights: { icp: 60, ai: 40 },
      icpThresholds: { excellent: 80, strong: 50, medium: 20 },
      finalThresholds: { excellent: 80, strong: 50, medium: 20 },
      thresholds: {
        icp: { excellent: 80, strong: 50, medium: 20 },
        final: { excellent: 80, strong: 50, medium: 20 },
      },
    },
  },
});

const splitTags = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeMax = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

export const buildQuickIcpPayload = ({
  name,
  description,
  industries,
  roles,
  geography,
  companySizeMin,
  companySizeMax,
  clientType = 'B2B',
} = {}) => {
  const base = createDefaultIcpFormData();
  const min = normalizeMax(companySizeMin, base.weights.structure.primaire.min);
  const maxCandidate = normalizeMax(companySizeMax, base.weights.structure.primaire.max);
  const max = Math.max(min, maxCandidate);

  return {
    ...base,
    name: String(name || '').trim() || 'My ICP',
    description: String(description || '').trim(),
    weights: {
      ...base.weights,
      industrie: {
        ...base.weights.industrie,
        primaires: splitTags(industries),
      },
      roles: {
        ...base.weights.roles,
        exacts: splitTags(roles),
      },
      geo: {
        ...base.weights.geo,
        primaire: splitTags(geography),
      },
      typeClient: {
        ...base.weights.typeClient,
        primaire: splitTags(clientType || 'B2B'),
      },
      structure: {
        ...base.weights.structure,
        primaire: { min, max },
        secondaire: {
          min: Math.max(1, Math.floor(min * 0.6)),
          max: Math.max(max, Math.ceil(max * 1.35)),
        },
      },
    },
  };
};

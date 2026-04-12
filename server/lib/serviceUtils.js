/**
 * Shared utilities for scoring and analysis services.
 * Centralises constants and helpers that were previously duplicated across
 * aiSignalService, analyzeService, internetSignalDiscoveryService, and dev route.
 */

export const ICP_CATEGORY = {
  EXCELLENT: 'Excellent',
  STRONG: 'Strong Fit',
  MEDIUM: 'Medium Fit',
  LOW: 'Low Fit',
  EXCLUDED: 'Excluded',
};

export const DEFAULT_CATEGORY_THRESHOLDS = { excellent: 80, strong: 50, medium: 20 };

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const normalizeText = (value) => String(value || '').trim().toLowerCase();

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

export const resolveCategoryThresholds = (raw = {}, fallback = DEFAULT_CATEGORY_THRESHOLDS) => {
  const excellent = clamp(Math.round(toNumber(raw?.excellent, fallback.excellent)), 0, 100);
  const strong = clamp(Math.round(toNumber(raw?.strong, fallback.strong)), 0, excellent);
  const medium = clamp(Math.round(toNumber(raw?.medium, fallback.medium)), 0, strong);

  return { excellent, strong, medium };
};

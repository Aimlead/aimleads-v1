const MODEL_LABELS = {
  'claude-haiku-4-5-20251001': 'Claude Haiku',
  'claude-sonnet-4-6': 'Claude Sonnet',
  mixed: 'Multi-source',
  internal: 'Internal',
};

const PROVIDER_LABELS = {
  anthropic: 'Anthropic',
  mixed: 'Multi-source',
  internal: 'Internal',
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeStatus = (value) => {
  const status = String(value || 'unknown').trim().toLowerCase();
  if (status === 'completed' || status === 'failed' || status === 'running') return status;
  return 'unknown';
};

export const humanizeAiModel = (value) => {
  const key = String(value || '').trim();
  if (!key) return 'Unknown model';
  return MODEL_LABELS[key] || key;
};

export const humanizeAiProvider = (value) => {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return 'Unknown provider';
  return PROVIDER_LABELS[key] || key;
};

export const formatAiRunDuration = (value, locale = 'en-US') => {
  const durationMs = toNumber(value);
  if (durationMs === null || durationMs <= 0) return null;

  if (durationMs < 1_000) {
    return `${Math.round(durationMs)} ms`;
  }

  if (durationMs < 60_000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(durationMs / 1_000)} s`;
  }

  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(durationMs / 60_000)} min`;
};

export const formatAiRunCost = (value, locale = 'en-US') => {
  const cost = toNumber(value);
  if (cost === null) return null;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cost < 0.1 ? 4 : 2,
    maximumFractionDigits: cost < 0.1 ? 4 : 2,
  }).format(cost);
};

export const formatAiRunTimestamp = (value, locale = 'en-US') => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export const formatAiRunRelativeTime = (value, locale = 'en-US', now = Date.now()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const diffMs = date.getTime() - now;
  const absMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (absMs < 60_000) {
    return rtf.format(Math.round(diffMs / 1_000), 'second');
  }

  if (absMs < 3_600_000) {
    return rtf.format(Math.round(diffMs / 60_000), 'minute');
  }

  if (absMs < 86_400_000) {
    return rtf.format(Math.round(diffMs / 3_600_000), 'hour');
  }

  return rtf.format(Math.round(diffMs / 86_400_000), 'day');
};

export const buildAiRunActivityModel = (runs = []) => {
  const normalizedRuns = Array.isArray(runs)
    ? runs
      .filter(Boolean)
      .map((run) => {
        const inputTokens = toNumber(run.input_tokens) || 0;
        const outputTokens = toNumber(run.output_tokens) || 0;
        const totalTokens = inputTokens + outputTokens;
        return {
          ...run,
          status: normalizeStatus(run.status),
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
          duration_ms: toNumber(run.duration_ms),
          estimated_cost: toNumber(run.estimated_cost),
          model_label: humanizeAiModel(run.model),
          provider_label: humanizeAiProvider(run.provider),
        };
      })
      .sort((left, right) => Date.parse(String(right.created_at || '')) - Date.parse(String(left.created_at || '')))
    : [];

  const completed = normalizedRuns.filter((run) => run.status === 'completed').length;
  const failed = normalizedRuns.filter((run) => run.status === 'failed').length;
  const running = normalizedRuns.filter((run) => run.status === 'running').length;
  const totalTokens = normalizedRuns.reduce((sum, run) => sum + run.total_tokens, 0);
  const totalCost = normalizedRuns.reduce((sum, run) => sum + (run.estimated_cost || 0), 0);

  const completedDurations = normalizedRuns
    .map((run) => run.duration_ms)
    .filter((duration) => Number.isFinite(duration) && duration > 0);

  const averageDurationMs = completedDurations.length > 0
    ? Math.round(completedDurations.reduce((sum, duration) => sum + duration, 0) / completedDurations.length)
    : null;

  const modelMixMap = new Map();
  for (const run of normalizedRuns) {
    const model = String(run.model || 'unknown').trim() || 'unknown';
    const current = modelMixMap.get(model) || { model, label: humanizeAiModel(model), count: 0 };
    current.count += 1;
    modelMixMap.set(model, current);
  }

  const modelMix = [...modelMixMap.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, 3);

  return {
    totalRuns: normalizedRuns.length,
    completed,
    failed,
    running,
    totalTokens,
    totalCost: Number(totalCost.toFixed(6)),
    averageDurationMs,
    modelMix,
    recentRuns: normalizedRuns.slice(0, 6),
  };
};

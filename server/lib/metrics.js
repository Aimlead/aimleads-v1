const REQUEST_DURATION_BUCKETS_MS = [25, 50, 100, 250, 500, 1000, 2500, 5000];

const state = {
  httpRequests: new Map(),
  httpDuration: new Map(),
  leadsAnalyzed: new Map(),
  creditsConsumed: new Map(),
  llmTokensUsed: new Map(),
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const escapeLabelValue = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/"/g, '\\"')
  .replace(/\n/g, '\\n');

const makeKey = (labels) => JSON.stringify(labels);

const incrementCounter = (map, labels, amount = 1) => {
  const key = makeKey(labels);
  const current = map.get(key) || { labels, value: 0 };
  current.value += amount;
  map.set(key, current);
};

const observeHistogram = (map, labels, value) => {
  const key = makeKey(labels);
  const current = map.get(key) || {
    labels,
    count: 0,
    sum: 0,
    buckets: new Map(REQUEST_DURATION_BUCKETS_MS.map((bucket) => [bucket, 0])),
    infCount: 0,
  };

  current.count += 1;
  current.sum += value;

  for (const bucket of REQUEST_DURATION_BUCKETS_MS) {
    if (value <= bucket) {
      current.buckets.set(bucket, current.buckets.get(bucket) + 1);
    }
  }

  current.infCount += 1;
  map.set(key, current);
};

export const recordHttpRequestMetric = ({ method, path, status, latencyMs }) => {
  const labels = {
    method: String(method || 'GET').toUpperCase(),
    path: String(path || '/unknown'),
    status: String(status || 0),
  };
  incrementCounter(state.httpRequests, labels, 1);
  observeHistogram(state.httpDuration, { method: labels.method, path: labels.path }, toNumber(latencyMs));
};

export const recordLeadAnalyzedMetric = ({ action = 'analyze', model = 'unknown' } = {}) => {
  incrementCounter(state.leadsAnalyzed, {
    action: String(action || 'analyze'),
    model: String(model || 'unknown'),
  }, 1);
};

export const recordCreditsConsumedMetric = ({ action = 'unknown', amount = 0 } = {}) => {
  const numericAmount = toNumber(amount);
  if (numericAmount <= 0) return;
  incrementCounter(state.creditsConsumed, {
    action: String(action || 'unknown'),
  }, numericAmount);
};

export const recordCreditConsumptionMetric = (input = {}) => {
  recordCreditsConsumedMetric(input);
};

export const recordLlmTokensUsedMetric = ({ model = 'unknown', inputTokens = 0, outputTokens = 0 } = {}) => {
  const totalTokens = Math.max(0, toNumber(inputTokens) + toNumber(outputTokens));
  if (totalTokens <= 0) return;
  incrementCounter(state.llmTokensUsed, {
    model: String(model || 'unknown'),
  }, totalTokens);
};

const renderCounterLines = (name, help, map) => {
  const lines = [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} counter`,
  ];

  for (const { labels, value } of map.values()) {
    const labelEntries = Object.entries(labels || {});
    const labelText = labelEntries.length > 0
      ? `{${labelEntries.map(([key, labelValue]) => `${key}="${escapeLabelValue(labelValue)}"`).join(',')}}`
      : '';
    lines.push(`${name}${labelText} ${value}`);
  }

  return lines;
};

const renderHistogramLines = (name, help, map) => {
  const lines = [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} histogram`,
  ];

  for (const metric of map.values()) {
    const baseLabels = metric.labels || {};
    for (const bucket of REQUEST_DURATION_BUCKETS_MS) {
      const labels = { ...baseLabels, le: bucket };
      const labelText = `{${Object.entries(labels).map(([key, labelValue]) => `${key}="${escapeLabelValue(labelValue)}"`).join(',')}}`;
      lines.push(`${name}_bucket${labelText} ${metric.buckets.get(bucket) || 0}`);
    }

    const infLabels = { ...baseLabels, le: '+Inf' };
    const infLabelText = `{${Object.entries(infLabels).map(([key, labelValue]) => `${key}="${escapeLabelValue(labelValue)}"`).join(',')}}`;
    lines.push(`${name}_bucket${infLabelText} ${metric.infCount}`);

    const sumLabelText = `{${Object.entries(baseLabels).map(([key, labelValue]) => `${key}="${escapeLabelValue(labelValue)}"`).join(',')}}`;
    lines.push(`${name}_sum${sumLabelText} ${metric.sum}`);
    lines.push(`${name}_count${sumLabelText} ${metric.count}`);
  }

  return lines;
};

export const renderPrometheusMetrics = () => {
  const lines = [
    ...renderCounterLines('http_requests_total', 'Total HTTP requests served by AimLeads.', state.httpRequests),
    ...renderHistogramLines('http_request_duration_ms', 'HTTP request latency in milliseconds.', state.httpDuration),
    ...renderCounterLines('leads_analyzed_total', 'Total leads analyzed by AI-capable actions.', state.leadsAnalyzed),
    ...renderCounterLines('credits_consumed_total', 'Total credits consumed by action.', state.creditsConsumed),
    ...renderCounterLines('llm_tokens_used_total', 'Total LLM tokens used by model.', state.llmTokensUsed),
  ];

  return `${lines.join('\n')}\n`;
};

export const resetMetrics = () => {
  for (const map of Object.values(state)) {
    map.clear();
  }
};

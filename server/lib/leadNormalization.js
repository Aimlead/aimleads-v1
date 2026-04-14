const NEGATIVE_SIGNAL_TOKENS = ['bankruptcy', 'closed', 'shutdown', 'layoff', 'churn', 'no_budget', 'budget_frozen'];

const unique = (items) => [...new Set(items)];

const extractSignalKey = (item) => {
  if (typeof item === 'string') return item.trim();
  if (!item || typeof item !== 'object') return '';
  return String(item.key || item.signal || item.label || '').trim();
};

const inferSignalBucket = (item) => {
  const explicitType = String(item?.type || item?.category || '').trim().toLowerCase();
  if (explicitType === 'negative') return 'negative';

  const key = extractSignalKey(item).toLowerCase();
  return NEGATIVE_SIGNAL_TOKENS.some((token) => key.includes(token)) ? 'negative' : 'pre_call';
};

const normalizeSignalList = (value) => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return unique(value.map(extractSignalKey).filter(Boolean));
  }

  if (typeof value === 'string') {
    return unique(value.split(',').map((item) => item.trim()).filter(Boolean));
  }

  if (typeof value === 'object') {
    return unique(
      Object.entries(value)
        .filter(([, enabled]) => Boolean(enabled))
        .map(([key]) => key.trim())
        .filter(Boolean)
    );
  }

  return [];
};

export const normalizeIntentSignalsPayload = (value) => {
  if (value == null) return null;

  const normalized = {
    pre_call: [],
    post_contact: [],
    negative: [],
  };

  if (Array.isArray(value)) {
    value.forEach((item) => {
      const bucket = inferSignalBucket(item);
      const key = extractSignalKey(item);
      if (key && !normalized[bucket].includes(key)) normalized[bucket].push(key);
    });
    return normalized;
  }

  if (typeof value !== 'object') {
    normalized.pre_call = normalizeSignalList(value);
    return normalized;
  }

  const hasStructuredKeys =
    'pre_call' in value ||
    'preCall' in value ||
    'pre' in value ||
    'precall' in value ||
    'post_contact' in value ||
    'postContact' in value ||
    'post' in value ||
    'negative' in value ||
    'negatives' in value ||
    'negative_signals' in value;

  if (hasStructuredKeys) {
    normalized.pre_call = normalizeSignalList(value.pre_call || value.preCall || value.pre || value.precall);
    normalized.post_contact = normalizeSignalList(value.post_contact || value.postContact || value.post);
    normalized.negative = normalizeSignalList(value.negative || value.negatives || value.negative_signals);
    return normalized;
  }

  Object.entries(value).forEach(([key, enabled]) => {
    if (!enabled) return;
    const bucket = NEGATIVE_SIGNAL_TOKENS.some((token) => key.toLowerCase().includes(token)) ? 'negative' : 'pre_call';
    if (!normalized[bucket].includes(key)) normalized[bucket].push(key);
  });

  return normalized;
};

export const normalizeLeadForResponse = (lead) => {
  if (!lead || typeof lead !== 'object') return lead;

  const finalStatus = String(lead.final_status || '').trim();
  const hasFinalStatus = finalStatus === 'Qualified' || finalStatus === 'Rejected';
  const currentStatus = String(lead.status || '').trim();
  const intentSignals = normalizeIntentSignalsPayload(lead.intent_signals ?? lead.signals);

  return {
    ...lead,
    ...(hasFinalStatus && (!currentStatus || currentStatus === 'Error') ? { status: finalStatus } : {}),
    ...(intentSignals ? { intent_signals: intentSignals } : {}),
  };
};

import { getRuntimeConfig } from './config.js';
import { logger } from './observability.js';

const MAX_BUCKETS = 10_000;
const buckets = new Map();
const loginAttempts = new Map();

const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

const warnedUpstashFailures = new Set();

const getBucketKey = (namespace, key) => `${namespace}:${key}`;
const normalizeEmailKey = (value) => String(value || '').toLowerCase().trim();

const getRateLimitRuntime = () => {
  const config = getRuntimeConfig();
  return config.rateLimit || {};
};

const isUpstashEnabled = () => {
  const rateLimit = getRateLimitRuntime();
  return rateLimit.backend === 'upstash' && Boolean(rateLimit.upstashRestUrl && rateLimit.upstashRestToken);
};

const warnUpstashFailureOnce = (scope, error) => {
  const key = String(scope || 'unknown');
  if (warnedUpstashFailures.has(key)) return;
  warnedUpstashFailures.add(key);
  logger.warn('upstash_rate_limit_fallback', {
    scope: key,
    message: error?.message || String(error || 'Unknown Upstash error'),
  });
};

const pruneExpired = (now) => {
  for (const [bucketKey, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(bucketKey);
    }
  }

  if (buckets.size > MAX_BUCKETS) {
    const overage = buckets.size - MAX_BUCKETS;
    let removed = 0;
    for (const key of buckets.keys()) {
      if (removed >= overage) break;
      buckets.delete(key);
      removed += 1;
    }
  }
};

setInterval(() => pruneExpired(Date.now()), 60 * 1000).unref?.();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts.entries()) {
    if (entry.windowStart + LOCKOUT_WINDOW_MS < now) {
      loginAttempts.delete(key);
    }
  }
}, 5 * 60 * 1000).unref?.();

const defaultKeyGenerator = (req) => req.ip || 'unknown';

const readUpstashPayload = async (response) => {
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error || `Upstash request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return payload?.result;
};

const runUpstashCommand = async (command, { scope = 'ratelimit' } = {}) => {
  const rateLimit = getRateLimitRuntime();
  const url = String(rateLimit.upstashRestUrl || '').replace(/\/$/, '');
  const token = String(rateLimit.upstashRestToken || '').trim();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  try {
    return await readUpstashPayload(response);
  } catch (error) {
    error.scope = scope;
    throw error;
  }
};

const runUpstashPipeline = async (commands, { scope = 'ratelimit' } = {}) => {
  const rateLimit = getRateLimitRuntime();
  const url = `${String(rateLimit.upstashRestUrl || '').replace(/\/$/, '')}/pipeline`;
  const token = String(rateLimit.upstashRestToken || '').trim();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload)) {
    const error = new Error(`Upstash pipeline failed (${response.status})`);
    error.scope = scope;
    throw error;
  }

  for (const item of payload) {
    if (item?.error) {
      const error = new Error(item.error);
      error.scope = scope;
      throw error;
    }
  }

  return payload.map((item) => item?.result);
};

const localRecordLoginFailure = (email) => {
  const key = normalizeEmailKey(email);
  if (!key) return;

  const now = Date.now();
  const existing = loginAttempts.get(key);

  if (!existing || existing.windowStart + LOCKOUT_WINDOW_MS < now) {
    loginAttempts.set(key, { count: 1, windowStart: now, lockedUntil: null });
    return;
  }

  existing.count += 1;
  if (existing.count >= LOCKOUT_MAX_ATTEMPTS) {
    existing.lockedUntil = now + LOCKOUT_WINDOW_MS;
  }
};

const localRecordLoginSuccess = (email) => {
  const key = normalizeEmailKey(email);
  loginAttempts.delete(key);
};

const localIsAccountLocked = (email) => {
  const key = normalizeEmailKey(email);
  if (!key) return false;

  const now = Date.now();
  const existing = loginAttempts.get(key);
  if (!existing?.lockedUntil) return false;

  if (existing.lockedUntil <= now) {
    loginAttempts.delete(key);
    return false;
  }

  return true;
};

const consumeLocalRateLimit = ({ namespace, key, windowMs, max }) => {
  const now = Date.now();
  pruneExpired(now);

  const bucketKey = getBucketKey(namespace, key);
  const current = buckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    const next = {
      count: 1,
      resetAt: now + windowMs,
    };

    buckets.set(bucketKey, next);

    return {
      count: next.count,
      remaining: Math.max(0, max - next.count),
      resetAt: next.resetAt,
      retryAfterSeconds: null,
    };
  }

  current.count += 1;

  return {
    count: current.count,
    remaining: Math.max(0, max - current.count),
    resetAt: current.resetAt,
    retryAfterSeconds: current.count > max
      ? Math.max(1, Math.ceil((current.resetAt - now) / 1000))
      : null,
  };
};

const consumeUpstashRateLimit = async ({ namespace, key, windowMs, max }) => {
  const bucketKey = getBucketKey(namespace, key);
  const scope = `bucket:${namespace}`;
  const now = Date.now();

  const countResult = Number(await runUpstashCommand(['INCR', bucketKey], { scope }));
  if (!Number.isFinite(countResult)) {
    throw new Error(`Invalid Upstash INCR result for ${bucketKey}`);
  }

  let ttlMs = null;

  if (countResult === 1) {
    await runUpstashCommand(['PEXPIRE', bucketKey, String(windowMs)], { scope });
    ttlMs = windowMs;
  } else {
    ttlMs = Number(await runUpstashCommand(['PTTL', bucketKey], { scope }));
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      await runUpstashCommand(['PEXPIRE', bucketKey, String(windowMs)], { scope });
      ttlMs = windowMs;
    }
  }

  return {
    count: countResult,
    remaining: Math.max(0, max - countResult),
    resetAt: now + ttlMs,
    retryAfterSeconds: countResult > max ? Math.max(1, Math.ceil(ttlMs / 1000)) : null,
  };
};

const consumeRateLimit = async ({ namespace, key, windowMs, max }) => {
  if (!isUpstashEnabled()) {
    return consumeLocalRateLimit({ namespace, key, windowMs, max });
  }

  try {
    return await consumeUpstashRateLimit({ namespace, key, windowMs, max });
  } catch (error) {
    warnUpstashFailureOnce(error?.scope || `bucket:${namespace}`, error);
    return consumeLocalRateLimit({ namespace, key, windowMs, max });
  }
};

const upstashLockKeys = (email) => {
  const key = normalizeEmailKey(email);
  return {
    attemptsKey: `lockout:attempts:${key}`,
    blockedKey: `lockout:blocked:${key}`,
  };
};

const upstashRecordLoginFailure = async (email) => {
  const key = normalizeEmailKey(email);
  if (!key) return;

  const { attemptsKey, blockedKey } = upstashLockKeys(key);
  const scope = 'lockout';

  const attempts = Number(await runUpstashCommand(['INCR', attemptsKey], { scope }));
  if (!Number.isFinite(attempts)) {
    throw new Error('Invalid Upstash attempts counter');
  }

  if (attempts === 1) {
    await runUpstashCommand(['PEXPIRE', attemptsKey, String(LOCKOUT_WINDOW_MS)], { scope });
  }

  if (attempts >= LOCKOUT_MAX_ATTEMPTS) {
    await runUpstashPipeline([
      ['SET', blockedKey, '1', 'PX', String(LOCKOUT_WINDOW_MS)],
      ['DEL', attemptsKey],
    ], { scope });
  }
};

const upstashRecordLoginSuccess = async (email) => {
  const key = normalizeEmailKey(email);
  if (!key) return;

  const { attemptsKey, blockedKey } = upstashLockKeys(key);
  await runUpstashPipeline([
    ['DEL', attemptsKey],
    ['DEL', blockedKey],
  ], { scope: 'lockout' });
};

const upstashIsAccountLocked = async (email) => {
  const key = normalizeEmailKey(email);
  if (!key) return false;

  const { blockedKey } = upstashLockKeys(key);
  const exists = Number(await runUpstashCommand(['EXISTS', blockedKey], { scope: 'lockout' }));
  return exists > 0;
};

export const recordLoginFailure = async (email) => {
  if (!isUpstashEnabled()) {
    localRecordLoginFailure(email);
    return;
  }

  try {
    await upstashRecordLoginFailure(email);
  } catch (error) {
    warnUpstashFailureOnce(error?.scope || 'lockout', error);
    localRecordLoginFailure(email);
  }
};

export const recordLoginSuccess = async (email) => {
  if (!isUpstashEnabled()) {
    localRecordLoginSuccess(email);
    return;
  }

  try {
    await upstashRecordLoginSuccess(email);
  } catch (error) {
    warnUpstashFailureOnce(error?.scope || 'lockout', error);
    localRecordLoginSuccess(email);
  }
};

export const isAccountLocked = async (email) => {
  if (!isUpstashEnabled()) {
    return localIsAccountLocked(email);
  }

  try {
    return await upstashIsAccountLocked(email);
  } catch (error) {
    warnUpstashFailureOnce(error?.scope || 'lockout', error);
    return localIsAccountLocked(email);
  }
};

export const createUserRateLimit = ({ namespace, windowMs, max, message = 'Rate limit exceeded' }) => (
  createRateLimit({
    namespace,
    windowMs,
    max,
    keyGenerator: (req) => req.user?.id || req.ip || 'anonymous',
    message,
  })
);

export const createRateLimit = ({
  namespace,
  windowMs,
  max,
  keyGenerator = defaultKeyGenerator,
  message = 'Too many requests',
}) => {
  if (!namespace) throw new Error('Rate limit namespace is required');

  return (req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const result = await consumeRateLimit({
          namespace,
          key: keyGenerator(req),
          windowMs,
          max,
        });

        res.setHeader('x-ratelimit-limit', String(max));
        res.setHeader('x-ratelimit-remaining', String(result.remaining));

        if (result.retryAfterSeconds) {
          res.setHeader('retry-after', String(result.retryAfterSeconds));
          return res.status(429).json({ message });
        }

        return next();
      })
      .catch(next);
  };
};

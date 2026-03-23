// NOTE: This rate limiter is in-process only.
// In a multi-instance or serverless (Vercel) environment, each instance has
// its own counter. For distributed rate limiting, replace with a Redis-backed
// store (e.g. @upstash/ratelimit). This implementation is acceptable for
// single-instance / moderate traffic scenarios.
const MAX_BUCKETS = 10_000;
const buckets = new Map();

const getBucketKey = (namespace, key) => `${namespace}:${key}`;

const pruneExpired = (now) => {
  for (const [bucketKey, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(bucketKey);
    }
  }
  // Hard cap: if still over limit, evict oldest entries
  if (buckets.size > MAX_BUCKETS) {
    const overage = buckets.size - MAX_BUCKETS;
    let removed = 0;
    for (const key of buckets.keys()) {
      if (removed >= overage) break;
      buckets.delete(key);
      removed++;
    }
  }
};

// Cleanup every minute instead of 5 minutes to keep memory tighter
setInterval(() => pruneExpired(Date.now()), 60 * 1000).unref?.();

// Account lockout: tracks failed login attempts per email
const loginAttempts = new Map();
const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export const recordLoginFailure = (email) => {
  const key = String(email || '').toLowerCase().trim();
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

export const recordLoginSuccess = (email) => {
  const key = String(email || '').toLowerCase().trim();
  loginAttempts.delete(key);
};

export const isAccountLocked = (email) => {
  const key = String(email || '').toLowerCase().trim();
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

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts.entries()) {
    if (entry.windowStart + LOCKOUT_WINDOW_MS < now) loginAttempts.delete(key);
  }
}, 5 * 60 * 1000).unref?.();

const defaultKeyGenerator = (req) => req.ip || 'unknown';

// Per-user rate limiter for expensive LLM operations
export const createUserRateLimit = ({ namespace, windowMs, max, message = 'Rate limit exceeded' }) => {
  const limiter = createRateLimit({
    namespace,
    windowMs,
    max,
    keyGenerator: (req) => req.user?.id || req.ip || 'anonymous',
    message,
  });
  return limiter;
};

export const createRateLimit = ({
  namespace,
  windowMs,
  max,
  keyGenerator = defaultKeyGenerator,
  message = 'Too many requests',
}) => {
  if (!namespace) throw new Error('Rate limit namespace is required');

  return (req, res, next) => {
    const now = Date.now();
    pruneExpired(now);

    const key = getBucketKey(namespace, keyGenerator(req));
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });

      res.setHeader('x-ratelimit-limit', String(max));
      res.setHeader('x-ratelimit-remaining', String(max - 1));
      return next();
    }

    current.count += 1;

    const remaining = Math.max(0, max - current.count);
    res.setHeader('x-ratelimit-limit', String(max));
    res.setHeader('x-ratelimit-remaining', String(remaining));

    if (current.count > max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('retry-after', String(retryAfter));
      return res.status(429).json({ message });
    }

    return next();
  };
};

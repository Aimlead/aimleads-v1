import { getRuntimeConfig } from './config.js';

export const getCookieOptions = (overrides = {}) => {
  const config = getRuntimeConfig();

  return {
    httpOnly: true,
    sameSite: config.isProduction ? 'strict' : 'lax',
    secure: config.isProduction,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: '/',
    ...overrides,
  };
};

export const getClearCookieOptions = (overrides = {}) => {
  const { maxAge: _maxAge, ...options } = getCookieOptions(overrides);
  return options;
};

const originMatchesPattern = (origin, pattern) => {
  if (!pattern.includes('*')) return origin === pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`).test(origin);
};

export const getCorsOptions = () => {
  const config = getRuntimeConfig();
  const whitelist = config.corsOrigin
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    origin: (origin, callback) => {
      // No origin header = server-to-server or same-origin (non-browser) request
      if (!origin) {
        callback(null, !config.isProduction);
        return;
      }

      // Auto-allow the deployment's own origin (VERCEL_URL is set automatically by Vercel)
      if (process.env.VERCEL_URL && origin === `https://${process.env.VERCEL_URL}`) {
        callback(null, true);
        return;
      }

      // Allow origins matching the configured whitelist (supports wildcards)
      if (whitelist.length > 0 && whitelist.some((pattern) => originMatchesPattern(origin, pattern))) {
        callback(null, true);
        return;
      }

      // In development with no whitelist, allow all
      if (whitelist.length === 0 && !config.isProduction) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  };
};

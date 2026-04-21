import crypto from 'node:crypto';
import { getRuntimeConfig } from './config.js';

export const CSRF_COOKIE_NAME = 'aimleads_csrf';

export const createCsrfToken = () => crypto.randomBytes(24).toString('base64url');

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

const getCsrfCookieOptions = (overrides = {}) => {
  const config = getRuntimeConfig();

  return {
    httpOnly: false,
    sameSite: config.isProduction ? 'strict' : 'lax',
    secure: config.isProduction,
    maxAge: 1000 * 60 * 60 * 8,
    path: '/',
    ...overrides,
  };
};

const getClearCsrfCookieOptions = (overrides = {}) => {
  const { maxAge: _maxAge, ...options } = getCsrfCookieOptions(overrides);
  return options;
};

export const setCsrfCookie = (res, token = createCsrfToken()) => {
  res.cookie(CSRF_COOKIE_NAME, token, getCsrfCookieOptions());
  return token;
};

export const clearCsrfCookie = (res) => {
  res.clearCookie(CSRF_COOKIE_NAME, getClearCsrfCookieOptions());
};

const originMatchesPattern = (origin, pattern) => {
  if (!pattern.includes('*')) return origin === pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`).test(origin);
};

const toOrigin = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
};

export const getTrustedOriginPatterns = (config = getRuntimeConfig()) => {
  const whitelist = String(config?.corsOrigin || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);


  return [...new Set(whitelist)];
};

export const isTrustedOrigin = (origin, config = getRuntimeConfig()) => {
  const normalizedOrigin = toOrigin(origin);
  if (!normalizedOrigin) return false;

  const patterns = getTrustedOriginPatterns(config);
  if (!config?.isProduction && patterns.length === 0) {
    return true;
  }

  return patterns.some((pattern) => originMatchesPattern(normalizedOrigin, pattern));
};

export const getCorsOptions = () => {
  const config = getRuntimeConfig();
  const whitelist = getTrustedOriginPatterns(config);

  return {
    origin: (origin, callback) => {
      // No origin header = server-to-server or same-origin (non-browser) request
      if (!origin) {
        callback(null, !config.isProduction);
        return;
      }

      // Allow origins matching the configured whitelist (supports wildcards)
      if (isTrustedOrigin(origin, config)) {
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

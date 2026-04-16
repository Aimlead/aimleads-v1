import crypto from 'node:crypto';
import { SESSION_COOKIE_NAME, verifyToken } from './auth.js';
import { dataStore } from './dataStore.js';
import { getRuntimeConfig, getSessionSecret, isAuthProviderSupabase } from './config.js';
import { CSRF_COOKIE_NAME, isTrustedOrigin, setCsrfCookie } from './http.js';
import { resolveSupabaseSessionFromRequest } from './supabaseAuth.js';
import { attachWorkspaceMembershipContext, ensureWorkspaceUserForAuth } from './workspaceUser.js';
import { isFeatureFlagEnabled } from './featureFlags.js';
import { getUserWorkspaceId } from './scope.js';

const HTTP_METHODS = ['use', 'get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all'];

const wrapHandler = (handler) => {
  if (typeof handler !== 'function') return handler;
  if (handler.length === 4) return handler;

  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};

export const wrapAsyncRoutes = (router) => {
  if (!router || router.__aimleadsAsyncWrapped) return router;

  for (const method of HTTP_METHODS) {
    const original = router[method];
    if (typeof original !== 'function') continue;

    router[method] = function wrappedRouteMethod(...args) {
      const wrappedArgs = args.map(wrapHandler);
      return original.apply(this, wrappedArgs);
    };
  }

  Object.defineProperty(router, '__aimleadsAsyncWrapped', {
    value: true,
    enumerable: false,
    configurable: false,
  });

  return router;
};

const optionalAuthLegacy = async (req, _res) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }

  const payload = verifyToken(token, getSessionSecret());
  if (!payload?.sub) {
    return null;
  }

  const user = await dataStore.findUserById(payload.sub);
  return user ? attachWorkspaceMembershipContext(user) : null;
};

const optionalAuthSupabase = async (req, res) => {
  const { authUser } = await resolveSupabaseSessionFromRequest(req, res);
  if (!authUser?.id) {
    return null;
  }

  const user = await ensureWorkspaceUserForAuth({ authUser });
  return user || null;
};

export async function optionalAuth(req, res, next) {
  try {
    const user = isAuthProviderSupabase()
      ? await optionalAuthSupabase(req, res)
      : await optionalAuthLegacy(req, res);

    req.user = user || null;
    return next();
  } catch (error) {
    return next(error);
  }
}

const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const toOrigin = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
};

const tokensMatch = (left, right) => {
  const a = String(left || '').trim();
  const b = String(right || '').trim();
  if (!a || !b) return false;

  const leftBuffer = Buffer.from(a);
  const rightBuffer = Buffer.from(b);
  if (leftBuffer.length !== rightBuffer.length) return false;

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export function ensureCsrfCookie(req, res, next) {
  const existing = String(req.cookies?.[CSRF_COOKIE_NAME] || '').trim();
  const token = existing || setCsrfCookie(res);
  req.csrfToken = token;
  return next();
}

export const isTrustedMutationRequest = (req, config = getRuntimeConfig()) => {
  if (CSRF_SAFE_METHODS.has(req.method)) return true;

  const requested = String(req.headers['x-requested-with'] || '').trim().toLowerCase();
  const requestOrigin = toOrigin(req.headers.origin) || toOrigin(req.headers.referer);
  const csrfCookie = String(req.cookies?.[CSRF_COOKIE_NAME] || '').trim();
  const csrfHeader = String(req.headers['x-csrf-token'] || '').trim();
  const hasValidCsrfToken = tokensMatch(csrfCookie, csrfHeader);

  if (!config.isProduction && process.env.NODE_ENV === 'test') {
    return requested === 'xmlhttprequest' || Boolean(requestOrigin);
  }

  if (!hasValidCsrfToken) {
    return false;
  }

  if (!config.isProduction) {
    return requested === 'xmlhttprequest' || Boolean(requestOrigin);
  }

  return Boolean(requestOrigin && isTrustedOrigin(requestOrigin, config));
};

export function csrfProtection(req, res, next) {
  if (isTrustedMutationRequest(req)) return next();
  return res.status(403).json({ message: 'Forbidden: invalid CSRF token or untrusted request origin' });
}

export async function requireAuth(req, res, next) {
  try {
    await optionalAuth(req, res, async () => {
      if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      return next();
    });
  } catch (error) {
    return next(error);
  }
}

export const requireFeatureFlag = (flagName) => async (req, res, next) => {
  try {
    const workspaceId = getUserWorkspaceId(req.user);
    const enabled = await isFeatureFlagEnabled(workspaceId, flagName);
    if (!enabled) {
      return res.status(403).json({
        message: `Feature flag "${flagName}" is disabled for this workspace.`,
        code: 'FEATURE_FLAG_DISABLED',
        flag_name: flagName,
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

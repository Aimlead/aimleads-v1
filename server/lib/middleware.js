import { SESSION_COOKIE_NAME, verifyToken } from './auth.js';
import { dataStore } from './dataStore.js';
import { getSessionSecret, isAuthProviderSupabase } from './config.js';
import { resolveSupabaseSessionFromRequest } from './supabaseAuth.js';
import { ensureWorkspaceUserForAuth } from './workspaceUser.js';

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
  return user || null;
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

export function csrfProtection(req, res, next) {
  if (CSRF_SAFE_METHODS.has(req.method)) return next();
  const requested = req.headers['x-requested-with'];
  if (requested && requested.toLowerCase() === 'xmlhttprequest') return next();
  return res.status(403).json({ message: 'Forbidden: missing CSRF header' });
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
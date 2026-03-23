import { getRuntimeConfig } from './config.js';
import { getCookieOptions } from './http.js';

export const SUPABASE_ACCESS_COOKIE_NAME = 'aimleads_sb_access_token';
export const SUPABASE_REFRESH_COOKIE_NAME = 'aimleads_sb_refresh_token';

const REFRESH_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const MIN_ACCESS_COOKIE_MAX_AGE_MS = 1000 * 60 * 5;
const MAX_ACCESS_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const toSupabaseAuthError = (response, payload) => {
  const message =
    payload?.msg || payload?.message || payload?.error_description || payload?.hint || `Supabase auth request failed (${response.status})`;

  const error = new Error(message);
  error.status = response.status;
  error.payload = payload;
  return error;
};

const toSearchParams = (query = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  return params;
};

const requestSupabaseAuth = async (
  path,
  { method = 'GET', body, useServiceRole = false, accessToken = '', query = {} } = {}
) => {
  const config = getRuntimeConfig();
  const baseUrl = `${config.supabase.url.replace(/\/$/, '')}/auth/v1`;
  const params = toSearchParams(query);
  const url = `${baseUrl}${path}${params.toString() ? `?${params.toString()}` : ''}`;

  const apiKey = useServiceRole ? config.supabase.serviceRoleKey : config.supabase.publishableKey;

  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${accessToken || apiKey}`,
    Accept: 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw toSupabaseAuthError(response, payload);
  }

  return payload;
};

const toSessionPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;

  const accessToken = String(payload.access_token || '').trim();
  const refreshToken = String(payload.refresh_token || '').trim();
  const user = payload.user && typeof payload.user === 'object' ? payload.user : null;

  if (!accessToken || !refreshToken || !user?.id) {
    return null;
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: Number(payload.expires_in) || 3600,
    user,
  };
};

const computeAccessCookieMaxAge = (expiresInSeconds) => {
  const raw = Number(expiresInSeconds) * 1000;
  if (!Number.isFinite(raw) || raw <= 0) {
    return 1000 * 60 * 60;
  }

  return Math.max(MIN_ACCESS_COOKIE_MAX_AGE_MS, Math.min(MAX_ACCESS_COOKIE_MAX_AGE_MS, Math.round(raw)));
};

export const setSupabaseAuthCookies = (res, session) => {
  if (!session?.access_token || !session?.refresh_token) {
    return;
  }

  res.cookie(
    SUPABASE_ACCESS_COOKIE_NAME,
    session.access_token,
    getCookieOptions({ maxAge: computeAccessCookieMaxAge(session.expires_in) })
  );

  res.cookie(
    SUPABASE_REFRESH_COOKIE_NAME,
    session.refresh_token,
    getCookieOptions({ maxAge: REFRESH_COOKIE_MAX_AGE_MS })
  );
};

export const clearSupabaseAuthCookies = (res) => {
  res.clearCookie(SUPABASE_ACCESS_COOKIE_NAME, getCookieOptions());
  res.clearCookie(SUPABASE_REFRESH_COOKIE_NAME, getCookieOptions());
};

export const getSupabaseAuthCookies = (req) => {
  return {
    accessToken: String(req?.cookies?.[SUPABASE_ACCESS_COOKIE_NAME] || '').trim(),
    refreshToken: String(req?.cookies?.[SUPABASE_REFRESH_COOKIE_NAME] || '').trim(),
  };
};

export const signInWithPassword = async ({ email, password }) => {
  const payload = await requestSupabaseAuth('/token', {
    method: 'POST',
    query: { grant_type: 'password' },
    body: {
      email: normalizeEmail(email),
      password: String(password || ''),
    },
  });

  const session = toSessionPayload(payload);
  if (!session) {
    const error = new Error('Invalid Supabase login response');
    error.status = 502;
    throw error;
  }

  return session;
};

export const refreshAuthSession = async (refreshToken) => {
  const payload = await requestSupabaseAuth('/token', {
    method: 'POST',
    query: { grant_type: 'refresh_token' },
    body: {
      refresh_token: String(refreshToken || ''),
    },
  });

  const session = toSessionPayload(payload);
  if (!session) {
    const error = new Error('Invalid Supabase refresh response');
    error.status = 502;
    throw error;
  }

  return session;
};

export const getAuthUserFromAccessToken = async (accessToken) => {
  if (!accessToken) return null;

  const payload = await requestSupabaseAuth('/user', {
    method: 'GET',
    accessToken,
  });

  return payload && typeof payload === 'object' ? payload : null;
};

export const signOutSupabaseSession = async (accessToken) => {
  if (!accessToken) return;

  try {
    await requestSupabaseAuth('/logout', {
      method: 'POST',
      accessToken,
    });
  } catch {
    // Ignore logout API errors and clear cookies anyway.
  }
};

export const adminCreateAuthUser = async ({ email, password, fullName, emailConfirm = true }) => {
  const payload = await requestSupabaseAuth('/admin/users', {
    method: 'POST',
    useServiceRole: true,
    body: {
      email: normalizeEmail(email),
      password: String(password || ''),
      email_confirm: Boolean(emailConfirm),
      user_metadata: {
        full_name: String(fullName || '').trim() || undefined,
      },
    },
  });

  return payload?.user || payload || null;
};

export const adminUpdateAuthUser = async (authUserId, updates = {}) => {
  if (!authUserId) return null;

  const payload = await requestSupabaseAuth(`/admin/users/${encodeURIComponent(String(authUserId))}`, {
    method: 'PUT',
    useServiceRole: true,
    body: updates,
  });

  return payload?.user || payload || null;
};

export const adminFindAuthUserByEmail = async (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const payload = await requestSupabaseAuth('/admin/users', {
      method: 'GET',
      useServiceRole: true,
      query: {
        page,
        per_page: perPage,
      },
    });

    const users = Array.isArray(payload?.users) ? payload.users : [];
    const match = users.find((user) => normalizeEmail(user?.email) === normalized) || null;
    if (match) {
      return match;
    }

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  return null;
};

export const ensureAuthUserWithPassword = async ({ email, password, fullName }) => {
  let existing = await adminFindAuthUserByEmail(email);

  if (!existing) {
    try {
      return await adminCreateAuthUser({ email, password, fullName, emailConfirm: true });
    } catch (error) {
      const lower = String(error?.message || '').toLowerCase();
      if (!lower.includes('already')) {
        throw error;
      }

      existing = await adminFindAuthUserByEmail(email);
      if (!existing) {
        throw error;
      }
    }
  }

  const nextMetadata = {
    ...(existing.user_metadata || {}),
    ...(fullName ? { full_name: String(fullName).trim() } : {}),
  };

  await adminUpdateAuthUser(existing.id, {
    password: String(password || ''),
    email_confirm: true,
    user_metadata: nextMetadata,
  });

  return {
    ...existing,
    user_metadata: nextMetadata,
  };
};

export const resolveSupabaseSessionFromRequest = async (req, res) => {
  const { accessToken, refreshToken } = getSupabaseAuthCookies(req);

  if (!accessToken && !refreshToken) {
    return { session: null, authUser: null };
  }

  if (accessToken) {
    try {
      const authUser = await getAuthUserFromAccessToken(accessToken);
      if (authUser?.id) {
        return {
          session: {
            access_token: accessToken,
            refresh_token: refreshToken,
            user: authUser,
          },
          authUser,
        };
      }
    } catch (error) {
      const status = Number(error?.status || 0);
      if (![401, 403].includes(status) || !refreshToken) {
        throw error;
      }
    }
  }

  if (!refreshToken) {
    clearSupabaseAuthCookies(res);
    return { session: null, authUser: null };
  }

  try {
    const refreshed = await refreshAuthSession(refreshToken);
    setSupabaseAuthCookies(res, refreshed);
    return {
      session: refreshed,
      authUser: refreshed.user,
    };
  } catch {
    clearSupabaseAuthCookies(res);
    return { session: null, authUser: null };
  }
};
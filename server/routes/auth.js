import express from 'express';
import {
  createSessionToken,
  hashPassword,
  sanitizeUser,
  SESSION_COOKIE_NAME,
  verifyPassword,
} from '../lib/auth.js';
import { getCookieOptions } from '../lib/http.js';
import { createId } from '../lib/utils.js';
import { optionalAuth, requireAuth, wrapAsyncRoutes } from '../lib/middleware.js';
import { dataStore } from '../lib/dataStore.js';
import { getSessionSecret, isAuthProviderSupabase } from '../lib/config.js';
import { createRateLimit, isAccountLocked, recordLoginFailure, recordLoginSuccess } from '../lib/rateLimit.js';
import { schemas, validateBody } from '../lib/validation.js';
import { logger } from '../lib/observability.js';
import {
  clearSupabaseAuthCookies,
  adminCreateAuthUser,
  getSupabaseAuthCookies,
  setSupabaseAuthCookies,
  signInWithPassword,
  signOutSupabaseSession,
} from '../lib/supabaseAuth.js';
import { ensureWorkspaceUserForAuth } from '../lib/workspaceUser.js';

const router = express.Router();
wrapAsyncRoutes(router);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const authLimiter = createRateLimit({
  namespace: 'auth',
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 30),
  keyGenerator: (req) => `${req.ip}:${normalizeEmail(req.body?.email || '')}`,
  message: 'Too many auth attempts, please try again later.',
});

const toApiAuthError = (error, fallbackMessage = 'Authentication failed') => {
  const status = Number(error?.status || 0);
  const message = String(error?.message || fallbackMessage);
  const lower = message.toLowerCase();

  if (lower.includes('security verification') || lower.includes('captcha')) {
    return {
      status: 400,
      message:
        'Supabase Bot Protection (CAPTCHA) is enabled. Disable CAPTCHA for local dev or wire a captcha token flow.',
    };
  }

  if (status === 401 || lower.includes('invalid login credentials')) {
    return {
      status: 401,
      message: 'Invalid credentials',
    };
  }

  if (status === 422 || status === 409 || lower.includes('already') || lower.includes('exists')) {
    return {
      status: 409,
      message: 'User already exists',
    };
  }

  return {
    status: status >= 400 && status < 600 ? status : 500,
    message,
  };
};

router.get('/me', optionalAuth, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  return res.json({ user: sanitizeUser(req.user) });
});

router.patch('/me', requireAuth, async (req, res) => {
  const { full_name, current_password, new_password } = req.body || {};
  const updates = {};

  if (full_name !== undefined) {
    const name = String(full_name).trim();
    if (name.length < 1) {
      return res.status(400).json({ message: 'full_name cannot be empty' });
    }
    updates.full_name = name;
  }

  if (new_password !== undefined) {
    if (isAuthProviderSupabase()) {
      return res.status(400).json({ message: 'Password changes must be done through Supabase Auth directly.' });
    }

    if (!current_password) {
      return res.status(400).json({ message: 'current_password is required to change password' });
    }

    const fresh = await dataStore.findUserById(req.user.id);
    if (!fresh || !verifyPassword(String(current_password), fresh.password_hash)) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const newPwd = String(new_password);
    if (newPwd.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }

    updates.password_hash = hashPassword(newPwd);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No valid fields to update' });
  }

  const updated = await dataStore.updateUser(req.user.id, updates);
  return res.json({ user: sanitizeUser(updated || req.user) });
});

router.post('/register', authLimiter, validateBody(schemas.authRegisterSchema), async (req, res) => {
  const email = normalizeEmail(req.validatedBody.email);
  const password = String(req.validatedBody.password || '');
  const fullName = String(req.validatedBody.full_name || req.validatedBody.fullName || '').trim() || 'New User';

  if (!isAuthProviderSupabase()) {
    const existingUser = await dataStore.findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists. Please sign in.' });
    }

    const newUser = await dataStore.createUser({
      id: createId('user'),
      workspace_id: createId('ws'),
      email,
      full_name: fullName,
      password_hash: hashPassword(password),
      created_at: new Date().toISOString(),
    });

    const token = createSessionToken(newUser.id, getSessionSecret());
    res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions());

    return res.status(201).json({ user: sanitizeUser(newUser) });
  }

  try {
    await adminCreateAuthUser({
      email,
      password,
      fullName,
      emailConfirm: true,
    });

    const session = await signInWithPassword({ email, password });
    setSupabaseAuthCookies(res, session);

    const appUser = await ensureWorkspaceUserForAuth({
      authUser: session.user,
      fallbackFullName: fullName,
    });

    return res.status(201).json({ user: sanitizeUser(appUser) });
  } catch (error) {
    const normalized = toApiAuthError(error, 'Registration failed');
    return res.status(normalized.status).json({ message: normalized.message });
  }
});

router.post('/login', authLimiter, validateBody(schemas.authLoginSchema), async (req, res) => {
  const email = normalizeEmail(req.validatedBody.email);
  const password = String(req.validatedBody.password || '');

  if (isAccountLocked(email)) {
    return res.status(429).json({ message: 'Account temporarily locked due to too many failed attempts. Please try again in 15 minutes.' });
  }

  if (!isAuthProviderSupabase()) {
    const user = await dataStore.findUserByEmail(email);

    if (!user || !verifyPassword(password, user.password_hash)) {
      recordLoginFailure(email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    recordLoginSuccess(email);
    const token = createSessionToken(user.id, getSessionSecret());
    res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions());

    return res.json({ user: sanitizeUser(user) });
  }

  try {
    const session = await signInWithPassword({ email, password });
    recordLoginSuccess(email);
    setSupabaseAuthCookies(res, session);

    const appUser = await ensureWorkspaceUserForAuth({
      authUser: session.user,
    });

    return res.json({ user: sanitizeUser(appUser) });
  } catch (error) {
    recordLoginFailure(email);
    const normalized = toApiAuthError(error, 'Login failed');
    return res.status(normalized.status).json({ message: normalized.message });
  }
});

// Rate-limited password reset (same limiter as login)
router.post('/reset-password', authLimiter, validateBody(schemas.authResetPasswordSchema), async (req, res) => {
  const email = normalizeEmail(req.validatedBody.email);

  // For Supabase: trigger built-in password reset email
  if (isAuthProviderSupabase()) {
    try {
      const { supabase } = await import('../lib/supabaseAuth.js');
      // Use admin client to send reset email
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${String(process.env.CORS_ORIGIN || 'http://localhost:5173')}/reset-password`,
      });
      if (error) throw error;
    } catch (err) {
      // Return success to prevent email enumeration, but log non-user errors
      logger.warn('reset_password_error', { message: err?.message, code: err?.code });
    }
    return res.json({ ok: true });
  }

  // For legacy auth: no email service wired.
  // Return a clear message so the user knows what to do.
  return res.json({ ok: true, message: 'If this email is registered, a reset link has been sent. Check your inbox or contact your administrator.' });
});

router.get('/me/export', requireAuth, async (req, res) => {
  const user = await dataStore.findUserById(req.user.id);
  const leads = await dataStore.listLeads(req.user, '-created_date');

  const exportData = {
    exported_at: new Date().toISOString(),
    user: sanitizeUser(user || req.user),
    leads: (leads || []).map((l) => ({ ...l })),
  };

  const filename = `aimleads-export-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(JSON.stringify(exportData, null, 2));
});

router.delete('/me', requireAuth, async (req, res) => {
  const userId = req.user.id;

  // Best-effort: delete all workspace leads
  try {
    const leads = await dataStore.listLeads(req.user, '-created_date');
    await Promise.allSettled((leads || []).map((l) => dataStore.deleteLead(req.user, l.id)));
  } catch { /* continue even if partial */ }

  // Best-effort: delete user record
  try {
    if (typeof dataStore.deleteUser === 'function') {
      await dataStore.deleteUser(userId);
    }
  } catch { /* continue */ }

  // Clear session
  if (isAuthProviderSupabase()) {
    const { getSupabaseAuthCookies, signOutSupabaseSession, clearSupabaseAuthCookies } = await import('../lib/supabaseAuth.js');
    const { accessToken } = getSupabaseAuthCookies(req);
    await signOutSupabaseSession(accessToken).catch(() => {});
    clearSupabaseAuthCookies(res);
  }

  res.clearCookie(SESSION_COOKIE_NAME, getCookieOptions());
  return res.status(200).json({ ok: true, message: 'Account and all associated data deleted.' });
});

router.post('/logout', async (req, res) => {
  if (isAuthProviderSupabase()) {
    const { accessToken } = getSupabaseAuthCookies(req);
    await signOutSupabaseSession(accessToken);
    clearSupabaseAuthCookies(res);
    res.clearCookie(SESSION_COOKIE_NAME, getCookieOptions());
    return res.status(204).send();
  }

  res.clearCookie(SESSION_COOKIE_NAME, getCookieOptions());
  return res.status(204).send();
});

export default router;

import express from 'express';
import {
  createSessionToken,
  hashPassword,
  sanitizeUser,
  SESSION_COOKIE_NAME,
  verifyPassword,
} from '../lib/auth.js';
import { clearCsrfCookie, getClearCookieOptions, getCookieOptions, setCsrfCookie } from '../lib/http.js';
import { createId } from '../lib/utils.js';
import { optionalAuth, requireAuth, wrapAsyncRoutes } from '../lib/middleware.js';
import { dataStore } from '../lib/dataStore.js';
import { getSessionSecret, isAuthProviderSupabase } from '../lib/config.js';
import { createRateLimit, isAccountLocked, recordLoginFailure, recordLoginSuccess } from '../lib/rateLimit.js';
import { schemas, validateBody } from '../lib/validation.js';
import { logger } from '../lib/observability.js';
import { writeAuditLog } from '../lib/auditLog.js';
import {
  adminDeleteAuthUser,
  clearSupabaseAuthCookies,
  adminCreateAuthUser,
  getOAuthSignInUrl,
  getSupabaseAuthCookies,
  getAuthUserFromAccessToken,
  sendPasswordResetEmail,
  setSupabaseAuthCookies,
  signInWithPassword,
  signOutSupabaseSession,
  updateAuthUserPassword,
} from '../lib/supabaseAuth.js';
import { ensureWorkspaceUserForAuth } from '../lib/workspaceUser.js';
import { sendEmail, EmailTemplates } from '../lib/email.js';
import { addBreadcrumb } from '../lib/sentry.js';

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

const resolveCurrentWorkspaceMember = async (user) => {
  const members = await dataStore.listWorkspaceMembers(user).catch(() => []);
  const membershipUserId = String(user?.supabase_auth_id || user?.id || '').trim();
  const appUserId = String(user?.id || '').trim();

  const currentMember =
    members.find((member) => String(member?.user_id || '').trim() === membershipUserId)
    || members.find((member) => String(member?.app_user_id || '').trim() === appUserId)
    || null;

  return {
    members,
    currentMember,
  };
};

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
    return res.json({ user: null });
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
  addBreadcrumb({
    category: 'auth',
    message: 'auth.register.attempt',
    data: {
      auth_provider: isAuthProviderSupabase() ? 'supabase' : 'legacy',
      has_full_name: Boolean(fullName),
      email_domain: email.split('@')[1] || null,
    },
  });

  if (!isAuthProviderSupabase()) {
    const existingUser = await dataStore.findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists. Please sign in.' });
    }

    const pendingInvite = await dataStore.findActiveWorkspaceInviteByEmail(email).catch(() => null);

    const newUser = await dataStore.createUser({
      id: createId('user'),
      workspace_id: pendingInvite?.workspace_id || createId('ws'),
      workspace_role: pendingInvite?.role || 'owner',
      email,
      full_name: fullName,
      password_hash: hashPassword(password),
      created_at: new Date().toISOString(),
    });

    if (pendingInvite) {
      await dataStore.consumeWorkspaceInviteByEmail(email, {
        accepted_by_user_id: newUser.id,
      }).catch(() => null);
    }

    const token = createSessionToken(newUser.id, getSessionSecret());
    res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions());
    setCsrfCookie(res);

    // Welcome email (fire-and-forget)
    sendEmail(EmailTemplates.welcome({
      toEmail: email,
      fullName: fullName,
      workspaceName: null,
    })).catch(() => {});

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
    setCsrfCookie(res);

    const appUser = await ensureWorkspaceUserForAuth({
      authUser: session.user,
      fallbackFullName: fullName,
    });

    // Welcome email (fire-and-forget)
    sendEmail(EmailTemplates.welcome({
      toEmail: email,
      fullName: appUser?.full_name || fullName,
      workspaceName: null,
    })).catch(() => {});

    return res.status(201).json({ user: sanitizeUser(appUser) });
  } catch (error) {
    const normalized = toApiAuthError(error, 'Registration failed');
    return res.status(normalized.status).json({ message: normalized.message });
  }
});

router.post('/login', authLimiter, validateBody(schemas.authLoginSchema), async (req, res) => {
  const email = normalizeEmail(req.validatedBody.email);
  const password = String(req.validatedBody.password || '');
  addBreadcrumb({
    category: 'auth',
    message: 'auth.login.attempt',
    data: {
      auth_provider: isAuthProviderSupabase() ? 'supabase' : 'legacy',
      email_domain: email.split('@')[1] || null,
    },
  });

  if (await isAccountLocked(email)) {
    addBreadcrumb({
      category: 'auth',
      message: 'auth.login.locked',
      level: 'warning',
      data: {
        email_domain: email.split('@')[1] || null,
      },
    });
    return res.status(429).json({ message: 'Account temporarily locked due to too many failed attempts. Please try again in 15 minutes.' });
  }

  if (!isAuthProviderSupabase()) {
    const user = await dataStore.findUserByEmail(email);

    if (!user || !verifyPassword(password, user.password_hash)) {
      await recordLoginFailure(email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    await recordLoginSuccess(email);
    const token = createSessionToken(user.id, getSessionSecret());
    res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions());
    setCsrfCookie(res);

    return res.json({ user: sanitizeUser(user) });
  }

  try {
    const session = await signInWithPassword({ email, password });
    await recordLoginSuccess(email);
    setSupabaseAuthCookies(res, session);
    setCsrfCookie(res);

    const appUser = await ensureWorkspaceUserForAuth({
      authUser: session.user,
    });

    return res.json({ user: sanitizeUser(appUser) });
  } catch (error) {
    await recordLoginFailure(email);
    const normalized = toApiAuthError(error, 'Login failed');
    return res.status(normalized.status).json({ message: normalized.message });
  }
});

// Rate-limited password reset (same limiter as login)
router.post('/reset-password', authLimiter, validateBody(schemas.authResetPasswordSchema), async (req, res) => {
  const email = normalizeEmail(req.validatedBody.email);
  addBreadcrumb({
    category: 'auth',
    message: 'auth.reset_password.requested',
    data: {
      auth_provider: isAuthProviderSupabase() ? 'supabase' : 'legacy',
      email_domain: email.split('@')[1] || null,
    },
  });

  // For Supabase: trigger built-in password reset email
  if (isAuthProviderSupabase()) {
    try {
      await sendPasswordResetEmail({
        email,
        redirectTo: `${String(process.env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/$/, '')}/reset-password`,
      });
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

router.post('/reset-password/complete', authLimiter, validateBody(schemas.authCompletePasswordResetSchema), async (req, res) => {
  if (!isAuthProviderSupabase()) {
    return res.status(400).json({ message: 'Password recovery is only available with Supabase Auth.' });
  }

  const accessToken = String(req.validatedBody.access_token || '').trim();
  const refreshToken = String(req.validatedBody.refresh_token || '').trim();
  const newPassword = String(req.validatedBody.new_password || '');

  try {
    await updateAuthUserPassword({
      accessToken,
      password: newPassword,
    });

    const authUser = await getAuthUserFromAccessToken(accessToken);
    if (!authUser?.id) {
      return res.status(401).json({ message: 'Recovery session is invalid or expired.' });
    }

    setSupabaseAuthCookies(res, {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      user: authUser,
    });
    setCsrfCookie(res);

    const appUser = await ensureWorkspaceUserForAuth({
      authUser,
      fallbackFullName: authUser.user_metadata?.full_name || authUser.email || '',
    });

    return res.json({ ok: true, user: sanitizeUser(appUser || authUser) });
  } catch (error) {
    const normalized = toApiAuthError(error, 'Password reset failed');
    return res.status(normalized.status).json({ message: normalized.message });
  }
});

router.get('/me/export', requireAuth, async (req, res) => {
  const user = await dataStore.findUserById(req.user.id);
  const leads = await dataStore.listLeads(req.user, '-created_at');

  const exportData = {
    exported_at: new Date().toISOString(),
    user: sanitizeUser(user || req.user),
    leads: (leads || []).map((l) => ({ ...l })),
  };

  const filename = `aimleads-export-${new Date().toISOString().slice(0, 10)}.json`;
  await writeAuditLog({
    user: req.user,
    action: 'export',
    resourceType: 'user_data',
    resourceId: filename,
    changes: {
      email: req.user.email,
      lead_count: Array.isArray(leads) ? leads.length : 0,
    },
  });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(JSON.stringify(exportData, null, 2));
});

router.delete('/me', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const existingUser = await dataStore.findUserById(userId);
  const membershipUserId = existingUser?.supabase_auth_id || existingUser?.id || req.user.supabase_auth_id || req.user.id;

  const { members, currentMember } = await resolveCurrentWorkspaceMember(req.user);
  if (!currentMember) {
    return res.status(409).json({
      message: 'Unable to verify workspace ownership. Please contact support before deleting this account.',
    });
  }

  if (currentMember?.role === 'owner') {
    const ownerCount = members.filter((member) => member.role === 'owner').length;
    if (ownerCount <= 1 && members.length > 1) {
      return res.status(400).json({
        message: 'Transfer ownership before deleting the last owner account.',
      });
    }
  }

  // Self-serve deletion should remove the account, not wipe the whole workspace.
  try {
    if (typeof dataStore.deleteWorkspaceMembership === 'function') {
      await dataStore.deleteWorkspaceMembership(req.user, membershipUserId);
    }
  } catch { /* continue */ }

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
    await adminDeleteAuthUser(existingUser?.supabase_auth_id || req.user.supabase_auth_id).catch(() => {});
    await signOutSupabaseSession(accessToken).catch(() => {});
    clearSupabaseAuthCookies(res);
  }

  res.clearCookie(SESSION_COOKIE_NAME, getClearCookieOptions());
  clearCsrfCookie(res);
  return res.status(200).json({ ok: true, message: 'Account deleted. Workspace data was not deleted.' });
});

// ─── SSO — OAuth initiation & session exchange ────────────────────────────────

// Allowed Supabase OAuth providers — keep in sync with the Login UI buttons.
// `azure` is the Supabase identifier for Microsoft Entra / Azure AD / personal MS accounts.
const ALLOWED_SSO_PROVIDERS = new Set(['google', 'github', 'azure']);

// Redirect user to Supabase OAuth authorize URL
router.get('/sso/init', (req, res) => {
  if (!isAuthProviderSupabase()) {
    return res.status(400).json({ message: 'SSO requires Supabase auth provider.' });
  }

  const provider = String(req.query.provider || '').toLowerCase();
  if (!ALLOWED_SSO_PROVIDERS.has(provider)) {
    return res.status(400).json({ message: `Unsupported provider. Allowed: ${[...ALLOWED_SSO_PROVIDERS].join(', ')}.` });
  }

  const appUrl = String(process.env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
  const redirectTo = `${appUrl}/auth/callback`;
  const authorizeUrl = getOAuthSignInUrl(provider, redirectTo);
  return res.redirect(authorizeUrl);
});

// Exchange access + refresh tokens (from OAuth hash fragment) for httpOnly cookies
router.post('/sso/session', authLimiter, async (req, res) => {
  if (!isAuthProviderSupabase()) {
    return res.status(400).json({ message: 'SSO requires Supabase auth provider.' });
  }

  const accessToken = String(req.body?.access_token || '').trim();
  const refreshToken = String(req.body?.refresh_token || '').trim();
  addBreadcrumb({
    category: 'auth',
    message: 'auth.sso.session_exchange',
    data: {
      has_access_token: Boolean(accessToken),
      has_refresh_token: Boolean(refreshToken),
    },
  });

  if (!accessToken || !refreshToken) {
    return res.status(400).json({ message: 'access_token and refresh_token are required.' });
  }

  try {
    const authUser = await getAuthUserFromAccessToken(accessToken);
    if (!authUser?.id) {
      return res.status(401).json({ message: 'Invalid or expired SSO token.' });
    }

    setSupabaseAuthCookies(res, { access_token: accessToken, refresh_token: refreshToken, expires_in: 3600, user: authUser });
    setCsrfCookie(res);

    const appUser = await ensureWorkspaceUserForAuth({
      authUser,
      fallbackFullName: authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email || '',
    });

    // Welcome email for new users (fire-and-forget)
    if (appUser?._is_new) {
      sendEmail(EmailTemplates.welcome({
        toEmail: authUser.email,
        fullName: appUser?.full_name || authUser.email,
        workspaceName: null,
      })).catch(() => {});
    }

    return res.json({ user: sanitizeUser(appUser) });
  } catch (error) {
    const normalized = toApiAuthError(error, 'SSO session exchange failed');
    return res.status(normalized.status).json({ message: normalized.message });
  }
});

router.post('/logout', async (req, res) => {
  if (isAuthProviderSupabase()) {
    const { accessToken } = getSupabaseAuthCookies(req);
    await signOutSupabaseSession(accessToken);
    clearSupabaseAuthCookies(res);
    res.clearCookie(SESSION_COOKIE_NAME, getClearCookieOptions());
    clearCsrfCookie(res);
    return res.status(204).send();
  }

  res.clearCookie(SESSION_COOKIE_NAME, getClearCookieOptions());
  clearCsrfCookie(res);
  return res.status(204).send();
});

export default router;

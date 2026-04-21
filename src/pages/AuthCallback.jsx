import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/lib/AuthContext';
import { resolvePostAuthRoute } from '@/lib/onboarding';
import { dataClient } from '@/services/dataClient';
import '@/styles/auth-v2.css';

/**
 * OAuth callback page.
 *
 * Supabase can redirect here with tokens in two ways:
 *   1. **Implicit flow** — tokens arrive in the URL hash fragment:
 *      /auth/callback#access_token=...&refresh_token=...
 *   2. **PKCE / code flow** — an authorization code arrives as a query param:
 *      /auth/callback?code=...
 *
 * This component detects which flow was used and exchanges the tokens/code
 * for a backend httpOnly session via the appropriate API endpoint.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { checkAppState } = useAuth();
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    // ── Check for errors first (both flows) ──────────────────────────────
    const errorParam =
      searchParams.get('error_description') ||
      searchParams.get('error') ||
      '';

    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      return;
    }

    // ── Detect PKCE / code flow ──────────────────────────────────────────
    const code = searchParams.get('code');

    if (code) {
      // Clear the code from the URL immediately for security
      window.history.replaceState(null, '', window.location.pathname);

      dataClient.auth.ssoCodeExchange({ code })
        .then(async () => {
          if (checkAppState) await checkAppState().catch(() => {});
          const redirectTarget = searchParams.get('redirect') || ROUTES.dashboard;
          const nextRoute = await resolvePostAuthRoute(redirectTarget);
          navigate(nextRoute, { replace: true });
        })
        .catch((err) => {
          setError(err?.message || t('authCallback.ssoFailed'));
        });

      return;
    }

    // ── Detect implicit flow (hash fragment) ─────────────────────────────
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const hashError = hashParams.get('error_description') || hashParams.get('error');

    if (hashError) {
      setError(decodeURIComponent(hashError));
      return;
    }

    if (!accessToken || !refreshToken) {
      setError(t('authCallback.missingTokens'));
      return;
    }

    // Clear tokens from URL immediately for security
    window.history.replaceState(null, '', window.location.pathname);

    dataClient.auth.ssoSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(async () => {
        if (checkAppState) await checkAppState().catch(() => {});
        const redirectTarget = searchParams.get('redirect') || ROUTES.dashboard;
        const nextRoute = await resolvePostAuthRoute(redirectTarget);
        navigate(nextRoute, { replace: true });
      })
      .catch((err) => {
        setError(err?.message || t('authCallback.ssoFailed'));
      });
  }, [navigate, checkAppState, t, searchParams]);

  if (error) {
    return (
      <div className="auth-v2-loader">
        <p style={{ color: '#ffb4aa', fontWeight: 500, textAlign: 'center', maxWidth: 380, fontSize: 14 }}>{error}</p>
        <a href={ROUTES.login} className="auth-v2-ghost-link" style={{ marginTop: 8 }}>
          {t('authCallback.backToLogin')}
        </a>
      </div>
    );
  }

  return (
    <div className="auth-v2-loader">
      <Loader2 className="auth-v2-loader-spinner animate-spin" />
      <p className="auth-v2-loader-label">{t('authCallback.connecting')}</p>
    </div>
  );
}

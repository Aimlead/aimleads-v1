import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/lib/AuthContext';
import { resolvePostAuthRoute } from '@/lib/onboarding';
import { dataClient } from '@/services/dataClient';

/**
 * Handles the Supabase OAuth redirect callback.
 * Supabase sends tokens in the URL hash fragment (implicit flow):
 *   /auth/callback#access_token=...&refresh_token=...&expires_in=...
 * This page reads those tokens, calls the backend to set httpOnly cookies,
 * then navigates to the dashboard.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const { checkAppState } = useAuth();
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const errorParam = params.get('error_description') || params.get('error');

    if (errorParam) {
      setError(decodeURIComponent(errorParam));
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
        const redirectTarget = new URLSearchParams(window.location.search).get('redirect') || ROUTES.dashboard;
        const nextRoute = await resolvePostAuthRoute(redirectTarget);
        navigate(nextRoute, { replace: true });
      })
      .catch((err) => {
        setError(err?.message || t('authCallback.ssoFailed'));
      });
  }, [navigate, checkAppState, t]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-rose-600 font-medium text-center max-w-md">{error}</p>
        <a href={ROUTES.login} className="text-sm text-brand-sky underline">
          {t('authCallback.backToLogin')}
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-brand-sky" />
      <p className="text-slate-600 text-sm">{t('authCallback.connecting')}</p>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/lib/AuthContext';
import { resolvePostAuthRoute } from '@/lib/onboarding';
import { dataClient } from '@/services/dataClient';
import '@/styles/auth-v2.css';

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

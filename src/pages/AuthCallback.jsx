import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/lib/AuthContext';
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
      setError('Tokens manquants dans le callback OAuth. Réessayez.');
      return;
    }

    // Clear tokens from URL immediately for security
    window.history.replaceState(null, '', window.location.pathname);

    dataClient.auth.ssoSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(async () => {
        if (checkAppState) await checkAppState().catch(() => {});
        navigate(ROUTES.dashboard, { replace: true });
      })
      .catch((err) => {
        setError(err?.message || 'Échec de la connexion SSO. Réessayez.');
      });
  }, [navigate, checkAppState]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-rose-600 font-medium text-center max-w-md">{error}</p>
        <a href={ROUTES.login} className="text-sm text-brand-sky underline">
          Retour à la connexion
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-brand-sky" />
      <p className="text-slate-600 text-sm">Connexion en cours…</p>
    </div>
  );
}

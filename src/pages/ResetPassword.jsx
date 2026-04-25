import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PasswordStrength from '@/components/PasswordStrength';
import BrandLogo from '@/components/brand/BrandLogo';
import { ROUTES } from '@/constants/routes';
import { validatePassword } from '@/lib/passwordValidation';
import { dataClient } from '@/services/dataClient';
import '@/styles/auth-v2.css';

const parseRecoveryTokens = (hash = '', search = '') => {
  const normalizedHash = String(hash || '').startsWith('#') ? String(hash || '').slice(1) : String(hash || '');
  const hashParams = new URLSearchParams(normalizedHash);
  const searchParams = new URLSearchParams(String(search || '').startsWith('?') ? String(search || '').slice(1) : String(search || ''));

  return {
    accessToken: String(hashParams.get('access_token') || searchParams.get('access_token') || '').trim(),
    refreshToken: String(hashParams.get('refresh_token') || searchParams.get('refresh_token') || '').trim(),
    type: String(hashParams.get('type') || searchParams.get('type') || '').trim(),
  };
};

export default function ResetPassword() {
  const { t } = useTranslation();
  const location = useLocation();
  const [recovery] = useState(() => parseRecoveryTokens(location.hash, location.search));
  const hasRecoverySession = Boolean(recovery.accessToken && recovery.refreshToken);

  const [form, setForm] = useState({
    new_password: '',
    confirm_password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!hasRecoverySession || typeof window === 'undefined') return;

    const cleanSearchParams = new URLSearchParams(
      String(location.search || '').startsWith('?') ? String(location.search || '').slice(1) : String(location.search || '')
    );
    cleanSearchParams.delete('access_token');
    cleanSearchParams.delete('refresh_token');
    const nextPath = cleanSearchParams.toString()
      ? `${ROUTES.resetPassword}?${cleanSearchParams.toString()}`
      : ROUTES.resetPassword;

    window.history.replaceState(window.history.state, document.title, nextPath);
  }, [hasRecoverySession, location.search]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    if (!hasRecoverySession) {
      setError(t('passwordRecovery.reset.invalidLink', 'This reset link is invalid or has already expired. Request a new one.'));
      setLoading(false);
      return;
    }

    if (form.new_password !== form.confirm_password) {
      setError(t('passwordRecovery.reset.passwordMismatch', 'New passwords do not match.'));
      setLoading(false);
      return;
    }

    const passwordError = validatePassword(form.new_password, t);
    if (passwordError) {
      setError(passwordError);
      setLoading(false);
      return;
    }

    try {
      await dataClient.auth.completePasswordRecovery({
        access_token: recovery.accessToken,
        refresh_token: recovery.refreshToken,
        new_password: form.new_password,
      });
      setCompleted(true);
      window.location.assign(ROUTES.dashboard);
    } catch (submitError) {
      setError(submitError?.message || t('passwordRecovery.reset.errorFallback', 'Failed to reset password. Please request a new link.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-v2">
      <div className="auth-v2-shell">
        <div className="auth-v2-topbar">
          <Link to={ROUTES.login} className="auth-v2-back">
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('passwordRecovery.forgot.backToSignIn', 'Back to sign in')}
          </Link>
        </div>

        <div className="auth-v2-card">
          <div className="auth-v2-brand">
            <BrandLogo variant="mark" tone="light" className="auth-v2-brand-mark" />
          </div>

          {completed ? (
            <div className="auth-v2-success">
              <div className="auth-v2-success-icon">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <p className="auth-v2-success-title">
                  {t('passwordRecovery.reset.completedTitle', 'Password updated')}
                </p>
                <p className="auth-v2-success-body">
                  {t('passwordRecovery.reset.completedBody', 'Redirecting you back to your workspace…')}
                </p>
              </div>
            </div>
          ) : (
            <>
              <h1 className="auth-v2-title">
                {t('passwordRecovery.reset.title', 'Set a new password')}
              </h1>
              <p className="auth-v2-subtitle">
                {t('passwordRecovery.reset.subtitle', "Choose a new password for your account and we'll sign you back in automatically.")}
              </p>

              <form onSubmit={handleSubmit} className="auth-v2-form">
                {!hasRecoverySession && (
                  <div className="auth-v2-banner auth-v2-banner--warn">
                    <p className="auth-v2-banner-body">
                      {t('passwordRecovery.reset.missingTokens', 'This reset link is missing recovery tokens. Request a new email before choosing a new password.')}
                    </p>
                  </div>
                )}

                {recovery.type && recovery.type !== 'recovery' ? (
                  <div className="auth-v2-banner auth-v2-banner--neutral">
                    <p className="auth-v2-banner-body">
                      {t('passwordRecovery.reset.detectedType', 'Recovery link type detected:')}{' '}
                      <span style={{ fontFamily: 'monospace' }}>{recovery.type}</span>
                    </p>
                  </div>
                ) : null}

                <div className="auth-v2-field">
                  <label htmlFor="new_password" className="auth-v2-label">
                    {t('passwordRecovery.reset.newPassword', 'New password')}
                  </label>
                  <div className="auth-v2-input-wrap">
                    <Lock className="auth-v2-input-icon" />
                    <input
                      id="new_password"
                      type="password"
                      className="auth-v2-input"
                      value={form.new_password}
                      onChange={(event) => setForm((prev) => ({ ...prev, new_password: event.target.value }))}
                      placeholder="••••••••"
                      required
                      autoFocus
                    />
                  </div>
                  <PasswordStrength password={form.new_password} />
                </div>

                <div className="auth-v2-field">
                  <label htmlFor="confirm_password" className="auth-v2-label">
                    {t('passwordRecovery.reset.confirmPassword', 'Confirm new password')}
                  </label>
                  <div className="auth-v2-input-wrap">
                    <Lock className="auth-v2-input-icon" />
                    <input
                      id="confirm_password"
                      type="password"
                      className="auth-v2-input"
                      value={form.confirm_password}
                      onChange={(event) => setForm((prev) => ({ ...prev, confirm_password: event.target.value }))}
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>

                {error && <div className="auth-v2-error">{error}</div>}

                <button
                  type="submit"
                  className="auth-v2-submit"
                  disabled={loading || !form.new_password || !form.confirm_password}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  {t('passwordRecovery.reset.submit', 'Save new password')}
                </button>

                <div style={{ textAlign: 'center', marginTop: 4 }}>
                  <Link to={ROUTES.forgotPassword} className="auth-v2-forgot">
                    {t('passwordRecovery.reset.requestNewLink', 'Request a new reset link')}
                  </Link>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

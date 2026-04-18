import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BrandLogo from '@/components/brand/BrandLogo';
import { ROUTES } from '@/constants/routes';
import { dataClient } from '@/services/dataClient';
import '@/styles/auth-v2.css';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await dataClient.auth.resetPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (err) {
      setError(err?.message || t('passwordRecovery.forgot.errorFallback', 'Failed to send reset email. Please try again.'));
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

          {sent ? (
            <div className="auth-v2-success">
              <div className="auth-v2-success-icon">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <p className="auth-v2-success-title">
                  {t('passwordRecovery.forgot.sentTitle', 'Email sent!')}
                </p>
                <p className="auth-v2-success-body">
                  {t('passwordRecovery.forgot.sentBody', 'Check your inbox at {{email}} for a password reset link.', { email })}
                </p>
              </div>
              <Link to={ROUTES.login} className="auth-v2-ghost-link">
                <ArrowLeft className="w-3.5 h-3.5" />
                {t('passwordRecovery.forgot.backToSignIn', 'Back to sign in')}
              </Link>
            </div>
          ) : (
            <>
              <h1 className="auth-v2-title">
                {t('passwordRecovery.forgot.title', 'Reset your password')}
              </h1>
              <p className="auth-v2-subtitle">
                {t('passwordRecovery.forgot.subtitle', "Enter your email and we'll send you a link to reset your password.")}
              </p>

              <form onSubmit={handleSubmit} className="auth-v2-form">
                <div className="auth-v2-field">
                  <label htmlFor="email" className="auth-v2-label">{t('auth.email', 'Email')}</label>
                  <div className="auth-v2-input-wrap">
                    <Mail className="auth-v2-input-icon" />
                    <input
                      id="email"
                      type="email"
                      className="auth-v2-input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('passwordRecovery.forgot.emailPlaceholder', 'you@company.com')}
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {error && <div className="auth-v2-error">{error}</div>}

                <button type="submit" className="auth-v2-submit" disabled={loading || !email}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {t('passwordRecovery.forgot.submit', 'Send reset link')}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

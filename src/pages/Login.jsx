import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Loader2, Lock, Mail, User } from 'lucide-react';
import PasswordStrength from '@/components/PasswordStrength';
import BrandLogo from '@/components/brand/BrandLogo';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/lib/AuthContext';
import { resolvePostAuthRoute } from '@/lib/onboarding';
import { dataClient } from '@/services/dataClient';
import '@/styles/auth-v2.css';

export default function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, register, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const invitedEmail = useMemo(
    () => String(searchParams.get('invite_email') || searchParams.get('email') || '').trim().toLowerCase(),
    [searchParams]
  );
  const selectedPlan = useMemo(
    () => String(searchParams.get('plan') || '').trim().toLowerCase(),
    [searchParams]
  );
  const startsInSignupMode = useMemo(
    () => searchParams.get('mode') === 'signup' || Boolean(invitedEmail) || Boolean(selectedPlan),
    [invitedEmail, searchParams, selectedPlan]
  );
  const [isSignup, setIsSignup] = useState(() => startsInSignupMode);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState(() => ({
    full_name: '',
    email: invitedEmail,
    password: '',
  }));
  const isInviteLocked = Boolean(invitedEmail);

  const redirectTarget = useMemo(() => {
    const value = searchParams.get('redirect');
    if (!value) return ROUTES.dashboard;
    return value.startsWith('/') ? value : ROUTES.dashboard;
  }, [searchParams]);
  const ssoRedirectTarget = useMemo(() => {
    const value = String(searchParams.get('redirect') || '').trim();
    if (!value || !value.startsWith('/') || value.startsWith('//') || value === ROUTES.home) return ROUTES.dashboard;
    return value;
  }, [searchParams]);
  const supportsSso = useMemo(() => typeof dataClient?.auth?.ssoInit === 'function', []);
  const resolveSsoLink = useMemo(() => {
    if (!supportsSso) return () => '';
    return (provider) => {
      try {
        const link = dataClient.auth.ssoInit(provider, ssoRedirectTarget);
        return typeof link === 'string' ? link : '';
      } catch {
        return '';
      }
    };
  }, [ssoRedirectTarget, supportsSso]);
  const ssoLinks = useMemo(() => {
    if (!supportsSso) return { google: '', microsoft: '' };
    return {
      google: resolveSsoLink('google'),
      microsoft: resolveSsoLink('azure'),
    };
  }, [resolveSsoLink, supportsSso]);
  const canRenderSso = Boolean(ssoLinks.google || ssoLinks.microsoft);

  useEffect(() => {
    if (!invitedEmail) return;
    setFormData((prev) => (prev.email === invitedEmail ? prev : { ...prev, email: invitedEmail }));
  }, [invitedEmail]);

  if (isAuthenticated) {
    return <Navigate to={redirectTarget} replace />;
  }

  const handleSsoClick = (provider, href) => (event) => {
    if (!href) {
      event.preventDefault();
      return;
    }
    setSsoLoading(provider);
    setError('');
    // The browser will navigate to the SSO init URL (server-side redirect to OAuth provider).
    // We set a loading state so the button shows feedback while the redirect happens.
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignup) {
        await register(formData);
      } else {
        await login({ email: formData.email, password: formData.password });
      }
      const nextRoute = await resolvePostAuthRoute(redirectTarget);
      navigate(nextRoute, { replace: true });
    } catch (submitError) {
      const rawMessage = submitError?.message || t('auth.authFailed');
      if (String(rawMessage).toLowerCase().includes('security verification') || String(rawMessage).toLowerCase().includes('captcha')) {
        setError(t('auth.captchaHint'));
      } else {
        setError(rawMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-v2">
      <div className="auth-v2-shell">
        <div className="auth-v2-topbar">
          <Link to={ROUTES.home} className="auth-v2-back">
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('auth.backToHome')}
          </Link>
          <LanguageSwitcher compact />
        </div>

        <div className="auth-v2-card">
          <div className="auth-v2-brand">
            <BrandLogo variant="mark" tone="light" className="auth-v2-brand-mark" />
          </div>

          <div style={{ textAlign: 'center' }}>
            <span className="auth-v2-eyebrow">
              <span className="auth-v2-eyebrow-dot" />
              {isSignup ? t('auth.signupEyebrow', 'Rejoignez AimLeads') : t('auth.loginEyebrow', 'Bon retour')}
            </span>
          </div>

          <h1 className="auth-v2-title">
            {isSignup ? t('auth.signupTitle') : t('auth.welcomeBack')}
          </h1>
          <p className="auth-v2-subtitle">
            {isSignup ? t('auth.signupSubtitle') : t('auth.loginSubtitle')}
          </p>

          {invitedEmail && (
            <div className="auth-v2-banner">
              <p className="auth-v2-banner-title">{t('auth.inviteDetected')}</p>
              <p className="auth-v2-banner-body">
                {t('auth.inviteDetectedBody', { email: invitedEmail })}
              </p>
            </div>
          )}

          {selectedPlan && (
            <div className="auth-v2-banner auth-v2-banner--neutral">
              <p className="auth-v2-banner-title">{t('auth.planSelected')}</p>
              <p className="auth-v2-banner-body">
                {t('auth.selectedPlanBody', { plan: selectedPlan })}
              </p>
            </div>
          )}

          {/* ── SSO buttons (Google + Microsoft) ─────────────────────────── */}
          {canRenderSso ? (
            <>
              <div className="auth-v2-sso-grid auth-v2-sso-grid--2">
                {ssoLinks.google && (
                  <a
                    href={ssoLinks.google}
                    className="auth-v2-sso-btn"
                    onClick={handleSsoClick('google', ssoLinks.google)}
                    aria-busy={ssoLoading === 'google'}
                  >
                    {ssoLoading === 'google' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    )}
                    {t('auth.continueWithGoogle')}
                  </a>
                )}
                {ssoLinks.microsoft && (
                  <a
                    href={ssoLinks.microsoft}
                    className="auth-v2-sso-btn"
                    onClick={handleSsoClick('microsoft', ssoLinks.microsoft)}
                    aria-busy={ssoLoading === 'microsoft'}
                  >
                    {ssoLoading === 'microsoft' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M11.4 11.4H2V2h9.4v9.4z" fill="#F25022" />
                        <path d="M22 11.4h-9.4V2H22v9.4z" fill="#7FBA00" />
                        <path d="M11.4 22H2v-9.4h9.4V22z" fill="#00A4EF" />
                        <path d="M22 22h-9.4v-9.4H22V22z" fill="#FFB900" />
                      </svg>
                    )}
                    {t('auth.continueWithMicrosoft', { defaultValue: 'Continuer avec Microsoft' })}
                  </a>
                )}
              </div>

              <div className="auth-v2-divider">
                <span className="auth-v2-divider-line" />
                <span className="auth-v2-divider-label">{t('auth.orContinueWith')}</span>
                <span className="auth-v2-divider-line" />
              </div>
            </>
          ) : null}

          <form onSubmit={handleSubmit} className="auth-v2-form">
            {isSignup && (
              <div className="auth-v2-field">
                <label htmlFor="full_name" className="auth-v2-label">{t('auth.fullName')}</label>
                <div className="auth-v2-input-wrap">
                  <User className="auth-v2-input-icon" />
                  <input
                    id="full_name"
                    className="auth-v2-input"
                    value={formData.full_name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
                    placeholder="Jean Dupont"
                    required
                  />
                </div>
              </div>
            )}

            <div className="auth-v2-field">
              <label htmlFor="email" className="auth-v2-label">{t('auth.email')}</label>
              <div className="auth-v2-input-wrap">
                <Mail className="auth-v2-input-icon" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="auth-v2-input"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="vous@entreprise.com"
                  required
                  disabled={isInviteLocked}
                />
              </div>
              {isInviteLocked ? (
                <p className="auth-v2-hint">{t('auth.inviteEmailLocked')}</p>
              ) : null}
            </div>

            <div className="auth-v2-field">
              <div className="auth-v2-label-row">
                <label htmlFor="password" className="auth-v2-label">{t('auth.password')}</label>
                {!isSignup && (
                  <Link to={ROUTES.forgotPassword} className="auth-v2-forgot">
                    {t('auth.forgotPassword')}
                  </Link>
                )}
              </div>
              <div className="auth-v2-input-wrap">
                <Lock className="auth-v2-input-icon" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  className="auth-v2-input auth-v2-input--password"
                  value={formData.password}
                  onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="auth-v2-eye-btn"
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {isSignup && <PasswordStrength password={formData.password} />}
            </div>

            {error && <div className="auth-v2-error">{error}</div>}

            <button type="submit" className="auth-v2-submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSignup ? t('auth.createAccount') : t('auth.signIn')}
            </button>
          </form>

          <div className="auth-v2-switch">
            {isSignup ? t('auth.alreadyHaveAccount') : t('auth.noAccount')}{' '}
            <button
              type="button"
              onClick={() => { setIsSignup((v) => !v); setError(''); }}
              className="auth-v2-switch-btn"
            >
              {isSignup ? t('auth.signIn') : t('auth.signup')}
            </button>
          </div>
        </div>

        <p className="auth-v2-foot">
          © {new Date().getFullYear()} AimLeads — {t('auth.tagline', 'L\u2019IA qui travaille pendant que vous scalez.')}
        </p>
      </div>
    </div>
  );
}

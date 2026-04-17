import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Lock, Mail, User } from 'lucide-react';
import PasswordStrength from '@/components/PasswordStrength';
import BrandLogo from '@/components/brand/BrandLogo';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/lib/AuthContext';
import { resolvePostAuthRoute } from '@/lib/onboarding';
import { dataClient } from '@/services/dataClient';

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
  const supportsSso = useMemo(() => typeof dataClient?.auth?.ssoInit === 'function', []);
  const resolveSsoLink = useMemo(() => {
    if (!supportsSso) return () => '';
    return (provider) => {
      try {
        const link = dataClient.auth.ssoInit(provider);
        return typeof link === 'string' ? link : '';
      } catch {
        return '';
      }
    };
  }, [supportsSso]);
  const ssoLinks = useMemo(() => {
    if (!supportsSso) return { google: '', github: '' };
    return {
      google: resolveSsoLink('google'),
      github: resolveSsoLink('github'),
    };
  }, [resolveSsoLink, supportsSso]);
  // Show SSO section if at least one provider link is available.
  // Each button renders independently so a missing provider doesn't hide the others.
  const canRenderSso = Boolean(ssoLinks.google || ssoLinks.github);

  useEffect(() => {
    if (!invitedEmail) return;
    setFormData((prev) => (prev.email === invitedEmail ? prev : { ...prev, email: invitedEmail }));
  }, [invitedEmail]);

  if (isAuthenticated) {
    return <Navigate to={redirectTarget} replace />;
  }

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
    <div className="login-page">
      {/* Background decorations */}
      <div className="login-bg-glow login-bg-glow--1" />
      <div className="login-bg-glow login-bg-glow--2" />

      <div className="login-card">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <BrandLogo variant="full" className="scale-110" />
        </div>

        {/* Title */}
        <h1 className="login-title">
          {isSignup ? t('auth.signupTitle') : t('auth.welcomeBack')}
        </h1>
        <p className="login-subtitle">
          {isSignup
            ? t('auth.signupSubtitle')
            : t('auth.loginSubtitle')}
        </p>

        {invitedEmail && (
          <div className="mb-5 rounded-2xl border border-brand-sky/20 bg-brand-sky/6 px-4 py-3 text-left">
            <p className="text-sm font-semibold text-slate-900">{t('auth.inviteDetected')}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {t('auth.inviteDetectedBody', { email: invitedEmail })}
            </p>
          </div>
        )}

        {selectedPlan && (
          <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left">
            <p className="text-sm font-semibold text-slate-900">{t('auth.planSelected')}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {t('auth.selectedPlanBody', { plan: selectedPlan })}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          {isSignup && (
            <div className="login-field">
              <label htmlFor="full_name" className="login-label">{t('auth.fullName')}</label>
              <div className="login-input-wrap">
                <User className="login-input-icon" />
                <input
                  id="full_name"
                  className="login-input"
                  value={formData.full_name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
                  placeholder="Jean Dupont"
                  required
                />
              </div>
            </div>
          )}

          <div className="login-field">
            <label htmlFor="email" className="login-label">{t('auth.email')}</label>
            <div className="login-input-wrap">
              <Mail className="login-input-icon" />
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="login-input"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="vous@entreprise.com"
                required
                disabled={isInviteLocked}
              />
            </div>
            {isInviteLocked ? (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {t('auth.inviteEmailLocked')}
              </p>
            ) : null}
          </div>

          <div className="login-field">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="login-label">{t('auth.password')}</label>
              {!isSignup && (
                <Link to={ROUTES.forgotPassword} className="login-forgot">
                  {t('auth.forgotPassword')}
                </Link>
              )}
            </div>
            <div className="login-input-wrap">
              <Lock className="login-input-icon" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                className="login-input login-input--password"
                value={formData.password}
                onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="login-eye-btn"
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {isSignup && <PasswordStrength password={formData.password} />}
          </div>

          {error && (
            <div className="login-error">{error}</div>
          )}

          <button type="submit" className="login-submit" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSignup ? t('auth.createAccount') : t('auth.signIn')}
          </button>
        </form>

        <div className="login-switch">
          {isSignup ? t('auth.alreadyHaveAccount') : t('auth.noAccount')}{' '}
          <button
            type="button"
            onClick={() => { setIsSignup((v) => !v); setError(''); }}
            className="login-switch-btn"
          >
            {isSignup ? t('auth.signIn') : t('auth.signup')}
          </button>
        </div>

        {canRenderSso ? (
          <div className="mt-5">
            <div className="relative flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 whitespace-nowrap">{t('auth.orContinueWith')}</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            <div className={`grid gap-3 ${ssoLinks.google && ssoLinks.github ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {ssoLinks.google && (
                <a
                  href={ssoLinks.google}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  {t('auth.continueWithGoogle')}
                </a>
              )}
              {ssoLinks.github && (
                <a
                  href={ssoLinks.github}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  {t('auth.continueWithGithub')}
                </a>
              )}
            </div>
          </div>
        ) : null}

        <div className="login-back mt-4">
          <Link to={ROUTES.home} className="login-back-link">
            {t('auth.backToHome')}
          </Link>
        </div>

      </div>
    </div>
  );
}

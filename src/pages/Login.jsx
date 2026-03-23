import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Lock, Mail, User } from 'lucide-react';
import PasswordStrength from '@/components/PasswordStrength';
import BrandLogo from '@/components/brand/BrandLogo';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/lib/AuthContext';
import { dataClient } from '@/services/dataClient';

export default function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, register, isAuthenticated } = useAuth();
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
      navigate(redirectTarget, { replace: true });
    } catch (submitError) {
      const rawMessage = submitError?.message || 'Authentication failed';
      if (String(rawMessage).toLowerCase().includes('security verification') || String(rawMessage).toLowerCase().includes('captcha')) {
        setError('Supabase Bot Protection (CAPTCHA) est active. En local, desactive-la dans Supabase Auth > Settings, ou ajoute un vrai flux captcha.');
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
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <BrandLogo variant="full" className="scale-110" />
        </div>

        {/* Title */}
        <h1 className="login-title">
          {isSignup ? 'Créer un compte' : 'Content de vous revoir'}
        </h1>
        <p className="login-subtitle">
          {isSignup
            ? 'Créez votre espace de travail pour qualifier vos leads.'
            : 'Connectez-vous à votre espace AimLeads.'}
        </p>

        {invitedEmail && (
          <div className="mb-5 rounded-2xl border border-brand-sky/20 bg-brand-sky/6 px-4 py-3 text-left">
            <p className="text-sm font-semibold text-slate-900">Invitation détectée</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Utilisez <span className="font-semibold">{invitedEmail}</span> pour rejoindre automatiquement cet espace de travail.
            </p>
          </div>
        )}

        {selectedPlan && (
          <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left">
            <p className="text-sm font-semibold text-slate-900">Plan sélectionné</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Vous démarrez sur le plan <span className="font-semibold capitalize">{selectedPlan}</span>. Créez votre compte pour ouvrir votre espace et atteindre votre première valeur plus vite.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          {isSignup && (
            <div className="login-field">
              <label htmlFor="full_name" className="login-label">Nom complet</label>
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
            <label htmlFor="email" className="login-label">Email</label>
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
                Cet email est verrouillé pour éviter de créer un mauvais workspace par erreur. Connectez-vous ou inscrivez-vous avec l&apos;adresse invitée.
              </p>
            ) : null}
          </div>

          <div className="login-field">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="login-label">Mot de passe</label>
              {!isSignup && (
                <Link to={ROUTES.forgotPassword} className="login-forgot">
                  Mot de passe oublié ?
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
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
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
            {isSignup ? 'Créer le compte' : 'Se connecter'}
          </button>
        </form>

        <div className="login-switch">
          {isSignup ? 'Déjà un compte ?' : 'Pas encore de compte ?'}{' '}
          <button
            type="button"
            onClick={() => { setIsSignup((v) => !v); setError(''); }}
            className="login-switch-btn"
          >
            {isSignup ? 'Se connecter' : 'Créer un compte'}
          </button>
        </div>

        <div className="login-back">
          <Link to={ROUTES.home} className="login-back-link">
            Retour à l'accueil
          </Link>
        </div>

        {import.meta.env.DEV && (
          <div className="login-debug">
            Mode: {dataClient.mode} · API: {dataClient.debug.apiBaseUrl} · Fallback: {dataClient.debug.allowApiFallback ? 'on' : 'off'}
          </div>
        )}
      </div>
    </div>
  );
}

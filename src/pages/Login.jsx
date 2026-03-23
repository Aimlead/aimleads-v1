import React, { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Lock, Mail, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PasswordStrength from '@/components/PasswordStrength';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/lib/AuthContext';
import { dataClient } from '@/services/dataClient';

export default function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, register, isAuthenticated } = useAuth();
  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
  });

  const redirectTarget = useMemo(() => {
    const value = searchParams.get('redirect');
    if (!value) return ROUTES.dashboard;
    return value.startsWith('/') ? value : ROUTES.dashboard;
  }, [searchParams]);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-navy to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-white/10 bg-white/95 backdrop-blur text-slate-900 [&_label]:text-slate-700 [&_input]:bg-white [&_input]:border-slate-200 [&_input]:text-slate-900 [&_input]:placeholder-slate-400 [&_input:focus]:ring-brand-sky/30 [&_input:focus]:border-brand-sky">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-slate-900">{isSignup ? 'Create account' : 'Welcome back'}</CardTitle>
          <CardDescription className="text-slate-500">
            {isSignup
              ? 'Create your workspace account to start qualifying leads.'
              : 'Sign in to your AimLeads workspace.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
              <div className="space-y-2">
                <Label htmlFor="full_name">Full name</Label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="full_name"
                    className="pl-9 rounded-xl"
                    value={formData.full_name}
                    onChange={(event) => setFormData((prev) => ({ ...prev, full_name: event.target.value }))}
                    placeholder="Jane Doe"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="pl-9 rounded-xl"
                  value={formData.email}
                  onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="you@company.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {!isSignup && (
                  <Link
                    to={ROUTES.forgotPassword}
                    className="text-xs text-slate-400 hover:text-brand-sky transition-colors"
                  >
                    Forgot password?
                  </Link>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  className="pl-9 pr-10 rounded-xl"
                  value={formData.password}
                  onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {isSignup && <PasswordStrength password={formData.password} />}
            </div>

            {error && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full gap-2 rounded-xl" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isSignup ? 'Create account' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-4 text-sm text-slate-600 text-center">
            {isSignup ? 'Already have an account?' : 'No account yet?'}{' '}
            <button
              type="button"
              onClick={() => { setIsSignup((v) => !v); setError(''); }}
              className="text-brand-sky hover:underline font-medium"
            >
              {isSignup ? 'Sign in' : 'Create one'}
            </button>
          </div>

          <div className="mt-3 text-xs text-slate-500 text-center">
            <Link to={ROUTES.home} className="hover:underline">
              Back to home
            </Link>
          </div>

          {import.meta.env.DEV && (
            <div className="mt-2 text-[11px] text-slate-400 text-center">
              Mode: {dataClient.mode} · API: {dataClient.debug.apiBaseUrl} · Fallback: {dataClient.debug.allowApiFallback ? 'on' : 'off'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

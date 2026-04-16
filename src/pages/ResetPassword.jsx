import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PasswordStrength from '@/components/PasswordStrength';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ROUTES } from '@/constants/routes';
import { dataClient } from '@/services/dataClient';

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-navy to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-slate-200 bg-white/95 backdrop-blur">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">{t('passwordRecovery.reset.title', 'Set a new password')}</CardTitle>
          <CardDescription>
            {t('passwordRecovery.reset.subtitle', "Choose a new password for your account and we'll sign you back in automatically.")}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {completed ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 mb-1">{t('passwordRecovery.reset.completedTitle', 'Password updated')}</p>
                <p className="text-sm text-slate-500">
                  {t('passwordRecovery.reset.completedBody', 'Redirecting you back to your workspace…')}
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {!hasRecoverySession && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {t('passwordRecovery.reset.missingTokens', 'This reset link is missing recovery tokens. Request a new email before choosing a new password.')}
                </div>
              )}

              {recovery.type && recovery.type !== 'recovery' ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  {t('passwordRecovery.reset.detectedType', 'Recovery link type detected:')} <span className="font-mono">{recovery.type}</span>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="new_password">{t('passwordRecovery.reset.newPassword', 'New password')}</Label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="new_password"
                    type="password"
                    className="pl-9 rounded-xl"
                    value={form.new_password}
                    onChange={(event) => setForm((prev) => ({ ...prev, new_password: event.target.value }))}
                    placeholder="••••••••"
                    required
                    autoFocus
                  />
                </div>
                <PasswordStrength password={form.new_password} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm_password">{t('passwordRecovery.reset.confirmPassword', 'Confirm new password')}</Label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="confirm_password"
                    type="password"
                    className="pl-9 rounded-xl"
                    value={form.confirm_password}
                    onChange={(event) => setForm((prev) => ({ ...prev, confirm_password: event.target.value }))}
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full gap-2 rounded-xl" disabled={loading || !form.new_password || !form.confirm_password}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {t('passwordRecovery.reset.submit', 'Save new password')}
              </Button>

              <div className="text-center">
                <Link
                  to={ROUTES.forgotPassword}
                  className="text-sm text-slate-500 hover:text-brand-sky flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {t('passwordRecovery.reset.requestNewLink', 'Request a new reset link')}
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

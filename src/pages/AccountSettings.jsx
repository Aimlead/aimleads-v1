import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Download, Loader2, Lock, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import BuildStamp from '@/components/ui/BuildStamp';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/lib/AuthContext';
import { dataClient } from '@/services/dataClient';

export default function AccountSettings() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const usesManagedPasswordRecovery = Boolean(user?.supabase_auth_id);

  const [exportLoading, setExportLoading] = useState('');
  const [exportError, setExportError] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const downloadJsonExport = async ({ exportType, url, filename, successMessage }) => {
    setExportLoading(exportType);
    setExportError('');
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(t('accountSettings.exportFailed'));
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      toast.success(successMessage);
    } catch (error) {
      setExportError(error?.message || t('accountSettings.exportFailed'));
    } finally {
      setExportLoading('');
    }
  };

  const handleWorkspaceExport = async () => {
    await downloadJsonExport({
      exportType: 'workspace',
      url: dataClient.workspace.exportUrl(),
      filename: `aimleads-workspace-export-${new Date().toISOString().slice(0, 10)}.json`,
      successMessage: t('accountSettings.workspaceExportDownloaded'),
    });
  };

  const handleAccountExport = async () => {
    await downloadJsonExport({
      exportType: 'account',
      url: dataClient.auth.exportMe(),
      filename: `aimleads-account-export-${new Date().toISOString().slice(0, 10)}.json`,
      successMessage: t('accountSettings.accountExportDownloaded'),
    });
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await dataClient.auth.deleteMe();
      toast.success(t('toasts.accountDeleted'));
      if (logout) await logout().catch(() => {});
      navigate(ROUTES.login, { replace: true });
    } catch (error) {
      setDeleteError(error?.message || t('accountSettings.deleteFailed'));
      setDeleteLoading(false);
    }
  };

  const [profileForm, setProfileForm] = useState({ full_name: user?.full_name || '' });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setProfileLoading(true);
    setProfileError('');
    setProfileSuccess('');

    try {
      await dataClient.auth.updateMe({ full_name: profileForm.full_name });
      setProfileSuccess(t('accountSettings.profileUpdated'));
      if (refreshUser) await refreshUser();
    } catch (error) {
      setProfileError(error?.message || t('accountSettings.profileUpdateFailed'));
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setPasswordLoading(true);
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError(t('accountSettings.passwordMismatch'));
      setPasswordLoading(false);
      return;
    }

    if (passwordForm.new_password.length < 8) {
      setPasswordError(t('accountSettings.passwordMinLength'));
      setPasswordLoading(false);
      return;
    }

    if (!/[A-Z]/.test(passwordForm.new_password)) {
      setPasswordError(t('accountSettings.passwordNeedsUppercase'));
      setPasswordLoading(false);
      return;
    }

    if (!/[0-9]/.test(passwordForm.new_password)) {
      setPasswordError(t('accountSettings.passwordNeedsNumber'));
      setPasswordLoading(false);
      return;
    }

    try {
      await dataClient.auth.updateMe({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setPasswordSuccess(t('accountSettings.passwordChanged'));
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (error) {
      setPasswordError(error?.message || t('accountSettings.passwordChangeFailed'));
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('accountSettings.title')}</h1>
        <p className="text-slate-500 mt-1">{t('accountSettings.subtitle')}</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            {t('accountSettings.profile')}
          </CardTitle>
          <CardDescription>{t('accountSettings.profileSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('auth.email')}</Label>
              <Input value={user?.email || ''} disabled className="bg-slate-50 text-slate-500" />
              <p className="text-xs text-slate-400">{t('accountSettings.emailCannotChange')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="full_name">{t('accountSettings.fullName')}</Label>
              <Input
                id="full_name"
                value={profileForm.full_name}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, full_name: e.target.value }))}
                placeholder={t('accountSettings.fullName')}
                required
              />
            </div>

            {profileError && <p className="text-sm text-rose-600">{profileError}</p>}
            {profileSuccess && <p className="text-sm text-emerald-600">{profileSuccess}</p>}

            <Button type="submit" disabled={profileLoading} className="gap-2">
              {profileLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('accountSettings.saveChanges')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password */}
      {usesManagedPasswordRecovery ? (
        <Card>
          <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            {t('accountSettings.passwordRecovery')}
          </CardTitle>
          <CardDescription>{t('accountSettings.passwordRecoverySubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            {t('accountSettings.passwordRecoveryHint')}
          </div>
          <Button asChild variant="outline" className="gap-2">
            <Link to={ROUTES.forgotPassword}>
              <Lock className="w-4 h-4" />
              {t('accountSettings.startPasswordReset')}
            </Link>
          </Button>
        </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            {t('accountSettings.passwordChange')}
          </CardTitle>
          <CardDescription>{t('accountSettings.passwordChangeSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current_password">{t('accountSettings.currentPassword')}</Label>
                <Input
                  id="current_password"
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, current_password: e.target.value }))}
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new_password">{t('accountSettings.newPassword')}</Label>
                <Input
                  id="new_password"
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, new_password: e.target.value }))}
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm_password">{t('accountSettings.confirmPassword')}</Label>
                <Input
                  id="confirm_password"
                  type="password"
                  value={passwordForm.confirm_password}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirm_password: e.target.value }))}
                  placeholder="••••••••"
                  required
                />
              </div>

              {passwordError && <p className="text-sm text-rose-600">{passwordError}</p>}
              {passwordSuccess && <p className="text-sm text-emerald-600">{passwordSuccess}</p>}

              <Button type="submit" variant="outline" disabled={passwordLoading} className="gap-2">
                {passwordLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('accountSettings.passwordChange')}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* RGPD — Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            {t('accountSettings.exportData')}
          </CardTitle>
          <CardDescription>{t('accountSettings.exportSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            {t('accountSettings.exportDescription')}
          </div>
          {exportError && <p className="text-sm text-rose-600">{exportError}</p>}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" disabled={Boolean(exportLoading)} onClick={handleWorkspaceExport} className="gap-2">
              {exportLoading === 'workspace'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Download className="w-4 h-4" />}
              {exportLoading === 'workspace'
                ? t('accountSettings.workspaceExportLoading')
                : t('accountSettings.workspaceExport')}
            </Button>
            <Button variant="ghost" disabled={Boolean(exportLoading)} onClick={handleAccountExport} className="gap-2">
              {exportLoading === 'account'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Download className="w-4 h-4" />}
              {exportLoading === 'account'
                ? t('accountSettings.accountExportLoading')
                : t('accountSettings.accountExport')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* RGPD — Delete */}
      <Card className="border-rose-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-rose-700">
            <Trash2 className="w-5 h-5" />
            {t('accountSettings.deleteAccount')}
          </CardTitle>
          <CardDescription>{t('accountSettings.deleteSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
            <p className="font-semibold mb-1">{t('accountSettings.deleteWarningTitle')}</p>
            <ul className="list-disc list-inside space-y-1 text-rose-600">
              <li>{t('accountSettings.deleteWarning1')}</li>
              <li>{t('accountSettings.deleteWarning2')}</li>
              <li>{t('accountSettings.deleteWarning3')}</li>
            </ul>
          </div>

          {!showDeleteConfirm ? (
            <Button
              variant="outline"
              className="border-rose-300 text-rose-700 hover:bg-rose-50 gap-2"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-4 h-4" />
              {t('accountSettings.deleteAccount')}
            </Button>
          ) : (
            <div className="space-y-3 border border-rose-200 rounded-xl p-4">
              <p className="text-sm text-slate-700 font-medium">
                {t('accountSettings.typeDeleteToConfirm')}
              </p>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                className="border-rose-300 focus-visible:ring-rose-400 font-mono"
              />
              {deleteError && <p className="text-sm text-rose-600">{deleteError}</p>}
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  disabled={deleteConfirm !== 'DELETE' || deleteLoading}
                  onClick={handleDeleteAccount}
                  className="gap-2"
                >
                  {deleteLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('accountSettings.confirmDelete')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirm(''); setDeleteError(''); }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('accountSettings.versionInfoTitle', { defaultValue: 'Version de l’application' })}</CardTitle>
          <CardDescription>{t('accountSettings.versionInfoSubtitle', { defaultValue: 'Utilisez cette empreinte pour vérifier qu’un conteneur ou un domaine sert bien le dernier build.' })}</CardDescription>
        </CardHeader>
        <CardContent>
          <BuildStamp
            label={t('accountSettings.buildLabel', { defaultValue: 'Build' })}
            builtAtLabel={t('accountSettings.buildDateLabel', { defaultValue: 'Built' })}
          />
        </CardContent>
      </Card>
    </div>
  );
}

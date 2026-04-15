import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, Loader2, Lock, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/lib/AuthContext';
import { dataClient } from '@/services/dataClient';

export default function AccountSettings() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const usesManagedPasswordRecovery = Boolean(user?.supabase_auth_id);

  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleExport = async () => {
    setExportLoading(true);
    setExportError('');
    try {
      const url = dataClient.auth.exportMe();
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `aimleads-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setExportError(error?.message || 'Échec de l\'export');
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await dataClient.auth.deleteMe();
      if (logout) await logout().catch(() => {});
      navigate(ROUTES.login, { replace: true });
    } catch (error) {
      setDeleteError(error?.message || 'Failed to delete account');
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
      setProfileSuccess('Profile updated successfully.');
      if (refreshUser) await refreshUser();
    } catch (error) {
      setProfileError(error?.message || 'Failed to update profile');
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
      setPasswordError('New passwords do not match');
      setPasswordLoading(false);
      return;
    }

    if (passwordForm.new_password.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      setPasswordLoading(false);
      return;
    }

    if (!/[A-Z]/.test(passwordForm.new_password)) {
      setPasswordError('New password must contain at least one uppercase letter');
      setPasswordLoading(false);
      return;
    }

    if (!/[0-9]/.test(passwordForm.new_password)) {
      setPasswordError('New password must contain at least one number');
      setPasswordLoading(false);
      return;
    }

    try {
      await dataClient.auth.updateMe({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setPasswordSuccess('Password changed successfully.');
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (error) {
      setPasswordError(error?.message || 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Account Settings</h1>
        <p className="text-slate-500 mt-1">Manage your profile and security settings.</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile
          </CardTitle>
          <CardDescription>Update your display name and account information.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ''} disabled className="bg-slate-50 text-slate-500" />
              <p className="text-xs text-slate-400">Email address cannot be changed here.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                value={profileForm.full_name}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, full_name: e.target.value }))}
                placeholder="Your name"
                required
              />
            </div>

            {profileError && <p className="text-sm text-rose-600">{profileError}</p>}
            {profileSuccess && <p className="text-sm text-emerald-600">{profileSuccess}</p>}

            <Button type="submit" disabled={profileLoading} className="gap-2">
              {profileLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Save changes
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
              Password recovery
            </CardTitle>
            <CardDescription>
              This account uses managed authentication. Start the reset-password flow instead of changing it directly here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              We&apos;ll send you a secure recovery link so you can set a new password without risking a failed in-app update.
            </div>
            <Button asChild variant="outline" className="gap-2">
              <Link to={ROUTES.forgotPassword}>
                <Lock className="w-4 h-4" />
                Start password reset
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Change Password
            </CardTitle>
            <CardDescription>Minimum 8 characters with at least 1 uppercase letter and 1 number.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current_password">Current password</Label>
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
                <Label htmlFor="new_password">New password</Label>
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
                <Label htmlFor="confirm_password">Confirm new password</Label>
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
                Change password
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
            Exporter mes données
          </CardTitle>
          <CardDescription>
            Téléchargez une copie complète de votre profil et de vos leads au format JSON.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            L&apos;export inclut votre profil utilisateur et tous les leads de votre workspace. Aucune donnée de carte bancaire n&apos;est stockée.
          </div>
          {exportError && <p className="text-sm text-rose-600">{exportError}</p>}
          <Button variant="outline" disabled={exportLoading} onClick={handleExport} className="gap-2">
            {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exportLoading ? 'Export en cours…' : 'Télécharger mes données'}
          </Button>
        </CardContent>
      </Card>

      {/* RGPD — Delete */}
      <Card className="border-rose-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-rose-700">
            <Trash2 className="w-5 h-5" />
            Supprimer mon compte
          </CardTitle>
          <CardDescription>
            Action irréversible. Votre compte sera supprimé mais les données du workspace seront conservées.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
            <p className="font-semibold mb-1">Avant de supprimer votre compte :</p>
            <ul className="list-disc list-inside space-y-1 text-rose-600">
              <li>Si vous êtes le seul propriétaire, transférez d&apos;abord la propriété du workspace.</li>
              <li>Vos leads et données workspace ne seront <strong>pas</strong> supprimés.</li>
              <li>Cette action est définitive et ne peut pas être annulée.</li>
            </ul>
          </div>

          {!showDeleteConfirm ? (
            <Button
              variant="outline"
              className="border-rose-300 text-rose-700 hover:bg-rose-50 gap-2"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-4 h-4" />
              Supprimer mon compte
            </Button>
          ) : (
            <div className="space-y-3 border border-rose-200 rounded-xl p-4">
              <p className="text-sm text-slate-700 font-medium">
                Tapez <span className="font-mono font-bold text-rose-700">DELETE</span> pour confirmer la suppression :
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
                  Confirmer la suppression
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirm(''); setDeleteError(''); }}
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

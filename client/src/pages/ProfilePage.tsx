import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  UserIcon,
  EnvelopeSimpleIcon,
  PhoneIcon,
  IdentificationCardIcon,
  CalendarBlankIcon,
  ShieldCheckIcon,
  LockKeyIcon,
  CircleNotchIcon,
  CheckCircleIcon,
  WarningIcon,
  EyeSlashIcon,
  EyeIcon,
  PencilSimpleIcon,
  CameraIcon,
  HouseIcon,
  DesktopIcon,
  TrashIcon
} from '@phosphor-icons/react';

export const ProfilePage: React.FC = () => {
  const { user, token, setSession } = useAuth();

  const [profile, setProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Password change form state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changing, setChanging] = useState(false);
  const [pwFeedback, setPwFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Edit name / image state
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [nameFeedback, setNameFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const role = user?.role || 'Guest';

  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.id || !token) {
        setLoadingProfile(false);
        return;
      }
      setLoadingProfile(true);
      try {
        const res = await api.get(`/auth/profile/${user.id}`, { params: { role } });
        setProfile(res.data.profile || {
          id: user.id,
          role: user.role,
          name: user.name,
          username: user.username
        });
      } catch (err: any) {
        // Fallback to the JWT session data if the API fails
        setProfile({
          id: user.id,
          role: user.role,
          name: user.name,
          username: user.username
        });
      } finally {
        setLoadingProfile(false);
      }
    };
    loadProfile();
  }, [user?.id, user?.role, token]);

  const refreshName = (newName: string) => {
    setProfile((p: any) => ({ ...(p || {}), name: newName }));
    if (user) {
      setSession(token || localStorage.getItem('hms_token') || '', { ...user, name: newName });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwFeedback(null);

    if (!oldPassword || !newPassword || !confirmPassword) {
      setPwFeedback({ type: 'error', msg: 'Please fill in all password fields.' });
      return;
    }
    if (newPassword.length < 6) {
      setPwFeedback({ type: 'error', msg: 'New password must be at least 6 characters long.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwFeedback({ type: 'error', msg: 'New password and confirmation do not match.' });
      return;
    }

    setChanging(true);
    try {
      const res = await api.post('/auth/change-password', {
        id: user?.id,
        role,
        oldPassword,
        newPassword
      });
      // Server revokes all sessions after a password change — force re-login.
      setPwFeedback({ type: 'success', msg: res.data.message || 'Password updated. Please log in again.' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        window.location.href = role === 'Guest' ? '/guest-login' : '/login';
      }, 1500);
    } catch (err: any) {
      setPwFeedback({
        type: 'error',
        msg: err.response?.data?.error || 'Failed to change password. Please try again.'
      });
    } finally {
      setChanging(false);
    }
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameFeedback(null);
    const newName = nameValue.trim();
    if (!newName) {
      setNameFeedback({ type: 'error', msg: 'Name cannot be empty.' });
      return;
    }
    setSavingName(true);
    try {
      await api.post('/auth/update-profile', { id: user?.id, role, name: newName });
      refreshName(newName);
      setNameFeedback({ type: 'success', msg: 'Name updated successfully.' });
      setEditingName(false);
    } catch (err: any) {
      setNameFeedback({
        type: 'error',
        msg: err.response?.data?.error || 'Failed to update name. Please try again.'
      });
    } finally {
      setSavingName(false);
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setNameFeedback({ type: 'error', msg: 'Please choose a valid image file.' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setNameFeedback({ type: 'error', msg: 'Image is too large. Maximum size is 2MB.' });
      return;
    }

    setNameFeedback(null);
    setUploadingImage(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
      await api.post('/auth/update-profile', { id: user?.id, role, image: dataUrl });
      setProfile((p: any) => ({ ...(p || {}), Profile_Image: dataUrl }));
      setNameFeedback({ type: 'success', msg: 'Profile image updated successfully.' });
    } catch (err: any) {
      setNameFeedback({
        type: 'error',
        msg: err.response?.data?.error || 'Failed to upload image. Please try again.'
      });
    } finally {
      setUploadingImage(false);
    }
  };

  // Sessions state
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsFeedback, setSessionsFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const res = await api.get('/auth/sessions');
      setSessions(res.data.sessions || []);
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id && token) loadSessions();
  }, [user?.id, token]);

  const handleRevokeSession = async (id: number) => {
    setSessionsFeedback(null);
    try {
      await api.delete(`/auth/sessions/${id}`);
      setSessionsFeedback({ type: 'success', msg: 'Session revoked.' });
      loadSessions();
    } catch (err: any) {
      setSessionsFeedback({ type: 'error', msg: err.response?.data?.error || 'Failed to revoke session.' });
    }
  };

  const handleRevokeAllSessions = async () => {
    setSessionsFeedback(null);
    try {
      await api.post('/auth/sessions/revoke-all');
      setSessionsFeedback({ type: 'success', msg: 'All sessions revoked. Please log in again.' });
      setTimeout(() => { window.location.href = '/guest-login'; }, 1200);
    } catch (err: any) {
      setSessionsFeedback({ type: 'error', msg: err.response?.data?.error || 'Failed to revoke sessions.' });
    }
  };

  const displayName = profile?.name || user?.name || '?';
  const initial = displayName.charAt(0).toUpperCase();

  const infoRows: { label: string; value: string; icon: React.ReactNode }[] = profile
    ? [
        { label: 'Full Name', value: displayName, icon: <UserIcon size={16} /> },
        { label: 'Username', value: String(profile.username || user?.username || '—'), icon: <ShieldCheckIcon size={16} /> },
        { label: 'Role', value: String(profile.role || role), icon: <ShieldCheckIcon size={16} /> },
        ...(profile.email ? [{ label: 'Email', value: String(profile.email), icon: <EnvelopeSimpleIcon size={16} /> }] : []),
        ...(profile.phone ? [{ label: 'Phone', value: String(profile.phone), icon: <PhoneIcon size={16} /> }] : []),
        ...(profile.identification ? [{ label: 'Identification No.', value: String(profile.identification), icon: <IdentificationCardIcon size={16} /> }] : []),
        ...(profile.nationality ? [{ label: 'Nationality', value: String(profile.nationality), icon: <IdentificationCardIcon size={16} /> }] : []),
        ...(profile.designation ? [{ label: 'Designation', value: String(profile.designation), icon: <ShieldCheckIcon size={16} /> }] : []),
        ...(profile.joined ? [{ label: 'Joined On', value: new Date(profile.joined).toLocaleDateString(), icon: <CalendarBlankIcon size={16} /> }] : [])
      ]
    : [];

  const inputCls =
    'w-full px-3 py-2 rounded border border-acc-300 dark:border-acc-700 bg-white dark:bg-acc-900 text-acc-950 dark:text-acc-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

  if (loadingProfile) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <CircleNotchIcon size={32} className="animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-acc-950 dark:text-acc-50">My Profile</h1>
        <p className="text-sm text-acc-500 dark:text-acc-400 font-mono mt-1">
          View your account information, edit your name &amp; picture, and manage your password
        </p>
      </header>

      {/* Basic Information Card */}
      <section className="rounded-lg border border-acc-200 dark:border-acc-800 bg-white dark:bg-acc-900 shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 p-6 bg-acc-50 dark:bg-acc-850 border-b border-acc-200 dark:border-acc-800">
          {/* Profile image with upload overlay */}
          <div className="relative group w-16 h-16 shrink-0">
            {profile?.Profile_Image ? (
              <img
                src={profile.Profile_Image}
                alt={displayName}
                className="w-16 h-16 rounded-full object-cover border-2 border-brand-500"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-brand-500 text-acc-950 flex items-center justify-center text-2xl font-extrabold">
                {initial}
              </div>
            )}
            {uploadingImage ? (
              <div className="absolute inset-0 rounded-full bg-acc-950/70 flex items-center justify-center">
                <CircleNotchIcon size={18} className="animate-spin text-brand-500" />
              </div>
            ) : (
              <label
                className="absolute inset-0 rounded-full bg-acc-950/70 opacity-0 group-hover:opacity-100 cursor-pointer flex flex-col items-center justify-center transition-opacity"
                title="Change profile image"
              >
                <CameraIcon size={18} className="text-white" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                  disabled={uploadingImage}
                />
              </label>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {editingName ? (
              <form onSubmit={handleSaveName} className="flex flex-col sm:flex-row sm:items-center gap-2">
                <input
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  placeholder="Enter your full name"
                  className={inputCls + ' sm:max-w-xs'}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={savingName}
                    className="px-3 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-acc-950 font-bold text-xs rounded font-mono flex items-center gap-1.5 shadow-sm"
                  >
                    {savingName ? <CircleNotchIcon size={13} className="animate-spin" /> : <CheckCircleIcon size={13} />}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingName(false); setNameFeedback(null); }}
                    className="px-3 py-2 border border-acc-300 dark:border-acc-700 text-acc-600 dark:text-acc-300 font-semibold text-xs rounded font-mono hover:bg-acc-100 dark:hover:bg-acc-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-acc-950 dark:text-acc-50 truncate">{displayName}</h2>
                <button
                  onClick={() => { setNameValue(displayName); setEditingName(true); setNameFeedback(null); }}
                  className="p-1.5 rounded text-acc-400 hover:text-brand-500 hover:bg-acc-100 dark:hover:bg-acc-800 transition-colors"
                  title="Edit name"
                >
                  <PencilSimpleIcon size={14} />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 mt-1">
              <span className="badge-pill bg-brand-500 text-acc-950 font-mono text-[10px] font-bold">
                {String(profile?.role || role).toUpperCase()}
              </span>
              <span className="text-[10px] font-mono text-acc-500 dark:text-acc-400 flex items-center gap-1">
                <CameraIcon size={11} /> hover the photo to change image
              </span>
            </div>
          </div>
        </div>

        {nameFeedback && (
          <div
            className={`flex items-center gap-2 text-sm rounded-none px-6 py-2.5 ${nameFeedback.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              }`}
          >
            {nameFeedback.type === 'success' ? <CheckCircleIcon size={16} /> : <WarningIcon size={16} />}
            {nameFeedback.msg}
          </div>
        )}

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {infoRows.map((row) => (
            <div key={row.label} className="flex items-start gap-2.5">
              <span className="text-acc-400 mt-0.5">{row.icon}</span>
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wide text-acc-500 dark:text-acc-400">{row.label}</p>
                <p className="text-sm font-semibold text-acc-950 dark:text-acc-50 break-all">{row.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Change Password Card */}
      <section className="rounded-lg border border-acc-200 dark:border-acc-800 bg-white dark:bg-acc-900 shadow-sm">
        <div className="flex items-center gap-2 p-4 border-b border-acc-200 dark:border-acc-800">
          <LockKeyIcon size={18} className="text-brand-500" />
          <h2 className="text-sm font-bold text-acc-950 dark:text-acc-50">Change Password</h2>
        </div>

        <form onSubmit={handleChangePassword} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-mono font-semibold text-acc-600 dark:text-acc-400 mb-1.5">
              Current Password
            </label>
            <div className="relative">
              <input
                type={showOld ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Enter your current password"
                className={inputCls}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowOld(!showOld)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-acc-400 hover:text-acc-600"
                tabIndex={-1}
              >
                {showOld ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono font-semibold text-acc-600 dark:text-acc-400 mb-1.5">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className={inputCls}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-acc-400 hover:text-acc-600"
                  tabIndex={-1}
                >
                  {showNew ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-mono font-semibold text-acc-600 dark:text-acc-400 mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className={inputCls}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-acc-400 hover:text-acc-600"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>
          </div>

          {pwFeedback && (
            <div
              className={`flex items-center gap-2 text-sm rounded px-3 py-2 ${pwFeedback.type === 'success'
                  ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}
            >
              {pwFeedback.type === 'success' ? <CheckCircleIcon size={16} /> : <WarningIcon size={16} />}
              {pwFeedback.msg}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={changing}
              className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 disabled:cursor-not-allowed text-acc-950 font-bold text-xs rounded font-mono flex items-center gap-2 shadow-sm transition-colors"
            >
              {changing ? (
                <>
                  <CircleNotchIcon size={14} className="animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <LockKeyIcon size={14} />
                  Update Password
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Active Sessions Card */}
      <section className="rounded-lg border border-acc-200 dark:border-acc-800 bg-white dark:bg-acc-900 shadow-sm">
        <div className="flex items-center justify-between p-4 border-b border-acc-200 dark:border-acc-800">
          <div className="flex items-center gap-2">
            <DesktopIcon size={18} className="text-brand-500" />
            <h2 className="text-sm font-bold text-acc-950 dark:text-acc-50">Active Sessions</h2>
          </div>
          <button
            onClick={handleRevokeAllSessions}
            className="px-3 py-1.5 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 font-semibold text-[11px] rounded font-mono hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Log out everywhere
          </button>
        </div>

        {sessionsFeedback && (
          <div className={`flex items-center gap-2 text-sm rounded-none px-6 py-2.5 ${sessionsFeedback.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            }`}>
            {sessionsFeedback.type === 'success' ? <CheckCircleIcon size={16} /> : <WarningIcon size={16} />}
            {sessionsFeedback.msg}
          </div>
        )}

        <div className="p-4 space-y-2">
          {sessionsLoading ? (
            <div className="flex items-center justify-center gap-2 py-4 text-acc-500 font-mono text-xs">
              <CircleNotchIcon size={16} className="animate-spin" /> Loading sessions...
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-center py-4 text-acc-500 font-mono text-xs">No active sessions found.</p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between gap-3 p-3 rounded border ${s.current
                  ? 'border-brand-400 dark:border-brand-600 bg-brand-50/50 dark:bg-brand-900/10'
                  : 'border-acc-200 dark:border-acc-800'}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-acc-950 dark:text-acc-50 truncate max-w-[300px]" title={s.device || ''}>
                      {s.device ? String(s.device).slice(0, 60) : 'Unknown device'}
                    </span>
                    {s.current && (
                      <span className="badge-pill bg-brand-500 text-acc-950 font-mono text-[9px] font-bold">THIS DEVICE</span>
                    )}
                  </div>
                  <p className="text-[10px] font-mono text-acc-500 dark:text-acc-400 mt-0.5">
                    IP {s.ip || '—'} · last used {s.lastUsed ? new Date(s.lastUsed).toLocaleString() : '—'}
                    {' '}· expires {s.expires ? new Date(s.expires).toLocaleDateString() : '—'}
                  </p>
                </div>
                <button
                  onClick={() => handleRevokeSession(s.id)}
                  disabled={s.current}
                  title={s.current ? 'Use the logout button to end this session' : 'Revoke this session'}
                  className="shrink-0 p-2 rounded text-acc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <TrashIcon size={15} />
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

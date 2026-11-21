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
  EyeIcon
} from '@phosphor-icons/react';

export const ProfilePage: React.FC = () => {
  const { user, token } = useAuth();

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
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

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
        setProfile(res.data.profile);
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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!oldPassword || !newPassword || !confirmPassword) {
      setFeedback({ type: 'error', msg: 'Please fill in all password fields.' });
      return;
    }
    if (newPassword.length < 6) {
      setFeedback({ type: 'error', msg: 'New password must be at least 6 characters long.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback({ type: 'error', msg: 'New password and confirmation do not match.' });
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
      setFeedback({ type: 'success', msg: res.data.message || 'Password updated successfully.' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setFeedback({
        type: 'error',
        msg: err.response?.data?.error || 'Failed to change password. Please try again.'
      });
    } finally {
      setChanging(false);
    }
  };

  const infoRows: { label: string; value: string; icon: React.ReactNode }[] = profile
    ? [
      { label: 'Full Name', value: profile.name || '—', icon: <UserIcon size={16} /> },
      { label: 'Username', value: profile.username || '—', icon: <ShieldCheckIcon size={16} /> },
      { label: 'Role', value: String(profile.role || role), icon: <ShieldCheckIcon size={16} /> },
      ...(profile.email ? [{ label: 'Email', value: profile.email, icon: <EnvelopeSimpleIcon size={16} /> }] : []),
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
          View your account information and manage your password
        </p>
      </header>

      {/* Basic Information Card */}
      <section className="rounded-lg border border-acc-200 dark:border-acc-800 bg-white dark:bg-acc-900 shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 p-6 bg-acc-50 dark:bg-acc-850 border-b border-acc-200 dark:border-acc-800">
          <div className="w-14 h-14 rounded-full bg-brand-500 text-acc-950 flex items-center justify-center text-xl font-extrabold">
            {(profile?.name || user?.name || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-bold text-acc-950 dark:text-acc-50">{profile?.name || user?.name}</h2>
            <span className="badge-pill bg-brand-500 text-acc-950 font-mono text-[10px] font-bold">
              {String(profile?.role || role).toUpperCase()}
            </span>
          </div>
        </div>

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

            {feedback && (
              <div
                className={`flex items-center gap-2 text-sm rounded px-3 py-2 ${feedback.type === 'success'
                    ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  }`}
              >
                {feedback.type === 'success' ? <CheckCircleIcon size={16} /> : <WarningIcon size={16} />}
                {feedback.msg}
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
    </div>
  );
};

import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  UsersIcon,
  CircleNotchIcon,
  WarningIcon,
  CheckCircleIcon,
  ProhibitIcon,
  ArrowCounterClockwiseIcon
} from '@phosphor-icons/react';

interface ManagedUser {
  User_Account_ID: number;
  User_Type: string;
  User_Ref_ID: number;
  Role: string;
  Banned: 0 | 1;
  Banned_At: string | null;
  Ban_Reason: string | null;
  Name: string | null;
  Email: string | null;
}

const ROLES = ['Guest', 'Receptionist', 'Manager', 'Admin'];

/**
 * Admin-only user management. The server enforces the real safety rules:
 * you cannot change your own role and cannot ban another admin — this UI
 * mirrors those rules so the buttons don't even appear.
 */
export const UserManagementPage: React.FC = () => {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/users');
      setUsers(res.data.users || []);
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.response?.data?.error || 'Failed to load users.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const isSelf = (u: ManagedUser) =>
    u.User_Type === (me?.role === 'Guest' ? 'Guest' : 'Employee') && Number(u.User_Ref_ID) === Number(me?.id);

  const canBan = (u: ManagedUser) => !isSelf(u) && u.Role !== 'Admin';

  const handleRoleChange = async (u: ManagedUser, role: string) => {
    if (isSelf(u)) {
      setFeedback({ type: 'error', msg: 'You cannot change your own role.' });
      return;
    }
    setBusyId(`${u.User_Type}-${u.User_Ref_ID}`);
    setFeedback(null);
    try {
      await api.put(`/users/${u.User_Type.toLowerCase()}/${u.User_Ref_ID}/role`, { role });
      setFeedback({ type: 'success', msg: `${u.Name || 'User'} is now ${role}. Their sessions were revoked so it applies immediately.` });
      fetchUsers();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.response?.data?.error || 'Failed to change role.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleBan = async (u: ManagedUser, ban: boolean) => {
    setBusyId(`${u.User_Type}-${u.User_Ref_ID}`);
    setFeedback(null);
    try {
      await api.post(`/users/${u.User_Type.toLowerCase()}/${u.User_Ref_ID}/${ban ? 'ban' : 'unban'}`, {
        reason: ban ? 'Banned by admin via user management panel' : undefined
      });
      setFeedback({ type: 'success', msg: ban ? 'User banned. Their next request will be rejected.' : 'User unbanned.' });
      fetchUsers();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.response?.data?.error || 'Failed to update ban state.' });
    } finally {
      setBusyId(null);
    }
  };

  const inputCls =
    'px-2 py-1 rounded border border-acc-300 dark:border-acc-700 bg-white dark:bg-acc-900 text-acc-950 dark:text-acc-50 text-xs font-mono';

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-acc-950 dark:text-acc-50 flex items-center gap-2">
          <UsersIcon size={24} className="text-brand-500" /> User Management
        </h1>
        <p className="text-sm text-acc-500 dark:text-acc-400 font-mono mt-1">
          Roles and ban states are stored in the database and enforced on the server for every request.
        </p>
      </header>

      {feedback && (
        <div className={`flex items-center gap-2 text-sm rounded px-4 py-2.5 ${feedback.type === 'success'
          ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
          : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
          {feedback.type === 'success' ? <CheckCircleIcon size={16} /> : <WarningIcon size={16} />}
          {feedback.msg}
        </div>
      )}

      <section className="rounded-lg border border-acc-200 dark:border-acc-800 bg-white dark:bg-acc-900 shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-acc-500 font-mono text-xs">
            <CircleNotchIcon size={18} className="animate-spin" /> Loading user accounts...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-acc-50 dark:bg-acc-850 text-left">
                <th className="px-4 py-2.5 font-mono text-[10px] uppercase text-acc-500">User</th>
                <th className="px-4 py-2.5 font-mono text-[10px] uppercase text-acc-500">Type</th>
                <th className="px-4 py-2.5 font-mono text-[10px] uppercase text-acc-500">Role</th>
                <th className="px-4 py-2.5 font-mono text-[10px] uppercase text-acc-500">Status</th>
                <th className="px-4 py-2.5 font-mono text-[10px] uppercase text-acc-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-acc-100 dark:divide-acc-800">
              {users.map((u) => {
                const busy = busyId === `${u.User_Type}-${u.User_Ref_ID}`;
                return (
                  <tr key={u.User_Account_ID} className={u.Banned ? 'opacity-60' : ''}>
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-acc-950 dark:text-acc-50">{u.Name || `#${u.User_Ref_ID}`}</p>
                      <p className="text-[10px] font-mono text-acc-500">{u.Email || '—'}</p>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{u.User_Type}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={u.Role}
                        disabled={isSelf(u) || busy}
                        onChange={(e) => handleRoleChange(u, e.target.value)}
                        className={inputCls}
                        title={isSelf(u) ? 'You cannot change your own role' : 'Change role'}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      {u.Banned ? (
                        <span className="badge-pill bg-red-500 text-white font-mono text-[9px] font-bold">BANNED</span>
                      ) : (
                        <span className="badge-pill bg-green-500 text-white font-mono text-[9px] font-bold">ACTIVE</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {canBan(u) ? (
                        u.Banned ? (
                          <button
                            onClick={() => handleBan(u, false)}
                            disabled={busy}
                            className="px-2.5 py-1 border border-green-300 dark:border-green-800 text-green-600 dark:text-green-400 text-[11px] font-mono rounded hover:bg-green-50 dark:hover:bg-green-900/20 flex items-center gap-1 ml-auto"
                          >
                            <ArrowCounterClockwiseIcon size={12} /> Unban
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBan(u, true)}
                            disabled={busy}
                            className="px-2.5 py-1 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 text-[11px] font-mono rounded hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-1 ml-auto"
                          >
                            <ProhibitIcon size={12} /> Ban
                          </button>
                        )
                      ) : (
                        <span className="text-[10px] font-mono text-acc-400">
                          {isSelf(u) ? '(you)' : '(admin)'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};

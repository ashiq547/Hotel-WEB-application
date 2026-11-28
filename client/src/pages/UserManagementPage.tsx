import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  UsersIcon,
  CircleNotchIcon,
  WarningIcon,
  CheckCircleIcon,
  ProhibitIcon,
  ArrowCounterClockwiseIcon,
  EyeIcon,
  DownloadSimpleIcon,
  TrashIcon
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
type AdminTab = 'users' | 'activity' | 'security' | 'content';

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
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [banReason, setBanReason] = useState('');
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditEventFilter, setAuditEventFilter] = useState('');
  const [security, setSecurity] = useState<{ byIp: any[]; byAccount: any[] } | null>(null);
  const [contentKind, setContentKind] = useState<'reservations' | 'hotels'>('reservations');
  const [content, setContent] = useState<any[]>([]);
  const [contentSelected, setContentSelected] = useState<number[]>([]);
  const [contentSearch, setContentSearch] = useState('');
  const pageSize = 10;

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

  const fetchAudit = async () => {
    try {
      const res = await api.get('/users/audit', {
        params: { page: 1, pageSize: 50, search: auditSearch, event: auditEventFilter }
      });
      setAuditEvents(res.data.events || []);
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.response?.data?.error || 'Failed to load activity.' });
    }
  };

  const fetchSecurity = async () => {
    try {
      const res = await api.get('/users/security');
      setSecurity(res.data);
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.response?.data?.error || 'Failed to load security summary.' });
    }
  };

  const fetchContent = async () => {
    try {
      const res = await api.get('/users/content', { params: { kind: contentKind, search: contentSearch } });
      setContent(res.data.records || []);
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.response?.data?.error || 'Failed to load content.' });
    }
  };

  useEffect(() => {
    if (activeTab === 'activity') fetchAudit();
    if (activeTab === 'security') fetchSecurity();
    if (activeTab === 'content') fetchContent();
  }, [activeTab, contentKind]);

  const isSelf = (u: ManagedUser) =>
    u.User_Type === (me?.role === 'Guest' ? 'Guest' : 'Employee') && Number(u.User_Ref_ID) === Number(me?.id);

  const canBan = (u: ManagedUser) => !isSelf(u) && u.Role !== 'Admin';
  const filteredUsers = users.filter((u) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [
      u.Name || '',
      u.Email || '',
      String(u.User_Ref_ID)
    ].some((value) => value.toLowerCase().includes(term));
    const matchesRole = !roleFilter || u.Role === roleFilter;
    const matchesStatus = !statusFilter || (statusFilter === 'banned') === Boolean(u.Banned);
    return matchesSearch && matchesRole && matchesStatus;
  });
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const visibleUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);

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
    if (ban && !banReason.trim()) {
      setFeedback({ type: 'error', msg: 'Enter a reason before banning a user.' });
      return;
    }
    setBusyId(`${u.User_Type}-${u.User_Ref_ID}`);
    setFeedback(null);
    try {
      await api.post(`/users/${u.User_Type.toLowerCase()}/${u.User_Ref_ID}/${ban ? 'ban' : 'unban'}`, {
        reason: ban ? banReason.trim() : undefined
      });
      setFeedback({ type: 'success', msg: ban ? 'User banned. Their next request will be rejected.' : 'User unbanned.' });
      if (ban) setBanReason('');
      fetchUsers();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.response?.data?.error || 'Failed to update ban state.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleBulk = async (action: 'ban' | 'unban') => {
    if (!selected.length) return;
    if (action === 'ban' && !banReason.trim()) {
      setFeedback({ type: 'error', msg: 'Enter a reason before banning users.' });
      return;
    }
    try {
      const targets = users.filter((u) => selected.includes(`${u.User_Type}-${u.User_Ref_ID}`))
        .map((u) => ({ type: u.User_Type.toLowerCase(), id: u.User_Ref_ID }));
      const res = await api.post('/users/bulk', { action, users: targets, reason: banReason });
      const changed = (res.data.results || []).filter((entry: any) => entry.changed).length;
      setFeedback({ type: 'success', msg: `${changed} user account(s) updated.` });
      setSelected([]);
      setBanReason('');
      fetchUsers();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.response?.data?.error || 'Bulk update failed.' });
    }
  };

  const showDetail = async (u: ManagedUser) => {
    try {
      const res = await api.get(`/users/${u.User_Type.toLowerCase()}/${u.User_Ref_ID}`);
      setDetail(res.data);
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.response?.data?.error || 'Failed to load user details.' });
    }
  };

  const exportCsv = async (kind: 'users' | 'records' | 'activity') => {
    try {
      const params = kind === 'users'
        ? { search, role: roleFilter, status: statusFilter }
        : kind === 'records'
          ? { search: contentSearch }
          : { search: auditSearch, event: auditEventFilter };
      const res = await api.get(`/users/export/${kind}`, { responseType: 'blob', params });
      const url = URL.createObjectURL(res.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${kind}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.response?.data?.error || `Failed to export ${kind}.` });
    }
  };

  const deleteSelectedContent = async () => {
    if (!contentSelected.length) return;
    try {
      const res = await api.delete('/users/content', { data: { kind: contentKind, ids: contentSelected } });
      setFeedback({
        type: res.data.blocked?.length ? 'error' : 'success',
        msg: `${res.data.deleted.length} deleted; ${res.data.blocked.length} blocked by linked records or dependencies.`
      });
      setContentSelected([]);
      fetchContent();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.response?.data?.error || 'Content moderation failed.' });
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

      <nav className="flex flex-wrap gap-2" aria-label="Admin sections">
        {(['users', 'activity', 'security', 'content'] as AdminTab[]).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-xs font-mono rounded border ${activeTab === tab
              ? 'bg-brand-500 text-acc-950 border-brand-500'
              : 'border-acc-300 dark:border-acc-700 text-acc-600 dark:text-acc-300'}`}>
            {tab === 'users' ? 'Users' : tab === 'activity' ? 'Activity log' : tab === 'security' ? 'Security' : 'Content moderation'}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button onClick={() => exportCsv('users')} className="px-3 py-2 border rounded text-xs font-mono"><DownloadSimpleIcon size={14} /> Export users</button>
          <button onClick={() => exportCsv('records')} className="px-3 py-2 border rounded text-xs font-mono"><DownloadSimpleIcon size={14} /> Export records</button>
          <button onClick={() => exportCsv('activity')} className="px-3 py-2 border rounded text-xs font-mono"><DownloadSimpleIcon size={14} /> Export activity</button>
        </div>
      </nav>

      {activeTab === 'users' && <section className="rounded-lg border border-acc-200 dark:border-acc-800 bg-white dark:bg-acc-900 shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-acc-500 font-mono text-xs">
            <CircleNotchIcon size={18} className="animate-spin" /> Loading user accounts...
          </div>
        ) : (
          <>
          <div className="p-4 border-b border-acc-100 dark:border-acc-800 flex flex-wrap gap-3">
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name, email, or ID"
              aria-label="Search users"
              className={`${inputCls} min-w-56 flex-1`}
            />
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              aria-label="Filter by role"
              className={inputCls}
            >
              <option value="">All roles</option>
              {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              aria-label="Filter by status"
              className={inputCls}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="banned">Banned</option>
            </select>
            <input
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Reason required to ban"
              aria-label="Ban reason"
              className={`${inputCls} min-w-52 flex-1`}
              maxLength={255}
            />
            <button type="button" onClick={() => handleBulk('ban')} disabled={!selected.length}
              className="px-3 py-1 border border-red-300 text-red-600 rounded text-xs disabled:opacity-40">Ban selected</button>
            <button type="button" onClick={() => handleBulk('unban')} disabled={!selected.length}
              className="px-3 py-1 border border-green-300 text-green-600 rounded text-xs disabled:opacity-40">Unban selected</button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-acc-50 dark:bg-acc-850 text-left">
                <th className="px-3 py-2"><input type="checkbox" aria-label="Select visible users"
                  checked={visibleUsers.length > 0 && visibleUsers.every((u) => selected.includes(`${u.User_Type}-${u.User_Ref_ID}`))}
                  onChange={(e) => setSelected(e.target.checked
                    ? Array.from(new Set([...selected, ...visibleUsers.map((u) => `${u.User_Type}-${u.User_Ref_ID}`)]))
                    : selected.filter((key) => !visibleUsers.some((u) => key === `${u.User_Type}-${u.User_Ref_ID}`)))} /></th>
                <th className="px-4 py-2.5 font-mono text-[10px] uppercase text-acc-500">User</th>
                <th className="px-4 py-2.5 font-mono text-[10px] uppercase text-acc-500">Type</th>
                <th className="px-4 py-2.5 font-mono text-[10px] uppercase text-acc-500">Role</th>
                <th className="px-4 py-2.5 font-mono text-[10px] uppercase text-acc-500">Status</th>
                <th className="px-4 py-2.5 font-mono text-[10px] uppercase text-acc-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-acc-100 dark:divide-acc-800">
              {visibleUsers.map((u) => {
                const busy = busyId === `${u.User_Type}-${u.User_Ref_ID}`;
                return (
                  <tr key={`${u.User_Type}-${u.User_Ref_ID}`} className={u.Banned ? 'opacity-60' : ''}>
                    <td className="px-3 py-2"><input type="checkbox" aria-label={`Select ${u.Name || u.User_Ref_ID}`}
                      checked={selected.includes(`${u.User_Type}-${u.User_Ref_ID}`)}
                      onChange={(e) => setSelected(e.target.checked
                        ? [...selected, `${u.User_Type}-${u.User_Ref_ID}`]
                        : selected.filter((key) => key !== `${u.User_Type}-${u.User_Ref_ID}`))} /></td>
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
                        {(u.User_Type === 'Guest' ? ['Guest'] : ROLES.filter((r) => r !== 'Guest'))
                          .map((r) => <option key={r} value={r}>{r}</option>)}
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
                      <button onClick={() => showDetail(u)} className="p-1 text-acc-500 hover:text-brand-600" title="View account details">
                        <EyeIcon size={16} />
                      </button>
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
              {visibleUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-xs font-mono text-acc-500">
                    No user accounts match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="p-4 border-t border-acc-100 dark:border-acc-800 flex items-center justify-between text-xs font-mono text-acc-500">
            <span>{filteredUsers.length} user(s)</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="px-2 py-1 border rounded disabled:opacity-40"
              >
                Previous
              </button>
              <span>Page {page} of {pageCount}</span>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                className="px-2 py-1 border rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
          </>
        )}
      </section>}

      {activeTab === 'activity' && (
        <section className="panel-card p-4 overflow-x-auto">
          <div className="flex flex-wrap gap-2 mb-3">
            <h2 className="font-bold mr-auto">Recent audit events</h2>
            <input value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)} placeholder="Search event, IP, ID"
              className={inputCls} />
            <select value={auditEventFilter} onChange={(e) => setAuditEventFilter(e.target.value)} className={inputCls}>
              <option value="">All events</option>
              {['login.success', 'login.failed', 'logout', 'password.change', 'role.change', 'user.ban', 'user.unban', 'content.delete', 'export.csv']
                .map((event) => <option key={event} value={event}>{event}</option>)}
            </select>
            <button onClick={fetchAudit} className="px-3 py-1 border rounded text-xs">Apply</button>
          </div>
          <table className="w-full text-xs"><thead><tr><th>Event</th><th>User</th><th>Target</th><th>IP</th><th>Details</th><th>Time</th></tr></thead>
            <tbody>{auditEvents.map((event) => <tr key={event.Audit_ID} className="border-t border-acc-100 dark:border-acc-800">
              <td className="p-2">{event.Event_Type}</td><td className="p-2">{event.User_Type}:{event.User_ID}</td>
              <td className="p-2">{event.Target_Type}:{event.Target_ID}</td><td className="p-2">{event.IP_Address || '—'}</td>
              <td className="p-2">{event.Details || '—'}</td><td className="p-2">{String(event.Created_At)}</td>
            </tr>)}</tbody>
          </table>
          {!auditEvents.length && <p className="py-8 text-center text-xs text-acc-500">No activity recorded yet.</p>}
        </section>
      )}

      {activeTab === 'security' && (
        <section className="grid lg:grid-cols-2 gap-4">
          {(['byIp', 'byAccount'] as const).map((field) => (
            <div key={field} className="panel-card p-4 overflow-x-auto">
              <h2 className="font-bold mb-3">Failed logins {field === 'byIp' ? 'by IP' : 'by account hash'} (7 days)</h2>
              <table className="w-full text-xs"><thead><tr><th>Identifier</th><th>Attempts</th><th>Last attempt</th></tr></thead>
                <tbody>{(security?.[field] || []).map((row, index) => <tr key={index} className="border-t border-acc-100 dark:border-acc-800">
                  <td className="p-2 break-all">{row.IP_Address || row.Attempt_Hash || 'Unknown'}</td>
                  <td className="p-2">{row.Failed_Logins}</td><td className="p-2">{String(row.Last_Attempt)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          ))}
        </section>
      )}

      {activeTab === 'content' && (
        <section className="panel-card p-4 space-y-3 overflow-x-auto">
          <div className="flex flex-wrap gap-2">
            <select value={contentKind} onChange={(e) => { setContentKind(e.target.value as 'reservations' | 'hotels'); setContentSelected([]); }} className={inputCls}>
              <option value="reservations">Reservations</option><option value="hotels">Hotels / groups</option>
            </select>
            <input value={contentSearch} onChange={(e) => setContentSearch(e.target.value)} placeholder="Search content" className={inputCls} />
            <button onClick={fetchContent} className="px-3 py-1 border rounded text-xs">Search</button>
            <button onClick={deleteSelectedContent} disabled={!contentSelected.length} className="px-3 py-1 border border-red-300 text-red-600 rounded text-xs disabled:opacity-40">
              <TrashIcon size={14} /> Delete selected
            </button>
          </div>
          <table className="w-full text-xs"><thead><tr><th>Select</th><th>ID</th><th>Content</th><th>Status / details</th></tr></thead>
            <tbody>{content.map((row) => <tr key={row.id} className="border-t border-acc-100 dark:border-acc-800">
              <td className="p-2"><input type="checkbox" checked={contentSelected.includes(Number(row.id))}
                onChange={(e) => setContentSelected(e.target.checked ? [...contentSelected, Number(row.id)] : contentSelected.filter((id) => id !== Number(row.id)))} /></td>
              <td className="p-2">{row.id}</td>
              <td className="p-2">{row.guest || row.name || row.hotel}</td>
              <td className="p-2">{row.status || [row.City, row.Room_Number].filter(Boolean).join(' · ')}</td>
            </tr>)}</tbody>
          </table>
          {!content.length && <p className="py-8 text-center text-xs text-acc-500">No content matches this search.</p>}
        </section>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-acc-900 rounded-lg p-5 max-w-3xl w-full max-h-[85vh] overflow-auto">
            <div className="flex justify-between items-center mb-3"><h2 className="font-bold">Account detail</h2>
              <button onClick={() => setDetail(null)} className="px-3 py-1 border rounded text-xs">Close</button></div>
            <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(detail, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

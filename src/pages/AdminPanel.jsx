import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppContext, isNotificationForUser } from '../context/AppContext';
import { isCloudEnabled, fetchAllProfiles, updateUserRole } from '../lib/supabase';
import { Shield, Users, Activity, RefreshCw, AlertTriangle, CheckCircle, XCircle, Ban, FileText, CheckSquare, Database, Calendar, Bell, Edit2, Trash2, MessageSquare, LogIn, LogOut, UserPlus, Send, LockKeyhole } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'pm', label: 'Project Manager', color: 'text-sky-400' },
  { value: 'backend', label: 'Backend Dev', color: 'text-emerald-400' },
  { value: 'frontend', label: 'Frontend Dev', color: 'text-amber-400' },
  { value: 'guest', label: 'Guest', color: 'text-slate-400' },
  { value: 'restricted', label: 'Restricted', color: 'text-red-400' },
];

const ACTION_ICONS = {
  // Tasks
  'Created Task':       { icon: CheckSquare,   color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  'Edited Task':        { icon: Edit2,         color: 'text-sky-400',     bg: 'bg-sky-500/10' },
  'Moved Task':         { icon: Activity,      color: 'text-amber-400',   bg: 'bg-amber-500/10' },
  'Deleted Task':       { icon: Trash2,        color: 'text-red-400',     bg: 'bg-red-500/10' },
  'Commented':          { icon: MessageSquare, color: 'text-sky-400',     bg: 'bg-sky-500/10' },
  'Added Subtask':      { icon: CheckSquare,   color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  'Completed Subtask':  { icon: CheckCircle,   color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  'Unchecked Subtask':  { icon: XCircle,       color: 'text-slate-400',   bg: 'bg-slate-500/10' },
  // Events
  'Created Event':      { icon: Calendar,      color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  'Edited Event':       { icon: Edit2,         color: 'text-sky-400',     bg: 'bg-sky-500/10' },
  'Deleted Event':      { icon: Trash2,        color: 'text-red-400',     bg: 'bg-red-500/10' },
  // Minutes
  'Added Meeting':      { icon: FileText,      color: 'text-sky-400',     bg: 'bg-sky-500/10' },
  'Edited Meeting':     { icon: Edit2,         color: 'text-sky-400',     bg: 'bg-sky-500/10' },
  'Deleted Meeting':    { icon: Trash2,        color: 'text-red-400',     bg: 'bg-red-500/10' },
  // Datasets
  'Uploaded Dataset':   { icon: Database,      color: 'text-purple-400',  bg: 'bg-purple-500/10' },
  'Updated Dataset':    { icon: Edit2,         color: 'text-purple-400',  bg: 'bg-purple-500/10' },
  'Deleted Dataset':    { icon: Trash2,        color: 'text-red-400',     bg: 'bg-red-500/10' },
  // Notifications
  'Nudged Member':      { icon: Bell,          color: 'text-amber-400',   bg: 'bg-amber-500/10' },
  'Cleared Notifications': { icon: Bell,       color: 'text-slate-400',   bg: 'bg-slate-500/10' },
  // Auth
  'Signed In':          { icon: LogIn,         color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  'Signed Out':         { icon: LogOut,        color: 'text-slate-400',   bg: 'bg-slate-500/10' },
  'Signed Up':          { icon: UserPlus,      color: 'text-sky-400',     bg: 'bg-sky-500/10' },
  // System
  'Imported Backup':    { icon: RefreshCw,     color: 'text-sky-400',     bg: 'bg-sky-500/10' },
  // Access requests
  'Requested Access':   { icon: LockKeyhole,   color: 'text-amber-400',   bg: 'bg-amber-500/10' },
};

const AdminPanel = () => {
  const { user, activityLog, notifications, clearNotifications, refreshActivityLog } = useAppContext();
  const [tab, setTab] = useState('users');
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [activityFilter, setActivityFilter] = useState('all');

  const isAdmin = user?.permissions?.isAdmin;
  const lastFetchRef = useRef(0);

  const loadData = useCallback(async ({ force = false } = {}) => {
    if (!isCloudEnabled) return;
    const now = Date.now();
    if (!force && now - lastFetchRef.current < 30_000) return;
    lastFetchRef.current = now;
    setLoading(true);
    // Refresh profiles AND activity log so the Actions counter reflects the
    // true server count, not whatever happened to arrive on this device.
    const [p] = await Promise.all([fetchAllProfiles(), refreshActivityLog()]);
    if (p) setProfiles(p);
    setLoading(false);
  }, [refreshActivityLog]);

  // Initial load on mount
  useEffect(() => {
    if (isAdmin) loadData({ force: true });
  }, [isAdmin, loadData]);

  // Re-fetch when tab regains focus so profiles/activity stay current
  useEffect(() => {
    if (!isAdmin) return;
    const onVisible = () => { if (document.visibilityState === 'visible') loadData(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isAdmin, loadData]);

  const handleRoleChange = async (userId, newRole) => {
    setActionLoading(userId);
    const { error } = await updateUserRole(userId, newRole);
    if (error) {
      alert(`Failed to update role: ${error}`);
    } else {
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, role: newRole } : p));
    }
    setActionLoading(null);
    setConfirmAction(null);
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  // Activity log filtering
  const actionTypes = [...new Set((activityLog || []).map(e => e.action))];
  const filteredActivity = activityFilter === 'all'
    ? (activityLog || [])
    : (activityLog || []).filter(e => e.action === activityFilter);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-140px)]">
        <div className="text-center">
          <Shield size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-100 mb-2">Admin Access Required</h2>
          <p className="text-slate-500">Only the Project Manager can access this panel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2 sm:gap-3">
            <Shield className="text-sky-400" size={24} /> Admin Panel
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm">Manage team members and view activity</p>
        </div>
        <button
          onClick={() => loadData({ force: true })}
          disabled={loading}
          aria-label="Refresh data"
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg font-bold hover:bg-slate-700 transition active:scale-95 disabled:opacity-50 text-sm"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-slate-900/50 p-3 sm:p-5 rounded-xl border border-slate-800">
          <div className="flex items-center gap-1.5 sm:gap-2 text-slate-400 mb-1 sm:mb-2"><Users size={14} className="sm:w-[18px] sm:h-[18px]" /> <span className="text-[10px] sm:text-sm">Members</span></div>
          <p className="text-lg sm:text-2xl font-bold text-slate-100">{profiles.filter(p => p.role !== 'restricted').length}</p>
        </div>
        <div className="bg-slate-900/50 p-3 sm:p-5 rounded-xl border border-slate-800">
          <div className="flex items-center gap-1.5 sm:gap-2 text-red-400 mb-1 sm:mb-2"><Ban size={14} className="sm:w-[18px] sm:h-[18px]" /> <span className="text-[10px] sm:text-sm">Restricted</span></div>
          <p className="text-lg sm:text-2xl font-bold text-red-400">{profiles.filter(p => p.role === 'restricted').length}</p>
        </div>
        <div className="bg-slate-900/50 p-3 sm:p-5 rounded-xl border border-slate-800">
          <div className="flex items-center gap-1.5 sm:gap-2 text-emerald-400 mb-1 sm:mb-2"><Activity size={14} className="sm:w-[18px] sm:h-[18px]" /> <span className="text-[10px] sm:text-sm">Actions</span></div>
          <p className="text-lg sm:text-2xl font-bold text-emerald-400">{(activityLog || []).length}</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="grid grid-cols-3 sm:flex sm:w-fit gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-800">
        <button
          onClick={() => setTab('users')}
          className={`px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap ${tab === 'users' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
        >
          <Users size={14} className="sm:w-4 sm:h-4" /> <span className="hidden xs:inline">Users</span><span className="xs:hidden">Users</span>
        </button>
        <button
          onClick={() => setTab('notifications')}
          className={`px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 sm:gap-2 relative whitespace-nowrap ${tab === 'notifications' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
        >
          <Bell size={14} className="sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Notifications</span><span className="sm:hidden">Notifs</span>
          {(() => {
            const unread = (notifications || []).filter(n => !n.read && isNotificationForUser(n, user)).length;
            return unread > 0 ? <span className="ml-0.5 sm:ml-1 px-1.5 py-0.5 bg-amber-500 text-white text-[10px] rounded-full font-bold">{unread}</span> : null;
          })()}
        </button>
        <button
          onClick={() => setTab('activity')}
          className={`px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap ${tab === 'activity' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
        >
          <Activity size={14} className="sm:w-4 sm:h-4" /> Activity
        </button>
      </div>

      {/* USER MANAGEMENT TAB */}
      {tab === 'users' && (
        <>
          {loading ? (
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-8 text-center text-slate-500">
              <RefreshCw size={20} className="animate-spin mx-auto mb-2" />Loading...
            </div>
          ) : profiles.length === 0 ? (
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-8 text-center text-slate-500">
              No users found. Users will appear here after signing up.
            </div>
          ) : (
            <>
              {/* Desktop table — hidden on small screens */}
              <div className="hidden md:block bg-slate-900/50 rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-800/30 border-b border-slate-800 text-xs font-bold text-slate-500 uppercase">
                    <tr>
                      <th className="p-4">User</th>
                      <th className="p-4">Email</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Joined</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {profiles.map(p => {
                      const roleOpt = ROLE_OPTIONS.find(r => r.value === p.role);
                      const isSelf = p.id === user?.id;
                      return (
                        <tr key={p.id} className={`hover:bg-slate-800/50 transition ${p.role === 'restricted' ? 'opacity-60' : ''}`}>
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center font-bold text-white text-xs uppercase shrink-0">
                                {p.name?.charAt(0) || '?'}
                              </div>
                              <p className="font-bold text-slate-200 text-sm truncate max-w-[140px]">{p.name}{isSelf && <span className="text-sky-400 text-[10px] ml-1">(you)</span>}</p>
                            </div>
                          </td>
                          <td className="p-4 text-slate-400 text-xs font-mono truncate max-w-[200px]">{p.email}</td>
                          <td className="p-4">
                            <span className={`text-xs px-2 py-1 rounded font-bold whitespace-nowrap ${roleOpt?.color || 'text-slate-400'} ${p.role === 'restricted' ? 'bg-red-500/15' : 'bg-slate-800'}`}>
                              {roleOpt?.label || p.role}
                            </span>
                          </td>
                          <td className="p-4 text-slate-500 text-xs whitespace-nowrap">{new Date(p.created_at).toLocaleDateString()}</td>
                          <td className="p-4 text-right">
                            {isSelf ? (
                              <span className="text-xs text-slate-600">—</span>
                            ) : actionLoading === p.id ? (
                              <RefreshCw size={16} className="animate-spin text-slate-400 ml-auto" />
                            ) : (
                              <div className="flex gap-2 justify-end">
                                {p.role === 'restricted' ? (
                                  <button
                                    onClick={() => setConfirmAction({ userId: p.id, name: p.name, newRole: 'guest', action: 'admit' })}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600/15 text-emerald-400 rounded-lg text-xs font-bold hover:bg-emerald-600/25 transition whitespace-nowrap"
                                  >
                                    <CheckCircle size={14} /> Admit
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setConfirmAction({ userId: p.id, name: p.name, newRole: 'restricted', action: 'restrict' })}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-xs font-bold hover:bg-red-500/20 transition whitespace-nowrap"
                                  >
                                    <Ban size={14} /> Restrict
                                  </button>
                                )}
                                <select
                                  value={p.role}
                                  onChange={(e) => setConfirmAction({ userId: p.id, name: p.name, newRole: e.target.value, action: 'change role to ' + e.target.value })}
                                  className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1.5 outline-none cursor-pointer hover:border-slate-600 transition"
                                >
                                  {ROLE_OPTIONS.map(r => (
                                    <option key={r.value} value={r.value} className="bg-slate-900">{r.label}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile card layout — visible on small screens */}
              <div className="md:hidden space-y-3">
                {profiles.map(p => {
                  const roleOpt = ROLE_OPTIONS.find(r => r.value === p.role);
                  const isSelf = p.id === user?.id;
                  return (
                    <div key={p.id} className={`bg-slate-900/50 rounded-xl border border-slate-800 p-4 space-y-3 ${p.role === 'restricted' ? 'opacity-60' : ''}`}>
                      {/* User header */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center font-bold text-white text-sm uppercase shrink-0">
                          {p.name?.charAt(0) || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-200 text-sm truncate">
                            {p.name}{isSelf && <span className="text-sky-400 text-[10px] ml-1">(you)</span>}
                          </p>
                          <p className="text-slate-400 text-xs font-mono truncate">{p.email}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap shrink-0 ${roleOpt?.color || 'text-slate-400'} ${p.role === 'restricted' ? 'bg-red-500/15' : 'bg-slate-800'}`}>
                          {roleOpt?.label || p.role}
                        </span>
                      </div>
                      {/* Meta + actions */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/50">
                        <span className="text-[10px] text-slate-500">Joined {new Date(p.created_at).toLocaleDateString()}</span>
                        {isSelf ? (
                          <span className="text-[10px] text-slate-600">—</span>
                        ) : actionLoading === p.id ? (
                          <RefreshCw size={14} className="animate-spin text-slate-400" />
                        ) : (
                          <div className="flex gap-2 items-center">
                            {p.role === 'restricted' ? (
                              <button
                                onClick={() => setConfirmAction({ userId: p.id, name: p.name, newRole: 'guest', action: 'admit' })}
                                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600/15 text-emerald-400 rounded-lg text-[10px] font-bold hover:bg-emerald-600/25 transition"
                              >
                                <CheckCircle size={12} /> Admit
                              </button>
                            ) : (
                              <button
                                onClick={() => setConfirmAction({ userId: p.id, name: p.name, newRole: 'restricted', action: 'restrict' })}
                                className="flex items-center gap-1 px-2.5 py-1 bg-red-500/10 text-red-400 rounded-lg text-[10px] font-bold hover:bg-red-500/20 transition"
                              >
                                <Ban size={12} /> Restrict
                              </button>
                            )}
                            <select
                              value={p.role}
                              onChange={(e) => setConfirmAction({ userId: p.id, name: p.name, newRole: e.target.value, action: 'change role to ' + e.target.value })}
                              className="bg-slate-800 border border-slate-700 text-slate-300 text-[10px] rounded-lg px-1.5 py-1 outline-none cursor-pointer hover:border-slate-600 transition max-w-[100px]"
                            >
                              {ROLE_OPTIONS.map(r => (
                                <option key={r.value} value={r.value} className="bg-slate-900">{r.label}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* NOTIFICATIONS TAB */}
      {tab === 'notifications' && (() => {
        const myNotifs = (notifications || []).filter(n => isNotificationForUser(n, user))
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const accessRequests = myNotifs.filter(n => n.type === 'access_request');
        const otherNotifs = myNotifs.filter(n => n.type !== 'access_request');

        return (
          <div className="space-y-4">
            {/* Access Requests Section */}
            {accessRequests.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-amber-400 uppercase mb-3 flex items-center gap-2"><LockKeyhole size={16} /> Access Requests</h3>
                <div className="bg-slate-900/50 rounded-xl border border-slate-800 divide-y divide-slate-800">
                  {accessRequests.map(n => {
                    // Try to find the user in profiles for quick role assign
                    const matchedProfile = profiles.find(p =>
                      (n.from_email && p.email === n.from_email) ||
                      (n.from_user && p.name === n.from_user)
                    );
                    return (
                      <div key={n.id} className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                            <Send size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-200">{n.message}</p>
                            <p className="text-[10px] text-slate-500 mt-1">{timeAgo(n.created_at)}</p>
                          </div>
                        </div>
                        {/* Quick role assign buttons */}
                        {matchedProfile && matchedProfile.role === 'guest' && (
                          <div className="mt-3 ml-12 flex flex-wrap gap-2">
                            <span className="text-[10px] text-slate-500 self-center mr-1">Quick assign:</span>
                            {[
                              { role: 'frontend', label: 'Frontend', color: 'bg-amber-600 hover:bg-amber-500' },
                              { role: 'backend', label: 'Backend', color: 'bg-emerald-600 hover:bg-emerald-500' },
                            ].map(opt => (
                              <button
                                key={opt.role}
                                onClick={() => setConfirmAction({ userId: matchedProfile.id, name: matchedProfile.name, newRole: opt.role, action: `change role to ${opt.role}` })}
                                className={`text-[10px] px-2.5 py-1 rounded-lg font-bold text-white transition ${opt.color}`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Other Notifications */}
            {otherNotifs.length > 0 && (
              <div className="bg-slate-900/50 rounded-xl border border-slate-800 divide-y divide-slate-800">
                {otherNotifs.map(n => (
                  <div key={n.id} className="p-4 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
                      <Bell size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200">{n.message}</p>
                      <p className="text-[10px] text-slate-500 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {myNotifs.length === 0 && (
              <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-8 text-center text-slate-500">
                <Bell size={32} className="mx-auto mb-2 text-slate-600" />
                <p>No notifications yet.</p>
                <p className="text-xs mt-1">Access requests from team members will appear here.</p>
              </div>
            )}

            {myNotifs.length > 0 && (
              <button onClick={clearNotifications} className="text-xs text-slate-500 hover:text-red-400 transition font-bold">
                Clear all notifications
              </button>
            )}
          </div>
        );
      })()}

      {/* ACTIVITY LOG TAB */}
      {tab === 'activity' && (
        <div className="space-y-4">
          {/* Filter */}
          <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar -mx-1 px-1">
            <button
              onClick={() => setActivityFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 ${activityFilter === 'all' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'}`}
            >
              All
            </button>
            {actionTypes.map(action => (
              <button
                key={action}
                onClick={() => setActivityFilter(action)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 ${activityFilter === action ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'}`}
              >
                {action}
              </button>
            ))}
          </div>

          {/* Log entries */}
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
            {filteredActivity.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Activity size={32} className="mx-auto mb-2 text-slate-600" />
                <p>No activity recorded yet.</p>
                <p className="text-xs mt-1">Actions like creating tasks, moving tasks, and uploading datasets will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800 max-h-[500px] overflow-y-auto custom-scrollbar">
                {filteredActivity.map(entry => {
                  const config = ACTION_ICONS[entry.action] || { icon: Activity, color: 'text-slate-400', bg: 'bg-slate-500/10' };
                  const Icon = config.icon;
                  return (
                    <div key={entry.id} className="p-3 sm:p-4 flex items-start sm:items-center gap-3 sm:gap-4 hover:bg-slate-800/30 transition">
                      <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full ${config.bg} ${config.color} flex items-center justify-center shrink-0`}>
                        <Icon size={16} className="sm:w-[18px] sm:h-[18px]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <span className="font-bold text-xs sm:text-sm text-slate-200 truncate max-w-[120px] sm:max-w-none">{entry.user_name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap ${config.color} ${config.bg}`}>
                            {entry.action}
                          </span>
                          <span className="text-[10px] text-slate-500 sm:hidden">{timeAgo(entry.created_at)}</span>
                        </div>
                        {entry.details && (
                          <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate">{entry.details}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0 hidden sm:block">
                        <p className="text-xs text-slate-500">{timeAgo(entry.created_at)}</p>
                        <p className="text-[10px] text-slate-600">{entry.time || ''}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONFIRM ACTION MODAL */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] animate-fade-in">
          <div className="bg-slate-900 p-6 rounded-2xl w-[calc(100%-2rem)] max-w-[420px] shadow-2xl text-center border border-slate-700 mx-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${confirmAction.newRole === 'restricted' ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
              {confirmAction.newRole === 'restricted' ? <Ban size={32} /> : <CheckCircle size={32} />}
            </div>
            <h3 className="text-xl font-bold text-slate-100 mb-2">
              {confirmAction.action === 'restrict' ? 'Restrict User?' : confirmAction.action === 'admit' ? 'Admit User?' : 'Change Role?'}
            </h3>
            <p className="text-slate-400 text-sm mb-6">
              {confirmAction.action === 'restrict'
                ? <><span className="font-bold text-white">{confirmAction.name}</span> will be blocked from accessing the workspace.</>
                : confirmAction.action === 'admit'
                ? <><span className="font-bold text-white">{confirmAction.name}</span> will be given guest access to the workspace.</>
                : <><span className="font-bold text-white">{confirmAction.name}</span>'s role will be changed to <span className="font-bold text-sky-400">{confirmAction.newRole}</span>.</>
              }
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirmAction(null)} className="px-5 py-2.5 rounded-xl font-bold text-slate-300 hover:bg-slate-800 transition">Cancel</button>
              <button
                onClick={() => handleRoleChange(confirmAction.userId, confirmAction.newRole)}
                className={`px-5 py-2.5 rounded-xl font-bold text-white transition shadow-lg ${confirmAction.newRole === 'restricted' ? 'bg-red-600 hover:bg-red-700 shadow-red-900/30' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30'}`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;

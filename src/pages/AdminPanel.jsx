import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { isCloudEnabled, fetchAllProfiles, updateUserRole } from '../lib/supabase';
import { Shield, Users, Activity, RefreshCw, AlertTriangle, CheckCircle, XCircle, Ban, FileText, CheckSquare, Database, Calendar, Bell, Edit2, Trash2, MessageSquare, LogIn, LogOut, UserPlus } from 'lucide-react';

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
};

const AdminPanel = () => {
  const { user, activityLog } = useAppContext();
  const [tab, setTab] = useState('users');
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [activityFilter, setActivityFilter] = useState('all');

  const isAdmin = user?.permissions?.isAdmin;

  const loadData = useCallback(async () => {
    if (!isCloudEnabled) return;
    setLoading(true);
    const p = await fetchAllProfiles();
    if (p) setProfiles(p);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) loadData();
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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <Shield className="text-sky-400" size={28} /> Admin Panel
          </h2>
          <p className="text-slate-500 text-sm">Manage team members and view workspace activity</p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg font-bold hover:bg-slate-700 transition active:scale-95 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 text-slate-400 mb-2"><Users size={18} /> Team Members</div>
          <p className="text-2xl font-bold text-slate-100">{profiles.filter(p => p.role !== 'restricted').length}</p>
        </div>
        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 text-red-400 mb-2"><Ban size={18} /> Restricted</div>
          <p className="text-2xl font-bold text-red-400">{profiles.filter(p => p.role === 'restricted').length}</p>
        </div>
        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 text-emerald-400 mb-2"><Activity size={18} /> Recent Actions</div>
          <p className="text-2xl font-bold text-emerald-400">{(activityLog || []).length}</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 bg-slate-900/50 p-1 rounded-lg border border-slate-800 w-fit">
        <button
          onClick={() => setTab('users')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${tab === 'users' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
        >
          <Users size={16} /> User Management
        </button>
        <button
          onClick={() => setTab('activity')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${tab === 'activity' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
        >
          <Activity size={16} /> Activity Log
        </button>
      </div>

      {/* USER MANAGEMENT TAB */}
      {tab === 'users' && (
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
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
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500"><RefreshCw size={20} className="animate-spin mx-auto mb-2" />Loading...</td></tr>
              ) : profiles.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500">No users found. Users will appear here after signing up.</td></tr>
              ) : (
                profiles.map(p => {
                  const roleOpt = ROLE_OPTIONS.find(r => r.value === p.role);
                  const isSelf = p.id === user?.id;
                  return (
                    <tr key={p.id} className={`hover:bg-slate-800/50 transition ${p.role === 'restricted' ? 'opacity-60' : ''}`}>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center font-bold text-white text-xs uppercase">
                            {p.name?.charAt(0) || '?'}
                          </div>
                          <div>
                            <p className="font-bold text-slate-200 text-sm">{p.name}{isSelf && <span className="text-sky-400 text-[10px] ml-2">(you)</span>}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-slate-400 text-sm font-mono">{p.email}</td>
                      <td className="p-4">
                        <span className={`text-xs px-2 py-1 rounded font-bold ${roleOpt?.color || 'text-slate-400'} ${p.role === 'restricted' ? 'bg-red-500/15' : 'bg-slate-800'}`}>
                          {roleOpt?.label || p.role}
                        </span>
                      </td>
                      <td className="p-4 text-slate-500 text-sm">{new Date(p.created_at).toLocaleDateString()}</td>
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
                                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600/15 text-emerald-400 rounded-lg text-xs font-bold hover:bg-emerald-600/25 transition"
                              >
                                <CheckCircle size={14} /> Admit
                              </button>
                            ) : (
                              <button
                                onClick={() => setConfirmAction({ userId: p.id, name: p.name, newRole: 'restricted', action: 'restrict' })}
                                className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-xs font-bold hover:bg-red-500/20 transition"
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
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ACTIVITY LOG TAB */}
      {tab === 'activity' && (
        <div className="space-y-4">
          {/* Filter */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActivityFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activityFilter === 'all' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'}`}
            >
              All Actions
            </button>
            {actionTypes.map(action => (
              <button
                key={action}
                onClick={() => setActivityFilter(action)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activityFilter === action ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'}`}
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
                    <div key={entry.id} className="p-4 flex items-center gap-4 hover:bg-slate-800/30 transition">
                      <div className={`w-9 h-9 rounded-full ${config.bg} ${config.color} flex items-center justify-center shrink-0`}>
                        <Icon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-200">{entry.user_name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${config.color} ${config.bg}`}>
                            {entry.action}
                          </span>
                        </div>
                        {entry.details && (
                          <p className="text-xs text-slate-500 mt-0.5 truncate">{entry.details}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] animate-enter">
          <div className="bg-slate-900 p-6 rounded-2xl w-[420px] shadow-2xl text-center border border-slate-700">
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

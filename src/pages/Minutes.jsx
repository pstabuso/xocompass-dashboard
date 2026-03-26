import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Plus, FileText, ExternalLink, X, Trash2, Edit2, AlertTriangle, LockKeyhole, Send } from 'lucide-react';

/* ISO 25010 Security: Strict URL allowlist — only http(s) schemes permitted */
const safeUrl = (url) => {
  if (!url) return '#';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Block javascript:, data:, blob:, vbscript:, and all other non-http schemes
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return '#';
  return 'https://' + trimmed;
};

const Minutes = () => {
  const { minutes, addMinute, updateMinute, deleteMinute, user, requestAccess } = useAppContext();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ date: '', topic: '', link: '' });
  const [accessSent, setAccessSent] = useState(false);

  // Sorted list derived from context — no duplicate state
  const sortedMinutes = useMemo(
    () => [...(minutes || [])].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [minutes]
  );

  const handleEdit = (meeting) => {
    if (!user?.permissions?.canCreate) return;
    setFormData({ date: meeting.date, topic: meeting.topic, link: meeting.link });
    setEditingId(meeting.id);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (id) => {
    if (!user?.permissions?.canDelete) return;
    setIsDeleteConfirmOpen(id);
  };

  const confirmDelete = () => {
    if (!user?.permissions?.canDelete) return;
    deleteMinute(isDeleteConfirmOpen);
    setIsDeleteConfirmOpen(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!user?.permissions?.canCreate) return;
    if (editingId) {
      updateMinute(editingId, formData);
    } else {
      // Use snake_case field names to match Supabase schema
      addMinute(formData);
    }
    closeModal();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData({ date: '', topic: '', link: '' });
    setEditingId(null);
  };

  return (
    <div className="space-y-3 sm:space-y-6 animate-enter">
      {!user?.permissions?.canCreate && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3">
          <LockKeyhole size={16} className="text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300 flex-1">You're in <span className="font-bold">view-only</span> mode. Need edit access?</p>
          {accessSent ? (
            <span className="text-[10px] px-2 py-1 bg-emerald-500/15 text-emerald-400 rounded font-bold shrink-0 flex items-center gap-1"><Send size={10} /> Sent</span>
          ) : (
            <button onClick={() => { requestAccess('Edit on Minutes of Meeting', 'action'); setAccessSent(true); }} className="text-[10px] px-2.5 py-1 bg-pink-600 text-white rounded font-bold hover:bg-pink-500 transition shrink-0">
              Request
            </button>
          )}
        </div>
      )}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
           <h2 className="text-xl sm:text-2xl font-bold text-slate-100">Minutes of Meeting</h2>
           <p className="text-slate-500 text-xs sm:text-sm">Centralized repository for Google Docs</p>
        </div>
        {user?.permissions?.canCreate && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center space-x-2 bg-pink-600 text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold shadow-lg shadow-pink-900/20 transition-all duration-300 ease-in-out hover:bg-pink-500 hover:scale-105 active:scale-95"
          >
            <Plus size={18} /> <span>Log Meeting</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4">
        {sortedMinutes.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-xl">
                <FileText size={48} className="mx-auto text-slate-600 mb-2"/>
                <p className="text-slate-500">No meetings logged yet.</p>
            </div>
        ) : (
            sortedMinutes.map((meeting) => (
            <div key={meeting.id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:border-slate-700 transition-all duration-300 group">
                <div className="flex items-start space-x-3 sm:space-x-4 min-w-0 flex-1">
                    <div className="bg-pink-600/15 p-2 sm:p-3 rounded-lg text-pink-400 group-hover:scale-110 transition-transform duration-300 shrink-0">
                        <FileText size={20} />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-bold text-slate-100 text-base sm:text-lg group-hover:text-pink-400 transition-colors truncate">{meeting.topic}</h3>
                        <p className="text-slate-500 text-xs sm:text-sm flex items-center gap-2">
                            <span>{meeting.date}</span>
                            <span className="w-1 h-1 rounded-full bg-slate-600 hidden sm:block"></span>
                            <span className="hidden sm:inline">Logged by {user?.name || 'Admin'}</span>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto shrink-0">
                    <a
                      href={safeUrl(meeting.link)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center space-x-1.5 sm:space-x-2 bg-slate-800/50 text-slate-300 px-2.5 sm:px-4 py-2 rounded-lg font-bold border border-slate-700 transition-all duration-200 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30 active:scale-95 text-sm"
                      aria-label="Open document"
                    >
                        <span className="hidden sm:inline">Open</span>
                        <ExternalLink size={14} />
                    </a>
                    {user?.permissions?.canCreate && (
                      <button onClick={() => handleEdit(meeting)} className="p-2 text-slate-600 hover:text-pink-400 hover:bg-pink-500/10 rounded-lg transition-all" aria-label="Edit meeting"><Edit2 size={16}/></button>
                    )}
                    {user?.permissions?.canDelete && (
                      <button onClick={() => handleDeleteClick(meeting.id)} className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" aria-label="Delete meeting"><Trash2 size={16}/></button>
                    )}
                </div>
            </div>
            ))
        )}
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteConfirmOpen && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] animate-fade-in">
            <div className="bg-slate-900 p-6 rounded-2xl w-[calc(100%-2rem)] max-w-[400px] shadow-2xl text-center border border-slate-700 mx-4">
                <div className="w-16 h-16 bg-red-500/15 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-2">Delete this entry?</h3>
                <p className="text-slate-400 text-sm mb-6">This action cannot be undone. Are you sure you want to remove this meeting log?</p>
                <div className="flex gap-3 justify-center">
                    <button onClick={() => setIsDeleteConfirmOpen(null)} className="px-5 py-2.5 rounded-xl font-bold text-slate-300 hover:bg-slate-800 transition">Cancel</button>
                    <button onClick={confirmDelete} className="px-5 py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition shadow-lg shadow-red-900/30">Yes, Delete</button>
                </div>
            </div>
         </div>
      )}

      {/* EDIT/CREATE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="relative bg-slate-900 p-5 sm:p-6 rounded-2xl w-[calc(100%-2rem)] max-w-[500px] shadow-2xl transform transition-all scale-100 border border-slate-700 mx-4">
             <button onClick={closeModal} className="absolute top-4 right-4 p-1 rounded-full hover:bg-slate-800 transition"><X size={20} className="text-slate-400" /></button>
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-100">{editingId ? 'Edit Meeting Log' : 'Log New Meeting'}</h3>
             </div>
             <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
                    <input required type="date" className="w-full bg-slate-800 border border-slate-700 text-white p-3 rounded-xl outline-none focus:ring-2 focus:ring-pink-500 transition-all" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Meeting Topic</label>
                    <input required placeholder="e.g. Chapter 1 Revisions" className="w-full bg-slate-800 border border-slate-700 text-white p-3 rounded-xl outline-none focus:ring-2 focus:ring-pink-500 transition-all placeholder-slate-500" value={formData.topic} onChange={e => setFormData({...formData, topic: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Google Docs Link</label>
                    <div className="relative">
                        <ExternalLink size={18} className="absolute left-3 top-3.5 text-slate-500"/>
                        <input required placeholder="https://docs.google.com/document/d/..." className="w-full bg-slate-800 border border-slate-700 text-white pl-10 pr-3 py-3 rounded-xl outline-none focus:ring-2 focus:ring-pink-500 transition-all placeholder-slate-500" value={formData.link} onChange={e => setFormData({...formData, link: e.target.value})} />
                    </div>
                </div>
                <button className="w-full bg-pink-600 text-white p-3 rounded-xl font-bold shadow-lg shadow-pink-900/20 transition-all duration-300 hover:bg-pink-500 hover:scale-[1.02] active:scale-95">
                    {editingId ? 'Update Log' : 'Save Meeting'}
                </button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Minutes;

import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Plus, FileText, ExternalLink, X, Trash2, Edit2, AlertTriangle } from 'lucide-react';

const safeUrl = (url) => {
  if (!url) return '#';
  if (url.match(/^https?:\/\//i)) return url;
  if (url.match(/^javascript:/i)) return '#';
  return 'https://' + url;
};

const Minutes = () => {
  const { minutes, addMinute, updateMinute, deleteMinute, user } = useAppContext();

  // Safe fallback if minutes is undefined in context
  const safeMinutes = minutes || [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ date: '', topic: '', link: '' });

  // Local state to handle immediate UI updates if Context is slow
  const [localList, setLocalList] = useState(safeMinutes);

  useEffect(() => {
    setLocalList(safeMinutes);
  }, [minutes]);

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
    setLocalList(localList.filter(m => m.id !== isDeleteConfirmOpen));
    setIsDeleteConfirmOpen(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!user?.permissions?.canCreate) return;
    if (editingId) {
      // Edit Logic
      updateMinute(editingId, formData);
      setLocalList(localList.map(m => m.id === editingId ? { ...m, ...formData } : m));
    } else {
      // Add Logic
      const newM = { ...formData, id: Date.now(), actionPoint: 'See Doc', items: [], notes: 'Linked via App' };
      addMinute(newM); // Sync with Context
      setLocalList([...localList, newM]); // Sync Local
    }
    closeModal();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData({ date: '', topic: '', link: '' });
    setEditingId(null);
  };

  return (
    <div className="space-y-6 animate-enter">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold text-slate-100">Minutes of Meeting</h2>
           <p className="text-slate-500 text-sm">Centralized repository for Google Docs</p>
        </div>
        {user?.permissions?.canCreate && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center space-x-2 bg-sky-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-sky-900/20 transition-all duration-300 ease-in-out hover:bg-sky-500 hover:scale-105 active:scale-95"
          >
            <Plus size={18} /> <span>Log Meeting</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {localList.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-xl">
                <FileText size={48} className="mx-auto text-slate-600 mb-2"/>
                <p className="text-slate-500">No meetings logged yet.</p>
            </div>
        ) : (
            localList.sort((a,b) => new Date(b.date) - new Date(a.date)).map((meeting) => (
            <div key={meeting.id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 flex justify-between items-center hover:border-slate-700 transition-all duration-300 group">
                <div className="flex items-start space-x-4">
                    <div className="bg-sky-600/15 p-3 rounded-lg text-sky-400 group-hover:scale-110 transition-transform duration-300">
                        <FileText size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-100 text-lg group-hover:text-sky-400 transition-colors">{meeting.topic}</h3>
                        <p className="text-slate-500 text-sm flex items-center gap-2">
                            <span>{meeting.date}</span>
                            <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                            <span>Logged by {user?.name || 'Admin'}</span>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <a
                      href={safeUrl(meeting.link)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center space-x-2 bg-slate-800/50 text-slate-300 px-4 py-2 rounded-lg font-bold border border-slate-700 transition-all duration-200 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30 active:scale-95"
                    >
                        <span>Open Doc</span>
                        <ExternalLink size={16} />
                    </a>
                    {user?.permissions?.canCreate && (
                      <button onClick={() => handleEdit(meeting)} className="p-2 text-slate-600 hover:text-sky-400 hover:bg-sky-500/10 rounded-lg transition-all"><Edit2 size={18}/></button>
                    )}
                    {user?.permissions?.canDelete && (
                      <button onClick={() => handleDeleteClick(meeting.id)} className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"><Trash2 size={18}/></button>
                    )}
                </div>
            </div>
            ))
        )}
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteConfirmOpen && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] animate-enter">
            <div className="bg-slate-900 p-6 rounded-2xl w-[400px] shadow-2xl text-center border border-slate-700">
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-enter">
          <div className="relative bg-slate-900 p-6 rounded-2xl w-[500px] shadow-2xl transform transition-all scale-100 border border-slate-700">
             <button onClick={closeModal} className="absolute top-4 right-4 p-1 rounded-full hover:bg-slate-800 transition"><X size={20} className="text-slate-400" /></button>
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-100">{editingId ? 'Edit Meeting Log' : 'Log New Meeting'}</h3>
             </div>
             <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
                    <input required type="date" className="w-full bg-slate-800 border border-slate-700 text-white p-3 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 transition-all" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Meeting Topic</label>
                    <input required placeholder="e.g. Chapter 1 Revisions" className="w-full bg-slate-800 border border-slate-700 text-white p-3 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 transition-all placeholder-slate-500" value={formData.topic} onChange={e => setFormData({...formData, topic: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Google Docs Link</label>
                    <div className="relative">
                        <ExternalLink size={18} className="absolute left-3 top-3.5 text-slate-500"/>
                        <input required placeholder="https://docs.google.com/document/d/..." className="w-full bg-slate-800 border border-slate-700 text-white pl-10 pr-3 py-3 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 transition-all placeholder-slate-500" value={formData.link} onChange={e => setFormData({...formData, link: e.target.value})} />
                    </div>
                </div>
                <button className="w-full bg-sky-600 text-white p-3 rounded-xl font-bold shadow-lg shadow-sky-900/20 transition-all duration-300 hover:bg-sky-500 hover:scale-[1.02] active:scale-95">
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

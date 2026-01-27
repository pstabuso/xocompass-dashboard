import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Plus, FileText, ExternalLink, X, Trash2, Edit2, AlertTriangle } from 'lucide-react';

const Minutes = () => {
  const { minutes, addMinute, user } = useAppContext();
  
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
    setFormData({ date: meeting.date, topic: meeting.topic, link: meeting.link });
    setEditingId(meeting.id);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (id) => {
    setIsDeleteConfirmOpen(id);
  };

  const confirmDelete = () => {
    // Logic to remove from local list (and ideally Context)
    setLocalList(localList.filter(m => m.id !== isDeleteConfirmOpen));
    setIsDeleteConfirmOpen(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId) {
      // Edit Logic
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
           <h2 className="text-2xl font-bold text-slate-800">Minutes of Meeting</h2>
           <p className="text-slate-500 text-sm">Centralized repository for Google Docs</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)} 
          className="flex items-center space-x-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all duration-300 ease-in-out hover:bg-blue-700 hover:scale-105 active:scale-95"
        >
          <Plus size={18} /> <span>Log Meeting</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {localList.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                <FileText size={48} className="mx-auto text-slate-300 mb-2"/>
                <p className="text-slate-400">No meetings logged yet.</p>
            </div>
        ) : (
            localList.sort((a,b) => new Date(b.date) - new Date(a.date)).map((meeting) => (
            <div key={meeting.id} className="bg-white border border-slate-200 rounded-xl p-5 flex justify-between items-center shadow-sm hover:shadow-md transition-all duration-300 group">
                <div className="flex items-start space-x-4">
                    <div className="bg-blue-50 p-3 rounded-lg text-blue-600 group-hover:scale-110 transition-transform duration-300">
                        <FileText size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800 text-lg group-hover:text-blue-600 transition-colors">{meeting.topic}</h3>
                        <p className="text-slate-500 text-sm flex items-center gap-2">
                            <span>{meeting.date}</span>
                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                            <span>Logged by {user?.name || 'Admin'}</span>
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    <a 
                      href={meeting.link.startsWith('http') ? meeting.link : `https://${meeting.link}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center space-x-2 bg-slate-50 text-slate-600 px-4 py-2 rounded-lg font-bold border border-slate-200 transition-all duration-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 active:scale-95"
                    >
                        <span>Open Doc</span>
                        <ExternalLink size={16} />
                    </a>
                    {/* Only show Edit/Delete if user has permissions (Optional refinement) */}
                    <button onClick={() => handleEdit(meeting)} className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Edit2 size={18}/></button>
                    <button onClick={() => handleDeleteClick(meeting.id)} className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={18}/></button>
                </div>
            </div>
            ))
        )}
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteConfirmOpen && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] animate-enter">
            <div className="bg-white p-6 rounded-2xl w-[400px] shadow-2xl text-center">
                <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Delete this entry?</h3>
                <p className="text-slate-500 text-sm mb-6">This action cannot be undone. Are you sure you want to remove this meeting log?</p>
                <div className="flex gap-3 justify-center">
                    <button onClick={() => setIsDeleteConfirmOpen(null)} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition">Cancel</button>
                    <button onClick={confirmDelete} className="px-5 py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition shadow-lg shadow-red-200">Yes, Delete</button>
                </div>
            </div>
         </div>
      )}

      {/* EDIT/CREATE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-enter">
          <div className="relative bg-white p-6 rounded-2xl w-[500px] shadow-2xl transform transition-all scale-100">
             <button onClick={closeModal} className="absolute top-4 right-4 p-1 rounded-full hover:bg-slate-100 transition"><X size={20} className="text-slate-400" /></button>
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">{editingId ? 'Edit Meeting Log' : 'Log New Meeting'}</h3>
             </div>
             <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
                    <input required type="date" className="w-full border border-slate-300 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Meeting Topic</label>
                    <input required placeholder="e.g. Chapter 1 Revisions" className="w-full border border-slate-300 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={formData.topic} onChange={e => setFormData({...formData, topic: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Google Docs Link</label>
                    <div className="relative">
                        <ExternalLink size={18} className="absolute left-3 top-3.5 text-slate-400"/>
                        <input required placeholder="https://docs.google.com/document/d/..." className="w-full border border-slate-300 pl-10 pr-3 py-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={formData.link} onChange={e => setFormData({...formData, link: e.target.value})} />
                    </div>
                </div>
                <button className="w-full bg-blue-600 text-white p-3 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all duration-300 hover:bg-blue-700 hover:scale-[1.02] active:scale-95">
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
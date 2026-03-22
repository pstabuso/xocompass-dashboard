import React, { useState, useRef, useMemo } from 'react';
import { Database, FileText, Upload, AlertCircle, Trash2, Edit2, X, AlertTriangle, Check, FileSpreadsheet } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const DataHub = () => {
  const { datasets, addDataset, updateDataset, deleteDataset, user } = useAppContext();

  const canCreate = user?.permissions?.canCreate;
  const canDelete = user?.permissions?.canDelete;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Form State
  const [formData, setFormData] = useState({ name: '', type: 'Primary', status: 'Raw', size: '0 KB', rows: 0 });
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  // --- COMPUTED STATS ---
  const stats = useMemo(() => {
    const parseRows = (r) => {
      if (typeof r === 'number') return r;
      if (typeof r === 'string') return parseInt(r.replace(/,/g, ''), 10) || 0;
      return 0;
    };
    const totalRecords = datasets.reduce((sum, d) => sum + parseRows(d.rows), 0);
    const verifiedCount = datasets.filter(d => d.status === 'Verified').length;
    const integrityPct = datasets.length === 0 ? 0 : Math.round((verifiedCount / datasets.length) * 100);
    return { totalRecords, integrityPct };
  }, [datasets]);

  // --- ACTIONS ---
  const handleEdit = (data) => {
    if (!canCreate) return;
    setFormData({ name: data.name, type: data.type, status: data.status, size: data.size, rows: data.rows });
    setEditingId(data.id);
    setIsModalOpen(true);
  };

  const handleDelete = () => {
    if (!canDelete) return;
    deleteDataset(deleteConfirmId);
    setDeleteConfirmId(null);
  };

  // --- FILE HANDLING LOGIC ---
  const processFile = (file) => {
    if (!file) return;

    // 1. Get Size
    let size = file.size / 1024;
    let unit = 'KB';
    if (size > 1024) { size /= 1024; unit = 'MB'; }
    const sizeStr = `${size.toFixed(2)} ${unit}`;

    // 2. Read Rows (Simple Line Counter)
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const lineCount = Math.max(0, text.split('\n').length - 1);
        // Use functional updater to avoid stale closure; store rows as number for Supabase INTEGER column
        setFormData(prev => ({
            ...prev,
            name: file.name,
            size: sizeStr,
            rows: lineCount,
        }));
    };
    reader.readAsText(file);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
        processFile(e.target.files[0]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId) {
        updateDataset(editingId, { type: formData.type, status: formData.status });
    } else {
        addDataset({ name: formData.name, type: formData.type, status: formData.status, size: formData.size, rows: formData.rows });
    }
    closeModal();
  };

  const closeModal = () => {
      setIsModalOpen(false);
      setEditingId(null);
      setFormData({ name: '', type: 'Primary', status: 'Raw', size: '0 KB', rows: 0 });
  };

  return (
    <div className="space-y-6 animate-enter">
      <header className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold text-slate-100">Data Hub</h2>
           <p className="text-slate-500 text-sm">Manage datasets for SARIMAX Training</p>
        </div>
        {canCreate && (
          <button onClick={() => setIsModalOpen(true)} className="flex items-center space-x-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-emerald-500 transition hover:scale-105 active:scale-95 duration-200 shadow-lg shadow-emerald-900/20">
              <Upload size={18}/> <span>Upload CSV</span>
          </button>
        )}
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800 transition hover:shadow-md hover:-translate-y-1 duration-300">
             <div className="flex items-center gap-3 text-slate-400 mb-2"><Database size={20}/> Total Records</div>
             <p className="text-3xl font-bold text-slate-100">{stats.totalRecords.toLocaleString()}</p>
         </div>
         <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800 transition hover:shadow-md hover:-translate-y-1 duration-300">
             <div className="flex items-center gap-3 text-slate-400 mb-2"><AlertCircle size={20}/> Data Integrity</div>
             <p className="text-3xl font-bold text-emerald-400">{datasets.length === 0 ? '--' : `${stats.integrityPct}%`}</p>
             <p className="text-xs text-slate-500">{datasets.length === 0 ? 'No datasets loaded' : stats.integrityPct === 100 ? 'All datasets verified' : `${datasets.filter(d => d.status === 'Verified').length} of ${datasets.length} verified`}</p>
         </div>
         <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800 transition hover:shadow-md hover:-translate-y-1 duration-300">
             <div className="flex items-center gap-3 text-slate-400 mb-2"><FileSpreadsheet size={20}/> Datasets</div>
             <p className="text-3xl font-bold text-sky-400">{datasets.length}</p>
         </div>
      </div>

      {/* Table or Empty State */}
      {datasets.length === 0 ? (
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-12 text-center">
          <Upload size={48} className="mx-auto text-slate-600 mb-4" />
          <h3 className="text-lg font-bold text-slate-400 mb-2">No datasets yet</h3>
          <p className="text-slate-500 text-sm">Upload your first CSV to get started.</p>
        </div>
      ) : (
      <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
         <table className="w-full text-left">
            <thead className="bg-slate-800/30 border-b border-slate-800 text-xs font-bold text-slate-500 uppercase">
                <tr>
                    <th className="p-4">Filename</th>
                    <th className="p-4">Type</th>
                    <th className="p-4">Size</th>
                    <th className="p-4">Rows</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
                {datasets.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-800/50 transition duration-200">
                        <td className="p-4 font-medium text-slate-300 flex items-center gap-3">
                            <FileText size={18} className="text-slate-500"/> {d.name}
                        </td>
                        <td className="p-4"><span className={`text-xs px-2 py-1 rounded font-bold ${d.type === 'Primary' ? 'bg-sky-500/15 text-sky-400' : 'bg-purple-500/15 text-purple-400'}`}>{d.type}</span></td>
                        <td className="p-4 text-slate-400 text-sm">{d.size}</td>
                        <td className="p-4 text-slate-300 text-sm font-mono">{Number(d.rows).toLocaleString()}</td>
                        <td className="p-4"><span className="text-xs font-bold text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {d.status}</span></td>
                        <td className="p-4 flex justify-end gap-2">
                            {canCreate && (
                              <button onClick={() => handleEdit(d)} className="p-2 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition"><Edit2 size={18}/></button>
                            )}
                            {canDelete && (
                              <button onClick={() => setDeleteConfirmId(d.id)} className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"><Trash2 size={18}/></button>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
         </table>
      </div>
      )}

      {/* Delete Modal */}
      {deleteConfirmId && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] animate-enter">
            <div className="bg-slate-900 p-6 rounded-2xl w-[400px] shadow-2xl text-center border border-slate-700">
                <div className="w-16 h-16 bg-red-500/15 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-2">Delete Dataset?</h3>
                <p className="text-slate-400 text-sm mb-6">This cannot be undone. Make sure you have a backup.</p>
                <div className="flex gap-3 justify-center">
                    <button onClick={() => setDeleteConfirmId(null)} className="px-5 py-2.5 rounded-xl font-bold text-slate-300 hover:bg-slate-800 transition">Cancel</button>
                    <button onClick={handleDelete} className="px-5 py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition shadow-lg shadow-red-900/30">Yes, Delete</button>
                </div>
            </div>
         </div>
      )}

      {/* Upload/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-enter">
            <div className="relative bg-slate-900 p-6 rounded-2xl w-96 shadow-2xl border border-slate-700">
                <button onClick={closeModal} className="absolute top-4 right-4 p-1 text-slate-400 hover:text-red-400 rounded-full transition"><X size={20}/></button>
                <h3 className="text-xl font-bold text-slate-100 mb-4">{editingId ? 'Edit Metadata' : 'Upload Dataset'}</h3>

                <form onSubmit={handleSubmit} className="space-y-4">

                    {/* DRAG & DROP FILE UPLOAD AREA */}
                    {!editingId && (
                        <div
                            className={`mt-1 flex flex-col justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-xl transition-all cursor-pointer relative ${dragActive ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 hover:bg-slate-800/50'}`}
                            onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                            onClick={() => fileInputRef.current.click()}
                        >
                            <div className="space-y-1 text-center">
                                {formData.name ? (
                                    <div className="flex flex-col items-center">
                                        <div className="bg-emerald-500/15 p-2 rounded-full mb-2"><Check className="text-emerald-400" size={24}/></div>
                                        <p className="text-sm font-bold text-slate-200 break-all">{formData.name}</p>
                                        <p className="text-xs text-slate-500">{formData.size} • {Number(formData.rows).toLocaleString()} rows</p>
                                    </div>
                                ) : (
                                    <>
                                        <Upload className={`mx-auto h-10 w-10 ${dragActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                                        <div className="flex text-sm text-slate-400 justify-center">
                                            <span className="font-medium text-emerald-400 hover:text-emerald-300">Click to upload</span>
                                            <span className="pl-1">or drag & drop</span>
                                        </div>
                                        <p className="text-xs text-slate-500">CSV (MAX. 10MB)</p>
                                    </>
                                )}
                                <input ref={fileInputRef} type="file" className="sr-only" accept=".csv" onChange={handleFileChange} />
                            </div>
                        </div>
                    )}

                    {/* METADATA FIELDS */}
                    <div className="space-y-3">
                        {editingId && (
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Filename</label>
                                <input required type="text" className="w-full bg-slate-800 border border-slate-700 text-slate-300 p-2 rounded-lg mt-1 outline-none" value={formData.name} readOnly />
                            </div>
                        )}
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Type</label>
                            <select className="w-full bg-slate-800 border border-slate-700 text-white p-2 rounded-lg mt-1 outline-none focus:border-emerald-500 transition" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                                <option value="Primary">Primary (Bookings)</option>
                                <option value="Exogenous">Exogenous (External)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Status</label>
                            <select className="w-full bg-slate-800 border border-slate-700 text-white p-2 rounded-lg mt-1 outline-none focus:border-emerald-500 transition" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                                <option value="Raw">Raw</option>
                                <option value="Cleaned">Cleaned</option>
                                <option value="Verified">Verified</option>
                            </select>
                        </div>
                    </div>

                    <button className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 transition shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!formData.name}>
                        {editingId ? 'Save Changes' : 'Process Upload'}
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default DataHub;

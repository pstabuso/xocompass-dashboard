import React, { useState, useRef } from 'react';
import { Database, FileText, Upload, Download, AlertCircle, Trash2, Edit2, X, AlertTriangle, Check, FileSpreadsheet } from 'lucide-react';

const DataHub = () => {
  const [datasets, setDatasets] = useState([
    { id: 1, name: 'KJS_Bookings_2019_2024.csv', size: '2.4 MB', rows: '15,400', status: 'Cleaned', type: 'Primary' },
    { id: 2, name: 'PAGASA_Rainfall_NCR.csv', size: '500 KB', rows: '2,100', status: 'Raw', type: 'Exogenous' },
    { id: 3, name: 'PH_Holidays_2019_2025.csv', size: '12 KB', rows: '150', status: 'Verified', type: 'Exogenous' },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  
  // Form State
  const [formData, setFormData] = useState({ name: '', type: 'Primary', status: 'Raw', size: '0 KB', rows: '0' });
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  // --- ACTIONS ---
  const handleEdit = (data) => {
    setFormData({ name: data.name, type: data.type, status: data.status, size: data.size, rows: data.rows });
    setEditingId(data.id);
    setIsModalOpen(true);
  };

  const handleDelete = () => {
    setDatasets(datasets.filter(d => d.id !== deleteConfirmId));
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
        const lineCount = text.split('\n').length - 1; // Subtract 1 assuming header or trailing newline
        setFormData({ 
            ...formData, 
            name: file.name, 
            size: sizeStr,
            rows: lineCount.toLocaleString()
        });
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
        setDatasets(datasets.map(d => d.id === editingId ? { ...d, ...formData } : d));
    } else {
        setDatasets([...datasets, { id: Date.now(), ...formData }]);
    }
    closeModal();
  };

  const closeModal = () => {
      setIsModalOpen(false);
      setEditingId(null);
      setFormData({ name: '', type: 'Primary', status: 'Raw', size: '0 KB', rows: '0' });
  };

  return (
    <div className="space-y-6 animate-enter">
      <header className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold text-slate-800">Data Hub</h2>
           <p className="text-slate-500 text-sm">Manage datasets for SARIMAX Training</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="flex items-center space-x-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-emerald-700 transition hover:scale-105 active:scale-95 duration-200 shadow-lg shadow-emerald-200">
            <Upload size={18}/> <span>Upload CSV</span>
        </button>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm transition hover:shadow-md hover:-translate-y-1 duration-300">
             <div className="flex items-center gap-3 text-slate-500 mb-2"><Database size={20}/> Total Records</div>
             <p className="text-3xl font-bold text-slate-800">17,650</p>
         </div>
         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm transition hover:shadow-md hover:-translate-y-1 duration-300">
             <div className="flex items-center gap-3 text-slate-500 mb-2"><AlertCircle size={20}/> Data Integrity</div>
             <p className="text-3xl font-bold text-emerald-500">100%</p>
             <p className="text-xs text-slate-400">No missing values detected</p>
         </div>
         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm transition hover:shadow-md hover:-translate-y-1 duration-300">
             <div className="flex items-center gap-3 text-slate-500 mb-2"><FileSpreadsheet size={20}/> Datasets</div>
             <p className="text-3xl font-bold text-blue-600">{datasets.length}</p>
         </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
         <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                <tr>
                    <th className="p-4">Filename</th>
                    <th className="p-4">Type</th>
                    <th className="p-4">Size</th>
                    <th className="p-4">Rows</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {datasets.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50 transition duration-200">
                        <td className="p-4 font-medium text-slate-700 flex items-center gap-3">
                            <FileText size={18} className="text-slate-400"/> {d.name}
                        </td>
                        <td className="p-4"><span className={`text-xs px-2 py-1 rounded font-bold ${d.type === 'Primary' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{d.type}</span></td>
                        <td className="p-4 text-slate-500 text-sm">{d.size}</td>
                        <td className="p-4 text-slate-600 text-sm font-mono">{d.rows}</td>
                        <td className="p-4"><span className="text-xs font-bold text-emerald-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {d.status}</span></td>
                        <td className="p-4 flex justify-end gap-2">
                            <button onClick={() => handleEdit(d)} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"><Edit2 size={18}/></button>
                            <button onClick={() => setDeleteConfirmId(d.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><Trash2 size={18}/></button>
                        </td>
                    </tr>
                ))}
            </tbody>
         </table>
      </div>

      {/* Delete Modal */}
      {deleteConfirmId && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] animate-enter">
            <div className="bg-white p-6 rounded-2xl w-[400px] shadow-2xl text-center">
                <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Delete Dataset?</h3>
                <p className="text-slate-500 text-sm mb-6">This cannot be undone. Make sure you have a backup.</p>
                <div className="flex gap-3 justify-center">
                    <button onClick={() => setDeleteConfirmId(null)} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition">Cancel</button>
                    <button onClick={handleDelete} className="px-5 py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition shadow-lg shadow-red-200">Yes, Delete</button>
                </div>
            </div>
         </div>
      )}

      {/* Upload/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-enter">
            <div className="relative bg-white p-6 rounded-2xl w-96 shadow-2xl">
                <button onClick={closeModal} className="absolute top-4 right-4 p-1 text-slate-400 hover:text-red-500 rounded-full transition"><X size={20}/></button>
                <h3 className="text-xl font-bold text-slate-800 mb-4">{editingId ? 'Edit Metadata' : 'Upload Dataset'}</h3>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    
                    {/* DRAG & DROP FILE UPLOAD AREA */}
                    {!editingId && (
                        <div 
                            className={`mt-1 flex flex-col justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-xl transition-all cursor-pointer relative ${dragActive ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 hover:bg-slate-50'}`}
                            onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                            onClick={() => fileInputRef.current.click()}
                        >
                            <div className="space-y-1 text-center">
                                {formData.name ? (
                                    <div className="flex flex-col items-center">
                                        <div className="bg-emerald-100 p-2 rounded-full mb-2"><Check className="text-emerald-600" size={24}/></div>
                                        <p className="text-sm font-bold text-slate-700 break-all">{formData.name}</p>
                                        <p className="text-xs text-slate-500">{formData.size} • {formData.rows} rows</p>
                                    </div>
                                ) : (
                                    <>
                                        <Upload className={`mx-auto h-10 w-10 ${dragActive ? 'text-emerald-500' : 'text-slate-400'}`} />
                                        <div className="flex text-sm text-slate-600 justify-center">
                                            <span className="font-medium text-emerald-600 hover:text-emerald-500">Click to upload</span>
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
                                <input required type="text" className="w-full border border-slate-300 p-2 rounded-lg mt-1 outline-none bg-slate-50" value={formData.name} readOnly />
                            </div>
                        )}
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Type</label>
                            <select className="w-full border border-slate-300 p-2 rounded-lg mt-1 outline-none focus:border-emerald-500 transition" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                                <option value="Primary">Primary (Bookings)</option>
                                <option value="Exogenous">Exogenous (External)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Status</label>
                            <select className="w-full border border-slate-300 p-2 rounded-lg mt-1 outline-none focus:border-emerald-500 transition" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                                <option value="Raw">Raw</option>
                                <option value="Cleaned">Cleaned</option>
                                <option value="Verified">Verified</option>
                            </select>
                        </div>
                    </div>

                    <button className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!formData.name}>
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
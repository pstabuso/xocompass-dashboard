import React, { useState, useRef, useMemo } from 'react';
import {
  Database, FileText, Upload, AlertCircle, Trash2, Edit2, X,
  AlertTriangle, Check, FileSpreadsheet, LockKeyhole, Send,
  Download, ArrowUpDown, ChevronUp, ChevronDown, FileCode, Filter,
  FlaskConical,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useDatasetFiles } from '../context/DatasetFileContext';

const ALLOWED_EXTENSIONS = ['.csv', '.tsv', '.txt', '.json', '.xlsx', '.xls'];
const MODEL_LAB_SUPPORTED_EXTENSIONS = ['.csv'];
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const getFileIcon = (name = '') => {
  const ext = '.' + name.split('.').pop().toLowerCase();
  if (['.xlsx', '.xls', '.csv', '.tsv'].includes(ext)) return FileSpreadsheet;
  if (ext === '.json') return FileCode;
  return FileText;
};

const getExtension = (name = '') => {
  const parts = name.split('.');
  if (parts.length < 2) return '';
  return `.${parts.pop().toLowerCase()}`;
};

const isModelLabLoadable = (dataset) => MODEL_LAB_SUPPORTED_EXTENSIONS.includes(getExtension(dataset?.name));

const STATUS_COLORS = {
  Raw: 'bg-slate-500/15 text-slate-400',
  Cleaned: 'bg-amber-500/15 text-amber-400',
  Verified: 'bg-emerald-500/15 text-emerald-400',
};

const STATUS_DOT = {
  Raw: 'bg-slate-500',
  Cleaned: 'bg-amber-500',
  Verified: 'bg-emerald-500',
};

const parseSize = (s = '') => {
  const [num, unit] = s.split(' ');
  const n = parseFloat(num) || 0;
  return unit === 'MB' ? n * 1024 : n;
};

const parseRows = (r) => {
  if (typeof r === 'number') return r;
  if (typeof r === 'string') return parseInt(r.replace(/,/g, ''), 10) || 0;
  return 0;
};

const DataHub = () => {
  const { datasets, addDataset, updateDataset, deleteDataset, user, requestAccess } = useAppContext();
  const {
    registerDatasetFile,
    removeDatasetFile,
    updateDatasetFileStatus,
    hasDatasetFile,
    downloadDatasetFile,
    getDatasetFile,
    storageReady,
  } = useDatasetFiles();

  const canCreate = user?.permissions?.canCreate ?? true;
  const canDelete = user?.permissions?.canDelete ?? true;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [accessSent, setAccessSent] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    type: 'Primary',
    status: 'Raw',
    size: '0 KB',
    rows: 0,
  });

  const fileInputRef = useRef(null);
  const pendingFileRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const [filterType, setFilterType] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [sortBy, setSortBy] = useState('uploadedAt');
  const [sortDir, setSortDir] = useState('desc');

  const stats = useMemo(() => {
    const totalRecords = datasets.reduce((sum, d) => sum + parseRows(d.rows), 0);
    const verifiedCount = datasets.filter((d) => d.status === 'Verified').length;
    const integrityPct = datasets.length === 0 ? 0 : Math.round((verifiedCount / datasets.length) * 100);
    const availableNow = datasets.filter((d) => hasDatasetFile(d.id)).length;
    const modelLabReady = datasets.filter((d) => hasDatasetFile(d.id) && isModelLabLoadable(d)).length;
    return { totalRecords, integrityPct, availableNow, modelLabReady };
  }, [datasets, hasDatasetFile]);

  const filteredDatasets = useMemo(() => {
    let list = [...datasets];

    if (filterType !== 'All') list = list.filter((d) => d.type === filterType);
    if (filterStatus !== 'All') list = list.filter((d) => d.status === filterStatus);

    list.sort((a, b) => {
      let va;
      let vb;

      if (sortBy === 'name') {
        va = (a.name || '').toLowerCase();
        vb = (b.name || '').toLowerCase();
      } else if (sortBy === 'size') {
        va = parseSize(a.size);
        vb = parseSize(b.size);
      } else if (sortBy === 'rows') {
        va = parseRows(a.rows);
        vb = parseRows(b.rows);
      } else {
        va = a.uploadedAt || a.created_at || '';
        vb = b.uploadedAt || b.created_at || '';
      }

      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [datasets, filterType, filterStatus, sortBy, sortDir]);

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortBy !== field) return <ArrowUpDown size={11} className="text-slate-600 ml-1 inline" />;
    return sortDir === 'asc'
      ? <ChevronUp size={11} className="text-pink-400 ml-1 inline" />
      : <ChevronDown size={11} className="text-pink-400 ml-1 inline" />;
  };

  const handleEdit = (data) => {
    if (!canCreate) return;
    setFormData({
      name: data.name,
      type: data.type,
      status: data.status,
      size: data.size,
      rows: data.rows,
    });
    setEditingId(data.id);
    setIsModalOpen(true);
  };

  const handleDelete = () => {
    if (!canDelete) return;
    removeDatasetFile(deleteConfirmId);
    deleteDataset(deleteConfirmId);
    setDeleteConfirmId(null);
  };

  const handleDownload = (dataset) => {
    downloadDatasetFile(dataset.id, dataset.name);
  };

  const processFile = (file) => {
    if (!file) return;

    const ext = `.${file.name.split('.').pop().toLowerCase()}`;

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      alert(`Unsupported file type: ${ext}\nAllowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      alert('File exceeds 50 MB limit.');
      return;
    }

    pendingFileRef.current = file;

    let size = file.size / 1024;
    let unit = 'KB';
    if (size > 1024) {
      size /= 1024;
      unit = 'MB';
    }
    const sizeStr = `${size.toFixed(2)} ${unit}`;

    if (['.xlsx', '.xls'].includes(ext)) {
      setFormData((prev) => ({ ...prev, name: file.name, size: sizeStr, rows: 0 }));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const lineCount = Math.max(0, e.target.result.split('\n').length - 1);
      setFormData((prev) => ({ ...prev, name: file.name, size: sizeStr, rows: lineCount }));
    };
    reader.onerror = () => {
      alert('Failed to read file. Please try again.');
      setFormData((prev) => ({ ...prev, name: file.name, size: sizeStr, rows: 0 }));
    };
    reader.readAsText(file);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  const handleFileChange = (e) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (editingId) {
      updateDataset(editingId, { type: formData.type, status: formData.status });
      updateDatasetFileStatus(editingId, formData.status);
    } else {
      const id = crypto.randomUUID();

      if (pendingFileRef.current) {
        registerDatasetFile(id, pendingFileRef.current, formData.name, formData.type, formData.status);
      }

      addDataset({
        id,
        name: formData.name,
        type: formData.type,
        status: formData.status,
        size: formData.size,
        rows: formData.rows,
      });
    }

    closeModal();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({ name: '', type: 'Primary', status: 'Raw', size: '0 KB', rows: 0 });
    pendingFileRef.current = null;
  };

  const activeFilterCount = (filterType !== 'All' ? 1 : 0) + (filterStatus !== 'All' ? 1 : 0);

  return (
    <div className="space-y-3 sm:space-y-6 animate-enter">
      {!storageReady && (
        <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl flex items-center gap-3">
          <FlaskConical size={16} className="text-sky-400 shrink-0" />
          <p className="text-xs text-sky-300 flex-1">
            Restoring locally saved dataset files...
          </p>
        </div>
      )}

      {!!user && !canCreate && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3">
          <LockKeyhole size={16} className="text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300 flex-1">
            You're in <span className="font-bold">view-only</span> mode. Need edit access?
          </p>
          {accessSent ? (
            <span className="text-[10px] px-2 py-1 bg-emerald-500/15 text-emerald-400 rounded font-bold shrink-0 flex items-center gap-1">
              <Send size={10} /> Sent
            </span>
          ) : (
            <button
              onClick={() => {
                requestAccess?.('Edit on Data Hub', 'action');
                setAccessSent(true);
              }}
              className="text-[10px] px-2.5 py-1 bg-pink-600 text-white rounded font-bold hover:bg-pink-500 transition shrink-0"
            >
              Request
            </button>
          )}
        </div>
      )}

      <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl flex items-center gap-3">
        <FlaskConical size={16} className="text-violet-400 shrink-0" />
        <p className="text-xs text-violet-300 flex-1">
          <span className="font-bold">{storageReady ? stats.availableNow : '...'}</span> dataset{storageReady && stats.availableNow !== 1 ? 's are' : ' is'} available locally,
          and <span className="font-bold">{storageReady ? stats.modelLabReady : '...'}</span> CSV dataset{storageReady && stats.modelLabReady !== 1 ? 's are' : ' is'} loadable in Model Lab right now.
          <span className="text-slate-400"> Files are now restored from local browser storage when available.</span>
        </p>
      </div>

      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-100">Data Hub</h2>
          <p className="text-slate-500 text-xs sm:text-sm">Manage datasets for SARIMAX training and locally persistent Model Lab loading</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center space-x-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-emerald-500 transition hover:scale-105 active:scale-95 duration-200 shadow-lg shadow-emerald-900/20"
          >
            <Upload size={18} /> <span>Upload Dataset</span>
          </button>
        )}
      </header>

      <div className="grid grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-slate-900/50 p-3 sm:p-5 rounded-xl border border-slate-800">
          <div className="flex items-center gap-1.5 sm:gap-3 text-slate-400 mb-1 sm:mb-2">
            <Database size={14} className="sm:w-[20px] sm:h-[20px]" />
            <span className="text-[10px] sm:text-sm">Records</span>
          </div>
          <p className="text-lg sm:text-3xl font-bold text-slate-100">{stats.totalRecords.toLocaleString()}</p>
        </div>

        <div className="bg-slate-900/50 p-3 sm:p-5 rounded-xl border border-slate-800">
          <div className="flex items-center gap-1.5 sm:gap-3 text-slate-400 mb-1 sm:mb-2">
            <AlertCircle size={14} className="sm:w-[20px] sm:h-[20px]" />
            <span className="text-[10px] sm:text-sm">Integrity</span>
          </div>
          <p className="text-lg sm:text-3xl font-bold text-emerald-400">
            {datasets.length === 0 ? '--' : `${stats.integrityPct}%`}
          </p>
        </div>

        <div className="bg-slate-900/50 p-3 sm:p-5 rounded-xl border border-slate-800">
          <div className="flex items-center gap-1.5 sm:gap-3 text-slate-400 mb-1 sm:mb-2">
            <FileSpreadsheet size={14} className="sm:w-[20px] sm:h-[20px]" />
            <span className="text-[10px] sm:text-sm">Datasets</span>
          </div>
          <p className="text-lg sm:text-3xl font-bold text-pink-400">{datasets.length}</p>
        </div>

        <div className="bg-slate-900/50 p-3 sm:p-5 rounded-xl border border-violet-500/20">
          <div className="flex items-center gap-1.5 sm:gap-3 text-violet-400 mb-1 sm:mb-2">
            <FlaskConical size={14} className="sm:w-[20px] sm:h-[20px]" />
            <span className="text-[10px] sm:text-sm">Model Lab Ready</span>
          </div>
          <p className="text-lg sm:text-3xl font-bold text-violet-400">{storageReady ? stats.modelLabReady : '...'}</p>
          <p className="text-[10px] sm:text-xs text-slate-500 hidden sm:block">locally available CSV files</p>
        </div>
      </div>

      {datasets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-900/50 border border-slate-800 rounded-xl">
          <Filter size={14} className={`shrink-0 ${activeFilterCount > 0 ? 'text-pink-400' : 'text-slate-500'}`} />

          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Type</span>
            <div className="flex rounded-lg overflow-hidden border border-slate-700">
              {['All', 'Primary', 'Exogenous'].map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-2.5 py-1 text-[10px] font-bold transition ${filterType === t ? 'bg-pink-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Status</span>
            <div className="flex rounded-lg overflow-hidden border border-slate-700">
              {['All', 'Raw', 'Cleaned', 'Verified'].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-2.5 py-1 text-[10px] font-bold transition ${filterStatus === s ? 'bg-pink-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Sort</span>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setSortDir('asc');
              }}
              className="bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold px-2 py-1 rounded-lg outline-none"
            >
              <option value="uploadedAt">Date</option>
              <option value="name">Name</option>
              <option value="size">Size</option>
              <option value="rows">Rows</option>
            </select>
            <button
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              className="p-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-pink-400 transition"
            >
              {sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
        </div>
      )}

      {datasets.length === 0 ? (
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 sm:p-12 text-center">
          <Upload size={48} className="mx-auto text-slate-600 mb-4" />
          <h3 className="text-lg font-bold text-slate-400 mb-2">No datasets yet</h3>
          <p className="text-slate-500 text-sm">Upload your first dataset to get started.</p>
          <p className="text-slate-600 text-xs mt-1">Supports metadata/local storage for: {ALLOWED_EXTENSIONS.join(', ')}</p>
          <p className="text-violet-400 text-xs mt-1">Model Lab currently loads CSV datasets only.</p>
        </div>
      ) : filteredDatasets.length === 0 ? (
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-8 text-center">
          <Filter size={32} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 font-bold">No results match your filters</p>
          <button
            onClick={() => {
              setFilterType('All');
              setFilterStatus('All');
            }}
            className="text-xs text-pink-400 hover:text-pink-300 mt-2 transition"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div className="hidden md:block bg-slate-900/50 rounded-xl border border-slate-800 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-800/30 border-b border-slate-800 text-xs font-bold text-slate-500 uppercase">
                <tr>
                  <th className="p-4 cursor-pointer hover:text-slate-300 transition select-none" onClick={() => toggleSort('name')}>
                    Filename <SortIcon field="name" />
                  </th>
                  <th className="p-4">Type</th>
                  <th className="p-4 cursor-pointer hover:text-slate-300 transition select-none" onClick={() => toggleSort('size')}>
                    Size <SortIcon field="size" />
                  </th>
                  <th className="p-4 cursor-pointer hover:text-slate-300 transition select-none" onClick={() => toggleSort('rows')}>
                    Rows <SortIcon field="rows" />
                  </th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Local File</th>
                  <th className="p-4">Model Lab</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredDatasets.map((d) => {
                  const Icon = getFileIcon(d.name);
                  const canDownload = !!getDatasetFile(d.id);
                  const availableNow = hasDatasetFile(d.id);
                  const modelLabReady = availableNow && isModelLabLoadable(d);

                  return (
                    <tr key={d.id} className="hover:bg-slate-800/50 transition duration-200">
                      <td className="p-4 font-medium text-slate-300 flex items-center gap-3">
                        <Icon size={18} className="text-slate-500 shrink-0" />
                        <span className="truncate max-w-[200px]">{d.name}</span>
                      </td>
                      <td className="p-4">
                        <span className={`text-xs px-2 py-1 rounded font-bold ${d.type === 'Primary' ? 'bg-pink-500/15 text-pink-400' : 'bg-purple-500/15 text-purple-400'}`}>
                          {d.type}
                        </span>
                      </td>
                      <td className="p-4 text-slate-400 text-sm">{d.size}</td>
                      <td className="p-4 text-slate-300 text-sm font-mono">{Number(d.rows).toLocaleString()}</td>
                      <td className="p-4">
                        <span className={`text-xs font-bold flex items-center gap-1 ${STATUS_COLORS[d.status] || STATUS_COLORS.Raw}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[d.status] || STATUS_DOT.Raw}`} />
                          {d.status}
                        </span>
                      </td>
                      <td className="p-4">
                        {availableNow ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-violet-500/15 text-violet-400 border border-violet-500/20 rounded font-bold">
                            <FlaskConical size={9} /> Restored
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">Not stored locally</span>
                        )}
                      </td>
                      <td className="p-4">
                        {modelLabReady ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 rounded font-bold">
                            CSV Ready
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">
                            {availableNow ? 'Not CSV-loadable' : 'Unavailable'}
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => handleDownload(d)}
                            className={`p-2 rounded-lg transition ${canDownload ? 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10' : 'text-slate-700 cursor-not-allowed'}`}
                            title={canDownload ? 'Download file' : 'Local file not available'}
                            disabled={!canDownload}
                          >
                            <Download size={16} />
                          </button>

                          {canCreate ? (
                            <button
                              onClick={() => handleEdit(d)}
                              className="p-2 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition"
                              aria-label="Edit"
                            >
                              <Edit2 size={16} />
                            </button>
                          ) : (
                            <button disabled className="p-2 text-slate-700 cursor-not-allowed rounded-lg">
                              <LockKeyhole size={15} />
                            </button>
                          )}

                          {canDelete ? (
                            <button
                              onClick={() => setDeleteConfirmId(d.id)}
                              className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                              aria-label="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          ) : (
                            <button disabled className="p-2 text-slate-700 cursor-not-allowed rounded-lg">
                              <LockKeyhole size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {filteredDatasets.map((d) => {
              const Icon = getFileIcon(d.name);
              const canDownload = !!getDatasetFile(d.id);
              const availableNow = hasDatasetFile(d.id);
              const modelLabReady = availableNow && isModelLabLoadable(d);

              return (
                <div key={d.id} className="bg-slate-900/50 rounded-xl border border-slate-800 p-3 space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <Icon size={16} className="text-slate-500 shrink-0" />
                    <p className="font-bold text-sm text-slate-200 truncate flex-1">{d.name}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold shrink-0 ${d.type === 'Primary' ? 'bg-pink-500/15 text-pink-400' : 'bg-purple-500/15 text-purple-400'}`}>
                      {d.type}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/50">
                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
                      <span>{d.size}</span>
                      <span className="font-mono">{Number(d.rows).toLocaleString()} rows</span>
                      <span className={`font-bold flex items-center gap-1 ${STATUS_COLORS[d.status] || STATUS_COLORS.Raw}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[d.status] || STATUS_DOT.Raw}`} />
                        {d.status}
                      </span>
                      <span className={availableNow ? 'text-violet-400' : 'text-slate-500'}>
                        {availableNow ? 'Restored' : 'Not stored'}
                      </span>
                      <span className={modelLabReady ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        {modelLabReady ? 'CSV Ready' : 'Model Lab: no'}
                      </span>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => handleDownload(d)}
                        className={`p-2 rounded-lg transition ${canDownload ? 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10' : 'text-slate-700 cursor-not-allowed'}`}
                        disabled={!canDownload}
                      >
                        <Download size={13} />
                      </button>

                      {canCreate ? (
                        <button
                          onClick={() => handleEdit(d)}
                          className="p-2 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition"
                        >
                          <Edit2 size={13} />
                        </button>
                      ) : (
                        <button disabled className="p-2 text-slate-700 cursor-not-allowed rounded-lg">
                          <LockKeyhole size={13} />
                        </button>
                      )}

                      {canDelete ? (
                        <button
                          onClick={() => setDeleteConfirmId(d.id)}
                          className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : (
                        <button disabled className="p-2 text-slate-700 cursor-not-allowed rounded-lg">
                          <LockKeyhole size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] animate-fade-in">
          <div className="bg-slate-900 p-6 rounded-2xl w-[calc(100%-2rem)] max-w-[400px] shadow-2xl text-center border border-slate-700 mx-4">
            <div className="w-16 h-16 bg-red-500/15 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-100 mb-2">Delete Dataset?</h3>
            <p className="text-slate-400 text-sm mb-6">This cannot be undone. Make sure you have a backup.</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-5 py-2.5 rounded-xl font-bold text-slate-300 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-5 py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition shadow-lg shadow-red-900/30"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="relative bg-slate-900 p-4 sm:p-6 rounded-2xl w-[calc(100%-2rem)] max-w-[420px] shadow-2xl border border-slate-700 mx-4">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-red-400 rounded-full transition"
            >
              <X size={20} />
            </button>

            <h3 className="text-xl font-bold text-slate-100 mb-4">
              {editingId ? 'Edit Metadata' : 'Upload Dataset'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingId && (
                <div
                  className={`mt-1 flex flex-col justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-xl transition-all cursor-pointer relative ${
                    dragActive ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 hover:bg-slate-800/50'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current.click()}
                >
                  <div className="space-y-1 text-center">
                    {formData.name ? (
                      <div className="flex flex-col items-center">
                        <div className="bg-emerald-500/15 p-2 rounded-full mb-2">
                          <Check className="text-emerald-400" size={24} />
                        </div>
                        <p className="text-sm font-bold text-slate-200 break-all">{formData.name}</p>
                        <p className="text-xs text-slate-500">
                          {formData.size} • {Number(formData.rows).toLocaleString()} rows
                        </p>
                        <p className="text-[10px] text-violet-400 mt-1 flex items-center gap-1 text-center">
                          <FlaskConical size={10} /> Saved locally in this browser. Model Lab currently loads CSV files only.
                        </p>
                      </div>
                    ) : (
                      <>
                        <Upload className={`mx-auto h-10 w-10 ${dragActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                        <div className="flex text-sm text-slate-400 justify-center">
                          <span className="font-medium text-emerald-400 hover:text-emerald-300">Click to upload</span>
                          <span className="pl-1">or drag & drop</span>
                        </div>
                        <p className="text-xs text-slate-500">CSV, TSV, JSON, XLSX, TXT — max 50 MB</p>
                        <p className="text-[10px] text-violet-400 flex items-center justify-center gap-1 text-center">
                          <FlaskConical size={10} /> Saved locally in this browser. Model Lab currently loads CSV files only.
                        </p>
                      </>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      className="sr-only"
                      accept=".csv,.tsv,.txt,.json,.xlsx,.xls"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {editingId && (
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Filename</label>
                    <input
                      type="text"
                      className="w-full bg-slate-800 border border-slate-700 text-slate-300 p-2 rounded-lg mt-1 outline-none"
                      value={formData.name}
                      readOnly
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Type</label>
                  <select
                    className="w-full bg-slate-800 border border-slate-700 text-white p-2 rounded-lg mt-1 outline-none focus:border-emerald-500 transition"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  >
                    <option value="Primary">Primary (Bookings)</option>
                    <option value="Exogenous">Exogenous (External)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Status</label>
                  <select
                    className="w-full bg-slate-800 border border-slate-700 text-white p-2 rounded-lg mt-1 outline-none focus:border-emerald-500 transition"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="Raw">Raw</option>
                    <option value="Cleaned">Cleaned</option>
                    <option value="Verified">Verified</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 transition shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!formData.name}
              >
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

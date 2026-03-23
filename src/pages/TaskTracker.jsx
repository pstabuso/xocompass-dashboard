import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Plus, Trash2, X, MessageSquare, List, BarChart as GanttIcon, Layout, CheckSquare, AlertTriangle, Send, Edit2, Save, LockKeyhole } from 'lucide-react';
import GanttView from '../components/GanttView';

const RequestBanner = ({ page }) => {
  const { requestAccess } = useAppContext();
  const [sent, setSent] = useState(false);
  return (
    <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3">
      <LockKeyhole size={16} className="text-amber-400 shrink-0" />
      <p className="text-xs text-amber-300 flex-1">You're in <span className="font-bold">view-only</span> mode. Need edit access?</p>
      {sent ? (
        <span className="text-[10px] px-2 py-1 bg-emerald-500/15 text-emerald-400 rounded font-bold shrink-0">Sent</span>
      ) : (
        <button onClick={() => { requestAccess(`Edit on ${page}`, 'action'); setSent(true); }} className="text-[10px] px-2 py-1 bg-sky-600 text-white rounded font-bold hover:bg-sky-500 transition shrink-0">
          Request
        </button>
      )}
    </div>
  );
};

const TaskTracker = () => {
  const { tasks, addTask, updateTask, updateTaskStatus, deleteTask, addTaskComment, subtasks, user } = useAppContext();
  const [viewMode, setViewMode] = useState('board');
  const [filter, setFilter] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedTask, setExpandedTask] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const canCreate = user?.permissions?.canCreate;
  const canDelete = user?.permissions?.canDelete;

  // Forms
  const [commentText, setCommentText] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [newTask, setNewTask] = useState({ task: '', deadline: '', start: '', remarks: '', owner: '', priority: 'Medium', dependency: '' });

  const filteredTasks = filter === 'All' ? tasks : tasks.filter(t => t.owner.includes(filter));
  const ownerOptions = ['All', ...Array.from(new Set(tasks.map(t => t.owner)))];

  const getStatusColor = (status) => {
    switch(status) {
      case 'Done': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
      case 'On-going': return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
      default: return 'bg-red-500/15 text-red-400 border-red-500/20';
    }
  };

  const getProgress = (task) => {
    if (task.status === 'Done') return 100;
    if (!task.subtasks || task.subtasks.length === 0) return task.status === 'On-going' ? 25 : 0;
    const done = task.subtasks.filter(st => st.done).length;
    return Math.round((done / task.subtasks.length) * 100);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canCreate) return;
    addTask({ ...newTask, status: 'Not Started', priority: newTask.priority || 'Medium', dependencies: newTask.dependency ? [newTask.dependency] : [] });
    setIsModalOpen(false);
    setNewTask({ task: '', deadline: '', start: '', remarks: '', owner: '', priority: 'Medium', dependency: '' });
  };

  const handleDeleteRequest = (id) => {
    if (!canDelete) return;
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (!canDelete) return;
    if (deleteConfirmId) {
      deleteTask(deleteConfirmId);
      setDeleteConfirmId(null);
      setExpandedTask(null);
      setIsEditing(false);
    }
  };

  const handleCommentSubmit = (taskId) => {
    if (!commentText.trim()) return;
    addTaskComment(taskId, commentText);
    setCommentText('');
  };

  const handleSubtaskSubmit = (e, taskId) => {
    e.preventDefault();
    if (!newSubtask.trim()) return;
    subtasks.add(taskId, newSubtask);
    setNewSubtask('');
  };

  // ── EDIT MODE ──
  const startEditing = () => {
    if (!canCreate) return;
    setEditForm({
      task: expandedTask.task,
      deadline: expandedTask.deadline || '',
      start: expandedTask.start || '',
      remarks: expandedTask.remarks || '',
      owner: expandedTask.owner || '',
      priority: expandedTask.priority || 'Medium',
      status: expandedTask.status,
    });
    setIsEditing(true);
  };

  const saveEdit = () => {
    updateTask(expandedTask.id, editForm);
    const updated = { ...expandedTask, ...editForm };
    setExpandedTask(updated);
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditForm({});
  };

  const handleSelectTask = (task) => {
    setExpandedTask(task);
    setIsEditing(false);
  };

  // --- Renderers ---
  const renderKanbanColumn = (title, status, bgClass, headerColorClass, items) => (
    <div className="flex-1 min-w-[220px] sm:min-w-[260px] lg:min-w-[280px] bg-slate-900/50 rounded-xl border border-slate-800 flex flex-col h-full max-h-[500px] sm:max-h-[600px] lg:max-h-[700px] animate-enter">
        <div className={`p-4 border-b border-slate-800 font-bold flex justify-between items-center`}>
            <span className={status === 'Not Started' ? 'text-red-400' : status === 'On-going' ? 'text-amber-400' : 'text-emerald-400'}>{title}</span>
            <span className="bg-slate-800 px-2 py-0.5 rounded-full text-xs border border-slate-700 text-slate-400">{items.length}</span>
        </div>
        <div className="p-3 space-y-3 overflow-y-auto flex-1 custom-scrollbar">
            {items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-slate-600 text-xs">
                <span className="text-2xl mb-2 opacity-50">{status === 'Not Started' ? '📋' : status === 'On-going' ? '⏳' : '✅'}</span>
                No tasks {status === 'Not Started' ? 'to start' : status === 'On-going' ? 'in progress' : 'completed'}
              </div>
            )}
            {items.map(task => (
                <div key={task.id} onClick={() => handleSelectTask(task)} className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 cursor-pointer transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1 hover:border-slate-600 group relative">
                    <div className="flex justify-between items-start mb-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${task.owner.includes(user.name) ? 'bg-sky-500/15 text-sky-400' : 'bg-slate-700/50 text-slate-500'}`}>{task.owner}</span>
                        {task.deadline && <span className="text-[10px] text-red-400 font-medium">Due {task.deadline.slice(5)}</span>}
                    </div>
                    <h4 className="font-bold text-slate-100 text-sm leading-snug mb-3">{task.task}</h4>
                    <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden mb-2">
                        <div className={`h-full rounded-full transition-all duration-500 ${status === 'Done' ? 'bg-emerald-500' : status === 'On-going' ? 'bg-amber-500' : 'bg-red-500'}`} style={{width: `${getProgress(task)}%`}}></div>
                    </div>
                </div>
            ))}
        </div>
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-6 h-[calc(100vh-140px)] lg:h-[calc(100vh-140px)] flex flex-col animate-enter">
      {!canCreate && <RequestBanner page="Task Tracker" />}
      {/* Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3 shrink-0">
        <div>
           <h2 className="text-xl sm:text-2xl font-bold text-slate-100">Task Tracker</h2>
           <p className="text-xs sm:text-sm text-slate-500">View: <span className="font-bold capitalize text-sky-400">{viewMode}</span></p>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 sm:px-3 py-1.5 text-sm text-slate-300 font-medium outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition whitespace-nowrap shrink-0"
            >
              {ownerOptions.map(opt => (
                <option key={opt} value={opt} className="bg-slate-900">{opt === 'All' ? 'All Owners' : opt}</option>
              ))}
            </select>
            <div className="flex bg-slate-800 p-0.5 sm:p-1 rounded-lg border border-slate-700 shrink-0">
                <button onClick={() => setViewMode('list')} aria-label="List view" className={`p-1.5 sm:p-2 rounded-md transition-all duration-200 ${viewMode === 'list' ? 'bg-slate-700 shadow text-slate-100 scale-105' : 'text-slate-500 hover:text-slate-300'}`}><List size={16}/></button>
                <button onClick={() => setViewMode('board')} aria-label="Board view" className={`p-1.5 sm:p-2 rounded-md transition-all duration-200 ${viewMode === 'board' ? 'bg-slate-700 shadow text-slate-100 scale-105' : 'text-slate-500 hover:text-slate-300'}`}><Layout size={16}/></button>
                <button onClick={() => setViewMode('gantt')} aria-label="Gantt view" className={`p-1.5 sm:p-2 rounded-md transition-all duration-200 ${viewMode === 'gantt' ? 'bg-slate-700 shadow text-slate-100 scale-105' : 'text-slate-500 hover:text-slate-300'}`}><GanttIcon size={16}/></button>
            </div>
            {canCreate && (
              <button onClick={() => setIsModalOpen(true)} className="flex items-center space-x-1.5 sm:space-x-2 bg-sky-600 text-white px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-sky-500 hover:scale-105 active:scale-95 transition-all duration-200 shadow-md whitespace-nowrap shrink-0">
                  <Plus size={16} /> <span className="hidden sm:inline">Add Task</span>
              </button>
            )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
          {viewMode === 'board' && (
              <div className="flex space-x-3 sm:space-x-4 h-full overflow-x-auto pb-4 custom-scrollbar">
                  {renderKanbanColumn('To Do', 'Not Started', '', '', filteredTasks.filter(t => t.status === 'Not Started'))}
                  {renderKanbanColumn('In Progress', 'On-going', '', '', filteredTasks.filter(t => t.status === 'On-going'))}
                  {renderKanbanColumn('Completed', 'Done', '', '', filteredTasks.filter(t => t.status === 'Done'))}
              </div>
          )}

          {viewMode === 'list' && (
              <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden animate-enter">
                  {filteredTasks.map(task => (
                      <div key={task.id} onClick={() => handleSelectTask(task)} className="p-4 border-b border-slate-800 hover:bg-slate-800/50 cursor-pointer flex justify-between items-center transition-colors duration-200">
                          <div>
                              <p className="font-bold text-slate-100">{task.task}</p>
                              <div className="flex items-center space-x-2 mt-1">
                                  <span className="text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-400 border border-slate-700">{task.owner}</span>
                                  <span className="text-xs text-slate-500">Due: {task.deadline}</span>
                              </div>
                          </div>
                          <div className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(task.status)}`}>{task.status}</div>
                      </div>
                  ))}
              </div>
          )}

          {viewMode === 'gantt' && (
             <div className="h-full animate-enter">
                {filteredTasks.length === 0 ? <div className="text-center p-8 text-slate-500">No tasks to display.</div> : <GanttView tasks={filteredTasks} onSelectTask={handleSelectTask} />}
            </div>
          )}
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmId && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] animate-fade-in">
            <div className="bg-slate-900 p-4 sm:p-6 rounded-2xl w-[calc(100%-2rem)] max-w-[400px] shadow-2xl text-center border border-slate-700 mx-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-red-500/15 text-red-400 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                    <AlertTriangle size={28} />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-100 mb-2">Delete Task?</h3>
                <p className="text-slate-400 text-sm mb-4 sm:mb-6">This will permanently remove this task and its subtasks. Are you sure?</p>
                <div className="flex gap-3 justify-center">
                    <button onClick={() => setDeleteConfirmId(null)} className="px-5 py-2.5 rounded-xl font-bold text-slate-300 hover:bg-slate-800 transition">Cancel</button>
                    <button onClick={confirmDelete} className="px-5 py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition shadow-lg shadow-red-900/30">Yes, Delete</button>
                </div>
            </div>
         </div>
      )}

      {/* FULL SCREEN FOCUS MODE: ADD / VIEW / EDIT TASK */}
      {(isModalOpen || expandedTask) && !deleteConfirmId && (
        <div className="fixed inset-0 bg-slate-950 z-[100] animate-in slide-in-from-bottom duration-300 overflow-y-auto">

            {/* Header */}
            <div className="max-w-4xl mx-auto pt-4 sm:pt-10 pb-4 sm:pb-6 px-4 sm:px-6 flex justify-between items-start sm:items-center border-b border-slate-800">
                <div className="min-w-0 flex-1">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-100">
                        {isModalOpen ? 'Create New Task' : isEditing ? 'Edit Task' : 'Task Details'}
                    </h2>
                    <p className="text-slate-500 mt-1 text-xs sm:text-base truncate">
                        {isModalOpen ? 'Fill in the details below.' : isEditing ? 'Modify and save.' : `ID: ${expandedTask?.id?.slice(0, 8)}...`}
                    </p>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-2">
                    {expandedTask && !isEditing && canCreate && (
                      <button
                        onClick={startEditing}
                        className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-sky-600 text-white rounded-lg font-bold hover:bg-sky-500 transition-all active:scale-95 shadow-md text-sm"
                      >
                        <Edit2 size={14} /> <span className="hidden sm:inline">Edit</span>
                      </button>
                    )}
                    {isEditing && (
                      <>
                        <button onClick={cancelEdit} className="px-3 py-2 text-slate-400 hover:bg-slate-800 rounded-lg font-bold transition text-sm">Cancel</button>
                        <button onClick={saveEdit} className="flex items-center gap-1 px-3 sm:px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-500 transition-all active:scale-95 shadow-md text-sm">
                          <Save size={14} /> <span className="hidden sm:inline">Save</span>
                        </button>
                      </>
                    )}
                    <button
                        onClick={() => { setIsModalOpen(false); setExpandedTask(null); setIsEditing(false); }}
                        className="p-2 sm:p-3 bg-slate-800 text-slate-400 rounded-full hover:bg-red-500 hover:text-white transition-all duration-200 shadow-sm"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Content Container */}
            <div className="max-w-4xl mx-auto p-3 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6 lg:gap-12">

                {/* LEFT COLUMN: FORM */}
                <div className="lg:col-span-2 space-y-4 sm:space-y-8">
                    {/* If Adding New Task */}
                    {isModalOpen && (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Task Title</label>
                                <input required type="text" className="w-full text-xl font-bold border-b-2 border-slate-700 py-2 outline-none focus:border-sky-500 transition-colors bg-transparent text-white" placeholder="e.g. Data Cleaning Phase 1" value={newTask.task} onChange={e => setNewTask({...newTask, task: e.target.value})} />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-8">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Start Date</label>
                                    <input type="date" className="w-full bg-slate-800 p-3 rounded-lg border border-slate-700 outline-none focus:ring-2 focus:ring-sky-500 transition-all text-white" value={newTask.start} onChange={e => setNewTask({...newTask, start: e.target.value})} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Deadline</label>
                                    <input required type="date" className="w-full bg-slate-800 p-3 rounded-lg border border-slate-700 outline-none focus:ring-2 focus:ring-sky-500 transition-all text-white" value={newTask.deadline} onChange={e => setNewTask({...newTask, deadline: e.target.value})} />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">Notes (optional)</label>
                                <textarea
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg focus:ring-2 focus:ring-sky-500 outline-none transition text-sm resize-none"
                                    rows={2}
                                    placeholder="Additional notes or context..."
                                    value={newTask.remarks}
                                    onChange={e => setNewTask({...newTask, remarks: e.target.value})}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">Priority</label>
                                <div className="flex gap-2 overflow-x-auto">
                                    {['Low', 'Medium', 'High', 'Critical'].map(p => (
                                        <button key={p} type="button"
                                            onClick={() => setNewTask({...newTask, priority: p})}
                                            className={`px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 ${
                                                newTask.priority === p
                                                    ? p === 'Critical' ? 'bg-red-600 text-white'
                                                    : p === 'High' ? 'bg-orange-600 text-white'
                                                    : p === 'Medium' ? 'bg-sky-600 text-white'
                                                    : 'bg-emerald-600 text-white'
                                                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                            }`}
                                        >{p}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Assigned To</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg focus:ring-2 focus:ring-sky-500 outline-none transition text-sm"
                                    placeholder="Enter assignee name"
                                    value={newTask.owner}
                                    onChange={e => setNewTask({...newTask, owner: e.target.value})}
                                />
                            </div>
                            <button className="w-full bg-sky-600 text-white py-3 sm:py-4 rounded-xl font-bold text-base sm:text-lg hover:bg-sky-500 hover:scale-[1.01] active:scale-95 transition-all shadow-xl shadow-sky-900/30">
                                Create Task
                            </button>
                        </form>
                    )}

                    {/* If Viewing/Editing Task (Expanded) */}
                    {expandedTask && (
                        <div className="space-y-4 sm:space-y-8 animate-enter">
                            {/* EDIT MODE: Inline editable fields */}
                            {isEditing ? (
                              <div className="space-y-6">
                                <div className="space-y-2">
                                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Task Title</label>
                                  <input
                                    type="text"
                                    className="w-full text-xl font-bold border-b-2 border-slate-700 py-2 outline-none focus:border-sky-500 transition-colors bg-transparent text-white"
                                    value={editForm.task}
                                    onChange={e => setEditForm({...editForm, task: e.target.value})}
                                  />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Status</label>
                                    <select
                                      value={editForm.status}
                                      onChange={e => setEditForm({...editForm, status: e.target.value})}
                                      className="w-full bg-slate-800 p-3 rounded-lg border border-slate-700 outline-none focus:ring-2 focus:ring-sky-500 text-white"
                                    >
                                      <option value="Not Started" className="bg-slate-900">Not Started</option>
                                      <option value="On-going" className="bg-slate-900">On-going</option>
                                      <option value="Done" className="bg-slate-900">Done</option>
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Priority</label>
                                    <div className="flex gap-2 pt-1 overflow-x-auto">
                                      {['Low', 'Medium', 'High', 'Critical'].map(p => (
                                        <button key={p} type="button"
                                          onClick={() => setEditForm({...editForm, priority: p})}
                                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 ${
                                            editForm.priority === p
                                              ? p === 'Critical' ? 'bg-red-600 text-white'
                                              : p === 'High' ? 'bg-orange-600 text-white'
                                              : p === 'Medium' ? 'bg-sky-600 text-white'
                                              : 'bg-emerald-600 text-white'
                                              : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                          }`}
                                        >{p}</button>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Start Date</label>
                                    <input type="date" className="w-full bg-slate-800 p-3 rounded-lg border border-slate-700 outline-none focus:ring-2 focus:ring-sky-500 text-white" value={editForm.start} onChange={e => setEditForm({...editForm, start: e.target.value})} />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Deadline</label>
                                    <input type="date" className="w-full bg-slate-800 p-3 rounded-lg border border-slate-700 outline-none focus:ring-2 focus:ring-sky-500 text-white" value={editForm.deadline} onChange={e => setEditForm({...editForm, deadline: e.target.value})} />
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <label className="text-xs font-bold text-slate-400 uppercase">Assigned To</label>
                                  <input type="text" className="w-full bg-slate-800 p-3 rounded-lg border border-slate-700 outline-none focus:ring-2 focus:ring-sky-500 text-white" value={editForm.owner} onChange={e => setEditForm({...editForm, owner: e.target.value})} />
                                </div>

                                <div className="space-y-2">
                                  <label className="text-xs font-bold text-slate-400 uppercase">Notes</label>
                                  <textarea
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg focus:ring-2 focus:ring-sky-500 outline-none transition text-sm resize-none"
                                    rows={3}
                                    value={editForm.remarks}
                                    onChange={e => setEditForm({...editForm, remarks: e.target.value})}
                                  />
                                </div>
                              </div>
                            ) : (
                              /* VIEW MODE: Read-only display */
                              <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-800">
                                        <p className="text-xs font-bold text-slate-500 uppercase">Status</p>
                                        {canCreate ? (
                                          <select
                                            value={expandedTask.status}
                                            onChange={(e) => { updateTaskStatus(expandedTask.id, e.target.value); setExpandedTask({...expandedTask, status: e.target.value}) }}
                                            className={`bg-transparent font-bold outline-none w-full mt-1 cursor-pointer ${expandedTask.status === 'Not Started' ? 'text-red-400' : expandedTask.status === 'On-going' ? 'text-amber-400' : 'text-emerald-400'}`}
                                          >
                                            <option value="Not Started" className="bg-slate-900">Not Started</option>
                                            <option value="On-going" className="bg-slate-900">On-going</option>
                                            <option value="Done" className="bg-slate-900">Done</option>
                                          </select>
                                        ) : (
                                          <p className={`font-bold mt-1 ${expandedTask.status === 'Not Started' ? 'text-red-400' : expandedTask.status === 'On-going' ? 'text-amber-400' : 'text-emerald-400'}`}>{expandedTask.status}</p>
                                        )}
                                    </div>
                                    <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-800">
                                        <p className="text-xs font-bold text-slate-500 uppercase">Deadline</p>
                                        <p className="font-bold text-slate-300 mt-1">{expandedTask.deadline || 'Not set'}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-800">
                                        <p className="text-xs font-bold text-slate-500 uppercase">Priority</p>
                                        <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                            expandedTask.priority === 'Critical' ? 'bg-red-600/20 text-red-400' :
                                            expandedTask.priority === 'High' ? 'bg-orange-600/20 text-orange-400' :
                                            expandedTask.priority === 'Medium' ? 'bg-sky-600/20 text-sky-400' :
                                            'bg-emerald-600/20 text-emerald-400'
                                        }`}>{expandedTask.priority || 'Medium'}</span>
                                    </div>
                                    <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-800">
                                        <p className="text-xs font-bold text-slate-500 uppercase">Assigned To</p>
                                        <p className="font-bold text-slate-300 mt-1">{expandedTask.owner || 'Unassigned'}</p>
                                    </div>
                                </div>

                                {expandedTask.remarks && (
                                    <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-800">
                                        <p className="text-xs font-bold text-slate-500 uppercase mb-1">Notes</p>
                                        <p className="text-sm text-slate-300 leading-relaxed">{expandedTask.remarks}</p>
                                    </div>
                                )}
                              </>
                            )}

                            {/* Subtasks — always visible */}
                            <div className="p-3 sm:p-6 bg-slate-800/30 rounded-2xl border border-slate-800">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-slate-100 flex items-center gap-2 text-sm sm:text-base"><CheckSquare size={18} /> Subtasks / Checklist</h3>
                                    <span className="text-xs text-slate-500">{getProgress(expandedTask)}%</span>
                                </div>
                                <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden mb-4">
                                     <div className="bg-sky-500 h-full rounded-full transition-all duration-500" style={{width: `${getProgress(expandedTask)}%`}}></div>
                                </div>
                                <div className="space-y-3">
                                    {(expandedTask.subtasks || []).map(st => (
                                        <div key={st.id} className="flex items-center group">
                                            <input
                                                type="checkbox"
                                                checked={st.done}
                                                onChange={() => { subtasks.toggle(expandedTask.id, st.id); setExpandedTask(prev => ({...prev, subtasks: prev.subtasks.map(s => s.id === st.id ? {...s, done: !s.done} : s)})) }}
                                                className="w-5 h-5 text-sky-600 rounded focus:ring-sky-500 cursor-pointer bg-slate-700 border-slate-600"
                                            />
                                            <span className={`ml-3 ${st.done ? 'text-slate-500 line-through' : 'text-slate-300'}`}>{st.name}</span>
                                        </div>
                                    ))}
                                </div>
                                {canCreate && (
                                  <form onSubmit={(e) => handleSubtaskSubmit(e, expandedTask.id)} className="flex mt-4 pt-4 border-t border-slate-700 gap-2">
                                      <input type="text" placeholder="+ Add step" className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-sky-500 transition text-white placeholder-slate-500" value={newSubtask} onChange={e => setNewSubtask(e.target.value)}/>
                                      <button type="submit" className="bg-sky-600 text-white px-3 py-2 rounded-lg hover:bg-sky-500 transition text-sm font-bold flex items-center justify-center">
                                        <Plus size={16} />
                                      </button>
                                  </form>
                                )}
                            </div>

                            {/* Comments — always visible */}
                            <div className="p-3 sm:p-6 bg-slate-800/30 rounded-2xl border border-slate-800">
                                <h3 className="font-bold text-slate-100 mb-4 flex items-center gap-2 text-sm sm:text-base"><MessageSquare size={18} /> Team Discussion</h3>
                                <div className="space-y-4 mb-4 max-h-40 overflow-y-auto custom-scrollbar">
                                    {(expandedTask.comments || []).map((c, i) => (
                                        <div key={i} className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                                            <div className="flex justify-between items-end mb-1">
                                                <span className="font-bold text-sky-400 text-xs">{c.user}</span>
                                                <span className="text-slate-600 text-[10px]">{c.time}</span>
                                            </div>
                                            <p className="text-slate-300 text-sm">{c.text}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                     <input type="text" className="flex-1 border border-slate-700 bg-slate-800 rounded-lg px-3 py-2 outline-none focus:border-sky-500 transition text-white placeholder-slate-500" placeholder="Write a comment..." value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCommentSubmit(expandedTask.id)}/>
                                     <button onClick={() => handleCommentSubmit(expandedTask.id)} className="bg-sky-600 text-white p-2 rounded-lg hover:bg-sky-500 transition"><Send size={18}/></button>
                                </div>
                            </div>

                            {/* Delete button — only for users with canDelete */}
                            {canDelete && (
                              <div className="flex justify-end pt-4">
                                  <button onClick={() => handleDeleteRequest(expandedTask.id)} className="text-red-400 font-bold flex items-center gap-2 hover:bg-red-600/10 p-3 rounded-lg transition-colors"><Trash2/> Delete Task</button>
                              </div>
                            )}
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: PREVIEW / META — hidden on mobile */}
                <div className="hidden lg:block lg:col-span-1 border-l border-slate-800 pl-12 space-y-6">
                    <div className="p-3 sm:p-6 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                        <h4 className="font-bold text-amber-400 mb-2">Pro Tip</h4>
                        <p className="text-sm text-amber-300/70 leading-relaxed">Breaking down tasks into subtasks increases completion rates by 40%. Don't just write "Chapter 1", write "Draft Intro", "Review RRL", etc.</p>
                    </div>
                    {!canCreate && (
                      <div className="p-3 sm:p-6 bg-slate-800/30 rounded-2xl border border-slate-800">
                        <h4 className="font-bold text-slate-400 mb-2">View Only</h4>
                        <p className="text-sm text-slate-500 leading-relaxed">Your current role doesn't have edit permissions. Contact the PM to request access.</p>
                      </div>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default TaskTracker;

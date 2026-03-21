import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Plus, Trash2, X, MessageSquare, List, BarChart as GanttIcon, Layout, CheckSquare, AlertTriangle, Send } from 'lucide-react';
import GanttView from '../components/GanttView';

const TaskTracker = () => {
  const { tasks, addTask, updateTaskStatus, deleteTask, addTaskComment, subtasks, user } = useAppContext();
  const [viewMode, setViewMode] = useState('board');
  const [filter, setFilter] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedTask, setExpandedTask] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Forms
  const [commentText, setCommentText] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [newTask, setNewTask] = useState({ task: '', deadline: '', start: '', remarks: '', owner: '', priority: 'Medium', dependency: '' });

  const filteredTasks = filter === 'All' ? tasks : tasks.filter(t => t.owner.includes(filter));

  // Get unique owners for filter dropdown
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
    addTask({ ...newTask, status: 'Not Started', priority: newTask.priority || 'Medium', dependencies: newTask.dependency ? [newTask.dependency] : [] });
    setIsModalOpen(false);
    setNewTask({ task: '', deadline: '', start: '', remarks: '', owner: '', priority: 'Medium', dependency: '' });
  };

  const handleDeleteRequest = (id) => { setDeleteConfirmId(id); };

  const confirmDelete = () => {
      if (deleteConfirmId) {
          deleteTask(deleteConfirmId);
          setDeleteConfirmId(null);
          setExpandedTask(null);
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

  const handleSelectTask = (task) => {
    setExpandedTask(task);
  };

  // --- Renderers ---
  const renderKanbanColumn = (title, status, bgClass, headerColorClass, items) => (
    <div className="flex-1 min-w-[300px] bg-slate-900/50 rounded-xl border border-slate-800 flex flex-col h-full max-h-[600px] animate-enter">
        <div className={`p-4 border-b border-slate-800 font-bold flex justify-between items-center`}>
            <span className={status === 'Not Started' ? 'text-red-400' : status === 'On-going' ? 'text-amber-400' : 'text-emerald-400'}>{title}</span>
            <span className="bg-slate-800 px-2 py-0.5 rounded-full text-xs border border-slate-700 text-slate-400">{items.length}</span>
        </div>
        <div className="p-3 space-y-3 overflow-y-auto flex-1 custom-scrollbar">
            {items.map(task => (
                <div key={task.id} onClick={() => setExpandedTask(task)} className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 cursor-pointer transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1 hover:border-slate-600 group relative">
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
    <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col animate-enter">
      {/* Controls */}
      <div className="flex justify-between items-center shrink-0">
        <div>
           <h2 className="text-2xl font-bold text-slate-100">Task Tracker</h2>
           <p className="text-sm text-slate-500">View: <span className="font-bold capitalize text-sky-400">{viewMode}</span></p>
        </div>
        <div className="flex items-center space-x-4">
            {/* Owner Filter Dropdown */}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 font-medium outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
            >
              {ownerOptions.map(opt => (
                <option key={opt} value={opt} className="bg-slate-900">{opt === 'All' ? 'All Owners' : opt}</option>
              ))}
            </select>
            <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all duration-200 ${viewMode === 'list' ? 'bg-slate-700 shadow text-slate-100 scale-105' : 'text-slate-500 hover:text-slate-300'}`}><List size={18}/></button>
                <button onClick={() => setViewMode('board')} className={`p-1.5 rounded-md transition-all duration-200 ${viewMode === 'board' ? 'bg-slate-700 shadow text-slate-100 scale-105' : 'text-slate-500 hover:text-slate-300'}`}><Layout size={18}/></button>
                <button onClick={() => setViewMode('gantt')} className={`p-1.5 rounded-md transition-all duration-200 ${viewMode === 'gantt' ? 'bg-slate-700 shadow text-slate-100 scale-105' : 'text-slate-500 hover:text-slate-300'}`}><GanttIcon size={18}/></button>
            </div>
            <button onClick={() => setIsModalOpen(true)} className="flex items-center space-x-2 bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-500 hover:scale-105 active:scale-95 transition-all duration-200 shadow-md">
                <Plus size={16} /> <span>Add Task</span>
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
          {viewMode === 'board' && (
              <div className="flex space-x-4 h-full overflow-x-auto pb-4 custom-scrollbar">
                  {renderKanbanColumn('To Do', 'Not Started', '', '', filteredTasks.filter(t => t.status === 'Not Started'))}
                  {renderKanbanColumn('In Progress', 'On-going', '', '', filteredTasks.filter(t => t.status === 'On-going'))}
                  {renderKanbanColumn('Completed', 'Done', '', '', filteredTasks.filter(t => t.status === 'Done'))}
              </div>
          )}

          {viewMode === 'list' && (
              <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden animate-enter">
                  {filteredTasks.map(task => (
                      <div key={task.id} onClick={() => setExpandedTask(task)} className="p-4 border-b border-slate-800 hover:bg-slate-800/50 cursor-pointer flex justify-between items-center transition-colors duration-200">
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
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] animate-enter">
            <div className="bg-slate-900 p-6 rounded-2xl w-[400px] shadow-2xl text-center border border-slate-700">
                <div className="w-16 h-16 bg-red-500/15 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-2">Delete Task?</h3>
                <p className="text-slate-400 text-sm mb-6">This will permanently remove this task and its subtasks. Are you sure?</p>
                <div className="flex gap-3 justify-center">
                    <button onClick={() => setDeleteConfirmId(null)} className="px-5 py-2.5 rounded-xl font-bold text-slate-300 hover:bg-slate-800 transition">Cancel</button>
                    <button onClick={confirmDelete} className="px-5 py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition shadow-lg shadow-red-900/30">Yes, Delete</button>
                </div>
            </div>
         </div>
      )}

      {/* FULL SCREEN FOCUS MODE: ADD / EDIT TASK */}
      {(isModalOpen || expandedTask) && !deleteConfirmId && (
        <div className="fixed inset-0 bg-slate-950 z-[100] animate-in slide-in-from-bottom duration-300 overflow-y-auto">

            {/* Header */}
            <div className="max-w-4xl mx-auto pt-10 pb-6 px-6 flex justify-between items-center border-b border-slate-800">
                <div>
                    <h2 className="text-3xl font-bold text-slate-100">
                        {expandedTask ? 'Task Details' : 'Create New Task'}
                    </h2>
                    <p className="text-slate-500 mt-1">
                        {expandedTask ? `Managing task ID: ${expandedTask.id}` : 'Fill in the details below to track progress.'}
                    </p>
                </div>
                <button
                    onClick={() => { setIsModalOpen(false); setExpandedTask(null); }}
                    className="p-3 bg-slate-800 text-slate-400 rounded-full hover:bg-red-500 hover:text-white transition-all duration-200 shadow-sm"
                >
                    <X size={24} />
                </button>
            </div>

            {/* Content Container */}
            <div className="max-w-4xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-12">

                {/* LEFT COLUMN: FORM */}
                <div className="lg:col-span-2 space-y-8">
                    {/* If Adding New Task */}
                    {isModalOpen && (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Task Title</label>
                                <input required type="text" className="w-full text-xl font-bold border-b-2 border-slate-700 py-2 outline-none focus:border-sky-500 transition-colors bg-transparent text-white" placeholder="e.g. Data Cleaning Phase 1" value={newTask.task} onChange={e => setNewTask({...newTask, task: e.target.value})} />
                            </div>

                            <div className="grid grid-cols-2 gap-8">
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
                                <div className="flex gap-2">
                                    {['Low', 'Medium', 'High', 'Critical'].map(p => (
                                        <button key={p} type="button"
                                            onClick={() => setNewTask({...newTask, priority: p})}
                                            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
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
                            <button className="w-full bg-sky-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-sky-500 hover:scale-[1.01] active:scale-95 transition-all shadow-xl shadow-sky-900/30">
                                Create Task
                            </button>
                        </form>
                    )}

                    {/* If Editing Task (Expanded) */}
                    {expandedTask && (
                        <div className="space-y-8 animate-enter">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-800">
                                    <p className="text-xs font-bold text-slate-500 uppercase">Status</p>
                                    <select
                                        value={expandedTask.status}
                                        onChange={(e) => { updateTaskStatus(expandedTask.id, e.target.value); setExpandedTask({...expandedTask, status: e.target.value}) }}
                                        className={`bg-transparent font-bold outline-none w-full mt-1 ${expandedTask.status === 'Not Started' ? 'text-red-400' : expandedTask.status === 'On-going' ? 'text-amber-400' : 'text-emerald-400'}`}
                                    >
                                        <option value="Not Started" className="bg-slate-900">Not Started</option>
                                        <option value="On-going" className="bg-slate-900">On-going</option>
                                        <option value="Done" className="bg-slate-900">Done</option>
                                    </select>
                                </div>
                                <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-800">
                                    <p className="text-xs font-bold text-slate-500 uppercase">Deadline</p>
                                    <p className="font-bold text-slate-300 mt-1">{expandedTask.deadline}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
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

                            <div className="p-6 bg-slate-800/30 rounded-2xl border border-slate-800">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-slate-100 flex items-center gap-2"><CheckSquare /> Subtasks / Checklist</h3>
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
                                <form onSubmit={(e) => handleSubtaskSubmit(e, expandedTask.id)} className="flex mt-4 pt-4 border-t border-slate-700 gap-2">
                                    <input type="text" placeholder="+ Add step" className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-sky-500 transition text-white placeholder-slate-500" value={newSubtask} onChange={e => setNewSubtask(e.target.value)}/>
                                    <button type="submit" className="bg-sky-600 text-white px-3 py-2 rounded-lg hover:bg-sky-500 transition text-sm font-bold flex items-center justify-center">
                                      <Plus size={16} />
                                    </button>
                                </form>
                            </div>

                            <div className="p-6 bg-slate-800/30 rounded-2xl border border-slate-800">
                                <h3 className="font-bold text-slate-100 mb-4 flex items-center gap-2"><MessageSquare /> Team Discussion</h3>
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

                            <div className="flex justify-end pt-4">
                                <button onClick={() => handleDeleteRequest(expandedTask.id)} className="text-red-400 font-bold flex items-center gap-2 hover:bg-red-600/10 p-3 rounded-lg transition-colors"><Trash2/> Delete Task</button>
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: PREVIEW / META */}
                <div className="lg:col-span-1 border-l border-slate-800 pl-12 space-y-8">
                    <div className="p-6 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                        <h4 className="font-bold text-amber-400 mb-2">Pro Tip</h4>
                        <p className="text-sm text-amber-300/70 leading-relaxed">Breaking down tasks into subtasks increases completion rates by 40%. Don't just write "Chapter 1", write "Draft Intro", "Review RRL", etc.</p>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default TaskTracker;

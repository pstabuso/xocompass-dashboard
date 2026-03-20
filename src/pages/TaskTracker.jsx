import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Plus, Trash2, X, MessageSquare, List, BarChart as GanttIcon, Layout, CheckSquare, AlertTriangle } from 'lucide-react';
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
  const [newTask, setNewTask] = useState({ task: '', deadline: '', start: '', remarks: '', owner: 'Lanz', dependency: '' });

  const filteredTasks = filter === 'All' ? tasks : tasks.filter(t => t.owner.includes(filter));

  const getStatusColor = (status) => {
    switch(status) {
      case 'Done': return 'bg-green-100 text-green-700 border-green-200';
      case 'On-going': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default: return 'bg-red-100 text-red-700 border-red-200';
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
    addTask({ ...newTask, status: 'Not Started', dependencies: newTask.dependency ? [parseInt(newTask.dependency)] : [] }); 
    setIsModalOpen(false);
    setNewTask({ task: '', deadline: '', start: '', remarks: '', owner: 'Lanz', dependency: '' }); 
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

  // --- Renderers ---
  const renderKanbanColumn = (title, status, bgClass, headerColorClass, items) => (
    <div className="flex-1 min-w-[300px] bg-slate-50 rounded-xl border border-slate-200 flex flex-col h-full max-h-[600px] animate-enter">
        <div className={`p-4 border-b border-slate-200 font-bold flex justify-between items-center ${headerColorClass} bg-opacity-10`}>
            <span className={headerColorClass.replace('bg-', 'text-')}>{title}</span>
            <span className="bg-white px-2 py-0.5 rounded-full text-xs border shadow-sm text-slate-600">{items.length}</span>
        </div>
        <div className="p-3 space-y-3 overflow-y-auto flex-1 custom-scrollbar">
            {items.map(task => (
                <div key={task.id} onClick={() => setExpandedTask(task)} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 cursor-pointer transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1 group relative">
                    <div className="flex justify-between items-start mb-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${task.owner.includes(user.name) ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{task.owner}</span>
                        {task.deadline && <span className="text-[10px] text-red-400 font-medium">Due {task.deadline.slice(5)}</span>}
                    </div>
                    <h4 className="font-bold text-slate-800 text-sm leading-snug mb-3">{task.task}</h4>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-2">
                        <div className={`h-full rounded-full transition-all duration-500 ${status === 'Done' ? 'bg-green-500' : status === 'On-going' ? 'bg-yellow-500' : 'bg-red-500'}`} style={{width: `${getProgress(task)}%`}}></div>
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
           <h2 className="text-2xl font-bold text-slate-800">Task Tracker</h2>
           <p className="text-sm text-slate-500">View: <span className="font-bold capitalize text-blue-600">{viewMode}</span></p>
        </div>
        <div className="flex items-center space-x-4">
            <div className="flex bg-slate-200 p-1 rounded-lg">
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all duration-200 ${viewMode === 'list' ? 'bg-white shadow text-slate-800 scale-105' : 'text-slate-500 hover:text-slate-800'}`}><List size={18}/></button>
                <button onClick={() => setViewMode('board')} className={`p-1.5 rounded-md transition-all duration-200 ${viewMode === 'board' ? 'bg-white shadow text-slate-800 scale-105' : 'text-slate-500 hover:text-slate-800'}`}><Layout size={18}/></button>
                <button onClick={() => setViewMode('gantt')} className={`p-1.5 rounded-md transition-all duration-200 ${viewMode === 'gantt' ? 'bg-white shadow text-slate-800 scale-105' : 'text-slate-500 hover:text-slate-800'}`}><GanttIcon size={18}/></button>
            </div>
            <button onClick={() => setIsModalOpen(true)} className="flex items-center space-x-2 bg-brand-blue text-white px-4 py-2 rounded-lg hover:opacity-90 hover:scale-105 active:scale-95 transition-all duration-200 shadow-md">
                <Plus size={16} /> <span>Add Task</span>
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
          {viewMode === 'board' && (
              <div className="flex space-x-4 h-full overflow-x-auto pb-4 custom-scrollbar">
                  {renderKanbanColumn('To Do', 'Not Started', 'bg-red-50', 'text-red-700', filteredTasks.filter(t => t.status === 'Not Started'))}
                  {renderKanbanColumn('In Progress', 'On-going', 'bg-yellow-50', 'text-yellow-700', filteredTasks.filter(t => t.status === 'On-going'))}
                  {renderKanbanColumn('Completed', 'Done', 'bg-green-50', 'text-green-700', filteredTasks.filter(t => t.status === 'Done'))}
              </div>
          )}

          {viewMode === 'list' && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden animate-enter">
                  {filteredTasks.map(task => (
                      <div key={task.id} onClick={() => setExpandedTask(task)} className="p-4 border-b border-slate-100 hover:bg-slate-50 cursor-pointer flex justify-between items-center transition-colors duration-200">
                          <div>
                              <p className="font-bold text-slate-800">{task.task}</p>
                              <div className="flex items-center space-x-2 mt-1">
                                  <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-500">{task.owner}</span>
                                  <span className="text-xs text-slate-400">Due: {task.deadline}</span>
                              </div>
                          </div>
                          <div className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(task.status)}`}>{task.status}</div>
                      </div>
                  ))}
              </div>
          )}

          {viewMode === 'gantt' && (
             <div className="h-full animate-enter">
                {filteredTasks.length === 0 ? <div className="text-center p-8 text-slate-400">No tasks to display.</div> : <GanttView tasks={filteredTasks} />}
            </div>
          )}
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmId && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] animate-enter">
            <div className="bg-white p-6 rounded-2xl w-[400px] shadow-2xl text-center">
                <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Delete Task?</h3>
                <p className="text-slate-500 text-sm mb-6">This will permanently remove this task and its subtasks. Are you sure?</p>
                <div className="flex gap-3 justify-center">
                    <button onClick={() => setDeleteConfirmId(null)} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition">Cancel</button>
                    <button onClick={confirmDelete} className="px-5 py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition shadow-lg shadow-red-200">Yes, Delete</button>
                </div>
            </div>
         </div>
      )}

      {/* FULL SCREEN FOCUS MODE: ADD / EDIT TASK */}
      {(isModalOpen || expandedTask) && !deleteConfirmId && (
        <div className="fixed inset-0 bg-white z-[100] animate-in slide-in-from-bottom duration-300 overflow-y-auto">
            
            {/* Header */}
            <div className="max-w-4xl mx-auto pt-10 pb-6 px-6 flex justify-between items-center border-b border-slate-100">
                <div>
                    <h2 className="text-3xl font-bold text-slate-800">
                        {expandedTask ? 'Task Details' : 'Create New Task'}
                    </h2>
                    <p className="text-slate-500 mt-1">
                        {expandedTask ? `Managing task ID: ${expandedTask.id}` : 'Fill in the details below to track progress.'}
                    </p>
                </div>
                <button 
                    onClick={() => { setIsModalOpen(false); setExpandedTask(null); }} 
                    className="p-3 bg-slate-100 text-slate-400 rounded-full hover:bg-red-500 hover:text-white transition-all duration-200 shadow-sm"
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
                                <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Task Title</label>
                                <input required type="text" className="w-full text-xl font-bold border-b-2 border-slate-200 py-2 outline-none focus:border-blue-500 transition-colors" placeholder="e.g. Data Cleaning Phase 1" value={newTask.task} onChange={e => setNewTask({...newTask, task: e.target.value})} />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Start Date</label>
                                    <input type="date" className="w-full bg-slate-50 p-3 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={newTask.start} onChange={e => setNewTask({...newTask, start: e.target.value})} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Deadline</label>
                                    <input required type="date" className="w-full bg-slate-50 p-3 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={newTask.deadline} onChange={e => setNewTask({...newTask, deadline: e.target.value})} />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Assign To</label>
                                <div className="flex gap-4">
                                    {['Lanz', 'Ralph', 'Paolo', 'All'].map(owner => (
                                        <button key={owner} type="button" onClick={() => setNewTask({...newTask, owner})} className={`px-6 py-3 rounded-lg font-bold border transition-all ${newTask.owner === owner ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-400'}`}>
                                            {owner}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 hover:scale-[1.01] active:scale-95 transition-all shadow-xl shadow-blue-200">
                                Create Task
                            </button>
                        </form>
                    )}

                    {/* If Editing Task (Expanded) */}
                    {expandedTask && (
                        <div className="space-y-8 animate-enter">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                    <p className="text-xs font-bold text-slate-400 uppercase">Status</p>
                                    <select 
                                        value={expandedTask.status} 
                                        onChange={(e) => { updateTaskStatus(expandedTask.id, e.target.value); setExpandedTask({...expandedTask, status: e.target.value}) }}
                                        className={`bg-transparent font-bold outline-none w-full mt-1 ${expandedTask.status === 'Not Started' ? 'text-red-600' : expandedTask.status === 'On-going' ? 'text-yellow-600' : 'text-green-600'}`}
                                    >
                                        <option value="Not Started">Not Started</option>
                                        <option value="On-going">On-going</option>
                                        <option value="Done">Done</option>
                                    </select>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                    <p className="text-xs font-bold text-slate-400 uppercase">Deadline</p>
                                    <p className="font-bold text-slate-700 mt-1">{expandedTask.deadline}</p>
                                </div>
                            </div>

                            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-slate-800 flex items-center gap-2"><CheckSquare /> Subtasks / Checklist</h3>
                                    <span className="text-xs text-slate-400">{getProgress(expandedTask)}%</span>
                                </div>
                                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-4">
                                     <div className="bg-blue-500 h-full rounded-full transition-all duration-500" style={{width: `${getProgress(expandedTask)}%`}}></div>
                                </div>
                                <div className="space-y-3">
                                    {(expandedTask.subtasks || []).map(st => (
                                        <div key={st.id} className="flex items-center group">
                                            <input 
                                                type="checkbox" 
                                                checked={st.done}
                                                onChange={() => { subtasks.toggle(expandedTask.id, st.id); setExpandedTask(prev => ({...prev, subtasks: prev.subtasks.map(s => s.id === st.id ? {...s, done: !s.done} : s)})) }}
                                                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                                            />
                                            <span className={`ml-3 ${st.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{st.name}</span>
                                        </div>
                                    ))}
                                </div>
                                <form onSubmit={(e) => handleSubtaskSubmit(e, expandedTask.id)} className="flex mt-4 pt-4 border-t border-slate-200">
                                    <input type="text" placeholder="+ Add step" className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-400 transition" value={newSubtask} onChange={e => setNewSubtask(e.target.value)}/>
                                </form>
                            </div>

                            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><MessageSquare /> Team Discussion</h3>
                                <div className="space-y-4 mb-4 max-h-40 overflow-y-auto custom-scrollbar">
                                    {(expandedTask.comments || []).map((c, i) => (
                                        <div key={i} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                                            <div className="flex justify-between items-end mb-1">
                                                <span className="font-bold text-blue-600 text-xs">{c.user}</span>
                                                <span className="text-slate-300 text-[10px]">{c.time}</span>
                                            </div>
                                            <p className="text-slate-600 text-sm">{c.text}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                     <input type="text" className="flex-1 border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-400 transition" placeholder="Write a comment..." value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleCommentSubmit(expandedTask.id)}/>
                                     <button onClick={() => handleCommentSubmit(expandedTask.id)} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition"><Send size={18}/></button>
                                </div>
                            </div>
                            
                            <div className="flex justify-end pt-4">
                                <button onClick={() => handleDeleteRequest(expandedTask.id)} className="text-red-500 font-bold flex items-center gap-2 hover:bg-red-50 p-3 rounded-lg transition-colors"><Trash2/> Delete Task</button>
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: PREVIEW / META */}
                <div className="lg:col-span-1 border-l border-slate-100 pl-12 space-y-8">
                    <div className="p-6 bg-yellow-50 rounded-2xl border border-yellow-100 shadow-sm">
                        <h4 className="font-bold text-yellow-800 mb-2">Pro Tip</h4>
                        <p className="text-sm text-yellow-700 leading-relaxed">Breaking down tasks into subtasks increases completion rates by 40%. Don't just write "Chapter 1", write "Draft Intro", "Review RRL", etc.</p>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default TaskTracker;
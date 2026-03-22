import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Edit2, Plus, X, CheckSquare, AlertCircle, Trash2, Save } from 'lucide-react';

const Schedule = () => {
  const { user, events, addEvent, updateEvent, deleteEvent, tasks, addTask } = useAppContext();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('selection');
  const [editMode, setEditMode] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [eventForm, setEventForm] = useState({ title: '', description: '', time: '09:00', status: 'Not Started', date: '' });
  const [taskForm, setTaskForm] = useState({ task: '', remarks: '', deadline: '', status: 'Not Started', owner: '', priority: 'Medium' });

  const canCreate = user?.permissions?.canCreate;
  const canDelete = user?.permissions?.canDelete;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const handleDayClick = (day) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
    setEventForm({ title: '', description: '', time: '09:00', status: 'Not Started', date: dateStr });
    setTaskForm({ task: '', remarks: '', deadline: dateStr, status: 'Not Started', owner: user?.name || '', start: dateStr, priority: 'Medium' });
    setModalMode(canCreate ? 'selection' : 'view');
    setEditMode(null);
    setIsModalOpen(true);
  };

  const handleEditEvent = (evt) => {
    if (!canCreate) return;
    setEventForm(evt);
    setEditMode(evt.id);
    setModalMode('event');
    setSelectedDate(evt.date);
    setIsModalOpen(true);
  };

  const handleDeleteEvent = (id) => {
    if (!canDelete) return;
    setDeleteConfirmId(id);
  };

  const confirmDeleteEvent = () => {
    if (!canDelete) return;
    deleteEvent(deleteConfirmId);
    setDeleteConfirmId(null);
    closeModal();
  };

  const submitEvent = (e) => {
    e.preventDefault();
    if (!canCreate) return;
    if (editMode) {
      updateEvent(editMode, eventForm);
    } else {
      addEvent({ ...eventForm, date: selectedDate, type: 'event' });
    }
    closeModal();
  };

  const submitTask = (e) => {
    e.preventDefault();
    if (!canCreate) return;
    addTask({ ...taskForm, deadline: selectedDate, priority: taskForm.priority || 'Medium' });
    closeModal();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEventForm({ title: '', description: '', time: '09:00', status: 'Not Started', date: '' });
    setTaskForm({ task: '', remarks: '', deadline: '', status: 'Not Started', owner: '', priority: 'Medium' });
    setEditMode(null);
    setDeleteConfirmId(null);
  };

  const getItemsForDay = (day) => {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEvents = events.filter(e => e.date === dateStr).map(e => ({...e, kind: 'event'}));
      const dayTasks = tasks.filter(t => t.deadline === dateStr).map(t => ({...t, title: t.task, kind: 'task'}));
      return [...dayEvents, ...dayTasks];
  };

  // Items for the selected date (shown in view mode for non-creators)
  const selectedItems = selectedDate ? getItemsForDay(parseInt(selectedDate.split('-')[2])) : [];

  return (
    <div className="flex flex-col lg:flex-row h-auto lg:h-[calc(100vh-100px)] gap-4 sm:gap-6 animate-enter">
      <div className="flex-1 flex flex-col space-y-4 sm:space-y-6 min-w-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-900/50 p-3 sm:p-4 rounded-xl border border-slate-800 transition hover:shadow-md duration-300">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-sky-600/15 text-sky-400 rounded-lg"><CalIcon size={20}/></div>
             <div><h2 className="text-lg sm:text-xl font-bold text-slate-100">Team Calendar</h2><p className="text-slate-500 text-xs">Events & Deadlines</p></div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
             <button onClick={goToToday} className="text-xs font-bold text-slate-500 hover:text-sky-400 px-2 transition-colors">Today</button>
             <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
                <button onClick={prevMonth} className="p-1 hover:bg-slate-700 rounded transition-all active:scale-95"><ChevronLeft size={18} className="text-slate-400"/></button>
                <div className="px-2 sm:px-4 font-bold text-slate-300 w-24 sm:w-32 text-center text-xs sm:text-sm">{monthNames[month]} {year}</div>
                <button onClick={nextMonth} className="p-1 hover:bg-slate-700 rounded transition-all active:scale-95"><ChevronRight size={18} className="text-slate-400"/></button>
             </div>
          </div>
        </div>
        <div className="flex-1 bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden flex flex-col">
          <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-800/30">
             {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (<div key={i} className="p-1.5 sm:p-3 text-center text-[10px] sm:text-xs font-bold text-slate-500 uppercase">{d}</div>))}
          </div>
          <div className="grid grid-cols-7 flex-1 auto-rows-fr">
             {[...Array(firstDayOfMonth)].map((_, i) => <div key={`empty-${i}`} className="bg-slate-900/30 border-b border-r border-slate-800/50"></div>)}
             {[...Array(daysInMonth)].map((_, i) => {
                const day = i + 1; const items = getItemsForDay(day); const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
                return (
                  <div key={day} onClick={() => handleDayClick(day)} className={`border-b border-r border-slate-800/50 p-1 sm:p-2 relative group hover:bg-slate-800/50 transition duration-200 cursor-pointer min-h-[48px] sm:min-h-[80px] ${isToday ? 'bg-sky-600/20 border-sky-500/30' : ''}`}>
                     <span className={`text-[10px] sm:text-xs font-bold w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-sky-600 text-white' : 'text-slate-500'}`}>{day}</span>
                     <div className="mt-0.5 sm:mt-1 space-y-0.5 sm:space-y-1">
                       {items.slice(0, 2).map((item, idx) => (
                         <div key={idx} className={`text-[8px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded border truncate font-medium hidden sm:block ${
                             item.kind === 'event' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                         }`}>
                           {item.title}
                         </div>
                       ))}
                       {/* Mobile: just show dots */}
                       {items.length > 0 && <div className="flex gap-0.5 sm:hidden justify-center">{items.slice(0, 3).map((item, idx) => <div key={idx} className={`w-1.5 h-1.5 rounded-full ${item.kind === 'event' ? 'bg-emerald-400' : 'bg-amber-400'}`} />)}</div>}
                       {items.length > 2 && <div className="text-[9px] text-slate-500 pl-1 hidden sm:block">+{items.length - 2} more</div>}
                     </div>
                  </div>
                );
             })}
          </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR: Upcoming Agenda — below calendar on mobile, beside on desktop */}
      <div className="w-full lg:w-80 bg-slate-900/50 rounded-xl border border-slate-800 flex flex-col overflow-hidden max-h-[400px] lg:max-h-none">
         <div className="p-4 border-b border-slate-800 bg-slate-800/30"><h3 className="font-bold text-slate-100">Upcoming Agenda</h3></div>
         <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {events.length > 0 && (
              <div><h4 className="text-xs font-bold text-emerald-400 uppercase mb-2">Events</h4>
                <div className="space-y-2">{[...events].sort((a,b) => new Date(a.date) - new Date(b.date)).map(evt => (
                    <div key={evt.id} className="p-3 rounded-lg border border-slate-800 bg-slate-800/30 hover:border-emerald-500/30 group relative transition-all duration-300 hover:shadow-md hover:-translate-y-1">
                       <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-sm text-slate-200">{evt.title}</p>
                            <p className="text-xs text-slate-500">{evt.date} • {evt.time}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded mt-1 inline-block ${evt.status === 'Done' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>{evt.status}</span>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {canCreate && (
                              <button onClick={() => handleEditEvent(evt)} className="p-1 text-slate-500 hover:text-sky-400 transition"><Edit2 size={14}/></button>
                            )}
                            {canDelete && (
                              <button onClick={() => handleDeleteEvent(evt.id)} className="p-1 text-slate-500 hover:text-red-400 transition"><Trash2 size={14}/></button>
                            )}
                          </div>
                       </div>
                    </div>
                  ))}</div></div>
            )}
            {tasks.filter(t => t.status !== 'Done').length > 0 && (
              <div><h4 className="text-xs font-bold text-amber-400 uppercase mb-2 mt-4">Pending Deadlines</h4>
                <div className="space-y-2">{[...tasks].filter(t => t.status !== 'Done').sort((a,b) => new Date(a.deadline) - new Date(b.deadline)).map(t => (
                    <div key={t.id} className="p-3 rounded-lg border border-slate-800 bg-slate-800/30 hover:border-amber-500/30 transition-all duration-300 hover:shadow-md hover:-translate-y-1"><p className="font-bold text-sm text-slate-200">{t.task}</p><div className="flex justify-between items-center mt-1"><p className="text-xs text-amber-400 font-medium">Due: {t.deadline}</p><span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 rounded">{t.owner}</span></div></div>
                  ))}</div></div>
            )}
         </div>
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] animate-enter">
          <div className="bg-slate-900 p-6 rounded-2xl w-[calc(100%-2rem)] max-w-[400px] shadow-2xl text-center border border-slate-700 mx-4">
            <div className="w-16 h-16 bg-red-500/15 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle size={32} /></div>
            <h3 className="text-xl font-bold text-slate-100 mb-2">Delete Event?</h3>
            <p className="text-slate-400 text-sm mb-6">This action cannot be undone.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeleteConfirmId(null)} className="px-5 py-2.5 rounded-xl font-bold text-slate-300 hover:bg-slate-800 transition">Cancel</button>
              <button onClick={confirmDeleteEvent} className="px-5 py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition shadow-lg shadow-red-900/30">Yes, Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN MODAL */}
      {isModalOpen && !deleteConfirmId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-enter">
          <div className="relative bg-slate-900 rounded-xl shadow-2xl w-[calc(100%-2rem)] max-w-[480px] overflow-hidden transform transition-all scale-100 border border-slate-700 mx-4">
             <button onClick={closeModal} className="absolute top-4 right-4 z-10 p-1.5 text-slate-400 hover:text-red-400 bg-slate-800/50 hover:bg-red-500/10 rounded-full transition-all"><X size={20} /></button>

             {/* SELECTION MODE — choose event or task */}
             {modalMode === 'selection' && (
                <div className="p-8 text-center">
                   <h3 className="text-xl font-bold text-slate-100 mb-2">Add to {selectedDate}</h3>
                   <div className="grid grid-cols-2 gap-4 mt-6">
                      <button onClick={() => setModalMode('event')} className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-slate-700 hover:border-emerald-500 hover:bg-emerald-500/10 transition group hover:scale-105 active:scale-95"><div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center mb-3"><CalIcon size={24}/></div><span className="font-bold text-slate-200">Event</span></button>
                      <button onClick={() => setModalMode('task')} className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-slate-700 hover:border-amber-500 hover:bg-amber-500/10 transition group hover:scale-105 active:scale-95"><div className="w-12 h-12 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center mb-3"><CheckSquare size={24}/></div><span className="font-bold text-slate-200">Task</span></button>
                   </div>
                </div>
             )}

             {/* VIEW MODE — for users without create permission */}
             {modalMode === 'view' && (
                <div className="p-6">
                   <h3 className="text-lg font-bold text-slate-100 mb-4">Items on {selectedDate}</h3>
                   {selectedItems.length === 0 ? (
                     <p className="text-slate-500 text-sm text-center py-8">No events or tasks on this date.</p>
                   ) : (
                     <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar">
                       {selectedItems.map((item, idx) => (
                         <div key={idx} className={`p-3 rounded-lg border ${item.kind === 'event' ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
                           <div className="flex items-center gap-2 mb-1">
                             <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${item.kind === 'event' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>{item.kind}</span>
                             <span className={`text-[10px] px-1.5 py-0.5 rounded ${item.status === 'Done' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>{item.status}</span>
                           </div>
                           <p className="font-bold text-sm text-slate-200">{item.title}</p>
                           {item.time && <p className="text-xs text-slate-500 mt-1">{item.time}</p>}
                           {item.owner && <p className="text-xs text-slate-500">Assigned: {item.owner}</p>}
                         </div>
                       ))}
                     </div>
                   )}
                </div>
             )}

             {/* EVENT FORM */}
             {modalMode === 'event' && (
                <form onSubmit={submitEvent}>
                   <div className="bg-emerald-600 p-4 flex justify-between items-center text-white"><h3 className="font-bold flex items-center gap-2"><CalIcon size={18}/> {editMode ? 'Edit Event' : 'New Event'}</h3></div>
                   <div className="p-6 space-y-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500">Event Name</label>
                        <input required type="text" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-lg mt-1 outline-none text-white focus:ring-2 focus:ring-emerald-500 transition" value={eventForm.title} onChange={e => setEventForm({...eventForm, title: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500">Description</label>
                        <textarea className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-lg mt-1 outline-none text-white focus:ring-2 focus:ring-emerald-500 transition resize-none" rows="2" value={eventForm.description} onChange={e => setEventForm({...eventForm, description: e.target.value})} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-slate-500">Date</label>
                          <input type="date" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-lg mt-1 text-white outline-none focus:ring-2 focus:ring-emerald-500 transition" value={eventForm.date} onChange={e => setEventForm({...eventForm, date: e.target.value})} />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500">Time</label>
                          <input type="time" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-lg mt-1 text-white outline-none focus:ring-2 focus:ring-emerald-500 transition" value={eventForm.time} onChange={e => setEventForm({...eventForm, time: e.target.value})} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500">Status</label>
                        <select value={eventForm.status} onChange={e => setEventForm({...eventForm, status: e.target.value})} className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 text-white rounded-lg mt-1 outline-none focus:ring-2 focus:ring-emerald-500 transition">
                          <option value="Not Started">Not Started</option><option value="On-going">On-going</option><option value="Done">Done</option>
                        </select>
                      </div>
                      <button className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-bold hover:bg-emerald-500 transition flex items-center justify-center gap-2">
                        <Save size={16} /> {editMode ? 'Save Changes' : 'Create Event'}
                      </button>
                      {editMode && canDelete && (
                        <button type="button" onClick={() => handleDeleteEvent(editMode)} className="w-full flex items-center justify-center gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 py-2 rounded-lg font-bold transition mt-1">
                          <Trash2 size={16} /> Delete Event
                        </button>
                      )}
                   </div>
                </form>
             )}

             {/* TASK FORM */}
             {modalMode === 'task' && (
                <form onSubmit={submitTask}>
                   <div className="bg-amber-600 p-4 flex justify-between items-center text-white"><h3 className="font-bold flex items-center gap-2"><CheckSquare size={18}/> New Task / Deadline</h3></div>
                   <div className="p-6 space-y-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500">Task Name</label>
                        <input required type="text" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-lg mt-1 outline-none text-white focus:ring-2 focus:ring-amber-500 transition" value={taskForm.task} onChange={e => setTaskForm({...taskForm, task: e.target.value})} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-slate-500">Deadline</label>
                          <input type="date" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-lg mt-1 text-white outline-none focus:ring-2 focus:ring-amber-500 transition" value={taskForm.deadline} onChange={e => setTaskForm({...taskForm, deadline: e.target.value})} />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500">Status</label>
                          <select className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-lg mt-1 text-white outline-none focus:ring-2 focus:ring-amber-500 transition" value={taskForm.status} onChange={e => setTaskForm({...taskForm, status: e.target.value})}>
                            <option>Not Started</option><option>On-going</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500">Assigned To</label>
                        <input type="text" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-lg mt-1 outline-none text-white focus:ring-2 focus:ring-amber-500 transition" placeholder="Enter assignee name" value={taskForm.owner} onChange={e => setTaskForm({...taskForm, owner: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500">Priority</label>
                        <div className="flex gap-2 mt-1">
                          {['Low', 'Medium', 'High', 'Critical'].map(p => (
                            <button key={p} type="button"
                              onClick={() => setTaskForm({...taskForm, priority: p})}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                taskForm.priority === p
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
                      <div>
                        <label className="text-xs font-bold text-slate-500">Notes (optional)</label>
                        <textarea className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-lg mt-1 outline-none text-white focus:ring-2 focus:ring-amber-500 transition resize-none text-sm" rows={2} placeholder="Additional notes or context..." value={taskForm.remarks} onChange={e => setTaskForm({...taskForm, remarks: e.target.value})} />
                      </div>
                      <button className="w-full bg-amber-600 text-white py-2.5 rounded-lg font-bold hover:bg-amber-500 transition flex items-center justify-center gap-2">
                        <Plus size={16} /> Create Task
                      </button>
                   </div>
                </form>
             )}
          </div>
        </div>
      )}
    </div>
  );
};
export default Schedule;

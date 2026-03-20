import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Edit2, Plus, X, CheckSquare, AlertCircle } from 'lucide-react';

const Schedule = () => {
  const { events, addEvent, updateEvent, tasks, addTask } = useAppContext();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('selection');
  const [editMode, setEditMode] = useState(null);
  const [eventForm, setEventForm] = useState({ title: '', description: '', time: '09:00', status: 'Not Started', date: '' });
  const [taskForm, setTaskForm] = useState({ task: '', remarks: '', deadline: '', status: 'Not Started', owner: 'Lanz' });

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
    setEventForm({ ...eventForm, date: dateStr });
    setTaskForm({ ...taskForm, deadline: dateStr });
    setModalMode('selection');
    setEditMode(null);
    setIsModalOpen(true);
  };
  const handleEditEvent = (evt) => { setEventForm(evt); setEditMode(evt.id); setModalMode('event'); setSelectedDate(evt.date); setIsModalOpen(true); };
  const submitEvent = (e) => { e.preventDefault(); if (editMode) { updateEvent(editMode, eventForm); } else { addEvent({ ...eventForm, date: selectedDate, type: 'event' }); } closeModal(); };
  const submitTask = (e) => { e.preventDefault(); addTask({ ...taskForm, deadline: selectedDate }); closeModal(); };
  const closeModal = () => { setIsModalOpen(false); setEventForm({ title: '', description: '', time: '09:00', status: 'Not Started', date: '' }); setTaskForm({ task: '', remarks: '', deadline: '', status: 'Not Started', owner: 'Lanz' }); setEditMode(null); };
  
  const getItemsForDay = (day) => { 
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; 
      const dayEvents = events.filter(e => e.date === dateStr).map(e => ({...e, kind: 'event'})); 
      const dayTasks = tasks.filter(t => t.deadline === dateStr).map(t => ({...t, title: t.task, kind: 'task'})); 
      return [...dayEvents, ...dayTasks]; 
  };

  return (
    <div className="flex h-[calc(100vh-100px)] gap-6 animate-enter">
      <div className="flex-1 flex flex-col space-y-6">
        <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm transition hover:shadow-md duration-300">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><CalIcon size={24}/></div>
             <div><h2 className="text-xl font-bold text-slate-800">Team Calendar</h2><p className="text-slate-500 text-xs">Events & Deadlines</p></div>
          </div>
          <div className="flex items-center space-x-4">
             <button onClick={goToToday} className="text-xs font-bold text-slate-500 hover:text-blue-600 px-3 transition-colors">Jump to Today</button>
             <div className="flex items-center bg-slate-100 rounded-lg p-1">
                <button onClick={prevMonth} className="p-1 hover:bg-white rounded transition-all shadow-sm active:scale-95"><ChevronLeft size={18}/></button>
                <div className="px-4 font-bold text-slate-700 w-32 text-center text-sm">{monthNames[month]} {year}</div>
                <button onClick={nextMonth} className="p-1 hover:bg-white rounded transition-all shadow-sm active:scale-95"><ChevronRight size={18}/></button>
             </div>
          </div>
        </div>
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
             {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (<div key={d} className="p-3 text-center text-xs font-bold text-slate-400 uppercase">{d}</div>))}
          </div>
          <div className="grid grid-cols-7 flex-1 auto-rows-fr">
             {[...Array(firstDayOfMonth)].map((_, i) => <div key={`empty-${i}`} className="bg-slate-50/30 border-b border-r border-slate-100"></div>)}
             {[...Array(daysInMonth)].map((_, i) => {
                const day = i + 1; const items = getItemsForDay(day); const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
                return (
                  <div key={day} onClick={() => handleDayClick(day)} className={`border-b border-r border-slate-100 p-2 relative group hover:bg-sky-50 transition duration-200 cursor-pointer min-h-[80px] ${isToday ? 'bg-blue-50/40' : ''}`}>
                     <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>{day}</span>
                     <div className="mt-1 space-y-1">
                       {items.slice(0, 3).map((item, idx) => (
                         <div key={idx} className={`text-[10px] px-1.5 py-0.5 rounded border truncate font-medium ${
                             item.kind === 'event' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'
                         }`}>
                           {item.kind === 'task' && <AlertCircle size={8} className="inline mr-1"/>}{item.title}
                         </div>
                       ))}
                       {items.length > 3 && <div className="text-[9px] text-slate-400 pl-1">+{items.length - 3} more</div>}
                     </div>
                  </div>
                );
             })}
          </div>
        </div>
      </div>
      
      <div className="w-80 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
         <div className="p-4 border-b border-slate-100 bg-slate-50"><h3 className="font-bold text-slate-800">Upcoming Agenda</h3></div>
         <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {events.length > 0 && (
              <div><h4 className="text-xs font-bold text-emerald-500 uppercase mb-2">Events</h4>
                <div className="space-y-2">{events.sort((a,b) => new Date(a.date) - new Date(b.date)).map(evt => (
                    <div key={evt.id} className="p-3 rounded-lg border border-slate-100 bg-white hover:border-emerald-200 group relative transition-all duration-300 hover:shadow-md hover:-translate-y-1">
                       <div className="flex justify-between items-start">
                          <div><p className="font-bold text-sm text-slate-700">{evt.title}</p><p className="text-xs text-slate-500">{evt.date} • {evt.time}</p><span className={`text-[10px] px-1.5 py-0.5 rounded mt-1 inline-block ${evt.status === 'Done' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{evt.status}</span></div>
                          <button onClick={() => handleEditEvent(evt)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-blue-600"><Edit2 size={14}/></button>
                       </div>
                    </div>
                  ))}</div></div>
            )}
            {tasks.filter(t => t.status !== 'Done').length > 0 && (
              <div><h4 className="text-xs font-bold text-amber-500 uppercase mb-2 mt-4">Pending Deadlines</h4>
                <div className="space-y-2">{tasks.filter(t => t.status !== 'Done').sort((a,b) => new Date(a.deadline) - new Date(b.deadline)).map(t => (
                    <div key={t.id} className="p-3 rounded-lg border border-slate-100 bg-white hover:border-amber-200 transition-all duration-300 hover:shadow-md hover:-translate-y-1"><p className="font-bold text-sm text-slate-700">{t.task}</p><div className="flex justify-between items-center mt-1"><p className="text-xs text-amber-600 font-medium">Due: {t.deadline}</p><span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 rounded">{t.owner}</span></div></div>
                  ))}</div></div>
            )}
         </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-enter">
          <div className="relative bg-white rounded-xl shadow-2xl w-[450px] overflow-hidden transform transition-all scale-100">
             <button onClick={closeModal} className="absolute top-4 right-4 z-10 p-1.5 text-slate-400 hover:text-red-500 bg-white/50 hover:bg-red-50 rounded-full transition-all"><X size={20} /></button>
             {modalMode === 'selection' && (
                <div className="p-8 text-center">
                   <h3 className="text-xl font-bold text-slate-800 mb-2">Add to {selectedDate}</h3>
                   <div className="grid grid-cols-2 gap-4 mt-6">
                      <button onClick={() => setModalMode('event')} className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-slate-100 hover:border-emerald-500 hover:bg-emerald-50 transition group hover:scale-105 active:scale-95"><div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3"><CalIcon size={24}/></div><span className="font-bold text-slate-700">Event</span></button>
                      <button onClick={() => setModalMode('task')} className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-slate-100 hover:border-amber-500 hover:bg-amber-50 transition group hover:scale-105 active:scale-95"><div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-3"><CheckSquare size={24}/></div><span className="font-bold text-slate-700">Task</span></button>
                   </div>
                </div>
             )}
             {modalMode === 'event' && (
                <form onSubmit={submitEvent}>
                   <div className="bg-emerald-600 p-4 flex justify-between items-center text-white"><h3 className="font-bold flex items-center gap-2"><CalIcon size={18}/> {editMode ? 'Edit Event' : 'New Event'}</h3></div>
                   <div className="p-6 space-y-4">
                      <div><label className="text-xs font-bold text-slate-500">Event Name</label><input required type="text" className="w-full border p-2 rounded-lg mt-1 outline-none" value={eventForm.title} onChange={e => setEventForm({...eventForm, title: e.target.value})} /></div>
                      <div><label className="text-xs font-bold text-slate-500">Description</label><textarea className="w-full border p-2 rounded-lg mt-1 outline-none" rows="2" value={eventForm.description} onChange={e => setEventForm({...eventForm, description: e.target.value})} /></div>
                      <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-500">Date</label><input type="date" className="w-full border p-2 rounded-lg mt-1" value={eventForm.date} onChange={e => setEventForm({...eventForm, date: e.target.value})} /></div><div><label className="text-xs font-bold text-slate-500">Time</label><input type="time" className="w-full border p-2 rounded-lg mt-1" value={eventForm.time} onChange={e => setEventForm({...eventForm, time: e.target.value})} /></div></div>
                      <button className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700 transition">Save Event</button>
                   </div>
                </form>
             )}
             {modalMode === 'task' && (
                <form onSubmit={submitTask}>
                   <div className="bg-amber-500 p-4 flex justify-between items-center text-white"><h3 className="font-bold flex items-center gap-2"><CheckSquare size={18}/> New Task / Deadline</h3></div>
                   <div className="p-6 space-y-4">
                      <div><label className="text-xs font-bold text-slate-500">Task Name</label><input required type="text" className="w-full border p-2 rounded-lg mt-1 outline-none" value={taskForm.task} onChange={e => setTaskForm({...taskForm, task: e.target.value})} /></div>
                      <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-500">Deadline</label><input type="date" className="w-full border p-2 rounded-lg mt-1" value={taskForm.deadline} onChange={e => setTaskForm({...taskForm, deadline: e.target.value})} /></div><div><label className="text-xs font-bold text-slate-500">Status</label><select className="w-full border p-2 rounded-lg mt-1" value={taskForm.status} onChange={e => setTaskForm({...taskForm, status: e.target.value})}><option>Not Started</option><option>On-going</option></select></div></div>
                      <button className="w-full bg-amber-500 text-white py-2 rounded-lg font-bold hover:bg-amber-600 mt-2 transition">Create Task</button>
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
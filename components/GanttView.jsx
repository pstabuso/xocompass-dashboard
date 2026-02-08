import React, { useState, useMemo } from 'react';
import { Calendar as CalIcon } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const GanttView = ({ tasks }) => {
  const { events } = useAppContext();
  const [viewMode, setViewMode] = useState('Day'); 

  const config = {
    Day: { pxPerDay: 60, headerFormat: 'd', step: 1 },
    Week: { pxPerDay: 20, headerFormat: 'w', step: 7 },
    Month: { pxPerDay: 5, headerFormat: 'm', step: 30 },
  };
  
  const pxPerDay = config[viewMode].pxPerDay;
  
  const timelineStart = useMemo(() => {
    const allDates = [...tasks.map(t => new Date(t.start || t.deadline)), ...events.map(e => new Date(e.date))].filter(d => !isNaN(d));
    if (allDates.length === 0) return new Date();
    const min = new Date(Math.min(...allDates));
    min.setDate(min.getDate() - 7); 
    return min;
  }, [tasks, events]);

  const timelineEnd = useMemo(() => {
    const allDates = [...tasks.map(t => new Date(t.deadline)), ...events.map(e => new Date(e.date))].filter(d => !isNaN(d));
    if (allDates.length === 0) return new Date();
    const max = new Date(Math.max(...allDates));
    max.setDate(max.getDate() + 30); 
    return max;
  }, [tasks, events]);

  const totalDays = Math.ceil((timelineEnd - timelineStart) / (1000 * 60 * 60 * 24));

  const getPos = (dateStr) => {
    if (!dateStr) return 0;
    const date = new Date(dateStr);
    const diffTime = date - timelineStart;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays * pxPerDay;
  };

  const renderTimeHeaders = () => {
    const headers = [];
    for (let i = 0; i <= totalDays; i += config[viewMode].step) {
      const date = new Date(timelineStart);
      date.setDate(date.getDate() + i);
      let label = `${date.getDate()}`;
      if (viewMode === 'Week') label = `W${getWeekNumber(date)}`;
      if (viewMode === 'Month') label = '';
      const monthLabel = date.getDate() === 1 || i === 0 ? date.toLocaleString('default', { month: 'short' }) : '';

      headers.push(
        <div key={i} className="absolute border-l border-slate-100 h-full flex flex-col items-center justify-end pb-2 text-xs text-slate-400 font-medium" 
             style={{ left: i * pxPerDay, width: config[viewMode].step * pxPerDay }}>
          {monthLabel && <span className="absolute top-0 left-1 font-bold text-slate-600 uppercase text-[10px] bg-slate-100 px-1 rounded">{monthLabel}</span>}
          <span>{label}</span>
        </div>
      );
    }
    return headers;
  };

  const getWeekNumber = (d) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    return Math.ceil((((date - yearStart) / 86400000) + 1)/7);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 flex flex-col h-[600px] shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <div className="flex items-center space-x-2">
           <span className="text-sm font-bold text-slate-600 mr-2">Zoom:</span>
           {['Day', 'Week', 'Month'].map(m => (
             <button key={m} onClick={() => setViewMode(m)} 
               className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${viewMode === m ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
               {m}
             </button>
           ))}
        </div>
        <div className="text-xs text-slate-500 flex items-center gap-4 font-medium">
            <div className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-500 rounded-full"></div> Tasks</div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 bg-purple-500 rounded-sm"></div> Events (Milestones)</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto relative custom-scrollbar bg-white">
        <div className="relative min-w-full" style={{ width: totalDays * pxPerDay }}>
            <div className="h-10 border-b border-slate-100 bg-white sticky top-0 z-30 shadow-sm">
                {renderTimeHeaders()}
            </div>
            
            <div className="absolute inset-0 z-0 flex pointer-events-none pt-10">
                {Array.from({ length: totalDays }).map((_, i) => (
                    <div key={i} className="border-r border-slate-50 h-full" style={{ width: pxPerDay }}></div>
                ))}
            </div>

            <div className="pt-6 pb-10 space-y-6 relative z-10 min-h-[400px]">
                
                {/* EVENTS (Vertical Markers) */}
                {events.map((evt) => {
                    const left = getPos(evt.date);
                    if (left < 0) return null;
                    return (
                        <div key={`evt-${evt.id}`} className="absolute top-0 bottom-0 z-0 pointer-events-none border-l-2 border-dashed border-purple-200 flex flex-col justify-end pb-2 group" style={{ left: left + (pxPerDay/2) }}>
                             <div className="absolute top-12 -left-1 transform -translate-x-1/2 p-1 bg-purple-100 border border-purple-300 rounded-lg shadow-sm z-20 pointer-events-auto cursor-help w-32">
                                <p className="text-[9px] font-bold text-purple-700 truncate">{evt.title}</p>
                                <p className="text-[8px] text-purple-500">{evt.date}</p>
                             </div>
                             <div className="w-4 h-4 rounded-full bg-purple-100 border border-purple-300 flex items-center justify-center absolute top-10 -left-2"><CalIcon size={10} className="text-purple-600"/></div>
                        </div>
                    );
                })}

                {/* DEPENDENCY LINES */}
                <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0 opacity-40">
                    <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
                        </marker>
                    </defs>
                    {tasks.map((task, index) => {
                        if (!task.dependencies || task.dependencies.length === 0) return null;
                        const parent = tasks.find(t => t.id === task.dependencies[0]);
                        if (!parent) return null;
                        const startX = getPos(parent.deadline || parent.start) + (viewMode === 'Day' ? 0 : 5);
                        const startY = (tasks.findIndex(t => t.id === parent.id) * 44) + 24 + 16 + 6; 
                        const endX = getPos(task.start || task.deadline);
                        const endY = (index * 44) + 24 + 16 + 6;
                        const path = `M ${startX} ${startY} C ${startX + 20} ${startY}, ${endX - 20} ${endY}, ${endX} ${endY}`;
                        return <path key={`link-${task.id}`} d={path} stroke="#94a3b8" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />;
                    })}
                </svg>

                {/* TASK BARS */}
                {tasks.map((task) => {
                    const left = getPos(task.start || task.deadline);
                    const width = task.start ? Math.max(pxPerDay, getPos(task.deadline) - left) : pxPerDay * 2; 
                    const visualLeft = task.start ? left : left - (pxPerDay * 2);
                    
                    let baseClass = 'bg-slate-200 border-slate-300 text-slate-600';
                    if(task.status === 'Done') baseClass = 'bg-emerald-100 border-emerald-300 text-emerald-700 shadow-sm';
                    else if(task.status === 'On-going') baseClass = 'bg-amber-100 border-amber-300 text-amber-700 shadow-sm';
                    else baseClass = 'bg-red-100 border-red-300 text-red-700 shadow-sm';

                    return (
                        <div key={task.id} className="h-7 relative flex items-center group z-10" style={{ paddingLeft: 20 }}>
                            <div className={`absolute h-7 rounded border flex items-center px-3 overflow-hidden whitespace-nowrap transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer hover:z-30 ${baseClass}`} style={{ left: visualLeft, width }}>
                                <span className="font-bold mr-2 text-[10px]">{task.task}</span>
                                {width > 80 && <span className="opacity-70 text-[9px] border-l border-black/10 pl-2"> {task.owner}</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      </div>
    </div>
  );
};

export default GanttView;

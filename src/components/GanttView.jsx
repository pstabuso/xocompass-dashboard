import React, { useState, useMemo } from 'react';
import { Calendar as CalIcon } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const LABEL_W = 176; // px — sticky left label column width

const priorityBarClass = (priority, status) => {
  if (status === 'Done') return 'bg-emerald-500/25 border-emerald-500/40 text-emerald-300';
  switch (priority) {
    case 'Critical': return 'bg-red-500/25 border-red-500/40 text-red-300';
    case 'High':     return 'bg-orange-500/25 border-orange-500/40 text-orange-300';
    case 'Low':      return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300';
    default:         return 'bg-amber-500/20 border-amber-500/35 text-amber-300';
  }
};

const priorityBadgeClass = (priority) => {
  switch (priority) {
    case 'Critical': return 'bg-red-500/30 text-red-300';
    case 'High':     return 'bg-orange-500/30 text-orange-300';
    case 'Low':      return 'bg-emerald-500/25 text-emerald-300';
    default:         return 'bg-amber-500/25 text-amber-300';
  }
};

const GanttView = ({ tasks, onSelectTask }) => {
  const { events } = useAppContext();
  const [viewMode, setViewMode] = useState('Day');

  const config = {
    Day:   { pxPerDay: 60, step: 1 },
    Week:  { pxPerDay: 20, step: 7 },
    Month: { pxPerDay: 5,  step: 30 },
  };

  const pxPerDay = config[viewMode].pxPerDay;
  const ROW_H = 44;

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
    const diffDays = Math.ceil((new Date(dateStr) - timelineStart) / (1000 * 60 * 60 * 24));
    return diffDays * pxPerDay;
  };

  // Today marker position
  const todayLeft = getPos(new Date().toISOString().slice(0, 10));

  const getWeekNumber = (d) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
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
      const isToday = date.toDateString() === new Date().toDateString();

      headers.push(
        <div key={i}
          className={`absolute border-l h-full flex flex-col items-center justify-end pb-1.5 text-[10px] font-medium ${isToday ? 'border-sky-500/60 text-sky-400' : 'border-slate-800 text-slate-500'}`}
          style={{ left: i * pxPerDay, width: config[viewMode].step * pxPerDay }}>
          {monthLabel && (
            <span className="absolute top-1 left-1 font-bold text-slate-400 uppercase text-[9px] bg-slate-800/80 px-1 py-0.5 rounded">
              {monthLabel}
            </span>
          )}
          <span className={isToday ? 'font-bold' : ''}>{label}</span>
        </div>
      );
    }
    return headers;
  };

  const timelineWidth = totalDays * pxPerDay;

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-800/20 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 mr-1">Zoom:</span>
          {['Day', 'Week', 'Month'].map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${viewMode === m ? 'bg-sky-600 text-white shadow-md' : 'bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700'}`}>
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium">
          <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 bg-amber-500 rounded-sm opacity-60"></div>In Progress</div>
          <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 bg-emerald-500 rounded-sm opacity-60"></div>Done</div>
          <div className="flex items-center gap-1"><div className="w-0.5 h-3 bg-sky-400"></div>Today</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rotate-45 bg-purple-500/40 border border-purple-400/60 rounded-sm"></div>Events</div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <div style={{ width: LABEL_W + timelineWidth }}>

          {/* Sticky header row */}
          <div className="sticky top-0 z-30 flex bg-slate-900 border-b border-slate-800 shadow-sm">
            {/* Label header */}
            <div className="sticky left-0 z-40 bg-slate-900 border-r border-slate-800 flex items-center px-3"
              style={{ width: LABEL_W, minWidth: LABEL_W, height: 40 }}>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Task / Event</span>
            </div>
            {/* Timeline header */}
            <div className="relative bg-slate-900" style={{ width: timelineWidth, height: 40 }}>
              {renderTimeHeaders()}
            </div>
          </div>

          {/* Dependency SVG overlay */}
          <svg className="absolute pointer-events-none z-0 opacity-30"
            style={{ top: 40, left: LABEL_W, width: timelineWidth, height: tasks.length * ROW_H }}>
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
              </marker>
            </defs>
            {tasks.map((task, index) => {
              if (!task.dependencies || task.dependencies.length === 0) return null;
              const parent = tasks.find(t => String(t.id) === String(task.dependencies[0]));
              if (!parent) return null;
              const startX = getPos(parent.deadline || parent.start);
              const startY = (tasks.findIndex(t => t.id === parent.id) * ROW_H) + ROW_H / 2;
              const endX = getPos(task.start || task.deadline);
              const endY = (index * ROW_H) + ROW_H / 2;
              const path = `M ${startX} ${startY} C ${startX + 20} ${startY}, ${endX - 20} ${endY}, ${endX} ${endY}`;
              return <path key={`link-${task.id}`} d={path} stroke="#64748b" strokeWidth="1.5" fill="none" markerEnd="url(#arrowhead)" />;
            })}
          </svg>

          {/* Task rows */}
          {tasks.map((task, idx) => {
            const left = getPos(task.start || task.deadline);
            const width = task.start ? Math.max(pxPerDay, getPos(task.deadline) - left) : pxPerDay * 2;
            const barLeft = task.start ? left : left - (pxPerDay * 2);

            return (
              <div key={task.id} className={`flex border-b border-slate-800/60 ${idx % 2 === 0 ? 'bg-slate-900/20' : 'bg-slate-900/40'}`}
                style={{ height: ROW_H }}>
                {/* Sticky label cell */}
                <div className={`sticky left-0 z-20 border-r border-slate-800 flex items-center px-3 gap-2 shrink-0 cursor-pointer hover:bg-slate-800/50 transition-colors ${idx % 2 === 0 ? 'bg-slate-900' : 'bg-slate-900'}`}
                  style={{ width: LABEL_W, minWidth: LABEL_W }}
                  onClick={() => onSelectTask && onSelectTask(task)}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-200 truncate leading-tight">{task.task}</p>
                    <p className="text-[9px] text-slate-500 truncate">{task.owner || 'Unassigned'}</p>
                  </div>
                  <span className={`text-[8px] px-1 py-0.5 rounded font-bold shrink-0 ${priorityBadgeClass(task.priority)}`}>
                    {(task.priority || 'Med').slice(0, 3)}
                  </span>
                </div>

                {/* Timeline cell */}
                <div className="relative" style={{ width: timelineWidth }}>
                  {/* Grid lines */}
                  {Array.from({ length: Math.ceil(timelineWidth / pxPerDay) }).map((_, i) => (
                    <div key={i} className="absolute top-0 bottom-0 border-r border-slate-800/30" style={{ left: i * pxPerDay }} />
                  ))}

                  {/* Today line */}
                  {todayLeft >= 0 && todayLeft <= timelineWidth && (
                    <div className="absolute top-0 bottom-0 w-0.5 bg-sky-500/50 z-10" style={{ left: todayLeft }} />
                  )}

                  {/* Event markers */}
                  {events.map(evt => {
                    const evtLeft = getPos(evt.date);
                    if (evtLeft < 0 || evtLeft > timelineWidth) return null;
                    return (
                      <div key={`evt-${evt.id}-${task.id}`}
                        className="absolute top-0 bottom-0 border-l-2 border-dashed border-purple-500/20 z-0 pointer-events-none"
                        style={{ left: evtLeft + (pxPerDay / 2) }} />
                    );
                  })}

                  {/* Task bar */}
                  <div
                    onClick={() => onSelectTask && onSelectTask(task)}
                    className={`absolute top-1/2 -translate-y-1/2 rounded-md border flex items-center px-2 overflow-hidden whitespace-nowrap cursor-pointer transition-all hover:brightness-125 hover:shadow-md z-10 ${priorityBarClass(task.priority, task.status)}`}
                    style={{ left: barLeft, width, height: 26 }}>
                    <span className="font-semibold text-[10px] truncate">{task.task}</span>
                    {width > 100 && task.owner && (
                      <span className="ml-2 opacity-60 text-[9px] border-l border-white/15 pl-2 truncate">{task.owner}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Events — one row each, same structure as tasks */}
          {events.length > 0 && (
            <>
              <div className="flex border-t-2 border-slate-800/80 bg-slate-950/30" style={{ height: 28 }}>
                <div className="sticky left-0 z-20 bg-slate-950/60 border-r border-slate-800 flex items-center px-3 shrink-0"
                  style={{ width: LABEL_W, minWidth: LABEL_W }}>
                  <span className="text-[9px] font-bold text-purple-400/80 uppercase tracking-widest">Events</span>
                </div>
                <div className="flex-1" />
              </div>
              {events.map((evt, idx) => {
                const evtLeft = getPos(evt.date);
                return (
                  <div key={evt.id} className={`flex border-b border-slate-800/40 ${idx % 2 === 0 ? 'bg-slate-900/10' : 'bg-purple-950/10'}`}
                    style={{ height: ROW_H }}>
                    {/* Sticky label */}
                    <div className="sticky left-0 z-20 bg-slate-900 border-r border-slate-800 flex items-center px-3 gap-2 shrink-0"
                      style={{ width: LABEL_W, minWidth: LABEL_W }}>
                      <div className="w-2 h-2 rounded-full bg-purple-500/60 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-purple-200 truncate leading-tight">{evt.title}</p>
                        <p className="text-[9px] text-slate-500 truncate">{evt.date}</p>
                      </div>
                    </div>
                    {/* Timeline cell */}
                    <div className="relative" style={{ width: timelineWidth }}>
                      {/* Grid lines */}
                      {Array.from({ length: Math.ceil(timelineWidth / pxPerDay) }).map((_, i) => (
                        <div key={i} className="absolute top-0 bottom-0 border-r border-slate-800/20" style={{ left: i * pxPerDay }} />
                      ))}
                      {/* Today line */}
                      {todayLeft >= 0 && todayLeft <= timelineWidth && (
                        <div className="absolute top-0 bottom-0 w-0.5 bg-sky-500/30 z-10" style={{ left: todayLeft }} />
                      )}
                      {/* Event milestone marker */}
                      {evtLeft >= 0 && evtLeft <= timelineWidth && (
                        <div className="absolute top-1/2 -translate-y-1/2 z-10 flex flex-col items-center"
                          style={{ left: evtLeft + pxPerDay / 2 - 8 }}>
                          {/* Diamond shape */}
                          <div className="w-4 h-4 rotate-45 bg-purple-500/40 border border-purple-400/60 rounded-sm mb-1" />
                          {pxPerDay >= 20 && (
                            <div className="bg-purple-500/15 border border-purple-500/30 rounded px-1.5 py-0.5 -mt-0.5 max-w-[100px]">
                              <p className="text-[8px] font-bold text-purple-300 truncate">{evt.title}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GanttView;

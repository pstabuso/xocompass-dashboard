import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';

const LABEL_W = 180;
const ROW_H = 44;
const HDR_TOP = 20; // month-span tier height
const HDR_BOT = 30; // unit tier height
const HDR_H = HDR_TOP + HDR_BOT;

const priorityBarClass = (priority, status) => {
  if (status === 'Done') return 'bg-emerald-500/25 border-emerald-500/40 text-emerald-300';
  switch (priority) {
    case 'Critical': return 'bg-rose-500/30 border-rose-500/50 text-rose-300';
    case 'High':     return 'bg-orange-500/25 border-orange-500/40 text-orange-300';
    case 'Low':      return 'bg-slate-500/20 border-slate-500/35 text-slate-300';
    default:         return 'bg-amber-500/20 border-amber-500/35 text-amber-300';
  }
};

const priorityBadgeClass = (priority) => {
  switch (priority) {
    case 'Critical': return 'bg-rose-500/30 text-rose-300';
    case 'High':     return 'bg-orange-500/30 text-orange-300';
    case 'Low':      return 'bg-slate-500/25 text-slate-300';
    default:         return 'bg-amber-500/25 text-amber-300';
  }
};

const getWeekNumber = (d) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
};

const CFG = {
  Day:   { pxPerDay: 52, step: 1,  minBarW: 52 },
  Week:  { pxPerDay: 14, step: 7,  minBarW: 14 },
  Month: { pxPerDay: 4,  step: 28, minBarW: 12 },
};

const GanttView = ({ tasks, onSelectTask }) => {
  const { events } = useAppContext();
  const [viewMode, setViewMode] = useState('Week');
  const scrollRef = useRef(null);

  const { pxPerDay, step, minBarW } = CFG[viewMode];

  const timelineStart = useMemo(() => {
    const allDates = [
      ...tasks.map(t => new Date(t.start || t.deadline)),
      ...events.map(e => new Date(e.date)),
    ].filter(d => !isNaN(d));
    if (!allDates.length) return new Date();
    const min = new Date(Math.min(...allDates));
    min.setDate(min.getDate() - 7);
    return min;
  }, [tasks, events]);

  const timelineEnd = useMemo(() => {
    const allDates = [
      ...tasks.map(t => new Date(t.deadline)),
      ...events.map(e => new Date(e.date)),
    ].filter(d => !isNaN(d));
    if (!allDates.length) return new Date();
    const max = new Date(Math.max(...allDates));
    max.setDate(max.getDate() + 30);
    return max;
  }, [tasks, events]);

  const totalDays = Math.max(1, Math.ceil((timelineEnd - timelineStart) / 86400000));
  const timelineWidth = totalDays * pxPerDay;

  const getPos = (dateStr) => {
    if (!dateStr) return 0;
    return Math.ceil((new Date(dateStr) - timelineStart) / 86400000) * pxPerDay;
  };

  const todayLeft = getPos(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft = Math.max(0, todayLeft - 200);
        }
      });
    }
  }, [viewMode, todayLeft]);

  const { topHeaders, botHeaders, gridLines } = useMemo(() => {
    const topHeaders = [];
    const botHeaders = [];
    const gridLines = [];

    // Top tier: month spans (iterate every day to detect month boundaries)
    let lastMonthKey = null;
    let monthGroupStart = 0;
    let monthGroupLabel = '';
    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(timelineStart);
      d.setDate(d.getDate() + i);
      const mk = `${d.getFullYear()}-${d.getMonth()}`;
      if (mk !== lastMonthKey) {
        if (lastMonthKey !== null) {
          topHeaders.push({ left: monthGroupStart, width: i * pxPerDay - monthGroupStart, label: monthGroupLabel });
        }
        monthGroupStart = i * pxPerDay;
        monthGroupLabel = d.toLocaleString('default', { month: 'short', year: '2-digit' });
        lastMonthKey = mk;
      }
    }
    topHeaders.push({ left: monthGroupStart, width: totalDays * pxPerDay - monthGroupStart, label: monthGroupLabel });

    // Bottom tier: step-based labels + grid lines
    for (let i = 0; i <= totalDays; i += step) {
      const d = new Date(timelineStart);
      d.setDate(d.getDate() + i);
      const isToday = d.toDateString() === new Date().toDateString();

      let label = '';
      let sub = '';
      if (viewMode === 'Day') {
        label = String(d.getDate());
      } else if (viewMode === 'Week') {
        label = `W${getWeekNumber(d)}`;
        sub = `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`;
      } else {
        label = d.toLocaleString('default', { month: 'short' });
      }

      botHeaders.push({ left: i * pxPerDay, width: step * pxPerDay, label, sub, isToday });
      gridLines.push(i * pxPerDay);
    }

    return { topHeaders, botHeaders, gridLines };
  }, [totalDays, pxPerDay, step, timelineStart, viewMode]);

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="px-3 py-2.5 border-b border-slate-800 flex justify-between items-center bg-slate-800/20 shrink-0 gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide hidden sm:block">View</span>
          <div className="flex bg-slate-800 rounded-lg border border-slate-700 p-0.5 gap-0.5">
            {['Day', 'Week', 'Month'].map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${viewMode === m ? 'bg-pink-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 text-[10px] text-slate-500 font-medium flex-wrap justify-end">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 inline-block bg-amber-500 rounded-sm opacity-60" /><span className="hidden sm:inline">In Progress</span></span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 inline-block bg-emerald-500 rounded-sm opacity-60" /><span className="hidden sm:inline">Done</span></span>
          <span className="flex items-center gap-1"><span className="w-px h-3 inline-block bg-pink-400" /><span className="hidden sm:inline">Today</span></span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 inline-block rotate-45 bg-purple-500/40 border border-purple-400/60 rounded-sm" /><span className="hidden sm:inline">Event</span></span>
        </div>
      </div>

      {/* Scrollable body */}
      <div ref={scrollRef} className="flex-1 overflow-auto custom-scrollbar">
        <div style={{ width: LABEL_W + timelineWidth, minWidth: LABEL_W + timelineWidth }}>

          {/* Sticky two-tier header */}
          <div className="sticky top-0 z-30 flex bg-slate-900 border-b border-slate-800 shadow" style={{ height: HDR_H }}>
            {/* Label column header */}
            <div className="sticky left-0 z-40 bg-slate-900 border-r border-slate-800 flex items-end pb-2 px-3 shrink-0"
              style={{ width: LABEL_W, minWidth: LABEL_W }}>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Task / Event</span>
            </div>
            {/* Timeline header */}
            <div className="relative overflow-hidden" style={{ width: timelineWidth }}>
              {/* Tier 1: Month spans */}
              <div className="absolute inset-x-0 top-0 border-b border-slate-800/50" style={{ height: HDR_TOP }}>
                {topHeaders.map((h, i) => (
                  <div key={i} className="absolute flex items-center px-1.5 overflow-hidden border-r border-slate-800/40"
                    style={{ left: h.left, width: Math.max(h.width, 1), height: HDR_TOP }}>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{h.label}</span>
                  </div>
                ))}
              </div>
              {/* Tier 2: Day/Week/Month units */}
              <div className="absolute inset-x-0" style={{ top: HDR_TOP, height: HDR_BOT }}>
                {botHeaders.map((h, i) => (
                  <div key={i}
                    className={`absolute flex flex-col items-center justify-center border-l overflow-hidden ${h.isToday ? 'border-pink-500/60' : 'border-slate-800/50'}`}
                    style={{ left: h.left, width: Math.max(h.width, 1), height: HDR_BOT }}>
                    <span className={`text-[10px] font-bold leading-tight ${h.isToday ? 'text-pink-400' : 'text-slate-400'}`}>{h.label}</span>
                    {h.sub && <span className="text-[8px] text-slate-600 leading-none mt-0.5 truncate px-1 w-full text-center">{h.sub}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Dependency arrows SVG */}
          <svg className="absolute pointer-events-none z-0 opacity-25"
            style={{ top: HDR_H, left: LABEL_W, width: timelineWidth, height: tasks.length * ROW_H }}>
            <defs>
              <marker id="gtt-arrow" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
                <polygon points="0 0, 7 2.5, 0 5" fill="#64748b" />
              </marker>
            </defs>
            {tasks.map((task, index) => {
              if (!task.dependencies?.length) return null;
              const parent = tasks.find(t => String(t.id) === String(task.dependencies[0]));
              if (!parent) return null;
              const sx = getPos(parent.deadline || parent.start);
              const sy = (tasks.findIndex(t => t.id === parent.id) * ROW_H) + ROW_H / 2;
              const ex = getPos(task.start || task.deadline);
              const ey = index * ROW_H + ROW_H / 2;
              return <path key={`dep-${task.id}`} d={`M${sx} ${sy} C${sx + 20} ${sy},${ex - 20} ${ey},${ex} ${ey}`} stroke="#64748b" strokeWidth="1.5" fill="none" markerEnd="url(#gtt-arrow)" />;
            })}
          </svg>

          {/* Task rows */}
          {tasks.map((task, idx) => {
            const startX = getPos(task.start || task.deadline);
            const endX = getPos(task.deadline);
            const barLeft = task.start ? startX : endX - minBarW;
            const barWidth = Math.max(minBarW, task.start ? endX - startX : minBarW);

            return (
              <div key={task.id}
                className={`flex border-b border-slate-800/60 ${idx % 2 === 0 ? 'bg-slate-900/20' : 'bg-slate-900/40'}`}
                style={{ height: ROW_H }}>
                {/* Sticky label */}
                <div
                  className="sticky left-0 z-20 bg-slate-900 border-r border-slate-800 flex items-center px-3 gap-2 shrink-0 cursor-pointer hover:bg-slate-800/50 transition-colors"
                  style={{ width: LABEL_W, minWidth: LABEL_W }}
                  onClick={() => onSelectTask?.(task)}>
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
                  {gridLines.map((x, gi) => (
                    <div key={gi} className="absolute top-0 bottom-0 border-r border-slate-800/25" style={{ left: x }} />
                  ))}
                  {todayLeft >= 0 && todayLeft <= timelineWidth && (
                    <div className="absolute top-0 bottom-0 w-px bg-pink-500/50 z-10" style={{ left: todayLeft }} />
                  )}
                  {events.map(evt => {
                    const x = getPos(evt.date);
                    return x >= 0 && x <= timelineWidth
                      ? <div key={`em-${evt.id}-${task.id}`} className="absolute top-0 bottom-0 border-l border-dashed border-purple-400/15 pointer-events-none" style={{ left: x + pxPerDay / 2 }} />
                      : null;
                  })}
                  {/* Task bar */}
                  <div
                    onClick={() => onSelectTask?.(task)}
                    className={`absolute top-1/2 -translate-y-1/2 rounded border cursor-pointer transition-all hover:brightness-125 hover:shadow-md z-10 flex items-center px-1.5 overflow-hidden whitespace-nowrap ${priorityBarClass(task.priority, task.status)}`}
                    style={{ left: barLeft, width: barWidth, height: 26 }}>
                    {barWidth >= 48 && <span className="font-semibold text-[10px] truncate">{task.task}</span>}
                    {barWidth >= 130 && task.owner && (
                      <span className="ml-1.5 opacity-60 text-[9px] border-l border-white/15 pl-1.5 truncate shrink-0">{task.owner}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Events section */}
          {events.length > 0 && (
            <>
              <div className="flex border-t-2 border-slate-800/80 bg-slate-950/30" style={{ height: 26 }}>
                <div className="sticky left-0 z-20 bg-slate-950/60 border-r border-slate-800 flex items-center px-3 shrink-0"
                  style={{ width: LABEL_W, minWidth: LABEL_W }}>
                  <span className="text-[9px] font-bold text-purple-400/80 uppercase tracking-widest">Events</span>
                </div>
                <div className="flex-1 bg-slate-950/20" />
              </div>
              {events.map((evt, idx) => {
                const evtX = getPos(evt.date);
                return (
                  <div key={evt.id} className={`flex border-b border-slate-800/40 ${idx % 2 === 0 ? 'bg-slate-900/10' : 'bg-purple-950/10'}`}
                    style={{ height: ROW_H }}>
                    <div className="sticky left-0 z-20 bg-slate-900 border-r border-slate-800 flex items-center px-3 gap-2 shrink-0"
                      style={{ width: LABEL_W, minWidth: LABEL_W }}>
                      <div className="w-2 h-2 rounded-full bg-purple-500/60 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-purple-200 truncate leading-tight">{evt.title}</p>
                        <p className="text-[9px] text-slate-500 truncate">{evt.date}</p>
                      </div>
                    </div>
                    <div className="relative" style={{ width: timelineWidth }}>
                      {gridLines.map((x, gi) => (
                        <div key={gi} className="absolute top-0 bottom-0 border-r border-slate-800/15" style={{ left: x }} />
                      ))}
                      {todayLeft >= 0 && todayLeft <= timelineWidth && (
                        <div className="absolute top-0 bottom-0 w-px bg-pink-500/30 z-10" style={{ left: todayLeft }} />
                      )}
                      {evtX >= 0 && evtX <= timelineWidth && (
                        <div className="absolute top-1/2 -translate-y-1/2 z-10 flex flex-col items-center"
                          style={{ left: evtX + pxPerDay / 2 - 8 }}>
                          <div className="w-4 h-4 rotate-45 bg-purple-500/40 border border-purple-400/60 rounded-sm" />
                          {pxPerDay >= 12 && (
                            <div className="mt-0.5 bg-purple-500/15 border border-purple-500/30 rounded px-1.5 py-0.5 max-w-[90px]">
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

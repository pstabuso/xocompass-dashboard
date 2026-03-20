import React, { useState, useMemo } from 'react';
import { 
  Activity, Database, Server, Layout, FileText, 
  Search, Filter, Download, ChevronDown, CheckCircle, 
  AlertCircle, Clock, Zap, GitBranch, Terminal, 
  Lightbulb, ArrowRight 
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { 
  PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid 
} from 'recharts';

const Dashboard = () => {
  const { user, tasks } = useAppContext();
  const [timeRange, setTimeRange] = useState('All Time');
  const [activeFilter, setActiveFilter] = useState(null); // Interactive Slicer

  // --- DATA PROCESSING LAYER (BI Logic) ---
  
  // 1. Personal Task Filter
  const myTasks = useMemo(() => {
    return tasks.filter(t => t.owner.includes(user.name.split(' ')[0]) || (user.username === 'andrei' && t.owner.includes('Ralph')));
  }, [tasks, user]);

  // 2. Role-Specific Metrics
  const getRoleMetrics = () => {
    if (user.role.includes('Backend')) {
      return [
        { label: 'API Endpoints', val: '12/15', sub: 'Ready for Integration', icon: Server, color: 'text-emerald-400', bg: 'bg-emerald-900/30 border-emerald-500/30' },
        { label: 'Model Accuracy', val: '84.2%', sub: 'SARIMAX (Test Set)', icon: Activity, color: 'text-blue-400', bg: 'bg-blue-900/30 border-blue-500/30' },
        { label: 'System Uptime', val: '99.9%', sub: 'Last 30 Days', icon: Zap, color: 'text-amber-400', bg: 'bg-amber-900/30 border-amber-500/30' },
      ];
    } else if (user.role.includes('Frontend')) {
      return [
        { label: 'UI Components', val: '24/30', sub: 'Atomic Design System', icon: Layout, color: 'text-purple-400', bg: 'bg-purple-900/30 border-purple-500/30' },
        { label: 'Responsiveness', val: 'Mobile', sub: '90% Optimized', icon: Search, color: 'text-pink-400', bg: 'bg-pink-900/30 border-pink-500/30' },
        { label: 'Git Commits', val: '142', sub: 'Feature Branch: main', icon: GitBranch, color: 'text-orange-400', bg: 'bg-orange-900/30 border-orange-500/30' },
      ];
    } else {
      return [
        { label: 'Chapter 1-3', val: '95%', sub: 'Ready for Defense', icon: FileText, color: 'text-teal-400', bg: 'bg-teal-900/30 border-teal-500/30' },
        { label: 'Citations', val: '45', sub: 'Mendeley Synced', icon: Database, color: 'text-cyan-400', bg: 'bg-cyan-900/30 border-cyan-500/30' },
        { label: 'RRL Matrix', val: 'Complete', sub: '20 Local / 15 Foreign', icon: CheckCircle, color: 'text-indigo-400', bg: 'bg-indigo-900/30 border-indigo-500/30' },
      ];
    }
  };

  const metrics = getRoleMetrics();

  // 3. Dynamic Insights Generation (The "Intelligence" Layer)
  const generateInsights = () => {
      const insights = [];
      const overdueCount = myTasks.filter(t => new Date(t.deadline) < new Date() && t.status !== 'Done').length;
      const progress = myTasks.length > 0 ? Math.round((myTasks.filter(t => t.status === 'Done').length / myTasks.length) * 100) : 0;

      if (overdueCount > 0) {
          insights.push({ type: 'critical', text: `You have ${overdueCount} overdue tasks. Prioritize these immediately to avoid bottlenecks.`, action: 'View Overdue' });
      }
      if (progress < 50 && myTasks.length > 5) {
          insights.push({ type: 'warning', text: 'Completion rate is below 50%. Consider breaking down complex tasks into subtasks.', action: 'Open Task Board' });
      }
      if (user.role.includes('Backend') && progress > 80) {
           insights.push({ type: 'success', text: 'High completion rate. You can now assist Frontend with API integration testing.', action: 'Message Andrei' });
      }
      if (insights.length === 0) {
          insights.push({ type: 'info', text: 'All systems go. You are on track for the next milestone.', action: 'View Schedule' });
      }
      return insights;
  };

  const insights = generateInsights();

  // 4. Chart Data Preparation
  const statusData = [
    { name: 'Done', value: myTasks.filter(t => t.status === 'Done').length, color: '#10b981' },
    { name: 'In Progress', value: myTasks.filter(t => t.status === 'On-going').length, color: '#f59e0b' },
    { name: 'To Do', value: myTasks.filter(t => t.status === 'Not Started').length, color: '#ef4444' },
  ];

  const velocityData = [
    { day: 'Mon', tasks: 2 }, { day: 'Tue', tasks: 4 }, { day: 'Wed', tasks: 3 },
    { day: 'Thu', tasks: 5 }, { day: 'Fri', tasks: 4 }, { day: 'Sat', tasks: 2 }, { day: 'Sun', tasks: 0 }
  ];

  // --- INTERACTION HANDLER ---
  const handleChartClick = (data) => {
    setActiveFilter(activeFilter === data.name ? null : data.name);
  };

  const displayedTasks = activeFilter 
    ? myTasks.filter(t => {
        if (activeFilter === 'In Progress') return t.status === 'On-going';
        if (activeFilter === 'To Do') return t.status === 'Not Started';
        return t.status === activeFilter;
    })
    : myTasks;

  return (
    <div className="min-h-screen text-slate-200 pb-10 animate-enter bg-slate-950">
      
      {/* 1. HEADER: Welcome & Context */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight mb-2">
            Welcome, <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-500">{user.name.split(' ')[0]}</span>
          </h1>
          <p className="text-slate-400 flex items-center gap-2 font-medium">
            <Terminal size={14} className="text-emerald-500" /> System Status: <span className="text-emerald-400 font-mono tracking-wide">OPERATIONAL</span>
          </p>
        </div>
        
        {/* Global Controls */}
        <div className="flex gap-3 mt-4 md:mt-0">
          <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-medium hover:bg-slate-700 hover:border-slate-600 transition text-slate-300">
            <Clock size={16} className="text-slate-400"/>
            {timeRange}
            <ChevronDown size={14} className="text-slate-500"/>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-blue-900/20 transition">
            <Download size={16}/> Export Report
          </button>
        </div>
      </div>

      {/* 2. KPI CARDS (High Contrast) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {metrics.map((m, idx) => (
          <div key={idx} className={`p-6 rounded-2xl relative overflow-hidden group border transition-all duration-300 ${m.bg} hover:border-opacity-50`}>
            <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 ${m.color}`}>
              <m.icon size={80} />
            </div>
            <div className="relative z-10">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 bg-slate-950/30 border border-white/10`}>
                <m.icon size={20} className={m.color} />
              </div>
              <p className="text-slate-300 text-xs font-bold uppercase tracking-widest mb-1 opacity-80">{m.label}</p>
              <h3 className="text-3xl font-bold text-white tracking-tight">{m.val}</h3>
              <p className="text-slate-400 text-sm mt-2 flex items-center gap-1 font-medium">
                <Activity size={14} className={m.color}/> {m.sub}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 3. MAIN DASHBOARD GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        
        {/* LEFT COL: Charts */}
        <div className="lg:col-span-2 space-y-6">
            
            {/* Velocity Chart */}
            <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-white text-lg">Work Velocity</h3>
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-900/30 border border-emerald-500/30 px-3 py-1 rounded-full">Avg: 2.8 Tasks/Day</span>
                </div>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={velocityData}>
                        <defs>
                        <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="day" stroke="#94a3b8" tick={{fontSize: 12, fill: '#94a3b8'}} tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" tick={{fontSize: 12, fill: '#94a3b8'}} tickLine={false} axisLine={false} />
                        <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#f8fafc' }}
                        itemStyle={{ color: '#38bdf8' }}
                        />
                        <Area type="monotone" dataKey="tasks" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorTasks)" />
                    </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Task Table (Filtered) */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <Database size={18} className="text-slate-400"/>
                        {activeFilter ? `${activeFilter} Tasks` : 'Active Tasks'}
                    </h3>
                    {activeFilter && (
                        <button onClick={() => setActiveFilter(null)} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 font-bold">
                        <Filter size={12}/> Clear Filter
                        </button>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-400">
                        <thead className="bg-slate-950 text-xs uppercase font-bold text-slate-500">
                        <tr>
                            <th className="p-4">Task Name</th>
                            <th className="p-4">Deadline</th>
                            <th className="p-4">Priority</th>
                            <th className="p-4 text-right">Status</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                        {displayedTasks.length === 0 ? (
                            <tr><td colSpan="4" className="p-8 text-center italic text-slate-500">No data available for this filter.</td></tr>
                        ) : displayedTasks.slice(0, 5).map(t => (
                            <tr key={t.id} className="hover:bg-slate-800/50 transition cursor-pointer group">
                            <td className="p-4 font-medium text-slate-200 group-hover:text-white transition-colors">{t.task}</td>
                            <td className="p-4">{t.deadline}</td>
                            <td className="p-4">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${t.priority === 'High' ? 'bg-red-900/20 text-red-400 border-red-500/20' : 'bg-blue-900/20 text-blue-400 border-blue-500/20'}`}>
                                {t.priority || 'Normal'}
                                </span>
                            </td>
                            <td className="p-4 text-right">
                                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${t.status === 'Done' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : t.status === 'On-going' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}></span>
                                <span className="text-slate-300">{t.status}</span>
                            </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        {/* RIGHT COL: Insights & Status */}
        <div className="space-y-6">
            
            {/* ACTIONABLE INSIGHTS (New Feature) */}
            <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                    <Lightbulb size={18} className="text-yellow-400"/> Actionable Insights
                </h3>
                <div className="space-y-3">
                    {insights.map((insight, i) => (
                        <div key={i} className={`p-4 rounded-xl border flex flex-col gap-2 ${
                            insight.type === 'critical' ? 'bg-red-900/10 border-red-500/30' :
                            insight.type === 'warning' ? 'bg-amber-900/10 border-amber-500/30' :
                            insight.type === 'success' ? 'bg-emerald-900/10 border-emerald-500/30' :
                            'bg-blue-900/10 border-blue-500/30'
                        }`}>
                            <p className={`text-sm font-medium ${
                                insight.type === 'critical' ? 'text-red-200' :
                                insight.type === 'warning' ? 'text-amber-200' :
                                insight.type === 'success' ? 'text-emerald-200' :
                                'text-blue-200'
                            }`}>{insight.text}</p>
                            <button className={`self-start text-xs font-bold flex items-center gap-1 hover:underline ${
                                insight.type === 'critical' ? 'text-red-400' :
                                insight.type === 'warning' ? 'text-amber-400' :
                                insight.type === 'success' ? 'text-emerald-400' :
                                'text-blue-400'
                            }`}>
                                {insight.action} <ArrowRight size={12}/>
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Status Pie Chart */}
            <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl flex flex-col h-[300px]">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-white">Status Overview</h3>
                </div>
                <div className="flex-1 min-h-0 relative">
                    <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie 
                        data={statusData} 
                        innerRadius={60} 
                        outerRadius={80} 
                        paddingAngle={5} 
                        dataKey="value"
                        onClick={handleChartClick} 
                        cursor="pointer"
                        stroke="none"
                        >
                        {statusData.map((entry, index) => (
                            <Cell 
                            key={`cell-${index}`} 
                            fill={entry.color} 
                            fillOpacity={activeFilter && activeFilter !== entry.name ? 0.3 : 1}
                            className="transition-all duration-300 hover:opacity-80"
                            />
                        ))}
                        </Pie>
                        <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#f8fafc' }}
                        itemStyle={{ color: '#f8fafc' }}
                        />
                    </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-3xl font-bold text-white">{myTasks.length}</span>
                        <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Total</span>
                    </div>
                </div>
                <div className="flex justify-center gap-4 mt-2">
                    {statusData.map(d => (
                    <div key={d.name} className={`flex items-center gap-2 text-xs cursor-pointer transition-opacity ${activeFilter === d.name ? 'opacity-100 font-bold text-white' : 'opacity-60 text-slate-400'}`} onClick={() => handleChartClick(d)}>
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }}></div>
                        {d.name}
                    </div>
                    ))}
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};

export default Dashboard;
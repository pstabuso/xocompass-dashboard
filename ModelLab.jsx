import React, { useState, useMemo } from 'react';
import { 
  Database, ArrowRight, Activity, CloudRain, Calendar, 
  Cpu, Settings, CheckCircle, RefreshCw, GitCommit, 
  AlertTriangle, BarChart as BarChartIcon, Search, TrendingUp, Info 
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, AreaChart, Area, Legend, ComposedChart, Bar, BarChart 
} from 'recharts';

const ModelLab = () => {
  const [stage, setStage] = useState('ingest'); 
  const [isProcessing, setIsProcessing] = useState(false);

  // --- DATA GENERATION (Restored) ---
  const rawData = useMemo(() => Array.from({ length: 30 }, (_, i) => ({
    date: `2024-01-${i + 1}`,
    sales: 4000 + (i * 50) + (Math.sin(i * 0.8) * 500) + ((Math.random() - 0.5) * 200),
    rainfall: Math.abs(Math.sin(i) * 40) + (Math.random() * 10),
    holiday: i % 10 === 0 ? 1 : 0
  })), []);

  const stationaryData = useMemo(() => rawData.map((d, i) => ({
    date: d.date,
    sales_diff: i === 0 ? 0 : d.sales - rawData[i - 1].sales
  })).slice(1), [rawData]);

  const decompositionData = useMemo(() => rawData.map((d, i) => ({
      date: d.date,
      original: d.sales,
      trend: 4000 + (i * 50),
      seasonal: Math.sin(i * 0.8) * 500,
      residual: (Math.random() - 0.5) * 200
  })), [rawData]);

  const residualData = useMemo(() => Array.from({ length: 10 }, (_, i) => ({
      bin: `${(i - 5) * 50}`,
      count: Math.ceil(Math.exp(-Math.pow(i - 5, 2) / 2) * 20)
  })), []);

  const forecastData = useMemo(() => rawData.map((d) => ({
    date: d.date,
    actual: d.sales,
    forecast: d.sales + (Math.random() * 150 - 75),
    ci_upper: d.sales + 300,
    ci_lower: d.sales - 300
  })), [rawData]);

  // --- CONTROLLER ---
  const runPipeline = (nextStage) => {
    setIsProcessing(true);
    setTimeout(() => { setStage(nextStage); setIsProcessing(false); }, 1000);
  };

  const steps = [
      { id: 'ingest', label: '1. Ingest' },
      { id: 'correlation', label: '2. Correlations' },
      { id: 'process', label: '3. Stationarity' },
      { id: 'decomp', label: '4. Decomposition' },
      { id: 'train', label: '5. Training' },
      { id: 'eval', label: '6. Evaluation' }
  ];

  return (
    <div className="min-h-screen text-slate-200 animate-enter pb-10 bg-slate-950">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
             <Cpu className="text-sky-400" size={32} /> SARIMAX Lab
          </h1>
          <p className="text-slate-400 mt-1">Advanced Model Development Environment</p>
        </div>
        <div className="flex items-center gap-1 mt-4 md:mt-0 overflow-x-auto max-w-full pb-2">
            {steps.map((s, idx) => (
                <div key={s.id} className="flex items-center">
                    <span className={`whitespace-nowrap px-3 py-1 rounded-full text-[10px] font-bold border transition-all duration-300 ${stage === s.id ? 'bg-sky-600 text-white border-sky-500 shadow-lg shadow-sky-900/50 scale-105' : 'bg-slate-900 text-slate-500 border-slate-800'}`}>
                        {s.label}
                    </span>
                    {idx < steps.length - 1 && <div className="w-4 h-[1px] bg-slate-800 mx-1"></div>}
                </div>
            ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* SIDEBAR CONTROLS */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 h-fit shadow-xl">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2"><Settings size={18}/> Hyperparameters</h3>
            <div className="space-y-6">
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Target (Endogenous)</label>
                    <div className="mt-2 p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center gap-2">
                        <Database size={16} className="text-sky-400"/>
                        <span className="text-sm font-mono text-slate-300">kjs_sales.csv</span>
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Exogenous Factors</label>
                    <div className="mt-2 space-y-2">
                        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center gap-2">
                            <CloudRain size={16} className="text-blue-400"/>
                            <span className="text-sm font-mono text-slate-300">rain_mm</span>
                        </div>
                        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center gap-2">
                            <Calendar size={16} className="text-red-400"/>
                            <span className="text-sm font-mono text-slate-300">is_holiday</span>
                        </div>
                    </div>
                </div>
                <div className="pt-4 border-t border-slate-800">
                    {stage === 'ingest' && <button onClick={() => runPipeline('correlation')} disabled={isProcessing} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition disabled:opacity-50">{isProcessing ? <RefreshCw className="animate-spin"/> : <Search size={18}/>} Analyze Correlations</button>}
                    {stage === 'correlation' && <button onClick={() => runPipeline('process')} disabled={isProcessing} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition disabled:opacity-50">{isProcessing ? <RefreshCw className="animate-spin"/> : <Activity size={18}/>} Test Stationarity</button>}
                    {stage === 'process' && <button onClick={() => runPipeline('decomp')} disabled={isProcessing} className="w-full bg-purple-600 hover:bg-purple-500 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition disabled:opacity-50">{isProcessing ? <RefreshCw className="animate-spin"/> : <TrendingUp size={18}/>} Decompose Series</button>}
                    {stage === 'decomp' && <button onClick={() => runPipeline('train')} disabled={isProcessing} className="w-full bg-amber-600 hover:bg-amber-500 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition disabled:opacity-50">{isProcessing ? <RefreshCw className="animate-spin"/> : <GitCommit size={18}/>} Train Model</button>}
                    {stage === 'train' && <button onClick={() => runPipeline('eval')} disabled={isProcessing} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition disabled:opacity-50">{isProcessing ? <RefreshCw className="animate-spin"/> : <BarChartIcon size={18}/>} Evaluate Results</button>}
                    {stage === 'eval' && <button onClick={() => setStage('ingest')} className="w-full bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition"><RefreshCw size={18}/> Reset Lab</button>}
                </div>
            </div>
        </div>

        {/* VISUALIZATION CANVAS */}
        <div className="lg:col-span-3 space-y-6">
            
            {/* STAGE 1: INGESTION */}
            {stage === 'ingest' && (
                <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 animate-enter shadow-xl">
                    <h3 className="text-xl font-bold text-white mb-2">Data Ingestion</h3>
                     <div className="h-96 w-full bg-slate-950 rounded-xl border border-slate-800 p-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={rawData}>
                                <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false}/>
                                <XAxis dataKey="date" stroke="#94a3b8" tick={{fontSize: 10}}/>
                                <YAxis yAxisId="left" stroke="#38bdf8"/>
                                <YAxis yAxisId="right" orientation="right" stroke="#a78bfa"/>
                                <Tooltip contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155'}}/>
                                <Legend />
                                <Bar yAxisId="right" dataKey="rainfall" fill="#a78bfa" opacity={0.3} name="Rainfall (mm)" barSize={20} />
                                <Line yAxisId="left" type="monotone" dataKey="sales" stroke="#38bdf8" strokeWidth={3} dot={false} name="Sales" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* STAGE 2: CORRELATION */}
            {stage === 'correlation' && (
                <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 animate-enter shadow-xl">
                    <h3 className="text-xl font-bold text-white mb-2">Correlation Matrix</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 flex items-center justify-center">
                            <div className="grid grid-cols-3 gap-1">
                                <div className="bg-transparent text-xs text-slate-500 font-bold p-2 text-center"></div>
                                <div className="bg-transparent text-xs text-slate-500 font-bold p-2 text-center">Sales</div>
                                <div className="bg-transparent text-xs text-slate-500 font-bold p-2 text-center">Rain</div>
                                <div className="bg-transparent text-xs text-slate-500 font-bold p-2 flex items-center">Sales</div>
                                <div className="bg-blue-600 text-white text-xs font-bold p-4 flex items-center justify-center rounded">1.0</div>
                                <div className="bg-blue-900/40 text-blue-200 text-xs font-bold p-4 flex items-center justify-center rounded">-0.65</div>
                                <div className="bg-transparent text-xs text-slate-500 font-bold p-2 flex items-center">Rain</div>
                                <div className="bg-blue-900/40 text-blue-200 text-xs font-bold p-4 flex items-center justify-center rounded">-0.65</div>
                                <div className="bg-blue-600 text-white text-xs font-bold p-4 flex items-center justify-center rounded">1.0</div>
                            </div>
                         </div>
                         <div className="space-y-4">
                            <div className="p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-lg">
                                <h4 className="font-bold text-emerald-400 text-sm mb-1">Strong Signal Detected</h4>
                                <p className="text-xs text-slate-400">Rainfall (-0.65) has a significant negative correlation with sales.</p>
                            </div>
                         </div>
                    </div>
                </div>
            )}

            {/* STAGE 3: STATIONARITY */}
            {stage === 'process' && (
                <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 animate-enter shadow-xl">
                    <h3 className="text-xl font-bold text-white mb-4">Stationarity Check (ADF Test)</h3>
                    <div className="h-64 w-full bg-slate-950 rounded-xl border border-slate-800 p-4">
                         <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={stationaryData}>
                                <CartesianGrid stroke="#334155" strokeDasharray="3 3"/>
                                <XAxis dataKey="date" stroke="#94a3b8" tick={{fontSize: 10}}/>
                                <YAxis stroke="#f472b6"/>
                                <Tooltip contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155'}}/>
                                <Line type="monotone" dataKey="sales_diff" stroke="#f472b6" strokeWidth={2} dot={false} name="1st Diff Sales" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-6">
                        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex justify-between items-center">
                            <span className="text-slate-400 text-sm">Original p-value</span>
                            <span className="text-red-400 font-bold">0.85 (Non-Stationary)</span>
                        </div>
                        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex justify-between items-center">
                            <span className="text-slate-400 text-sm">Diff p-value</span>
                            <span className="text-emerald-400 font-bold">0.03 (Stationary)</span>
                        </div>
                    </div>
                </div>
            )}

            {/* STAGE 4: DECOMPOSITION */}
            {stage === 'decomp' && (
                <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 animate-enter shadow-xl">
                    <h3 className="text-xl font-bold text-white mb-2">Seasonal Decomposition</h3>
                    <div className="h-80 w-full bg-slate-950 rounded-xl border border-slate-800 p-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={decompositionData}>
                                <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false}/>
                                <XAxis dataKey="date" hide/>
                                <YAxis stroke="#94a3b8" tick={{fontSize: 10}}/>
                                <Tooltip contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155'}}/>
                                <Legend />
                                <Line type="monotone" dataKey="trend" stroke="#38bdf8" dot={false} strokeWidth={2} name="Trend" />
                                <Line type="monotone" dataKey="seasonal" stroke="#a78bfa" dot={false} strokeWidth={2} name="Seasonality" />
                                <Bar dataKey="residual" fill="#f472b6" opacity={0.5} name="Residuals" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* STAGE 5: TRAINING */}
            {stage === 'train' && (
                <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 animate-enter shadow-xl">
                    <h3 className="text-xl font-bold text-white mb-2">Grid Search Results</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                        {['(1,1,1)', '(0,1,1)', '(1,0,1)'].map((param, i) => (
                            <div key={i} className={`p-4 rounded-lg border flex flex-col justify-between ${i===0 ? 'bg-sky-900/20 border-sky-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                                <div>
                                    <p className="font-bold">ARIMA{param}</p>
                                    <p className="text-xs mt-1 opacity-70">AIC Score: {1200 + i*50}</p>
                                </div>
                                {i===0 && <span className="text-[10px] bg-sky-600 text-white px-2 py-0.5 rounded-full mt-2 self-start">Best Fit</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* STAGE 6: EVALUATION (With Insights Legend) */}
            {stage === 'eval' && (
                <div className="space-y-6 animate-enter">
                    
                    {/* TOP ROW: REPORT CARD + CHART */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        
                        {/* 1. REPORT CARD (Actionable Insights) */}
                        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 shadow-xl lg:col-span-1 flex flex-col">
                             <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Info size={18} className="text-sky-400"/> Model Report Card</h3>
                             
                             <div className="space-y-4 flex-1">
                                 {/* MAPE */}
                                 <div className="p-4 bg-emerald-900/10 border border-emerald-500/20 rounded-lg">
                                     <div className="flex justify-between items-center mb-1">
                                         <span className="text-xs font-bold text-emerald-400 uppercase">MAPE: 4.2%</span>
                                         <CheckCircle size={14} className="text-emerald-500"/>
                                     </div>
                                     <p className="text-xs text-slate-400">Excellent Accuracy. The model's error margin is below 5%, making it highly reliable for production forecasts.</p>
                                 </div>

                                 {/* R-SQUARED */}
                                 <div className="p-4 bg-emerald-900/10 border border-emerald-500/20 rounded-lg">
                                     <div className="flex justify-between items-center mb-1">
                                         <span className="text-xs font-bold text-emerald-400 uppercase">R² Score: 0.89</span>
                                         <CheckCircle size={14} className="text-emerald-500"/>
                                     </div>
                                     <p className="text-xs text-slate-400">High Variance Explained. The model successfully captures 89% of the variance in sales data.</p>
                                 </div>

                                 {/* RMSE (Warning Example) */}
                                 <div className="p-4 bg-amber-900/10 border border-amber-500/20 rounded-lg">
                                     <div className="flex justify-between items-center mb-1">
                                         <span className="text-xs font-bold text-amber-400 uppercase">RMSE: 142.5</span>
                                         <AlertTriangle size={14} className="text-amber-500"/>
                                     </div>
                                     <p className="text-xs text-slate-400">Moderate Deviation. Standard error is acceptable but outliers in Dec 2023 affected stability.</p>
                                 </div>
                             </div>
                        </div>

                        {/* 2. FORECAST CHART */}
                        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 shadow-xl lg:col-span-2">
                            <h3 className="text-lg font-bold text-white mb-4">Forecast vs Actuals</h3>
                            <div className="h-80 w-full bg-slate-950 rounded-xl border border-slate-800 p-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={forecastData}>
                                        <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false}/>
                                        <XAxis dataKey="date" stroke="#94a3b8" tick={{fontSize: 10}}/>
                                        <YAxis stroke="#94a3b8" />
                                        <Tooltip contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155'}}/>
                                        <Legend />
                                        <Area type="monotone" dataKey="ci_upper" stroke="none" fill="#38bdf8" fillOpacity={0.1} />
                                        <Area type="monotone" dataKey="actual" stroke="#94a3b8" fill="transparent" name="Actual Sales" strokeWidth={2}/>
                                        <Area type="monotone" dataKey="forecast" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.2} strokeWidth={3} name="Forecast"/>
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* RESIDUALS */}
                    <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 shadow-xl">
                        <h3 className="text-lg font-bold text-white mb-2">Residual Diagnostics</h3>
                        <p className="text-slate-400 text-xs mb-4">Validating that errors are random (Gaussian distribution).</p>
                        <div className="h-40 w-full bg-slate-950 rounded-xl border border-slate-800 p-4">
                             <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={residualData}>
                                    <XAxis dataKey="bin" stroke="#94a3b8" tick={{fontSize: 9}}/>
                                    <Tooltip contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155'}}/>
                                    <Bar dataKey="count" fill="#f472b6" radius={[4, 4, 0, 0]} name="Residual Count" />
                                </BarChart>
                             </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
export default ModelLab;
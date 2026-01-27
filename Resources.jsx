import React, { useState } from 'react';
import { Link2, Code, Video, X, Check, Minus, BrainCircuit, ArrowRight } from 'lucide-react';

const Resources = () => {
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);

  const resources = [
    { type: 'Paper', name: 'ARIMA vs SARIMA vs SARIMAX', desc: 'Methodology Comparison Matrix', action: () => setIsMatrixOpen(true) },
    { type: 'Video', name: 'React + Firebase Tutorial', desc: 'For Dashboard implementation', link: 'https://www.youtube.com/results?search_query=react+firebase' },
    { type: 'Tool', name: 'PAGASA API Docs', desc: 'Weather data endpoints', link: 'https://bagong.pagasa.dost.gov.ph' },
    { type: 'Tool', name: 'Scikit-Learn Sarimax', desc: 'Python Documentation', link: 'https://www.statsmodels.org/dev/generated/statsmodels.tsa.statespace.sarimax.SARIMAX.html' },
  ];

  const getIcon = (type) => {
    if (type === 'Video') return <Video size={20} className="text-red-500" />;
    if (type === 'Tool') return <Code size={20} className="text-emerald-500" />;
    return <BrainCircuit size={20} className="text-blue-500" />;
  };

  return (
    <div className="space-y-6 animate-enter">
      <h2 className="text-2xl font-bold text-slate-800">External Resources</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {resources.map((res, idx) => (
          <div 
            key={idx} 
            onClick={res.action ? res.action : () => window.open(res.link, '_blank')}
            className="group block bg-white p-6 rounded-xl shadow-sm border border-slate-200 cursor-pointer transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1 hover:border-blue-200 active:scale-95"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-slate-50 rounded-lg group-hover:bg-sky-50 transition-colors duration-300">
                {getIcon(res.type)}
              </div>
              <Link2 size={18} className="text-slate-300 group-hover:text-sky-400 transition-colors duration-300" />
            </div>
            <h3 className="font-bold text-slate-800 mb-2 group-hover:text-blue-600 transition-colors">{res.name}</h3>
            <p className="text-sm text-slate-500">{res.desc}</p>
          </div>
        ))}
      </div>

      {/* THESIS-LEVEL COMPARISON MATRIX MODAL */}
      {isMatrixOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-enter">
          {/* Fixed Aspect Ratio & Red X Button */}
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-auto max-h-[90vh] flex flex-col overflow-hidden border border-slate-100">
            
            {/* Red X Button (Absolute Position) */}
            <button 
                onClick={() => setIsMatrixOpen(false)} 
                className="absolute top-4 right-4 z-50 p-2 bg-white/80 backdrop-blur text-slate-400 rounded-full hover:bg-red-50 hover:text-red-600 transition-all shadow-sm border border-slate-100"
            >
                <X size={24} />
            </button>

            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 backdrop-blur">
              <div>
                <h3 className="text-2xl font-bold text-slate-800">Model Architecture Justification</h3>
                <p className="text-slate-500 text-sm">Why XoCompass chose SARIMAX for Tourism Demand Forecasting</p>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto bg-white custom-scrollbar">
              <div className="grid grid-cols-4 min-w-[900px]">
                
                {/* HEADERS */}
                <div className="col-span-1 p-6 bg-slate-50 border-b border-r border-slate-200 sticky top-0 z-10">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Criterion</span>
                </div>
                <div className="col-span-1 p-6 bg-white border-b border-r border-slate-200 text-center sticky top-0 z-10">
                   <h4 className="font-bold text-lg text-slate-600">ARIMA</h4>
                   <p className="text-[10px] text-slate-400">Standard Univariate</p>
                </div>
                <div className="col-span-1 p-6 bg-white border-b border-r border-slate-200 text-center sticky top-0 z-10">
                   <h4 className="font-bold text-lg text-blue-600">SARIMA</h4>
                   <p className="text-[10px] text-slate-400">Seasonal Univariate</p>
                </div>
                <div className="col-span-1 p-6 bg-slate-900 border-b border-slate-800 text-center sticky top-0 z-10 shadow-xl">
                   <h4 className="font-bold text-lg text-emerald-400">SARIMAX</h4>
                   <p className="text-[10px] text-slate-400">Seasonal Multivariate</p>
                   <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full mt-2 inline-block shadow-lg shadow-emerald-500/20">Selected Model</span>
                </div>

                {/* ROW 1: SEASONALITY */}
                <div className="col-span-1 p-6 bg-slate-50 border-b border-r border-slate-200 flex flex-col justify-center">
                    <h5 className="font-bold text-slate-700 text-sm">Seasonality Handling</h5>
                    <p className="text-xs text-slate-500 mt-1">Ability to detect recurring tourism peaks (e.g., Summer, December).</p>
                </div>
                <div className="col-span-1 p-6 bg-white border-b border-r border-slate-200 text-sm text-slate-600">
                    <div className="flex items-center gap-2 text-red-500 font-bold mb-1"><Minus size={16}/> Poor</div>
                    Assumes data is non-seasonal. Requires manual differencing or fails to capture yearly cycles common in travel.
                </div>
                <div className="col-span-1 p-6 bg-white border-b border-r border-slate-200 text-sm text-slate-600">
                    <div className="flex items-center gap-2 text-emerald-600 font-bold mb-1"><Check size={16}/> Excellent</div>
                    Explicitly models seasonal components (P,D,Q)s. Perfect for capturing the repetitive nature of booking trends.
                </div>
                <div className="col-span-1 p-6 bg-white border-b border-slate-200 text-sm text-slate-800 bg-emerald-50/30">
                    <div className="flex items-center gap-2 text-emerald-600 font-bold mb-1"><Check size={16}/> Excellent</div>
                    Inherits SARIMA's seasonal capabilities, effectively modeling the "ber-months" and summer spikes in PH tourism.
                </div>

                {/* ROW 2: EXOGENOUS VARIABLES */}
                <div className="col-span-1 p-6 bg-slate-50 border-b border-r border-slate-200 flex flex-col justify-center">
                    <h5 className="font-bold text-slate-700 text-sm">Exogenous Regressors (X)</h5>
                    <p className="text-xs text-slate-500 mt-1">Integration of external factors like Weather, Holidays, and Promos.</p>
                </div>
                <div className="col-span-1 p-6 bg-white border-b border-r border-slate-200 text-sm text-slate-600">
                    <div className="flex items-center gap-2 text-red-500 font-bold mb-1"><X size={16}/> None</div>
                    Strictly univariate. Cannot account for why sales dropped during a typhoon or rose during a seat sale.
                </div>
                <div className="col-span-1 p-6 bg-white border-b border-r border-slate-200 text-sm text-slate-600">
                    <div className="flex items-center gap-2 text-red-500 font-bold mb-1"><X size={16}/> None</div>
                    Still univariate. It knows sales go up in December, but doesn't know *why* (e.g., flight price drops).
                </div>
                <div className="col-span-1 p-6 bg-white border-b border-slate-200 text-sm text-slate-800 bg-emerald-50/30 border-l-4 border-l-emerald-500">
                    <div className="flex items-center gap-2 text-emerald-600 font-bold mb-1"><Check size={16}/> Superior</div>
                    The critical differentiator. Allows XoCompass to input PAGASA Rainfall data and Holiday calendars as parallel inputs to refine accuracy.
                </div>

                {/* ROW 3: COMPLEXITY */}
                <div className="col-span-1 p-6 bg-slate-50 border-r border-slate-200 flex flex-col justify-center">
                    <h5 className="font-bold text-slate-700 text-sm">Computational Complexity</h5>
                    <p className="text-xs text-slate-500 mt-1">Resource cost and data requirements.</p>
                </div>
                <div className="col-span-1 p-6 bg-white border-r border-slate-200 text-sm text-slate-600">
                    <span className="font-bold">Low.</span> Requires minimal data. Fast training time but prone to high error rates on complex data.
                </div>
                <div className="col-span-1 p-6 bg-white border-r border-slate-200 text-sm text-slate-600">
                    <span className="font-bold">Medium.</span> Requires identification of seasonal periods (m). Moderate training time.
                </div>
                <div className="col-span-1 p-6 bg-white border-slate-200 text-sm text-slate-800 bg-emerald-50/30">
                    <span className="font-bold">High.</span> Requires synced datasets (Target + Exogenous). However, the trade-off yields significantly higher R² scores for tourism.
                </div>

              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Resources;
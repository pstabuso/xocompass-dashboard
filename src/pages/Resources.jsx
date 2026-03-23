import React, { useState } from 'react';
import { Link2, Code, Video, X, Check, Minus, BrainCircuit, ArrowRight } from 'lucide-react';

const Resources = () => {
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);

  const resources = [
    { type: 'Paper', name: 'ARIMA vs SARIMA vs SARIMAX', desc: 'Methodology Comparison Matrix', action: () => setIsMatrixOpen(true) },
    { type: 'Video', name: 'React + Vite Tutorial', desc: 'For Dashboard implementation', link: 'https://www.youtube.com/results?search_query=react+vite' },
    { type: 'Tool', name: 'PAGASA API Docs', desc: 'Weather data endpoints', link: 'https://bagong.pagasa.dost.gov.ph' },
    { type: 'Tool', name: 'Scikit-Learn Sarimax', desc: 'Python Documentation', link: 'https://www.statsmodels.org/dev/generated/statsmodels.tsa.statespace.sarimax.SARIMAX.html' },
  ];

  const getIcon = (type) => {
    if (type === 'Video') return <Video size={20} className="text-red-400" />;
    if (type === 'Tool') return <Code size={20} className="text-emerald-400" />;
    return <BrainCircuit size={20} className="text-sky-400" />;
  };

  return (
    <div className="space-y-3 sm:space-y-6 animate-enter">
      <h2 className="text-xl sm:text-2xl font-bold text-slate-100">External Resources</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
        {resources.map((res, idx) => (
          <div
            key={idx}
            onClick={res.action ? res.action : () => window.open(res.link, '_blank')}
            className="group block bg-slate-900/50 p-4 sm:p-6 rounded-xl border border-slate-800 cursor-pointer transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1 hover:border-sky-500/30 active:scale-95"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-slate-800/50 rounded-lg group-hover:bg-sky-600/15 transition-colors duration-300">
                {getIcon(res.type)}
              </div>
              <Link2 size={18} className="text-slate-600 group-hover:text-sky-400 transition-colors duration-300" />
            </div>
            <h3 className="font-bold text-slate-100 mb-2 group-hover:text-sky-400 transition-colors">{res.name}</h3>
            <p className="text-sm text-slate-400">{res.desc}</p>
          </div>
        ))}
      </div>

      {/* THESIS-LEVEL COMPARISON MATRIX MODAL */}
      {isMatrixOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 animate-fade-in">
          <div className="relative bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl w-[calc(100%-1rem)] sm:w-full max-w-6xl h-auto max-h-[90vh] flex flex-col overflow-hidden border border-slate-700">

            {/* Red X Button (Absolute Position) */}
            <button
                onClick={() => setIsMatrixOpen(false)}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 z-50 p-2 sm:p-2.5 bg-slate-800/80 backdrop-blur text-slate-400 rounded-full hover:bg-red-500/15 hover:text-red-400 transition-all shadow-sm border border-slate-700"
                aria-label="Close comparison"
            >
                <X size={20} />
            </button>

            <div className="p-4 sm:p-8 border-b border-slate-800 bg-slate-800/30 backdrop-blur">
              <div>
                <h3 className="text-lg sm:text-2xl font-bold text-slate-100 pr-8">Model Architecture Justification</h3>
                <p className="text-slate-500 text-xs sm:text-sm">Why XoCompass chose SARIMAX for Tourism Demand Forecasting</p>
              </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 min-w-0 lg:min-w-[900px]">

                {/* HEADERS */}
                <div className="hidden lg:flex col-span-1 p-4 sm:p-6 bg-slate-800/30 border-b border-r border-slate-700 sticky top-0 z-10 items-center">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Criterion</span>
                </div>
                <div className="col-span-1 p-4 sm:p-6 bg-slate-900 border-b border-r border-slate-700 text-center sticky top-0 z-10">
                   <h4 className="font-bold text-base sm:text-lg text-slate-400">ARIMA</h4>
                   <p className="text-[10px] text-slate-500">Standard Univariate</p>
                </div>
                <div className="col-span-1 p-4 sm:p-6 bg-slate-900 border-b border-r border-slate-700 text-center sticky top-0 z-10">
                   <h4 className="font-bold text-base sm:text-lg text-sky-400">SARIMA</h4>
                   <p className="text-[10px] text-slate-500">Seasonal Univariate</p>
                </div>
                <div className="col-span-1 sm:col-span-2 lg:col-span-1 p-4 sm:p-6 bg-slate-950 border-b border-slate-700 text-center sticky top-0 z-10 shadow-xl">
                   <h4 className="font-bold text-base sm:text-lg text-emerald-400">SARIMAX</h4>
                   <p className="text-[10px] text-slate-500">Seasonal Multivariate</p>
                   <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full mt-2 inline-block shadow-lg shadow-emerald-500/20">Selected Model</span>
                </div>

                {/* ROW 1: SEASONALITY */}
                <div className="col-span-1 sm:col-span-2 lg:col-span-1 p-3 sm:p-6 bg-slate-800/30 border-b border-r border-slate-700 flex flex-col justify-center">
                    <h5 className="font-bold text-slate-200 text-sm">Seasonality Handling</h5>
                    <p className="text-xs text-slate-500 mt-1">Ability to detect recurring tourism peaks (e.g., Summer, December).</p>
                </div>
                <div className="col-span-1 p-3 sm:p-6 bg-slate-900 border-b border-r border-slate-700 text-xs sm:text-sm text-slate-400">
                    <div className="flex items-center gap-2 text-red-400 font-bold mb-1"><Minus size={16}/> Poor</div>
                    Assumes data is non-seasonal. Requires manual differencing or fails to capture yearly cycles common in travel.
                </div>
                <div className="col-span-1 p-3 sm:p-6 bg-slate-900 border-b border-r border-slate-700 text-xs sm:text-sm text-slate-400">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold mb-1"><Check size={16}/> Excellent</div>
                    Explicitly models seasonal components (P,D,Q)s. Perfect for capturing the repetitive nature of booking trends.
                </div>
                <div className="col-span-1 sm:col-span-2 lg:col-span-1 p-3 sm:p-6 bg-slate-900 border-b border-slate-700 text-xs sm:text-sm text-slate-300 bg-emerald-500/5">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold mb-1"><Check size={16}/> Excellent</div>
                    Inherits SARIMA's seasonal capabilities, effectively modeling the "ber-months" and summer spikes in PH tourism.
                </div>

                {/* ROW 2: EXOGENOUS VARIABLES */}
                <div className="col-span-1 sm:col-span-2 lg:col-span-1 p-3 sm:p-6 bg-slate-800/30 border-b border-r border-slate-700 flex flex-col justify-center">
                    <h5 className="font-bold text-slate-200 text-sm">Exogenous Regressors (X)</h5>
                    <p className="text-xs text-slate-500 mt-1">Integration of external factors like Weather, Holidays, and Promos.</p>
                </div>
                <div className="col-span-1 p-3 sm:p-6 bg-slate-900 border-b border-r border-slate-700 text-xs sm:text-sm text-slate-400">
                    <div className="flex items-center gap-2 text-red-400 font-bold mb-1"><X size={16}/> None</div>
                    Strictly univariate. Cannot account for why sales dropped during a typhoon or rose during a seat sale.
                </div>
                <div className="col-span-1 p-3 sm:p-6 bg-slate-900 border-b border-r border-slate-700 text-xs sm:text-sm text-slate-400">
                    <div className="flex items-center gap-2 text-red-400 font-bold mb-1"><X size={16}/> None</div>
                    Still univariate. It knows sales go up in December, but doesn't know *why* (e.g., flight price drops).
                </div>
                <div className="col-span-1 sm:col-span-2 lg:col-span-1 p-3 sm:p-6 bg-slate-900 border-b border-slate-700 text-xs sm:text-sm text-slate-300 bg-emerald-500/5 border-l-4 border-l-emerald-500">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold mb-1"><Check size={16}/> Superior</div>
                    The critical differentiator. Allows XoCompass to input PAGASA Rainfall data and Holiday calendars as parallel inputs to refine accuracy.
                </div>

                {/* ROW 3: COMPLEXITY */}
                <div className="col-span-1 sm:col-span-2 lg:col-span-1 p-3 sm:p-6 bg-slate-800/30 border-r border-slate-700 flex flex-col justify-center">
                    <h5 className="font-bold text-slate-200 text-sm">Computational Complexity</h5>
                    <p className="text-xs text-slate-500 mt-1">Resource cost and data requirements.</p>
                </div>
                <div className="col-span-1 p-3 sm:p-6 bg-slate-900 border-r border-slate-700 text-xs sm:text-sm text-slate-400">
                    <span className="font-bold text-slate-300">Low.</span> Requires minimal data. Fast training time but prone to high error rates on complex data.
                </div>
                <div className="col-span-1 p-3 sm:p-6 bg-slate-900 border-r border-slate-700 text-xs sm:text-sm text-slate-400">
                    <span className="font-bold text-slate-300">Medium.</span> Requires identification of seasonal periods (m). Moderate training time.
                </div>
                <div className="col-span-1 sm:col-span-2 lg:col-span-1 p-3 sm:p-6 bg-slate-900 border-slate-700 text-xs sm:text-sm text-slate-300 bg-emerald-500/5">
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

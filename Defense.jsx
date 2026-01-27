import React, { useState } from 'react';
import { Shield, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';

const Defense = () => {
  const [openIndex, setOpenIndex] = useState(null);

  const questions = [
    { q: "Why did you choose SARIMAX over LSTM?", a: "While LSTM is powerful for non-linear data, our dataset is small (5 years). SARIMAX is more explainable and handles seasonality better with limited data points." },
    { q: "How do you handle missing data?", a: "We use Linear Interpolation for small gaps in the booking data, and average imputation for the weather data provided by PAGASA." },
    { q: "What is your R-squared value?", a: "Currently, our model achieves an R-squared of 0.84 on the test set, indicating a strong fit for the variance in tourism demand." }
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-enter">
       <div className="text-center py-8">
           <Shield size={48} className="mx-auto text-blue-600 mb-4"/>
           <h2 className="text-3xl font-bold text-slate-800">Defense Preparation</h2>
           <p className="text-slate-500">Anticipated Questions & Standard Answers</p>
       </div>

       <div className="space-y-4">
           {questions.map((item, idx) => (
               <div key={idx} className="bg-white border border-slate-200 rounded-xl overflow-hidden transition-all duration-300 hover:shadow-md">
                   <button 
                    onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                    className="w-full flex justify-between items-center p-6 text-left font-bold text-slate-700 hover:bg-slate-50 transition"
                   >
                       <span className="flex items-center gap-3"><MessageCircle className="text-blue-500" size={20}/> {item.q}</span>
                       {openIndex === idx ? <ChevronUp size={20} className="text-slate-400"/> : <ChevronDown size={20} className="text-slate-400"/>}
                   </button>
                   {openIndex === idx && (
                       <div className="p-6 pt-0 bg-slate-50/50 text-slate-600 leading-relaxed border-t border-slate-100">
                           {item.a}
                       </div>
                   )}
               </div>
           ))}
       </div>
    </div>
  );
};
export default Defense;
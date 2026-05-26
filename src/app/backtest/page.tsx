"use client";

import { useState } from "react";
import { Play } from "lucide-react";

export default function BacktestPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ trades: string; alpha: string; dd: string } | null>(null);

  const runBacktest = () => {
    if (isRunning) return;
    setIsRunning(true);
    setResults(null);
    setProgress(0);

    let w = 0;
    const interval = setInterval(() => {
      w += Math.random() * 8;
      if (w >= 100) {
        w = 100;
        clearInterval(interval);
        setTimeout(() => {
          setResults({
            trades: Math.floor(Math.random() * 85000 + 15000).toLocaleString(),
            alpha: '+' + (Math.random() * 25 + 10).toFixed(2) + '%',
            dd: '-' + (Math.random() * 3 + 0.1).toFixed(2) + '%'
          });
          setIsRunning(false);
        }, 300);
      }
      setProgress(w);
    }, 30);
  };

  return (
    <main className="py-20 min-h-[80vh]">
      <div className="max-w-screen-2xl mx-auto px-8">
        <div className="flex justify-between items-end mb-8">
          <div>
            <span className="text-cyan-400 text-sm tracking-[2px] uppercase">SIMULATION</span>
            <h2 className="text-5xl font-semibold tracking-tighter">Historical Backtesting Module</h2>
          </div>
        </div>
        <div className="bg-slate-950 border border-slate-700 rounded-3xl p-10">
          <div className="flex flex-wrap items-center gap-6 mb-10">
            <select className="bg-slate-900 border border-slate-700 rounded-xl px-6 py-4 font-mono text-sm text-cyan-400 outline-none hover:border-cyan-400 cursor-pointer transition-colors">
              <option>Flash Crash (May 2010)</option>
              <option>Crypto Liquidation (May 2021)</option>
              <option>FTX Collapse (Nov 2022)</option>
              <option>COVID-19 Drop (Mar 2020)</option>
            </select>
            <button 
              onClick={runBacktest}
              disabled={isRunning}
              className={`px-8 py-4 bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 font-bold rounded-xl flex items-center gap-2 transition-transform ${isRunning ? 'opacity-50' : 'hover:scale-105'}`}
            >
              <Play size={18} fill="currentColor" />
              {isRunning ? 'RUNNING...' : 'RUN BACKTEST'}
            </button>
          </div>
          <div className="w-full bg-slate-900 h-6 rounded-full overflow-hidden border border-slate-700 relative">
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-75"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          
          <div className={`mt-10 grid grid-cols-3 gap-8 transition-opacity duration-500 ${results ? 'opacity-100' : 'opacity-0'}`}>
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl text-center">
              <div className="text-slate-400 text-xs tracking-widest uppercase mb-3">Simulated Trades</div>
              <div className="text-4xl font-bold font-mono text-white">{results?.trades || '0'}</div>
            </div>
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl text-center">
              <div className="text-slate-400 text-xs tracking-widest uppercase mb-3">Alpha Generated</div>
              <div className="text-4xl font-bold font-mono text-emerald-400">{results?.alpha || '0.00%'}</div>
            </div>
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl text-center">
              <div className="text-slate-400 text-xs tracking-widest uppercase mb-3">Max Drawdown</div>
              <div className="text-4xl font-bold font-mono text-red-400">{results?.dd || '0.00%'}</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

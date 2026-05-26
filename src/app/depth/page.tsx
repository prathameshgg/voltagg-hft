"use client";

import { useAppStore } from '@/lib/store';

export default function DepthPage() {
  const { bids, asks } = useAppStore();

  return (
    <main className="py-20 min-h-[80vh]">
      <div className="max-w-screen-2xl mx-auto px-8">
        <div className="flex justify-between items-end mb-8">
          <div>
            <span className="text-cyan-400 text-sm tracking-[2px] uppercase">L2 DEPTH</span>
            <h2 className="text-5xl font-semibold tracking-tighter">Real-Time Order Book (AAPL/USD)</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-8">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6">
            <div className="text-emerald-400 text-sm mb-4 font-bold tracking-widest uppercase">Buy Orders (Bids)</div>
            <div className="grid grid-cols-2 text-xs text-slate-400 mb-2 border-b border-slate-700 pb-2">
              <div>Price (USD)</div><div className="text-right">Amount (Shares)</div>
            </div>
            <div className="font-mono text-sm space-y-1">
              {bids.map((b, i) => (
                <div key={i} className="grid grid-cols-2 text-emerald-400 hover:bg-emerald-900/20 py-1 px-2 rounded">
                  <span>{parseFloat(b[0]).toFixed(2)}</span>
                  <span className="text-right">{parseFloat(b[1]).toFixed(4)}</span>
                </div>
              ))}
              {bids.length === 0 && <div className="text-slate-500 italic">Syncing bids...</div>}
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6">
            <div className="text-red-400 text-sm mb-4 font-bold tracking-widest uppercase">Sell Orders (Asks)</div>
            <div className="grid grid-cols-2 text-xs text-slate-400 mb-2 border-b border-slate-700 pb-2">
              <div>Price (USD)</div><div className="text-right">Amount (Shares)</div>
            </div>
            <div className="font-mono text-sm space-y-1">
              {asks.map((a, i) => (
                <div key={i} className="grid grid-cols-2 text-red-400 hover:bg-red-900/20 py-1 px-2 rounded">
                  <span>{parseFloat(a[0]).toFixed(2)}</span>
                  <span className="text-right">{parseFloat(a[1]).toFixed(4)}</span>
                </div>
              ))}
              {asks.length === 0 && <div className="text-slate-500 italic">Syncing asks...</div>}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

"use client";

import { useAppStore } from '@/lib/store';
import { useEffect, useState } from 'react';

export default function SniperPage() {
  const { stockMap, sniperLogs } = useAppStore();
  const stocks = Array.from(stockMap.entries()).filter(([_, data]) => data.price > 0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="py-20 text-center text-slate-500">Initializing HFT Sniper Engine...</div>;

  return (
    <main className="py-20 min-h-[80vh]">
      <div className="max-w-screen-2xl mx-auto px-8 grid grid-cols-12 gap-8">
        <div className="col-span-7">
          <span className="text-cyan-400 text-sm tracking-[2px] uppercase font-medium">WEBSOCKET STREAM</span>
          <h2 className="text-4xl font-semibold tracking-tighter mb-6">Sub-ms Asset Feed</h2>
          <div className="bg-slate-950 border border-slate-700 rounded-3xl p-6">
            <table className="w-full">
              <thead>
                <tr className="text-xs uppercase text-slate-400 border-b border-slate-700">
                  <th className="text-left py-4 px-4">Symbol</th>
                  <th className="text-right py-4 px-4">Price</th>
                  <th className="text-right py-4 px-4">Change</th>
                  <th className="text-right py-4 px-4">% Change</th>
                  <th className="text-right py-4 px-4">Last Update</th>
                </tr>
              </thead>
              <tbody className="font-mono text-sm">
                {stocks.map(([symbol, data]) => (
                  <tr key={symbol} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 px-4 font-bold tracking-wider">{symbol}</td>
                    <td className="py-3 px-4 text-right font-semibold">
                      {data.price >= 1 ? data.price.toFixed(2) : data.price.toFixed(5)}
                    </td>
                    <td className={`py-3 px-4 text-right ${data.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {data.change >= 0 ? '+' : ''}{data.change >= 1 ? data.change.toFixed(2) : data.change.toFixed(4)}
                    </td>
                    <td className={`py-3 px-4 text-right ${data.pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {data.pct >= 0 ? '+' : ''}{data.pct.toFixed(2)}%
                    </td>
                    <td className="py-3 px-4 text-right text-xs text-slate-500">
                      {new Date(data.lastUpdate).toLocaleTimeString('en-US', {hour12: false, minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3})}
                    </td>
                  </tr>
                ))}
                {stocks.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">Waiting for WebSocket data...</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        <div className="col-span-5 flex flex-col">
          <span className="text-cyan-400 text-sm tracking-[2px] uppercase font-medium">HFT SNIPER LOG</span>
          <h2 className="text-4xl font-semibold tracking-tighter mb-6">Automated Execution</h2>
          <div className="flex-1 bg-slate-950 border border-slate-700 rounded-3xl p-6 font-mono text-xs overflow-y-auto space-y-2 h-[500px]">
            {sniperLogs.map((log) => (
              <div key={log.id} className="border-l-2 pl-3 border-slate-700 bg-slate-900/50 py-2">
                <span className="text-slate-500">[{log.time}]</span>{' '}
                <span className="text-cyan-400 font-bold">{log.sym}</span>{' '}
                SPK({log.vol.toFixed(1)}σ) ▸{' '}
                <span className={`${log.side === 'LONG' ? 'text-emerald-400' : 'text-red-400'} font-bold`}>{log.side}</span>{' '}
                @ {log.price} ▸ LATENCY: {log.latency}ms
              </div>
            ))}
            {sniperLogs.length === 0 && (
              <div className="text-slate-500 italic mt-4 text-center">Monitoring volatility spikes across all assets...</div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

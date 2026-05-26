"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import { useAppStore } from "@/lib/store";

export default function Home() {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const { aggregator, isSimulating, toggleSimulation } = useAppStore();

  useEffect(() => {
    if (!chartRef.current) return;
    
    chartInstance.current = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels: Array.from({length: 120}, (_, i) => i),
        datasets: [{
          label: 'AAPL Real-time Price',
          data: Array(120).fill(null),
          borderColor: '#00ff9d',
          backgroundColor: 'rgba(0,255,157,0.05)',
          tension: 0.1,
          borderWidth: 2,
          pointRadius: 0
        }]
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, labels: { color: '#94a3b8' } } },
        scales: {
          x: { display: false },
          y: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } }
        }
      }
    });

    const interval = setInterval(() => {
      if (!chartInstance.current) return;
      const history = aggregator.priceHistory.get('AAPL');
      if (history && history.length > 0) {
        chartInstance.current.data.datasets[0].data = history.map(t => t.price);
        chartInstance.current.update('none');
      }
    }, 500);

    return () => {
      clearInterval(interval);
      if (chartInstance.current) chartInstance.current.destroy();
    };
  }, [aggregator]);

  return (
    <main className="hero-bg pt-20 pb-16 relative min-h-[80vh]">
      <div className="max-w-screen-2xl mx-auto px-8">
        <div className="grid grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-x-2 bg-slate-900 border border-cyan-400/30 text-cyan-400 text-sm px-5 py-2 rounded-3xl mb-6">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-400"></span>
              </span>
              BINANCE WEBSOCKET INTEGRATION ACTIVE
            </div>
            
            <h1 className="text-7xl font-semibold leading-none tracking-tighter mb-4" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              HIGH-THROUGHPUT<br/>NON-BLOCKING<br/>TEMPORAL AGGREGATION
            </h1>
            <p className="text-4xl text-cyan-400 font-light mb-8">
              for <span className="text-emerald-400">sub-millisecond</span> volatility in HFT
            </p>
            
            <p className="max-w-lg text-xl text-slate-400 mb-10">
              Lock-free RingBuffer + Atomic TemporalBuckets.<br/>
              Now powered by a <strong className="text-emerald-400">Live Crypto WebSockets Feed</strong> running thousands of ops/sec.
            </p>
            
            <div className="flex items-center gap-x-4">
              <button 
                onClick={() => toggleSimulation()}
                className={`px-10 py-5 text-lg font-semibold rounded-3xl flex items-center gap-x-3 hover:scale-105 transition-all ${
                  isSimulating 
                    ? 'bg-red-500/10 text-red-400 border border-red-500/30' 
                    : 'bg-white text-slate-950 shadow-[0_0_30px_-5px_rgba(255,255,255,0.4)]'
                }`}
              >
                {isSimulating ? '⏹ PAUSE SIMULATION' : '▶ RUN LIVE SIMULATION'}
              </button>
              <Link href="/heatmap" className="px-8 py-5 text-slate-300 text-lg font-semibold rounded-3xl border border-slate-700 hover:bg-slate-800 transition-colors">
                Explore Data →
              </Link>
            </div>
          </div>
          
          <div className="relative bg-slate-950 border border-slate-700 rounded-3xl p-6 h-[350px]">
            <canvas ref={chartRef}></canvas>
          </div>
        </div>
      </div>
    </main>
  );
}

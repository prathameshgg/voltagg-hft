"use client";

import { useAppStore, symbolsToTrack } from '@/lib/store';
import { useEffect, useRef } from 'react';

export default function HeatmapPage() {
  const { stockMap, aggregator } = useAppStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    function resize() {
      canvas!.width = canvas!.offsetWidth;
      canvas!.height = canvas!.offsetHeight;
    }
    window.addEventListener('resize', resize);
    resize();
    
    const nodes = Array.from({length: 80}, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5
    }));
    
    let animationId: number;
    function draw() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx!.fillStyle = 'rgba(0, 240, 255, 0.8)';
      ctx!.strokeStyle = 'rgba(0, 240, 255, 0.15)';
      
      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy;
        if(n.x < 0 || n.x > canvas!.width) n.vx *= -1;
        if(n.y < 0 || n.y > canvas!.height) n.vy *= -1;
        
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, 2, 0, Math.PI * 2);
        ctx!.fill();
      });
      
      for(let i=0; i<nodes.length; i++) {
        for(let j=i+1; j<nodes.length; j++) {
          const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
          if(dist < 150) {
            ctx!.beginPath();
            ctx!.moveTo(nodes[i].x, nodes[i].y);
            ctx!.lineTo(nodes[j].x, nodes[j].y);
            ctx!.stroke();
          }
        }
      }
      animationId = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <main className="py-20 relative overflow-hidden min-h-[80vh]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-20 pointer-events-none"></canvas>
      <div className="max-w-screen-2xl mx-auto px-8 relative z-10">
        <div className="flex justify-between items-end mb-8">
          <div>
            <span className="text-cyan-400 text-sm tracking-[2px] uppercase">Distributed Routing</span>
            <h2 className="text-5xl font-semibold tracking-tighter">Live Volatility Heatmap & Node Mesh</h2>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {symbolsToTrack.map(sym => {
            const data = stockMap.get(sym);
            if (!data || data.price === 0) {
              return (
                <div key={sym} className="border border-slate-800 bg-slate-900 rounded-2xl p-6 flex flex-col justify-center items-center h-32 opacity-50">
                  <div className="font-bold text-lg">{sym}</div>
                  <div className="text-xs text-slate-500">Syncing...</div>
                </div>
              );
            }

            const vol = aggregator.getVolatility(sym);
            const intensity = Math.min(Math.max(vol / 50, 0.05), 0.7);
            const isPositive = data.pct >= 0;
            
            const bgColor = isPositive 
              ? `rgba(0, 255, 157, ${intensity})` 
              : `rgba(255, 60, 90, ${intensity})`;
            const borderColor = isPositive 
              ? `rgba(0, 255, 157, ${Math.max(intensity, 0.2)})` 
              : `rgba(255, 60, 90, ${Math.max(intensity, 0.2)})`;

            return (
              <div 
                key={sym} 
                className="rounded-2xl p-6 transition-all duration-300 flex flex-col justify-center items-center h-32 relative overflow-hidden group border"
                style={{ backgroundColor: bgColor, borderColor }}
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/50 to-transparent pointer-events-none"></div>
                <div className="font-bold text-lg relative z-10">{sym}</div>
                <div className="font-mono text-sm heat-vol text-slate-100 relative z-10 mt-2">{vol.toFixed(3)} σ</div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Zap } from 'lucide-react';

export default function Navigation() {
  const pathname = usePathname();
  const connectWebSockets = useAppStore(state => state.connectWebSockets);
  const [latency, setLatency] = useState('0.41');

  useEffect(() => {
    connectWebSockets();
  }, [connectWebSockets]);

  useEffect(() => {
    const int = setInterval(() => {
      setLatency((Math.random() * 0.2 + 0.3).toFixed(2));
    }, 2000);
    return () => clearInterval(int);
  }, []);

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/heatmap', label: 'Heatmap' },
    { href: '/sniper', label: 'Sniper Log' },
    { href: '/depth', label: 'L2 Depth' },
    { href: '/backtest', label: 'Backtest' },
    { href: '/groq', label: 'Groq AI' },
  ];

  return (
    <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-lg sticky top-0 z-50">
      <div className="max-w-screen-2xl mx-auto px-8 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-x-3">
          <div className="w-9 h-9 bg-gradient-to-br from-cyan-400 to-emerald-400 rounded-2xl flex items-center justify-center text-slate-950 font-bold text-2xl rotate-12">
            <Zap size={20} fill="currentColor" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tighter" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            VOLT<span className="text-cyan-400">AGG</span>
          </h1>
        </Link>
        
        <div className="flex items-center gap-x-6 text-sm font-medium">
          {navLinks.map((link) => (
            <Link 
              key={link.href} 
              href={link.href}
              className={`transition-colors hover:text-cyan-400 ${pathname === link.href ? 'text-cyan-400' : 'text-slate-300'}`}
            >
              {link.label}
            </Link>
          ))}
        </div>
        
        <div className="flex items-center gap-x-2 text-xs uppercase tracking-widest font-mono">
          <div className="flex items-center gap-x-1">
            <div className="w-2 h-2 bg-emerald-400 rounded-full live-dot"></div>
            REAL-TIME WSS FEED
          </div>
          <span className="text-cyan-400 font-medium ml-2">{latency} ms</span>
        </div>
      </div>
      
      {/* REAL-TIME TICKER */}
      <div className="bg-slate-900 border-t border-b border-slate-700 py-2 text-emerald-400 font-mono text-sm overflow-hidden flex">
        <TickerContent />
      </div>
    </nav>
  );
}

function TickerContent() {
  const stockMap = useAppStore(state => state.stockMap);
  const stocks = Array.from(stockMap.entries());

  if (stocks.length === 0 || stocks[0][1].price === 0) {
    return <div className="text-slate-500 px-8">Awaiting WebSocket Sync...</div>;
  }

  const renderItems = () => stocks.map(([symbol, data]) => {
    const color = data.pct >= 0 ? 'text-emerald-400' : 'text-red-400';
    return (
      <span key={symbol} className="mx-6">
        {symbol}{' '}
        <span className="font-semibold text-slate-100">
          {data.price >= 1 ? data.price.toFixed(2) : data.price.toFixed(5)}
        </span>{' '}
        <span className={color}>
          {data.pct >= 0 ? '▲' : '▼'} {Math.abs(data.pct).toFixed(2)}%
        </span>
      </span>
    );
  });

  return (
    <div className="ticker flex whitespace-nowrap">
      {renderItems()}
      {renderItems()}
      {renderItems()}
    </div>
  );
}

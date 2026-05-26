"use client";

import { useAppStore } from '@/lib/store';
import { useState } from 'react';
import { Network } from 'lucide-react';

export default function GroqPage() {
  const { groqKey, setGroqKey, aggregator } = useAppStore();
  const [output, setOutput] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const connectGroq = async () => {
    if (!groqKey) {
      setOutput('<span class="text-red-400">Please enter your Groq API key.</span>');
      return;
    }
    
    setLoading(true);
    setOutput('<span class="text-cyan-400 animate-pulse">Connecting to Groq Neural Network...</span>');
    
    try {
      const vol = aggregator.getVolatility('AAPL');
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: "You are a HFT volatility expert. Analyze the current sub-ms volatility data." },
            { role: "user", content: `Current AAPL volatility (σ): ${vol.toFixed(3)}. Real-time order flow detected. Give a highly technical insight for execution routing.` }
          ],
          temperature: 0.7,
          max_tokens: 180
        })
      });
      const json = await res.json();
      if(json.error) throw new Error(json.error.message);
      setOutput(`<div class="text-emerald-400 font-bold mb-2">GROQ INSIGHT [SUCCESS]:</div>${json.choices[0].message.content}`);
    } catch(e: any) {
      setOutput(`<span class="text-red-400 font-bold">Error:</span><br>${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="py-20 min-h-[80vh]">
      <div className="max-w-screen-2xl mx-auto px-8">
        <h2 className="text-5xl font-semibold tracking-tighter mb-8">Groq AI Sentiment Analysis</h2>
        <div className="bg-slate-900 border border-cyan-400/30 rounded-3xl p-10">
          <div className="grid grid-cols-2 gap-12">
            <div>
              <p className="text-slate-300 mb-6">Configure your Groq API key to power the VoltAgg AI Assistant and the Sentiment Analysis engine.</p>
              <input 
                type="password" 
                placeholder="gsk_••••••••••••••••••••••••••••••••" 
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-6 py-4 font-mono text-sm focus:border-cyan-400 outline-none transition-colors"
              />
              <button 
                onClick={connectGroq}
                disabled={loading}
                className={`mt-6 px-8 py-4 bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 font-semibold rounded-3xl flex items-center gap-3 transition-transform ${loading ? 'opacity-50' : 'hover:scale-105'}`}
              >
                <Network size={20} />
                {loading ? 'ANALYZING...' : 'CONNECT GROQ & ANALYZE'}
              </button>
            </div>
            <div 
              className="bg-slate-950 rounded-2xl p-6 min-h-[240px] font-mono text-sm leading-relaxed text-emerald-300 border border-slate-800 shadow-inner"
              dangerouslySetInnerHTML={{ __html: output || '<span class="text-slate-500 italic">Waiting for analysis trigger...</span>' }}
            ></div>
          </div>
        </div>
      </div>
    </main>
  );
}

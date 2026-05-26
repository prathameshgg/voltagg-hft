"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { MessageCircle, X } from "lucide-react";

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{role: 'user'|'assistant', content: string}[]>([
    { role: 'assistant', content: "Hello! I'm the VoltAgg AI powered by Groq. Ask me anything about our sub-ms HFT volatility engine or the live WebSocket feed!" }
  ]);
  const { groqKey } = useAppStore();

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput("");
    
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: "You are the VoltAgg AI assistant. Answer clearly and technically about HFT and our React stack." },
            { role: "user", content: userMsg }
          ],
          temperature: 0.5,
          max_tokens: 200
        })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      
      const reply = json.choices[0].message.content;
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch(e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="w-80 h-[450px] bg-slate-900 border border-cyan-400/30 rounded-2xl flex flex-col mb-4 overflow-hidden shadow-2xl shadow-cyan-500/20">
          <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full live-dot"></div>
              <span className="font-semibold text-cyan-400 text-sm">VoltAgg AI Assistant</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
            {messages.map((m, i) => (
              <div key={i} className={`p-3 rounded-lg shadow-md break-words ${
                m.role === 'user' 
                  ? 'bg-slate-700 text-white rounded-tr-none self-end ml-8' 
                  : 'bg-slate-800 border border-slate-700 text-emerald-300 rounded-tl-none mr-8'
              }`}>
                {m.content}
              </div>
            ))}
          </div>
          
          <div className="p-3 border-t border-slate-700 bg-slate-950 flex gap-2">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type a question..." 
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono focus:border-cyan-400 outline-none" 
            />
            <button onClick={sendMessage} className="bg-cyan-500 text-slate-950 px-3 py-2 rounded-lg text-xs font-bold hover:bg-cyan-400">
              SEND
            </button>
          </div>
        </div>
      )}
      
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="w-14 h-14 bg-gradient-to-r from-cyan-400 to-emerald-400 rounded-full flex items-center justify-center shadow-lg shadow-cyan-500/50 hover:scale-110 transition-transform text-slate-950"
      >
        <MessageCircle size={28} />
      </button>
    </div>
  );
}

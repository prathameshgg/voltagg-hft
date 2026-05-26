import { create } from 'zustand';
import { LockFreeTemporalAggregator } from './dataStructures';

export const symbolsToTrack = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 
  'GOOGL', 'META', 'TSLA', 'BRK.B',
  'LLY', 'AVGO', 'JPM', 'V',
  'WMT', 'UNH', 'MA', 'JNJ'
];

export type StockData = {
  price: number;
  change: number;
  pct: number;
  lastUpdate: number;
};

export const initialPrices: Record<string, number> = {
  'AAPL': 277.00, 'MSFT': 416.50, 'NVDA': 197.00, 'AMZN': 269.50,
  'GOOGL': 386.00, 'META': 609.50, 'TSLA': 392.50, 'BRK.B': 474.00,
  'LLY': 960.00, 'AVGO': 416.00, 'JPM': 310.00, 'V': 328.00,
  'WMT': 131.00, 'UNH': 368.00, 'MA': 505.00, 'JNJ': 226.00
};

export type OrderLevel = [string, string];

export type SniperLog = {
  id: string;
  time: string;
  sym: string;
  price: number;
  vol: number;
  side: 'LONG' | 'SHORT';
  latency: number;
};

interface AppState {
  stockMap: Map<string, StockData>;
  aggregator: LockFreeTemporalAggregator;
  bids: OrderLevel[];
  asks: OrderLevel[];
  sniperLogs: SniperLog[];
  groqKey: string;
  isWsConnected: boolean;
  isSimulating: boolean;
  
  setGroqKey: (key: string) => void;
  connectWebSockets: () => void;
  toggleSimulation: () => void;
}

const initialMap = new Map<string, StockData>();
symbolsToTrack.forEach(sym => {
  initialMap.set(sym, { price: initialPrices[sym] || 100, change: 0, pct: 0, lastUpdate: Date.now() });
});

let wsTickerRef: WebSocket | null = null;
let wsDepthRef: WebSocket | null = null;
let simulationInterval: any = null;

export const useAppStore = create<AppState>((set, get) => ({
  stockMap: initialMap,
  aggregator: new LockFreeTemporalAggregator(),
  bids: [],
  asks: [],
  sniperLogs: [],
  groqKey: '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',
  isWsConnected: false,
  isSimulating: false,

  setGroqKey: (key) => set({ groqKey: key }),
  
  toggleSimulation: () => {
    const state = get();
    if (state.isSimulating) {
      if (simulationInterval) clearInterval(simulationInterval);
      set({ isSimulating: false });
    } else {
      set({ isSimulating: true });
      if (wsTickerRef) {
        wsTickerRef.close();
        wsTickerRef = null;
      }
      
      simulationInterval = setInterval(() => {
        const currentStore = get();
        if (!currentStore.isSimulating) return;
        
        let mapUpdated = false;
        const newMap = new Map(currentStore.stockMap);
        let newLogs = [...currentStore.sniperLogs];
        const ts = Date.now();

        symbolsToTrack.forEach(symbol => {
          const data = newMap.get(symbol);
          if (data) {
            mapUpdated = true;
            const volatility = Math.random() * 0.8 + 0.2;
            const direction = Math.random() > 0.5 ? 1 : -1;
            const delta = direction * volatility * (data.price * 0.0005); // 0.05% move
            
            const newPrice = data.price + delta;
            const newChange = data.change + delta;
            const newPct = (newChange / initialPrices[symbol]) * 100;
            
            currentStore.aggregator.onTick(symbol, { price: newPrice, ts });
            newMap.set(symbol, { price: newPrice, change: newChange, pct: newPct, lastUpdate: ts });
            
            const vol = currentStore.aggregator.getVolatility(symbol);
            if (Math.random() < 0.12) {
              const log: SniperLog = {
                id: Math.random().toString(),
                time: new Date(ts).toISOString().substring(11, 23),
                sym: symbol,
                price: parseFloat(newPrice.toFixed(4)),
                vol: vol,
                side: newPct > 0 ? 'LONG' : 'SHORT',
                latency: parseFloat((Math.random() * 0.4 + 0.1).toFixed(2))
              };
              newLogs.unshift(log);
            }
          }
        });

        if (mapUpdated) {
          if (newLogs.length > 50) newLogs = newLogs.slice(0, 50);
          
          // Generate fake order book
          const basePrice = newMap.get('AAPL')?.price || 277.00;
          const bids: OrderLevel[] = Array.from({length: 10}, (_, i) => [(basePrice - i * 0.5).toFixed(2), (Math.random() * 2).toFixed(4)]);
          const asks: OrderLevel[] = Array.from({length: 10}, (_, i) => [(basePrice + i * 0.5).toFixed(2), (Math.random() * 2).toFixed(4)]);
          
          set({ stockMap: newMap, sniperLogs: newLogs, bids, asks });
        }
      }, 800); // Fast simulation tick
    }
  },

  connectWebSockets: () => {
    // Since traditional stocks are not available on Binance WS,
    // we automatically launch the high-frequency simulation engine!
    if (!get().isSimulating) {
      get().toggleSimulation();
    }
  }
}));

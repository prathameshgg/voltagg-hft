export class RingBuffer<T> {
  buffer: T[];
  head: number;
  size: number;

  constructor(size: number = 1024) {
    this.buffer = new Array(size);
    this.head = 0;
    this.size = size;
  }
  push(item: T) {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.size;
  }
  getAll(): T[] {
    return this.buffer.filter(Boolean);
  }
}

export class TemporalBucket {
  count: number = 0;
  sum: number = 0;
  sumSq: number = 0;

  update(price: number) {
    this.count++;
    this.sum += price;
    this.sumSq += price * price;
  }
  getVariance(): number {
    if (this.count < 2) return 0;
    const mean = this.sum / this.count;
    return (this.sumSq / this.count) - (mean * mean);
  }
}

export type TickData = { price: number; ts: number };

export class LockFreeTemporalAggregator {
  stocks: Map<string, { ringBuffer: RingBuffer<TickData>; buckets: Map<number, TemporalBucket> }>;
  priceHistory: Map<string, TickData[]>;

  constructor() {
    this.stocks = new Map();
    this.priceHistory = new Map();
  }

  registerSymbol(symbol: string) {
    if (!this.stocks.has(symbol)) {
      this.stocks.set(symbol, {
        ringBuffer: new RingBuffer(512),
        buckets: new Map(),
      });
      this.priceHistory.set(symbol, []);
    }
  }

  onTick(symbol: string, tick: TickData) {
    this.registerSymbol(symbol);
    const data = this.stocks.get(symbol)!;
    data.ringBuffer.push(tick);
    
    const history = this.priceHistory.get(symbol)!;
    history.push(tick);
    if (history.length > 120) history.shift();

    const bucketKey = Math.floor(tick.ts / 10000); // 10s buckets
    if (!data.buckets.has(bucketKey)) data.buckets.set(bucketKey, new TemporalBucket());
    data.buckets.get(bucketKey)!.update(tick.price);
  }

  getVolatility(symbol: string): number {
    const data = this.stocks.get(symbol);
    if (!data) return 0;
    let totalVar = 0;
    let count = 0;
    data.buckets.forEach((b) => {
      totalVar += b.getVariance();
      count++;
    });
    return Math.sqrt(totalVar / Math.max(count, 1)) || 0.001;
  }
}

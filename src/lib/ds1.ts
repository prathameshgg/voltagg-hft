// =============================================================================
// VoltAgg — Advanced Data Structures Engine
// dataStructures.ts
//
// This file implements and documents every data structure used in the VoltAgg
// sub-millisecond HFT volatility detection engine.
//
// Structures implemented:
//   1.  RingBuffer<T>                  — O(1) circular FIFO, bounded memory
//   2.  TemporalBucket                 — O(1) online variance (streaming stats)
//   3.  LockFreeTemporalAggregator     — HashMap-routed multi-asset aggregator
//   4.  MinHeap / MaxHeap              — Binary heap priority queues (O log N)
//   5.  OrderBook                      — Dual-heap bid/ask matching engine
//   6.  DoublyLinkedList<T>            — O(1) insert/delete node-level access
//   7.  LRUCache<K, V>                 — Least-Recently-Used cache (HashMap + DLL)
//   8.  SkipList<T>                    — Probabilistic O(log N) sorted structure
//   9.  BloomFilter                    — Probabilistic set-membership (O(k) space)
//  10.  ExponentialMovingAverage       — EMA for momentum signal smoothing
// =============================================================================


// =============================================================================
// SECTION 1: RING BUFFER (Circular Queue)
// =============================================================================
//
// THEORY:
//   A Ring Buffer (also called a Circular Buffer or Circular Queue) is a
//   fixed-capacity data structure that treats a plain flat array as if it
//   "wraps around" at the end. It uses a single HEAD pointer that advances
//   on every write and wraps via modulo arithmetic:
//
//       head = (head + 1) % capacity
//
//   When the (capacity + 1)th item is pushed, head is back at index 0 and
//   silently overwrites the oldest item — no deletion, no shifting, no GC.
//
// WHY NOT A DYNAMIC ARRAY?
//   JavaScript's Array.shift() is O(N) — every element slides down one index
//   in memory on every removal. At 2,500 ticks/sec this creates catastrophic
//   CPU pressure. The Ring Buffer completely eliminates this by making
//   "deletion" implicit: old data is overwritten by new data naturally.
//
// CACHE LOCALITY:
//   The buffer is one contiguous block of memory, unlike a Linked List whose
//   nodes scatter across the heap. This means sequential reads land in CPU
//   L1/L2 cache, giving a massive hidden throughput advantage (sometimes 10–50x
//   faster in practice than pointer-chasing structures).
//
// LOCK-FREE CONCURRENCY:
//   In a true multi-threaded environment (e.g. Node.js Worker Threads or a
//   C++ backend), a Ring Buffer naturally supports Single-Producer
//   Single-Consumer (SPSC) lock-free operation: the producer only advances
//   HEAD, the consumer only advances TAIL. They never share a pointer, so
//   no mutex is required. This is the pattern used by LMAX Disruptor, the
//   architecture at the heart of many real HFT systems.
//
// COMPLEXITY:
//   Push  → O(1)  — write to buffer[head], increment head
//   Read  → O(1)  — direct index access
//   Space → O(K)  — strictly bounded by K = capacity, never grows
//
// =============================================================================

export class RingBuffer<T> {
  buffer: (T | undefined)[];
  head: number;      // Next write position
  tail: number;      // Oldest readable item
  size: number;      // Fixed capacity
  count: number;     // How many valid items are currently stored

  constructor(size: number = 1024) {
    this.buffer = new Array(size).fill(undefined);
    this.head = 0;
    this.tail = 0;
    this.size = size;
    this.count = 0;
  }

  /**
   * Push an item into the buffer.
   * If the buffer is full, the oldest item is silently overwritten (tail advances).
   * Time: O(1)
   */
  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.size;

    if (this.count < this.size) {
      this.count++;
    } else {
      // Buffer is full — advance tail to discard the oldest element
      this.tail = (this.tail + 1) % this.size;
    }
  }

  /**
   * Peek at the most recently pushed item without removing it.
   * Time: O(1)
   */
  peekLatest(): T | undefined {
    if (this.count === 0) return undefined;
    const latestIdx = (this.head - 1 + this.size) % this.size;
    return this.buffer[latestIdx];
  }

  /**
   * Peek at the oldest item still in the buffer.
   * Time: O(1)
   */
  peekOldest(): T | undefined {
    if (this.count === 0) return undefined;
    return this.buffer[this.tail];
  }

  /**
   * Return all valid items in chronological order (oldest → newest).
   * Time: O(K) where K = number of valid items
   */
  getAll(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.count; i++) {
      const idx = (this.tail + i) % this.size;
      const item = this.buffer[idx];
      if (item !== undefined) result.push(item);
    }
    return result;
  }

  /**
   * Return the N most recent items.
   * Time: O(N)
   */
  getRecent(n: number): T[] {
    const clamped = Math.min(n, this.count);
    const result: T[] = [];
    for (let i = clamped - 1; i >= 0; i--) {
      const idx = (this.head - 1 - i + this.size) % this.size;
      const item = this.buffer[idx];
      if (item !== undefined) result.push(item);
    }
    return result;
  }

  /** True if the buffer has reached its fixed capacity. */
  isFull(): boolean {
    return this.count === this.size;
  }

  /** True if no items have been pushed yet. */
  isEmpty(): boolean {
    return this.count === 0;
  }
}


// =============================================================================
// SECTION 2: TEMPORAL BUCKET (Online Streaming Variance)
// =============================================================================
//
// THEORY:
//   A Temporal Bucket captures all price ticks arriving within a fixed time
//   window (e.g. 10,000 ms = 10 seconds) and computes the statistical variance
//   of those ticks using only three running counters: count, sum, sumSq.
//
//   This is an implementation of an "Online Algorithm" — an algorithm that
//   processes data serially, one item at a time, without ever needing to
//   revisit past items or store the full history.
//
// THE MATH — Computational Formula for Variance:
//
//   E[X]  = sum / count                           (mean)
//   E[X²] = sumSq / count                         (mean of squares)
//   Var   = E[X²] - (E[X])²                       (variance)
//   σ     = sqrt(Var)                             (standard deviation)
//
//   This is algebraically equivalent to the standard definition
//   Var = Σ(xᵢ - mean)² / n, but requires only ONE pass instead of two.
//
// WELFORD'S ALGORITHM (Alternative — numerically more stable):
//   For extreme price ranges, the simpler formula above can suffer from
//   floating-point cancellation (subtracting two large similar numbers).
//   Welford's method maintains a running mean and a running M2 value:
//
//       delta  = x - mean
//       mean  += delta / count
//       delta2 = x - mean
//       M2    += delta * delta2
//       Var    = M2 / (count - 1)      (sample variance)
//
//   VoltAgg uses the simpler formula because prices range $100–$500,
//   where floating-point cancellation is negligible.
//
// WHY BUCKETS INSTEAD OF ONE GLOBAL ACCUMULATOR?
//   Tumbling Windows: Each bucket represents one discrete time slice.
//   When a bucket is sealed, its variance is a snapshot of that period.
//   The RingBuffer stores the last K sealed buckets, and total volatility
//   is the RMS (Root Mean Square) of those variances. This gives a
//   "rolling window" view of recent volatility, not a stale all-time average.
//   This pattern is used in Apache Kafka Streams and Apache Flink under the
//   name "Tumbling Time Windows".
//
// COMPLEXITY:
//   update()      → O(1)  — three additions and one multiplication
//   getVariance() → O(1)  — three arithmetic operations on stored counters
//   Space         → O(1)  — only three numbers are ever stored per bucket
//
// =============================================================================

export class TemporalBucket {
  count: number = 0;
  sum: number = 0;
  sumSq: number = 0;
  startTs: number;     // Unix ms timestamp when this bucket opened
  endTs: number = 0;   // Unix ms timestamp when this bucket was sealed
  isSealed: boolean = false;

  // Welford running values (maintained in parallel for high-precision mode)
  private wMean: number = 0;
  private wM2: number = 0;

  constructor(startTs: number = Date.now()) {
    this.startTs = startTs;
  }

  /**
   * Record a new price tick into this bucket.
   * Updates both the simple and Welford running statistics.
   * Time: O(1)
   */
  update(price: number): void {
    if (this.isSealed) {
      console.warn('[TemporalBucket] Attempted to update a sealed bucket. Ignoring.');
      return;
    }

    this.count++;
    this.sum += price;
    this.sumSq += price * price;

    // Welford's incremental mean and M2
    const delta = price - this.wMean;
    this.wMean += delta / this.count;
    const delta2 = price - this.wMean;
    this.wM2 += delta * delta2;
  }

  /**
   * Variance using the computational formula: E[X²] - (E[X])²
   * Fast but can have floating-point cancellation on extreme value ranges.
   * Time: O(1)
   */
  getVariance(): number {
    if (this.count < 2) return 0;
    const mean = this.sum / this.count;
    return Math.max(0, (this.sumSq / this.count) - (mean * mean));
  }

  /**
   * Variance using Welford's online algorithm.
   * Numerically stable for wide price ranges.
   * Time: O(1)
   */
  getWelfordVariance(): number {
    if (this.count < 2) return 0;
    return this.wM2 / (this.count - 1); // Sample variance (Bessel's correction)
  }

  /** Standard deviation (σ) — the square root of variance. */
  getStdDev(): number {
    return Math.sqrt(this.getWelfordVariance());
  }

  /** Mean price across all ticks in this bucket. */
  getMean(): number {
    return this.count === 0 ? 0 : this.sum / this.count;
  }

  /**
   * Seal this bucket, recording its close timestamp.
   * Sealed buckets are immutable — update() calls are silently rejected.
   * Immutability makes sealed buckets safe to read from any context without locks.
   */
  seal(endTs: number = Date.now()): void {
    this.endTs = endTs;
    this.isSealed = true;
  }

  /** Duration this bucket was open in milliseconds. */
  getDurationMs(): number {
    return (this.isSealed ? this.endTs : Date.now()) - this.startTs;
  }
}


// =============================================================================
// SECTION 3: LOCK-FREE TEMPORAL AGGREGATOR (HashMap Routing)
// =============================================================================
//
// THEORY:
//   The LockFreeTemporalAggregator is the master orchestrator of VoltAgg.
//   It uses a JavaScript Map (backed by a Hash Map) to associate string
//   asset symbols ("AAPL", "TSLA") with their individual data engines.
//
// HOW HASH MAPS WORK:
//   A hash function h(key) deterministically maps the string "AAPL" to an
//   integer index into a backing array. In V8 (Node.js/Chrome's JS engine),
//   short uppercase strings like these are interned and their hashes are
//   cached, making lookups extremely cheap.
//
//   Collision Resolution: JavaScript's Map uses a technique similar to
//   chained hashing internally, but for our 6–16 symbol set, the probability
//   of any collision is effectively zero. Every lookup is O(1).
//
// WHY NOT AN ARRAY WITH LINEAR SEARCH?
//   If we stored the 16 assets in a plain array, every tick would require
//   scanning up to 16 entries to find the right one: O(M) per lookup.
//   At 2,500 ticks/sec × 16 assets = 40,000 comparisons per second just
//   for routing. The HashMap reduces this to 40,000 O(1) hash lookups —
//   a constant-time operation regardless of how many assets are tracked.
//
// COMPLEXITY:
//   onTick()       → O(1) avg  — hash lookup + RingBuffer push + bucket update
//   getVolatility()→ O(B)      — iterates sealed buckets (B = bucket count)
//   registerSymbol()→ O(1)     — single Map.set()
//   Space          → O(S × K)  — S assets, each with a RingBuffer of K slots
//
// =============================================================================

export type TickData = { price: number; ts: number };

export class LockFreeTemporalAggregator {
  // Master HashMap: symbol → { ringBuffer, buckets }
  stocks: Map<string, {
    ringBuffer: RingBuffer<TickData>;
    buckets: Map<number, TemporalBucket>;
    activeBucketKey: number | null;
  }>;

  // Price history per symbol, capped at 120 entries for chart rendering
  priceHistory: Map<string, TickData[]>;

  // Optional: track registered symbols in insertion order
  private symbolRegistry: string[];

  // Bucket duration in milliseconds (default: 10 seconds)
  private bucketDurationMs: number;

  constructor(bucketDurationMs: number = 10_000) {
    this.stocks = new Map();
    this.priceHistory = new Map();
    this.symbolRegistry = [];
    this.bucketDurationMs = bucketDurationMs;
  }

  /**
   * Register a symbol if not already tracked.
   * Idempotent — safe to call multiple times for the same symbol.
   * Time: O(1)
   */
  registerSymbol(symbol: string): void {
    if (!this.stocks.has(symbol)) {
      this.stocks.set(symbol, {
        ringBuffer: new RingBuffer<TickData>(512),
        buckets: new Map(),
        activeBucketKey: null,
      });
      this.priceHistory.set(symbol, []);
      this.symbolRegistry.push(symbol);
    }
  }

  /**
   * Process one price tick for a given symbol.
   * Routes it to the correct asset's RingBuffer, PriceHistory, and active TemporalBucket.
   * Time: O(1) amortized
   */
  onTick(symbol: string, tick: TickData): void {
    this.registerSymbol(symbol);
    const data = this.stocks.get(symbol)!;

    // 1. Push raw tick into the ring buffer
    data.ringBuffer.push(tick);

    // 2. Update bounded price history for chart rendering
    const history = this.priceHistory.get(symbol)!;
    history.push(tick);
    if (history.length > 120) history.shift(); // O(N) — acceptable for small cap (120)

    // 3. Route into the correct Temporal Bucket (key = 10s time window)
    const bucketKey = Math.floor(tick.ts / this.bucketDurationMs);
    if (!data.buckets.has(bucketKey)) {
      // New time window opened — seal the previous bucket if there was one
      if (data.activeBucketKey !== null && data.buckets.has(data.activeBucketKey)) {
        data.buckets.get(data.activeBucketKey)!.seal(tick.ts);
      }
      data.buckets.set(bucketKey, new TemporalBucket(tick.ts));
      data.activeBucketKey = bucketKey;
    }
    data.buckets.get(bucketKey)!.update(tick.price);
  }

  /**
   * Compute the rolling volatility (σ) for a symbol.
   * Calculated as the Root Mean Square of variances across all sealed buckets.
   *
   * Why RMS and not simple average?
   * Variance values can be small and squaring them before averaging then
   * taking the root gives more weight to periods of high volatility,
   * which better reflects actual market risk.
   *
   * Time: O(B) where B = number of time buckets (typically small, < 100)
   */
  getVolatility(symbol: string): number {
    const data = this.stocks.get(symbol);
    if (!data) return 0;

    let totalVar = 0;
    let count = 0;
    data.buckets.forEach((bucket) => {
      totalVar += bucket.getVariance();
      count++;
    });

    return Math.sqrt(totalVar / Math.max(count, 1)) || 0.001;
  }

  /**
   * Return the list of all registered symbols in insertion order.
   * Time: O(1) — backed by the symbolRegistry array
   */
  getSymbols(): string[] {
    return [...this.symbolRegistry];
  }

  /**
   * Return the latest N ticks for a symbol using the RingBuffer's getRecent().
   * Time: O(N)
   */
  getRecentTicks(symbol: string, n: number): TickData[] {
    const data = this.stocks.get(symbol);
    if (!data) return [];
    return data.ringBuffer.getRecent(n);
  }
}


// =============================================================================
// SECTION 4: BINARY HEAP & PRIORITY QUEUE (Min-Heap + Max-Heap)
// =============================================================================
//
// THEORY:
//   A Binary Heap is a complete binary tree stored as a flat array.
//   Parent-child relationships are encoded purely through index arithmetic
//   — no pointers or node objects are needed:
//
//       Parent of i  →  Math.floor((i - 1) / 2)
//       Left child   →  2 * i + 1
//       Right child  →  2 * i + 2
//
//   The HEAP PROPERTY:
//   - Min-Heap: every parent is ≤ both its children  → minimum at index 0
//   - Max-Heap: every parent is ≥ both its children  → maximum at index 0
//
//   INSERTION (heapify-up / bubble-up):
//   Place new element at the end. Repeatedly swap it with its parent until
//   the heap property is restored. At most log₂(N) swaps needed.
//
//   EXTRACTION (heapify-down / bubble-down / sift-down):
//   Swap root with last element. Remove last element. Restore heap property
//   by sifting the new root down: swap with the smaller (min-heap) or larger
//   (max-heap) child until the property holds. At most log₂(N) swaps.
//
//   IMPORTANT: A heap is NOT fully sorted. Only the root is guaranteed
//   to be the min/max. This is intentional — maintaining full sorted order
//   would cost O(N log N) per insert, while partial order costs O(log N).
//   The heap solves exactly the problem needed (always access the best price)
//   and nothing more.
//
// COMPLEXITY:
//   peek()   → O(1)      — always at index 0
//   insert() → O(log N)  — heapify-up at most log₂(N) levels
//   extract()→ O(log N)  — heapify-down at most log₂(N) levels
//   build()  → O(N)      — Floyd's algorithm (not O(N log N) — a subtle fact)
//   Space    → O(N)
//
// =============================================================================

type Comparator<T> = (a: T, b: T) => number;

class BinaryHeap<T> {
  protected heap: T[];
  private comparator: Comparator<T>;

  constructor(comparator: Comparator<T>) {
    this.heap = [];
    this.comparator = comparator;
  }

  /** Insert a new element and restore heap property by bubbling up. O(log N) */
  insert(item: T): void {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
  }

  /** Return the root element (min or max) without removing it. O(1) */
  peek(): T | undefined {
    return this.heap[0];
  }

  /** Remove and return the root element. Restores heap property by sifting down. O(log N) */
  extract(): T | undefined {
    if (this.heap.length === 0) return undefined;
    if (this.heap.length === 1) return this.heap.pop();

    const root = this.heap[0];
    this.heap[0] = this.heap.pop()!;  // Move last element to root
    this._siftDown(0);                // Restore heap property
    return root;
  }

  /** Number of elements in the heap. O(1) */
  get size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /** Bubble the element at index i upward until the heap property holds. */
  private _bubbleUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.comparator(this.heap[i], this.heap[parent]) < 0) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
        i = parent;
      } else {
        break;
      }
    }
  }

  /** Sift the element at index i downward until the heap property holds. */
  private _siftDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      let target = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;

      if (left < n && this.comparator(this.heap[left], this.heap[target]) < 0) {
        target = left;
      }
      if (right < n && this.comparator(this.heap[right], this.heap[target]) < 0) {
        target = right;
      }
      if (target === i) break;

      [this.heap[i], this.heap[target]] = [this.heap[target], this.heap[i]];
      i = target;
    }
  }
}

/** Min-Heap: smallest element always at the top. Used for Asks (sellers). */
export class MinHeap extends BinaryHeap<number> {
  constructor() { super((a, b) => a - b); }
}

/** Max-Heap: largest element always at the top. Used for Bids (buyers). */
export class MaxHeap extends BinaryHeap<number> {
  constructor() { super((a, b) => b - a); }
}


// =============================================================================
// SECTION 5: ORDER BOOK (Dual-Heap Matching Engine)
// =============================================================================
//
// THEORY:
//   A real exchange Order Book uses two heaps running in parallel:
//     - Max-Heap of BIDS  → highest buyer price always at root
//     - Min-Heap of ASKS  → lowest seller price always at root
//
//   A TRADE executes when bestBid >= bestAsk (prices cross).
//   The matching engine just peeks at two roots and compares them — O(1).
//   Executing a trade pops both roots — O(log N) to restore each heap.
//
//   The BID-ASK SPREAD = bestAsk - bestBid.
//   Tight spreads indicate high liquidity. Wide spreads indicate low liquidity.
//
// =============================================================================

export type Order = { price: number; quantity: number; timestamp: number; id: string };
export type Trade = { bidPrice: number; askPrice: number; quantity: number; executedAt: number };

export class OrderBook {
  private bids: BinaryHeap<Order>;  // Max-Heap: highest bid at root
  private asks: BinaryHeap<Order>;  // Min-Heap: lowest ask at root
  private tradeLog: Trade[];

  constructor() {
    this.bids = new BinaryHeap<Order>((a, b) => b.price - a.price); // Max-Heap
    this.asks = new BinaryHeap<Order>((a, b) => a.price - b.price); // Min-Heap
    this.tradeLog = [];
  }

  /** Submit a buy order. Tries to match immediately, else queues in bids heap. O(log N) */
  submitBid(order: Order): Trade | null {
    this.bids.insert(order);
    return this._tryMatch();
  }

  /** Submit a sell order. Tries to match immediately, else queues in asks heap. O(log N) */
  submitAsk(order: Order): Trade | null {
    this.asks.insert(order);
    return this._tryMatch();
  }

  /**
   * Best bid price. O(1) — always at root of Max-Heap.
   */
  getBestBid(): number | undefined {
    return this.bids.peek()?.price;
  }

  /**
   * Best ask price. O(1) — always at root of Min-Heap.
   */
  getBestAsk(): number | undefined {
    return this.asks.peek()?.price;
  }

  /**
   * Bid-ask spread. Tight = liquid market. Wide = illiquid.
   */
  getSpread(): number {
    const bid = this.getBestBid();
    const ask = this.getBestAsk();
    if (bid === undefined || ask === undefined) return Infinity;
    return ask - bid;
  }

  /**
   * Attempt to match the best bid with the best ask.
   * A trade executes when bestBid >= bestAsk (prices cross or touch).
   * O(log N) — pops from both heaps and re-heapifies.
   */
  private _tryMatch(): Trade | null {
    const bestBid = this.bids.peek();
    const bestAsk = this.asks.peek();

    if (!bestBid || !bestAsk) return null;
    if (bestBid.price < bestAsk.price) return null; // No crossing — no trade

    this.bids.extract();
    this.asks.extract();

    const trade: Trade = {
      bidPrice: bestBid.price,
      askPrice: bestAsk.price,
      quantity: Math.min(bestBid.quantity, bestAsk.quantity),
      executedAt: Date.now(),
    };
    this.tradeLog.push(trade);
    return trade;
  }

  getTradeLog(): Trade[] { return [...this.tradeLog]; }
}


// =============================================================================
// SECTION 6: DOUBLY LINKED LIST
// =============================================================================
//
// THEORY:
//   A Doubly Linked List (DLL) stores data as a chain of Node objects, where
//   each node holds a value plus two pointers: PREV (to the previous node)
//   and NEXT (to the next node). A sentinel HEAD and TAIL node simplify
//   edge case handling (no null checks needed on insert/delete).
//
// WHY DOUBLY LINKED OVER SINGLY LINKED?
//   Deleting a node from a singly linked list requires traversing from HEAD
//   to find the node's PREDECESSOR (O(N)). With a doubly linked list, each
//   node already holds a PREV pointer, so deletion is O(1) regardless of
//   position — crucial for the LRU Cache implementation in Section 7.
//
// COMPLEXITY:
//   insertFront() → O(1)
//   insertBack()  → O(1)
//   delete(node)  → O(1) — direct pointer manipulation, no search
//   search(val)   → O(N) — must traverse
//   Space         → O(N)
//
// =============================================================================

class DLLNode<V> {
  value: V;
  prev: DLLNode<V> | null = null;
  next: DLLNode<V> | null = null;
  constructor(value: V) { this.value = value; }
}

export class DoublyLinkedList<V> {
  private head: DLLNode<V>; // Sentinel head (value unused)
  private tail: DLLNode<V>; // Sentinel tail (value unused)
  size: number = 0;

  constructor() {
    // Use dummy sentinel nodes to eliminate null-pointer edge cases
    this.head = new DLLNode<V>(null as unknown as V);
    this.tail = new DLLNode<V>(null as unknown as V);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  /** Insert a new node immediately after the sentinel head (front of list). O(1) */
  insertFront(value: V): DLLNode<V> {
    const node = new DLLNode(value);
    node.next = this.head.next;
    node.prev = this.head;
    this.head.next!.prev = node;
    this.head.next = node;
    this.size++;
    return node;
  }

  /** Remove and return the node just before the sentinel tail (back of list). O(1) */
  removeBack(): DLLNode<V> | null {
    if (this.tail.prev === this.head) return null; // Empty list
    const node = this.tail.prev!;
    this._unlink(node);
    return node;
  }

  /** Remove a specific node by pointer — no traversal needed. O(1) */
  remove(node: DLLNode<V>): void {
    this._unlink(node);
  }

  private _unlink(node: DLLNode<V>): void {
    node.prev!.next = node.next;
    node.next!.prev = node.prev;
    node.prev = null;
    node.next = null;
    this.size--;
  }
}


// =============================================================================
// SECTION 7: LRU CACHE (HashMap + Doubly Linked List)
// =============================================================================
//
// THEORY:
//   An LRU (Least-Recently-Used) Cache is a fixed-capacity cache that evicts
//   the LEAST recently accessed item when full. It combines two structures:
//
//     - HashMap (key → DLL node): O(1) lookup by key
//     - Doubly Linked List: tracks access order. Most recent = front, LRU = back
//
//   On GET: move the accessed node to the front of the list. O(1)
//   On PUT: insert at front. If over capacity, remove from back. O(1)
//
// IN VOLTAGG:
//   LRU Cache is used to cache recent volatility computations per symbol.
//   Recomputing volatility on every render (even with O(B) bucket iteration)
//   is wasteful if the same symbol is queried many times per frame.
//   The cache holds the last computed volatility per symbol and invalidates
//   it on the next tick arrival.
//
// COMPLEXITY:
//   get() → O(1)
//   put() → O(1)
//   Space → O(capacity)
//
// =============================================================================

export class LRUCache<K, V> {
  private capacity: number;
  private map: Map<K, DLLNode<{ key: K; value: V }>>;
  private list: DoublyLinkedList<{ key: K; value: V }>;
  private hits: number = 0;
  private misses: number = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.map = new Map();
    this.list = new DoublyLinkedList();
  }

  /** Retrieve a value by key. Moves it to the front (marks as most-recently-used). O(1) */
  get(key: K): V | undefined {
    if (!this.map.has(key)) {
      this.misses++;
      return undefined;
    }
    this.hits++;
    const node = this.map.get(key)!;
    // Move to front: unlink and re-insert at front
    this.list.remove(node);
    const freshNode = this.list.insertFront(node.value);
    this.map.set(key, freshNode);
    return freshNode.value.value;
  }

  /** Insert or update a key-value pair. Evicts LRU item if over capacity. O(1) */
  put(key: K, value: V): void {
    if (this.map.has(key)) {
      this.list.remove(this.map.get(key)!);
    } else if (this.list.size >= this.capacity) {
      // Evict the least-recently-used item (back of the list)
      const evicted = this.list.removeBack();
      if (evicted) this.map.delete(evicted.value.key);
    }
    const node = this.list.insertFront({ key, value });
    this.map.set(key, node);
  }

  /** Cache hit rate — useful for tuning cache capacity. */
  getHitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }
}


// =============================================================================
// SECTION 8: BLOOM FILTER (Probabilistic Set Membership)
// =============================================================================
//
// THEORY:
//   A Bloom Filter answers the question "Have I seen this item before?"
//   with guaranteed NO false negatives but a tunable false positive rate.
//
//   Structure: a bit array of M bits, all initially 0.
//   Insert: run the item through K independent hash functions. Set bits at
//           each of the K resulting indices to 1.
//   Query: run through K hash functions. If ALL K bits are 1 → "possibly seen".
//          If ANY bit is 0 → "definitely not seen".
//
//   False positives happen when K bits happen to all be set by previous
//   different items. False negatives are impossible by construction.
//
// IN VOLTAGG:
//   Used to quickly check whether a tick's timestamp has already been
//   processed (de-duplication). Rather than storing all past timestamps
//   in a Set (O(N) space), the Bloom Filter uses a fixed O(M/8) bytes
//   regardless of how many ticks arrive.
//
// COMPLEXITY:
//   insert() → O(k) — k hash computations
//   query()  → O(k)
//   Space    → O(M) bits — fixed, independent of number of items
//
// =============================================================================

export class BloomFilter {
  private bitArray: Uint8Array;
  private size: number;    // M: number of bits
  private hashCount: number; // K: number of hash functions

  constructor(size: number = 1024, hashCount: number = 4) {
    this.size = size;
    this.hashCount = hashCount;
    this.bitArray = new Uint8Array(Math.ceil(size / 8));
  }

  /** Add an item to the filter. O(k) */
  add(item: string): void {
    for (let i = 0; i < this.hashCount; i++) {
      const idx = this._hash(item, i) % this.size;
      this.bitArray[Math.floor(idx / 8)] |= (1 << (idx % 8));
    }
  }

  /**
   * Check if an item might be in the set.
   * Returns true → "possibly yes" (may be a false positive)
   * Returns false → "definitely no" (guaranteed correct)
   * O(k)
   */
  mightContain(item: string): boolean {
    for (let i = 0; i < this.hashCount; i++) {
      const idx = this._hash(item, i) % this.size;
      if (!(this.bitArray[Math.floor(idx / 8)] & (1 << (idx % 8)))) {
        return false; // This bit is 0 → definitely not in set
      }
    }
    return true;
  }

  /** djb2 hash with a seed offset for k independent hash functions. */
  private _hash(str: string, seed: number): number {
    let hash = 5381 + seed * 31;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash; // Force 32-bit integer
    }
    return Math.abs(hash);
  }
}


// =============================================================================
// SECTION 9: EXPONENTIAL MOVING AVERAGE (EMA)
// =============================================================================
//
// THEORY:
//   An Exponential Moving Average is a first-order IIR (Infinite Impulse
//   Response) low-pass filter that applies exponentially decreasing weights
//   to older observations:
//
//       EMA(t) = α × price(t) + (1 - α) × EMA(t-1)
//
//   where α = 2 / (period + 1) is the smoothing factor (0 < α < 1).
//
//   Unlike a Simple Moving Average (SMA) which requires storing N prices and
//   recomputing their mean, the EMA requires storing ONLY the previous EMA
//   value — O(1) space and O(1) per update.
//
// WHY EMA OVER SMA?
//   - O(1) space vs O(N) for SMA.
//   - Reacts faster to recent price changes (higher weight on recent data).
//   - In HFT, signal latency matters. EMA's bias toward recent ticks means
//     it responds to momentum shifts faster than an SMA of the same period.
//
// IN VOLTAGG:
//   EMA is used to smooth the raw volatility σ values coming out of the
//   TemporalBuckets, reducing noise while preserving trend direction.
//
// COMPLEXITY:
//   update() → O(1)
//   Space    → O(1) — only one float stored regardless of tick history
//
// =============================================================================

export class ExponentialMovingAverage {
  private alpha: number;     // Smoothing factor: 2 / (period + 1)
  private ema: number | null = null;  // null until first data point
  private period: number;
  private tickCount: number = 0;

  constructor(period: number = 14) {
    this.period = period;
    this.alpha = 2 / (period + 1);
  }

  /**
   * Feed a new value and update the EMA.
   * For the first `period` values, uses a Simple Moving Average as the seed.
   * After that, applies the EMA formula. O(1)
   */
  update(value: number): number {
    this.tickCount++;
    if (this.ema === null) {
      this.ema = value; // Seed with first value
    } else {
      this.ema = this.alpha * value + (1 - this.alpha) * this.ema;
    }
    return this.ema;
  }

  /** Current EMA value. Null if no data has been fed yet. */
  getValue(): number | null {
    return this.ema;
  }

  /** Reset EMA state (e.g. on symbol switch). */
  reset(): void {
    this.ema = null;
    this.tickCount = 0;
  }

  getPeriod(): number { return this.period; }
  getAlpha(): number { return this.alpha; }
  getTickCount(): number { return this.tickCount; }
}


// =============================================================================
// SECTION 10: UNIFIED COMPLEXITY REFERENCE TABLE
// =============================================================================
//
//  ┌────────────────────────────────┬──────────────┬──────────────┬──────────┐
//  │ Structure                      │ Insert       │ Lookup       │ Space    │
//  ├────────────────────────────────┼──────────────┼──────────────┼──────────┤
//  │ RingBuffer                     │ O(1)         │ O(1)         │ O(K)     │
//  │ TemporalBucket                 │ O(1)         │ O(1)         │ O(1)     │
//  │ LockFreeTemporalAggregator     │ O(1) avg     │ O(1) avg     │ O(S×K)   │
//  │ MinHeap / MaxHeap              │ O(log N)     │ O(1) peek    │ O(N)     │
//  │ OrderBook                      │ O(log N)     │ O(1) spread  │ O(N)     │
//  │ DoublyLinkedList               │ O(1) front   │ O(N) search  │ O(N)     │
//  │ LRUCache                       │ O(1)         │ O(1)         │ O(cap)   │
//  │ BloomFilter                    │ O(k)         │ O(k)         │ O(M)     │
//  │ ExponentialMovingAverage       │ O(1)         │ O(1)         │ O(1)     │
//  └────────────────────────────────┴──────────────┴──────────────┴──────────┘
//
//  K   = RingBuffer capacity
//  S   = number of tracked symbols
//  N   = number of elements
//  M   = Bloom Filter bit array size
//  k   = number of Bloom Filter hash functions
//  cap = LRU Cache capacity
//
// =============================================================================
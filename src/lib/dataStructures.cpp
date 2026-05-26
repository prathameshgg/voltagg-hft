#include <iostream>
#include <vector>
#include <unordered_map>
#include <string>
#include <cmath>
#include <chrono>

using namespace std;

// ==========================================
// RING BUFFER
// ==========================================
template <typename T>
class RingBuffer {
private:
    vector<T> buffer;
    int head;
    int tail;
    int capacity;
    int count;

public:
    RingBuffer(int size = 1024) {
        capacity = size;
        buffer.resize(size);
        head = 0;
        tail = 0;
        count = 0;
    }

    void push(T item) {
        buffer[head] = item;
        head = (head + 1) % capacity;
        if (count < capacity) {
            count++;
        } else {
            tail = (tail + 1) % capacity;
        }
    }

    vector<T> getRecent(int n) {
        int clamped = min(n, count);
        vector<T> result;
        for (int i = clamped - 1; i >= 0; i--) {
            int idx = (head - 1 - i + capacity) % capacity;
            result.push_back(buffer[idx]);
        }
        return result;
    }
};

// ==========================================
// TEMPORAL BUCKET
// ==========================================
class TemporalBucket {
public:
    int count = 0;
    double sum = 0.0;
    double sumSq = 0.0;
    long long startTs;
    long long endTs = 0;
    bool isSealed = false;

    // Welford's algorithm trackers
    double wMean = 0.0;
    double wM2 = 0.0;

    TemporalBucket(long long startTs) : startTs(startTs) {}

    void update(double price) {
        if (isSealed) return;
        
        count++;
        sum += price;
        sumSq += price * price;

        double delta = price - wMean;
        wMean += delta / count;
        double delta2 = price - wMean;
        wM2 += delta * delta2;
    }

    double getVariance() {
        if (count < 2) return 0.0;
        double mean = sum / count;
        return max(0.0, (sumSq / count) - (mean * mean));
    }

    double getWelfordVariance() {
        if (count < 2) return 0.0;
        return wM2 / (count - 1);
    }

    void seal(long long end) {
        endTs = end;
        isSealed = true;
    }
};

// ==========================================
// LOCK-FREE TEMPORAL AGGREGATOR
// ==========================================
struct TickData {
    double price;
    long long ts;
};

struct AssetData {
    RingBuffer<TickData> ringBuffer = RingBuffer<TickData>(512);
    unordered_map<long long, TemporalBucket*> buckets;
    long long activeBucketKey = -1;
};

class LockFreeTemporalAggregator {
private:
    unordered_map<string, AssetData*> stocks;
    long long bucketDurationMs;

public:
    LockFreeTemporalAggregator(long long durationMs = 10000) {
        bucketDurationMs = durationMs;
    }

    void registerSymbol(string symbol) {
        if (stocks.find(symbol) == stocks.end()) {
            stocks[symbol] = new AssetData();
        }
    }

    void onTick(string symbol, TickData tick) {
        registerSymbol(symbol);
        AssetData* data = stocks[symbol];

        data->ringBuffer.push(tick);

        long long bucketKey = tick.ts / bucketDurationMs;
        if (data->buckets.find(bucketKey) == data->buckets.end()) {
            if (data->activeBucketKey != -1 && data->buckets.find(data->activeBucketKey) != data->buckets.end()) {
                data->buckets[data->activeBucketKey]->seal(tick.ts);
            }
            data->buckets[bucketKey] = new TemporalBucket(tick.ts);
            data->activeBucketKey = bucketKey;
        }
        data->buckets[bucketKey]->update(tick.price);
    }

    double getVolatility(string symbol) {
        if (stocks.find(symbol) == stocks.end()) return 0.0;
        AssetData* data = stocks[symbol];

        double totalVar = 0.0;
        int count = 0;
        
        for (auto const& [key, bucket] : data->buckets) {
            totalVar += bucket->getWelfordVariance();
            count++;
        }

        if (count == 0) return 0.001;
        return sqrt(totalVar / count);
    }
};

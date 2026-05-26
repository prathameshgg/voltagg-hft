#include <iostream>
#include <vector>
#include <string>
#include <unordered_map>
#include <random>
#include <chrono>
#include <thread>
#include "dataStructures.cpp" // Includes the aggregator logic

using namespace std;

// ==========================================
// MOCK ZUSTAND STORE & SIMULATION ENGINE
// ==========================================

struct StockData {
    double price;
    double change;
    double pct;
    long long lastUpdate;
};

struct SniperLog {
    string id;
    string time;
    string sym;
    double price;
    double vol;
    string side;
    double latency;
};

class AppStore {
public:
    vector<string> symbolsToTrack = {
        "AAPL", "MSFT", "NVDA", "AMZN", 
        "GOOGL", "META", "TSLA", "BRK.B",
        "LLY", "AVGO", "JPM", "V",
        "WMT", "UNH", "MA", "JNJ"
    };

    unordered_map<string, double> initialPrices = {
        {"AAPL", 277.00}, {"MSFT", 416.50}, {"NVDA", 197.00}, {"AMZN", 269.50},
        {"GOOGL", 386.00}, {"META", 609.50}, {"TSLA", 392.50}, {"BRK.B", 474.00},
        {"LLY", 960.00}, {"AVGO", 416.00}, {"JPM", 310.00}, {"V", 328.00},
        {"WMT", 131.00}, {"UNH", 368.00}, {"MA", 505.00}, {"JNJ", 226.00}
    };

    unordered_map<string, StockData> stockMap;
    LockFreeTemporalAggregator aggregator;
    vector<SniperLog> sniperLogs;

    AppStore() {
        long long ts = chrono::duration_cast<chrono::milliseconds>(
            chrono::system_clock::now().time_since_epoch()
        ).count();

        for (const string& sym : symbolsToTrack) {
            stockMap[sym] = {initialPrices[sym], 0.0, 0.0, ts};
        }
    }

    void runSimulation() {
        cout << "Starting High-Frequency Simulation Engine..." << endl;
        
        random_device rd;
        mt19937 gen(rd());
        uniform_real_distribution<> volDist(0.2, 1.0);
        uniform_int_distribution<> dirDist(0, 1);
        uniform_real_distribution<> latDist(0.1, 0.5);
        uniform_real_distribution<> chanceDist(0.0, 1.0);

        while (true) {
            long long ts = chrono::duration_cast<chrono::milliseconds>(
                chrono::system_clock::now().time_since_epoch()
            ).count();

            for (const string& symbol : symbolsToTrack) {
                double volatility = volDist(gen);
                int direction = dirDist(gen) == 1 ? 1 : -1;
                double delta = direction * volatility * (stockMap[symbol].price * 0.0005);
                
                double newPrice = stockMap[symbol].price + delta;
                double newChange = stockMap[symbol].change + delta;
                double newPct = (newChange / initialPrices[symbol]) * 100.0;
                
                // Update mathematical aggregator
                aggregator.onTick(symbol, {newPrice, ts});
                
                // Update local state map
                stockMap[symbol] = {newPrice, newChange, newPct, ts};

                // Trigger Sniper Log execution (8% chance per tick)
                if (chanceDist(gen) < 0.08) {
                    double volScore = aggregator.getVolatility(symbol);
                    SniperLog log = {
                        to_string(ts) + symbol, // fake ID
                        "EXECUTION_TIME",       // fake string time
                        symbol,
                        newPrice,
                        volScore,
                        newPct > 0 ? "LONG" : "SHORT",
                        latDist(gen)
                    };
                    
                    sniperLogs.insert(sniperLogs.begin(), log);
                    if (sniperLogs.size() > 50) sniperLogs.pop_back();

                    cout << "[SNIPER] " << log.side << " " << symbol 
                         << " @ $" << newPrice << " (Vol: " << volScore << ")" << endl;
                }
            }

            // Simulate the 800ms batching interval
            this_thread::sleep_for(chrono::milliseconds(800));
        }
    }
};

int main() {
    AppStore store;
    store.runSimulation();
    return 0;
}

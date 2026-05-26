#include <iostream>
#include <vector>
#include <functional>

using namespace std;

// ==========================================
// BINARY HEAP (Base Class)
// ==========================================
template <typename T>
class BinaryHeap {
protected:
    vector<T> heap;
    function<int(T, T)> comparator;

    void _bubbleUp(int i) {
        while (i > 0) {
            int parent = (i - 1) / 2;
            if (comparator(heap[i], heap[parent]) < 0) {
                swap(heap[i], heap[parent]);
                i = parent;
            } else {
                break;
            }
        }
    }

    void _siftDown(int i) {
        int n = heap.size();
        while (true) {
            int target = i;
            int left = 2 * i + 1;
            int right = 2 * i + 2;

            if (left < n && comparator(heap[left], heap[target]) < 0) {
                target = left;
            }
            if (right < n && comparator(heap[right], heap[target]) < 0) {
                target = right;
            }
            if (target == i) break;

            swap(heap[i], heap[target]);
            i = target;
        }
    }

public:
    BinaryHeap(function<int(T, T)> comp) : comparator(comp) {}

    void insert(T item) {
        heap.push_back(item);
        _bubbleUp(heap.size() - 1);
    }

    bool peek(T& outItem) {
        if (heap.empty()) return false;
        outItem = heap[0];
        return true;
    }

    bool extract(T& outItem) {
        if (heap.empty()) return false;
        outItem = heap[0];
        
        if (heap.size() == 1) {
            heap.pop_back();
        } else {
            heap[0] = heap.back();
            heap.pop_back();
            _siftDown(0);
        }
        return true;
    }

    int size() {
        return heap.size();
    }

    bool isEmpty() {
        return heap.empty();
    }
};

// ==========================================
// MIN HEAP
// ==========================================
class MinHeap : public BinaryHeap<double> {
public:
    MinHeap() : BinaryHeap<double>([](double a, double b) { return (a < b) ? -1 : (a > b ? 1 : 0); }) {}
};

// ==========================================
// MAX HEAP
// ==========================================
class MaxHeap : public BinaryHeap<double> {
public:
    MaxHeap() : BinaryHeap<double>([](double a, double b) { return (a > b) ? -1 : (a < b ? 1 : 0); }) {}
};

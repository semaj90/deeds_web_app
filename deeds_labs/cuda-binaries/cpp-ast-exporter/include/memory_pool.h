#pragma once

#include <torch/torch.h>
#include <memory>
#include <vector>
#include <tuple>
#include <mutex>

// Phase SIMDJSON: Advanced Memory Pool Header
// Optimized memory allocation and management for GPU workloads

class MemoryPool {
public:
    MemoryPool(size_t block_size = 64 * 1024 * 1024, size_t max_pool_size = 4 * 1024 * 1024 * 1024);
    ~MemoryPool();

    // Memory operations
    void* allocate(size_t size);
    void deallocate(void* ptr);

    // Statistics and info
    struct PoolStats {
        size_t allocations;
        size_t deallocations;
        size_t hits;  // Reused blocks
        size_t misses;  // New allocations
        size_t fragmentation;  // Wasted space
    };

    PoolStats get_stats() const;
    std::tuple<size_t, size_t, size_t> get_memory_info() const;  // current, peak, blocks

    // Maintenance operations
    void defragment();
    void preallocate_blocks(int num_blocks);
    void clear_unused_blocks();

private:
    struct MemoryBlock {
        void* ptr;
        size_t size;
        bool in_use;
        std::chrono::steady_clock::time_point last_used;

        MemoryBlock(void* p, size_t s);
    };

    std::vector<MemoryBlock> blocks_;
    mutable std::mutex pool_mutex_;
    size_t total_allocated_;
    size_t peak_usage_;
    const size_t block_size_;
    const size_t max_pool_size_;
    PoolStats stats_;

    // Helper functions
    size_t next_power_of_two(size_t size);
    void evict_lru_blocks(size_t needed_size);
};

// CUDA allocator that uses memory pool
class PooledCudaAllocator : public torch::Allocator {
private:
    MemoryPool& pool_;

public:
    PooledCudaAllocator(MemoryPool& pool);
    torch::DataPtr allocate(size_t size) const override;
    torch::DeleterFnPtr raw_deleter() const override;
};

// Factory functions
std::unique_ptr<MemoryPool> create_memory_pool(size_t block_size = 64 * 1024 * 1024,
                                              size_t max_pool_size = 4 * 1024 * 1024 * 1024);

// Utility functions
void setup_pooled_allocator(MemoryPool& pool);
torch::Tensor benchmark_memory_pool(MemoryPool& pool, int iterations = 1000);
void display_memory_pool_stats(MemoryPool& pool);
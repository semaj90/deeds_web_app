#pragma once

#include <atomic>
#include <cassert>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <mutex>
#include <new>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

namespace atlas::memory {

/**
 * REG-01: Canonical Descriptor Contract (PROPOSAL_ONLY for experiments)
 */
enum class RepresentationType : std::uint8_t {
    Ast = 0,
    Semantic768,
    Latent128,
    Latent64,
    NesLut,
    Lod128,
    SomBmu
};

enum class MemoryLocation : std::uint8_t {
    CpuSlab = 0,
    ArrowIpc,
    Valkey,
    Postgres,
    Qdrant,
    Cuda
};

enum class EntryState : std::uint8_t {
    Resident = 0,
    Loading,
    Evicting,
    Stale
};

struct AtlasMemoryEntryV1 {
    std::string canonical_id;
    std::string packet_key;
    std::string source_revision;       // sha256:...
    std::string workspace_revision;    // sha256:...
    std::string representation_revision;
    std::string artifact_digest;       // sha256:...
    RepresentationType representation{RepresentationType::Lod128};
    MemoryLocation location{MemoryLocation::CpuSlab};
    std::size_t byte_length{0};
    std::size_t alignment{64};
    std::string owner_id;
    std::uint64_t lease_epoch{0};
    std::uint64_t expires_at{0};
    EntryState state{EntryState::Resident};
    std::string checksum;              // sha256:...
    const void* resident_ptr{nullptr}; // Borrowed pointer into slab arena
};

struct AtlasWorkItem {
    std::string request_id;
    enum class Operation : std::uint8_t {
        Load = 0,
        Rank,
        Project,
        Evict
    } operation{Operation::Rank};
    std::string memory_entry_id;
    std::string expected_revision;
    std::uint32_t priority{0};
    std::uint64_t deadline_ms{0};
    std::size_t estimated_bytes{0};
};

/**
 * REG-02: Bounded 64-byte Cacheline-Aligned CPU Slab Allocator
 * Manages contiguous chunks for 128-byte LOD texture blocks and sign bitsets.
 */
class AlignedSlabArena {
public:
    explicit AlignedSlabArena(std::size_t capacity_bytes, std::size_t block_alignment = 64)
        : capacity_(capacity_bytes), alignment_(block_alignment), allocated_bytes_(0), active_leases_(0) {
        // Enforce power-of-two alignment, at least 64 bytes (L1/L2 cacheline size)
        if (alignment_ < 64) alignment_ = 64;
#if defined(_MSC_VER)
        buffer_ = static_cast<std::uint8_t*>(_aligned_malloc(capacity_, alignment_));
#else
        void* ptr = nullptr;
        if (posix_memalign(&ptr, alignment_, capacity_) != 0) {
            ptr = nullptr;
        }
        buffer_ = static_cast<std::uint8_t*>(ptr);
#endif
        if (!buffer_) {
            throw std::bad_alloc();
        }
    }

    ~AlignedSlabArena() noexcept {
        if (buffer_) {
#if defined(_MSC_VER)
            _aligned_free(buffer_);
#else
            std::free(buffer_);
#endif
            buffer_ = nullptr;
        }
    }

    AlignedSlabArena(const AlignedSlabArena&) = delete;
    AlignedSlabArena& operator=(const AlignedSlabArena&) = delete;

    [[nodiscard]] std::uint8_t* allocate(std::size_t bytes) {
        std::lock_guard<std::mutex> lock(mutex_);
        // Align request up to block_alignment_
        const std::size_t padded = (bytes + alignment_ - 1) & ~(alignment_ - 1);
        if (allocated_bytes_ + padded > capacity_) {
            return nullptr; // Capacity exceeded; caller must evict or reject
        }
        std::uint8_t* p = buffer_ + allocated_bytes_;
        allocated_bytes_ += padded;
        active_leases_.fetch_add(1, std::memory_order_relaxed);
        return p;
    }

    void reset() noexcept {
        std::lock_guard<std::mutex> lock(mutex_);
        allocated_bytes_ = 0;
        active_leases_.store(0, std::memory_order_relaxed);
    }

    [[nodiscard]] std::size_t capacity() const noexcept { return capacity_; }
    [[nodiscard]] std::size_t allocated() const noexcept { return allocated_bytes_; }
    [[nodiscard]] std::size_t active_leases() const noexcept { return active_leases_.load(std::memory_order_relaxed); }
    [[nodiscard]] std::size_t alignment() const noexcept { return alignment_; }

private:
    std::size_t capacity_;
    std::size_t alignment_;
    std::size_t allocated_bytes_;
    std::atomic<std::size_t> active_leases_;
    std::uint8_t* buffer_{nullptr};
    std::mutex mutex_;
};

/**
 * Memory Registry Lease Manager
 */
class MemoryRegistry {
public:
    explicit MemoryRegistry(std::size_t slab_capacity_bytes = 16 * 1024 * 1024)
        : arena_(slab_capacity_bytes, 64) {}

    bool register_entry(AtlasMemoryEntryV1 entry) {
        std::lock_guard<std::mutex> lock(mutex_);
        // Validate required lineage fields
        if (entry.workspace_revision.empty() || entry.source_revision.empty()) {
            return false; // Refuse admission without source & workspace revisions
        }
        const std::string id = entry.canonical_id;
        entries_[id] = std::move(entry);
        return true;
    }

    [[nodiscard]] std::optional<AtlasMemoryEntryV1> get_entry(const std::string& id) const {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = entries_.find(id);
        if (it != entries_.end()) {
            return it->second;
        }
        return std::nullopt;
    }

    AlignedSlabArena& arena() noexcept { return arena_; }

    [[nodiscard]] std::size_t entry_count() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return entries_.size();
    }

private:
    AlignedSlabArena arena_;
    std::unordered_map<std::string, AtlasMemoryEntryV1> entries_;
    mutable std::mutex mutex_;
};

} // namespace atlas::memory

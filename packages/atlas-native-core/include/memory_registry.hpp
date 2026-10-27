#pragma once

#include <atomic>
#include <algorithm>
#include <cassert>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <map>
#include <memory>
#include <mutex>
#include <new>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#if defined(_MSC_VER)
#include <malloc.h>
#endif

#include "sha256.hpp"

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
    Stale,
    Evicted
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
    EntryState state{EntryState::Evicted};
    std::string checksum;              // sha256:...
    const void* resident_ptr{nullptr};
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
        : capacity_(capacity_bytes), alignment_(block_alignment < 64 ? 64 : block_alignment), allocated_bytes_(0), active_leases_(0) {
        if (capacity_ == 0 || (alignment_ & (alignment_ - 1)) != 0) {
            throw std::invalid_argument("SLAB_CAPACITY_OR_ALIGNMENT_INVALID");
        }
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
        free_blocks_.emplace(0, capacity_);
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
        if (bytes == 0 || bytes > std::numeric_limits<std::size_t>::max() - (alignment_ - 1)) return nullptr;
        std::lock_guard<std::mutex> lock(mutex_);
        const std::size_t padded = (bytes + alignment_ - 1) & ~(alignment_ - 1);
        for (auto block = free_blocks_.begin(); block != free_blocks_.end(); ++block) {
            if (block->second < padded) continue;
            const std::size_t offset = block->first;
            const std::size_t available = block->second;
            free_blocks_.erase(block);
            if (available > padded) free_blocks_.emplace(offset + padded, available - padded);
            allocations_.emplace(offset, padded);
            allocated_bytes_ += padded;
            ++active_leases_;
            return buffer_ + offset;
        }
        return nullptr;
    }

    bool deallocate(std::uint8_t* pointer) noexcept {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!pointer) return false;
        const auto base_address = reinterpret_cast<std::uintptr_t>(buffer_);
        const auto pointer_address = reinterpret_cast<std::uintptr_t>(pointer);
        if (pointer_address < base_address || pointer_address - base_address >= capacity_) return false;
        const std::size_t offset = static_cast<std::size_t>(pointer_address - base_address);
        const auto allocation = allocations_.find(offset);
        if (allocation == allocations_.end()) return false;
        std::size_t start = allocation->first;
        std::size_t length = allocation->second;
        allocations_.erase(allocation);
        allocated_bytes_ -= length;
        --active_leases_;

        auto next = free_blocks_.lower_bound(start);
        if (next != free_blocks_.end() && start + length == next->first) {
            length += next->second;
            free_blocks_.erase(next);
        }
        auto previous = free_blocks_.lower_bound(start);
        if (previous != free_blocks_.begin()) {
            --previous;
            if (previous->first + previous->second == start) {
                start = previous->first;
                length += previous->second;
                free_blocks_.erase(previous);
            }
        }
        free_blocks_.emplace(start, length);
        return true;
    }

    bool reset() noexcept {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!allocations_.empty()) return false;
        allocated_bytes_ = 0;
        active_leases_ = 0;
        free_blocks_.clear();
        free_blocks_.emplace(0, capacity_);
        return true;
    }

    [[nodiscard]] std::size_t capacity() const noexcept { return capacity_; }
    [[nodiscard]] std::size_t allocated() const noexcept { std::lock_guard<std::mutex> lock(mutex_); return allocated_bytes_; }
    [[nodiscard]] std::size_t active_leases() const noexcept { std::lock_guard<std::mutex> lock(mutex_); return active_leases_; }
    [[nodiscard]] std::size_t alignment() const noexcept { return alignment_; }

private:
    std::size_t capacity_;
    std::size_t alignment_;
    std::size_t allocated_bytes_;
    std::size_t active_leases_;
    std::uint8_t* buffer_{nullptr};
    std::map<std::size_t, std::size_t> free_blocks_;
    std::map<std::size_t, std::size_t> allocations_;
    mutable std::mutex mutex_;
};

class ResidentArtifactBuffer {
public:
    ResidentArtifactBuffer(std::shared_ptr<AlignedSlabArena> arena, std::uint8_t* data, std::size_t size)
        : arena_(std::move(arena)), data_(data), size_(size) {}
    ~ResidentArtifactBuffer() { if (data_) arena_->deallocate(data_); }
    ResidentArtifactBuffer(const ResidentArtifactBuffer&) = delete;
    ResidentArtifactBuffer& operator=(const ResidentArtifactBuffer&) = delete;
    [[nodiscard]] const std::uint8_t* data() const noexcept { return data_; }
    [[nodiscard]] std::size_t size() const noexcept { return size_; }

private:
    std::shared_ptr<AlignedSlabArena> arena_;
    std::uint8_t* data_;
    std::size_t size_;
};

class MemoryRegistry {
public:
    explicit MemoryRegistry(std::size_t slab_capacity_bytes = 16 * 1024 * 1024)
        : arena_(std::make_shared<AlignedSlabArena>(slab_capacity_bytes, 64)), capacity_bytes_(slab_capacity_bytes) {}

    class Lease {
    public:
        Lease(AtlasMemoryEntryV1 descriptor, std::shared_ptr<const ResidentArtifactBuffer> buffer)
            : descriptor_(std::move(descriptor)), buffer_(std::move(buffer)) {}
        [[nodiscard]] const std::uint8_t* data() const noexcept { return buffer_ ? buffer_->data() : nullptr; }
        [[nodiscard]] std::size_t size() const noexcept { return buffer_ ? buffer_->size() : 0; }
        [[nodiscard]] const AtlasMemoryEntryV1& descriptor() const noexcept { return descriptor_; }

    private:
        AtlasMemoryEntryV1 descriptor_;
        std::shared_ptr<const ResidentArtifactBuffer> buffer_;
    };

    bool register_entry(AtlasMemoryEntryV1 entry) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (entry.canonical_id.empty() || entry.packet_key.empty() || entry.representation_revision.empty() ||
            entry.byte_length == 0 || entry.alignment != 64 || !isSha256Reference(entry.source_revision) ||
            !isSha256Reference(entry.workspace_revision) || !isSha256Reference(entry.artifact_digest) ||
            records_.contains(entry.canonical_id)) return false;
        entry.state = EntryState::Evicted;
        entry.location = MemoryLocation::CpuSlab;
        entry.resident_ptr = nullptr;
        entry.checksum = entry.artifact_digest;
        records_.emplace(entry.canonical_id, Record{std::move(entry), {}});
        return true;
    }

    [[nodiscard]] std::optional<AtlasMemoryEntryV1> get_entry(const std::string& id) const {
        std::lock_guard<std::mutex> lock(mutex_);
        const auto it = records_.find(id);
        if (it == records_.end()) return std::nullopt;
        auto descriptor = it->second.descriptor;
        descriptor.resident_ptr = nullptr;
        return descriptor;
    }

    bool load_artifact(const std::string& id, const std::uint8_t* bytes, std::size_t size,
        const std::string& expected_source_revision, const std::string& expected_workspace_revision) {
        if (!bytes || size == 0) return false;
        const std::string digest = "sha256:" + atlas::native::sha256_hex(bytes, size);
        std::lock_guard<std::mutex> lock(mutex_);
        const auto it = records_.find(id);
        if (it == records_.end()) return false;
        auto& record = it->second;
        auto& entry = record.descriptor;
        if (entry.state != EntryState::Evicted || entry.source_revision != expected_source_revision ||
            entry.workspace_revision != expected_workspace_revision || entry.byte_length != size || entry.artifact_digest != digest ||
            size > capacity_bytes_ - resident_bytes_ || entry.lease_epoch == std::numeric_limits<std::uint64_t>::max()) return false;
        entry.state = EntryState::Loading;
        auto* destination = arena_->allocate(size);
        if (!destination) {
            entry.state = EntryState::Evicted;
            return false;
        }
        std::memcpy(destination, bytes, size);
        try {
            record.buffer = std::make_shared<ResidentArtifactBuffer>(arena_, destination, size);
        } catch (...) {
            arena_->deallocate(destination);
            entry.state = EntryState::Evicted;
            throw;
        }
        ++entry.lease_epoch;
        entry.state = EntryState::Resident;
        resident_bytes_ += size;
        return true;
    }

    [[nodiscard]] std::optional<Lease> acquire(const std::string& id, const std::string& expected_source_revision,
        const std::string& expected_workspace_revision, std::uint64_t expected_lease_epoch) const {
        std::lock_guard<std::mutex> lock(mutex_);
        const auto it = records_.find(id);
        if (it == records_.end()) return std::nullopt;
        const auto& record = it->second;
        if (record.descriptor.state != EntryState::Resident || !record.buffer ||
            record.descriptor.source_revision != expected_source_revision ||
            record.descriptor.workspace_revision != expected_workspace_revision ||
            record.descriptor.lease_epoch != expected_lease_epoch) return std::nullopt;
        auto descriptor = record.descriptor;
        descriptor.resident_ptr = nullptr;
        return Lease(std::move(descriptor), record.buffer);
    }

    bool evict(const std::string& id, const std::string& expected_source_revision,
        const std::string& expected_workspace_revision, std::uint64_t expected_lease_epoch) {
        std::lock_guard<std::mutex> lock(mutex_);
        const auto it = records_.find(id);
        if (it == records_.end()) return false;
        auto& record = it->second;
        auto& entry = record.descriptor;
        if (entry.state != EntryState::Resident || !record.buffer || record.buffer.use_count() != 1 ||
            entry.source_revision != expected_source_revision || entry.workspace_revision != expected_workspace_revision ||
            entry.lease_epoch != expected_lease_epoch || entry.lease_epoch == std::numeric_limits<std::uint64_t>::max()) return false;
        entry.state = EntryState::Evicting;
        resident_bytes_ -= entry.byte_length;
        record.buffer.reset();
        entry.resident_ptr = nullptr;
        ++entry.lease_epoch;
        entry.state = EntryState::Evicted;
        return true;
    }

    [[nodiscard]] std::size_t entry_count() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return records_.size();
    }

    [[nodiscard]] std::size_t resident_bytes() const { std::lock_guard<std::mutex> lock(mutex_); return resident_bytes_; }
    [[nodiscard]] std::size_t capacity_bytes() const noexcept { return capacity_bytes_; }
    [[nodiscard]] AlignedSlabArena& arena() noexcept { return *arena_; }

private:
    struct Record {
        AtlasMemoryEntryV1 descriptor;
        std::shared_ptr<ResidentArtifactBuffer> buffer;
    };

    static bool isSha256Reference(const std::string& value) noexcept {
        if (value.size() != 71 || value.compare(0, 7, "sha256:") != 0) return false;
        return std::all_of(value.begin() + 7, value.end(), [](unsigned char ch) {
            return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f');
        });
    }

    std::shared_ptr<AlignedSlabArena> arena_;
    const std::size_t capacity_bytes_;
    std::size_t resident_bytes_{0};
    std::unordered_map<std::string, Record> records_;
    mutable std::mutex mutex_;
};

} // namespace atlas::memory

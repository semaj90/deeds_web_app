#pragma once
/**
 * @file radix_sort.hpp
 * @brief Deterministic 8-bit LSD Radix Sort over composite 64-bit keys:
 *        [kmeans_cluster_id : 16 bits][som_bmu_id : 16 bits][candidate_ordinal : 32 bits]
 *
 * Ensures HNSW / cuTile memory pages are physically contiguous by KMeans cluster
 * and 20x20 SOM cell (0..399) before DMA transfer to GPU L2/shared memory.
 */

#include <array>
#include <cstdint>
#include <stdexcept>
#include <vector>

namespace atlas::native {

struct SomTileSortEntry {
    std::uint64_t composite_key{0};
    std::uint16_t kmeans_cluster_id{0};
    std::uint16_t som_bmu_id{0};        // 0..399 for 20x20 SOM grid (y * 20 + x)
    std::uint32_t candidate_ordinal{0}; // Canonical CandidateOrdinalMapV1 index
    std::uint32_t source_index{0};       // Local input index; never emitted as candidate identity
};

constexpr std::uint64_t pack_som_radix_key(
    std::uint16_t kmeans_cluster_id,
    std::uint16_t som_bmu_id,
    std::uint32_t candidate_ordinal
) noexcept {
    return (static_cast<std::uint64_t>(kmeans_cluster_id) << 48ULL) |
           (static_cast<std::uint64_t>(som_bmu_id) << 32ULL) |
           static_cast<std::uint64_t>(candidate_ordinal);
}

/**
 * 8-pass (8-bit LSD) deterministic radix sort over SomTileSortEntry.
 * Runs in O(8 * N) with zero heap allocations beyond the single ping-pong buffer.
 */
inline void radix_sort_som_tiles(std::vector<SomTileSortEntry>& entries) {
    for (const auto& entry : entries) {
        if (entry.som_bmu_id >= 400) {
            throw std::invalid_argument("SOM_BMU_ID_OUT_OF_RANGE");
        }
        if (entry.composite_key != pack_som_radix_key(
                entry.kmeans_cluster_id, entry.som_bmu_id, entry.candidate_ordinal)) {
            throw std::invalid_argument("SOM_RADIX_COMPOSITE_KEY_MISMATCH");
        }
    }
    const std::size_t n = entries.size();
    if (n <= 1) return;

    std::vector<SomTileSortEntry> scratch(n);
    SomTileSortEntry* src = entries.data();
    SomTileSortEntry* dst = scratch.data();

    for (unsigned pass = 0; pass < 8; ++pass) {
        const unsigned shift = pass * 8;
        std::array<std::size_t, 256> count{};
        for (std::size_t i = 0; i < n; ++i) {
            const std::uint8_t bucket = static_cast<std::uint8_t>((src[i].composite_key >> shift) & 0xFFULL);
            ++count[bucket];
        }

        std::array<std::size_t, 256> offset{};
        std::size_t running = 0;
        for (std::size_t b = 0; b < 256; ++b) {
            offset[b] = running;
            running += count[b];
        }

        for (std::size_t i = 0; i < n; ++i) {
            const std::uint8_t bucket = static_cast<std::uint8_t>((src[i].composite_key >> shift) & 0xFFULL);
            dst[offset[bucket]++] = src[i];
        }

        SomTileSortEntry* tmp = src;
        src = dst;
        dst = tmp;
    }

    // 8 passes (even) means final sorted order is already back in `entries`.
}

} // namespace atlas::native

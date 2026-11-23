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

constexpr std::size_t MAX_SOM_RADIX_CANDIDATES_V1 = 65536;

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
    if (entries.size() > MAX_SOM_RADIX_CANDIDATES_V1) {
        throw std::invalid_argument("SOM_RADIX_CANDIDATE_LIMIT_EXCEEDED");
    }
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

struct ResidencyRadixKeyEntry {
    std::uint64_t composite_key{0};
    std::uint32_t source_index{0};
};

constexpr std::uint64_t pack_residency_glyph_key_v1(
    std::uint8_t residency_tier,
    std::uint8_t lod,
    std::uint16_t pagerank_quantized,
    std::uint16_t recency,
    std::uint32_t projection_ordinal
) noexcept {
    const std::uint64_t tier = static_cast<std::uint64_t>(residency_tier) & 0xFFULL;
    const std::uint64_t lod_field = static_cast<std::uint64_t>(lod) & 0xFFULL;
    const std::uint64_t utility_bucket = static_cast<std::uint64_t>(pagerank_quantized / 257u) & 0xFFULL;
    const std::uint64_t recency_bucket = static_cast<std::uint64_t>(recency / 257u) & 0xFFULL;
    const std::uint64_t ordinal = static_cast<std::uint64_t>(projection_ordinal) & 0xFFFFFFFFULL;
    return (tier << 56ULL) |
           (lod_field << 48ULL) |
           (utility_bucket << 40ULL) |
           (recency_bucket << 32ULL) |
           ordinal;
}

/**
 * Generic 8-pass (8-bit LSD) stable radix sort over uint64 keys.
 * Releases GIL in pybind11/Cython bindings for zero-allocation ping-pong execution.
 */
inline void radix_sort_u64_entries(std::vector<ResidencyRadixKeyEntry>& entries) {
    if (entries.size() > MAX_SOM_RADIX_CANDIDATES_V1) {
        throw std::invalid_argument("RADIX_U64_CANDIDATE_LIMIT_EXCEEDED");
    }
    const std::size_t n = entries.size();
    if (n <= 1) return;

    std::vector<ResidencyRadixKeyEntry> scratch(n);
    ResidencyRadixKeyEntry* src = entries.data();
    ResidencyRadixKeyEntry* dst = scratch.data();

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

        ResidencyRadixKeyEntry* tmp = src;
        src = dst;
        dst = tmp;
    }
}

} // namespace atlas::native

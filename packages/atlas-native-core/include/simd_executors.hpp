#pragma once

#include <bit>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <span>

#if defined(__x86_64__) || defined(_M_X64)
#if defined(__GNUC__) || defined(__clang__)
#include <immintrin.h>
#endif
#endif

namespace atlas::simd {

/**
 * 128-bit Sign Bitset (16 bytes)
 */
struct alignas(16) Bitset128 {
    std::uint64_t lo;
    std::uint64_t hi;
};

// ============================================================================
// REG-03: Scalar Correctness Oracles
// ============================================================================

inline std::uint32_t hamming_distance_128_scalar(const std::uint8_t* a, const std::uint8_t* b) noexcept {
    if (!a || !b) return 128;
    std::uint32_t dist = 0;
    for (std::size_t i = 0; i < 16; ++i) {
        dist += static_cast<std::uint32_t>(std::popcount(static_cast<unsigned>(a[i] ^ b[i])));
    }
    return dist;
}

inline float jaccard_similarity_128_scalar(const std::uint8_t* a, const std::uint8_t* b) noexcept {
    if (!a || !b) return 0.0f;
    std::uint32_t isect = 0;
    std::uint32_t un = 0;
    for (std::size_t i = 0; i < 16; ++i) {
        isect += static_cast<std::uint32_t>(std::popcount(static_cast<unsigned>(a[i] & b[i])));
        un += static_cast<std::uint32_t>(std::popcount(static_cast<unsigned>(a[i] | b[i])));
    }
    return un == 0 ? 1.0f : (static_cast<float>(isect) / static_cast<float>(un));
}

// ============================================================================
// Fast Native 64-bit Word Dispatch
// ============================================================================

inline std::uint32_t hamming_distance_128_fast(const Bitset128& a, const Bitset128& b) noexcept {
    return static_cast<std::uint32_t>(std::popcount(a.lo ^ b.lo) + std::popcount(a.hi ^ b.hi));
}

inline float jaccard_similarity_128_fast(const Bitset128& a, const Bitset128& b) noexcept {
    const std::uint64_t isect_lo = a.lo & b.lo;
    const std::uint64_t isect_hi = a.hi & b.hi;
    const std::uint64_t un_lo = a.lo | b.lo;
    const std::uint64_t un_hi = a.hi | b.hi;

    const std::uint32_t isect = static_cast<std::uint32_t>(std::popcount(isect_lo) + std::popcount(isect_hi));
    const std::uint32_t un = static_cast<std::uint32_t>(std::popcount(un_lo) + std::popcount(un_hi));
    return un == 0 ? 1.0f : (static_cast<float>(isect) / static_cast<float>(un));
}

// ============================================================================
// NES (Non-Euclidean Similarity) Look-Up Table (LUT) Scorer
// ============================================================================

inline float score_nes_lut_scalar(
    const std::uint8_t* packed_2bit,
    const float* lut_table_256,
    std::size_t num_bytes
) noexcept {
    if (!packed_2bit || !lut_table_256 || num_bytes == 0) return 0.0f;
    float sum = 0.0f;
    for (std::size_t i = 0; i < num_bytes; ++i) {
        sum += lut_table_256[packed_2bit[i]];
    }
    return sum;
}

// ============================================================================
// Batch Candidate SIMD Evaluator
// ============================================================================

struct BatchScoringResult {
    std::size_t batch_size{0};
    double duration_microseconds{0.0};
    double candidates_per_second{0.0};
    bool oracle_parity{false};
};

inline BatchScoringResult benchmark_hamming128_batch(
    const Bitset128* query,
    const Bitset128* candidates,
    std::uint32_t* output_distances,
    std::size_t count
) noexcept {
    BatchScoringResult result{};
    result.batch_size = count;
    if (!query || !candidates || !output_distances || count == 0) return result;

    const auto t0 = std::chrono::high_resolution_clock::now();

    for (std::size_t i = 0; i < count; ++i) {
        output_distances[i] = hamming_distance_128_fast(*query, candidates[i]);
    }

    const auto t1 = std::chrono::high_resolution_clock::now();
    result.duration_microseconds = std::chrono::duration<double, std::micro>(t1 - t0).count();
    if (result.duration_microseconds > 0.0) {
        result.candidates_per_second = (static_cast<double>(count) / result.duration_microseconds) * 1e6;
    }

    // Oracle verification on first 64 candidates
    bool match = true;
    for (std::size_t i = 0; i < std::min<std::size_t>(count, 64); ++i) {
        const auto expected = hamming_distance_128_scalar(
            reinterpret_cast<const std::uint8_t*>(query),
            reinterpret_cast<const std::uint8_t*>(&candidates[i])
        );
        if (output_distances[i] != expected) {
            match = false;
            break;
        }
    }
    result.oracle_parity = match;
    return result;
}

} // namespace atlas::simd

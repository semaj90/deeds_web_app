#pragma once

#include <bit>
#include <algorithm>
#include <chrono>
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

inline void hamming_distance_128_batch_scalar(
    const Bitset128& query,
    const Bitset128* candidates,
    std::uint32_t* output,
    std::size_t count
) noexcept {
    for (std::size_t i = 0; i < count; ++i) output[i] = hamming_distance_128_fast(query, candidates[i]);
}

#if (defined(__x86_64__) || defined(_M_X64)) && (defined(__GNUC__) || defined(__clang__))
__attribute__((target("avx2")))
inline void hamming_distance_128_batch_avx2(
    const Bitset128& query,
    const Bitset128* candidates,
    std::uint32_t* output,
    std::size_t count
) noexcept {
    const __m256i query_words = _mm256_set_epi64x(
        static_cast<long long>(query.hi), static_cast<long long>(query.lo),
        static_cast<long long>(query.hi), static_cast<long long>(query.lo));
    const __m256i nibble_mask = _mm256_set1_epi8(0x0f);
    const __m256i lookup = _mm256_setr_epi8(
        0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4,
        0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4);
    const __m256i zero = _mm256_setzero_si256();
    std::size_t i = 0;
    for (; i + 2 <= count; i += 2) {
        const auto* source = reinterpret_cast<const __m256i*>(candidates + i);
        const __m256i values = _mm256_loadu_si256(source);
        const __m256i different = _mm256_xor_si256(values, query_words);
        const __m256i low = _mm256_and_si256(different, nibble_mask);
        const __m256i high = _mm256_and_si256(_mm256_srli_epi16(different, 4), nibble_mask);
        const __m256i counts = _mm256_add_epi8(
            _mm256_shuffle_epi8(lookup, low), _mm256_shuffle_epi8(lookup, high));
        const __m256i sums = _mm256_sad_epu8(counts, zero);
        alignas(32) std::uint64_t partial[4];
        _mm256_store_si256(reinterpret_cast<__m256i*>(partial), sums);
        output[i] = static_cast<std::uint32_t>(partial[0] + partial[1]);
        output[i + 1] = static_cast<std::uint32_t>(partial[2] + partial[3]);
    }
    hamming_distance_128_batch_scalar(query, candidates + i, output + i, count - i);
}

__attribute__((target("avx512f,avx512vpopcntdq")))
inline void hamming_distance_128_batch_avx512(
    const Bitset128& query,
    const Bitset128* candidates,
    std::uint32_t* output,
    std::size_t count
) noexcept {
    const __m512i query_words = _mm512_set_epi64(
        static_cast<long long>(query.hi), static_cast<long long>(query.lo),
        static_cast<long long>(query.hi), static_cast<long long>(query.lo),
        static_cast<long long>(query.hi), static_cast<long long>(query.lo),
        static_cast<long long>(query.hi), static_cast<long long>(query.lo));
    std::size_t i = 0;
    for (; i + 4 <= count; i += 4) {
        const auto* source = reinterpret_cast<const __m512i*>(candidates + i);
        const __m512i values = _mm512_loadu_si512(source);
        const __m512i counts = _mm512_popcnt_epi64(_mm512_xor_si512(values, query_words));
        alignas(64) std::uint64_t partial[8];
        _mm512_store_si512(reinterpret_cast<__m512i*>(partial), counts);
        for (std::size_t j = 0; j < 4; ++j) {
            output[i + j] = static_cast<std::uint32_t>(partial[j * 2] + partial[j * 2 + 1]);
        }
    }
    hamming_distance_128_batch_scalar(query, candidates + i, output + i, count - i);
}

inline bool hamming128_avx2_available() noexcept {
    static const bool supported = [] {
        __builtin_cpu_init();
        return __builtin_cpu_supports("avx2");
    }();
    return supported;
}

inline bool hamming128_avx512_vpopcnt_available() noexcept {
    static const bool supported = [] {
        __builtin_cpu_init();
        return __builtin_cpu_supports("avx512f") && __builtin_cpu_supports("avx512vpopcntdq");
    }();
    return supported;
}
#endif

inline const char* hamming_distance_128_batch_backend() noexcept {
#if (defined(__x86_64__) || defined(_M_X64)) && (defined(__GNUC__) || defined(__clang__))
    if (hamming128_avx2_available()) return "avx2-nibble-popcount";
    if (hamming128_avx512_vpopcnt_available()) return "avx512-vpopcntdq";
#endif
    return "scalar-64bit-popcount";
}

inline void hamming_distance_128_batch(
    const Bitset128& query,
    const Bitset128* candidates,
    std::uint32_t* output,
    std::size_t count
) noexcept {
    if (!candidates || !output || count == 0) return;
#if (defined(__x86_64__) || defined(_M_X64)) && (defined(__GNUC__) || defined(__clang__))
    if (hamming128_avx2_available()) {
        hamming_distance_128_batch_avx2(query, candidates, output, count);
        return;
    }
    if (hamming128_avx512_vpopcnt_available()) {
        hamming_distance_128_batch_avx512(query, candidates, output, count);
        return;
    }
#endif
    hamming_distance_128_batch_scalar(query, candidates, output, count);
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
    const char* backend{"scalar-64bit-popcount"};
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

    hamming_distance_128_batch(*query, candidates, output_distances, count);
    result.backend = hamming_distance_128_batch_backend();

    const auto t1 = std::chrono::high_resolution_clock::now();
    result.duration_microseconds = std::chrono::duration<double, std::micro>(t1 - t0).count();
    if (result.duration_microseconds > 0.0) {
        result.candidates_per_second = (static_cast<double>(count) / result.duration_microseconds) * 1e6;
    }

    bool match = true;
    for (std::size_t i = 0; i < count; ++i) {
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

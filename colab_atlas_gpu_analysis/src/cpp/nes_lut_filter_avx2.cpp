/**
 * simd-bridge/cpp/nes_lut_filter_avx2.cpp
 *
 * Implementation of NLUT-07 AVX2 LUT filtering challenger & scalar oracle.
 * Zero external library dependencies (no LibTorch, CUDA, PyTorch, N-API).
 */

#include "nes_lut_filter_avx2.h"

#include <immintrin.h>
#if defined(_WIN32)
  #include <intrin.h>
#endif
#include <cstring>

// -----------------------------------------------------------------------------
// CPUID Feature Detection
// -----------------------------------------------------------------------------
NES_LUT_API bool nes_lut_cpu_supports_avx2(void) {
#if defined(_WIN32)
    int cpuInfo[4] = {0};
    __cpuid(cpuInfo, 0);
    int nIds = cpuInfo[0];
    if (nIds >= 7) {
        int cpuInfo7[4] = {0};
        __cpuidex(cpuInfo7, 7, 0);
        return (cpuInfo7[1] & (1 << 5)) != 0; // AVX2 is bit 5 in EBX
    }
    return false;
#else
    return __builtin_cpu_supports("avx2");
#endif
}

// -----------------------------------------------------------------------------
// 1. Scalar Oracle: Single Domain Match
// -----------------------------------------------------------------------------
NES_LUT_API NesLutFilterStatus nes_lut_filter_scalar(
    const uint8_t* lut_bytes,
    size_t count,
    uint8_t target_domain,
    uint32_t* out_indices,
    size_t max_out,
    size_t* out_matched
) {
    if (!lut_bytes || !out_indices || !out_matched) {
        return NES_LUT_FILTER_ERR_NULL_POINTER;
    }
    *out_matched = 0;

    // Fail closed on invalid domain: 0x00 (unresolved) and >0x0A (out of bounds)
    if (target_domain < NES_LUT_MIN_DOMAIN_BYTE || target_domain > NES_LUT_MAX_DOMAIN_BYTE) {
        return NES_LUT_FILTER_OK; // 0 matches
    }

    size_t matched = 0;
    for (size_t i = 0; i < count; ++i) {
        uint8_t b = lut_bytes[i];
        if (b == target_domain && b != NES_LUT_UNRESOLVED_BYTE && b <= NES_LUT_MAX_DOMAIN_BYTE) {
            if (matched < max_out) {
                out_indices[matched] = static_cast<uint32_t>(i);
            }
            matched++;
        }
    }

    *out_matched = matched;
    return (matched <= max_out) ? NES_LUT_FILTER_OK : NES_LUT_FILTER_ERR_BUFFER_TOO_SMALL;
}

// -----------------------------------------------------------------------------
// 2. AVX2 Challenger: Single Domain Match
// -----------------------------------------------------------------------------
NES_LUT_API NesLutFilterStatus nes_lut_filter_avx2(
    const uint8_t* lut_bytes,
    size_t count,
    uint8_t target_domain,
    uint32_t* out_indices,
    size_t max_out,
    size_t* out_matched
) {
    if (!lut_bytes || !out_indices || !out_matched) {
        return NES_LUT_FILTER_ERR_NULL_POINTER;
    }
    *out_matched = 0;

    // Fail closed on invalid domain: 0x00 and >0x0A match 0 items
    if (target_domain < NES_LUT_MIN_DOMAIN_BYTE || target_domain > NES_LUT_MAX_DOMAIN_BYTE) {
        return NES_LUT_FILTER_OK;
    }

    size_t matched = 0;
    size_t i = 0;

#if defined(__AVX512BW__) && defined(__AVX512VL__)
    size_t limit512 = count & ~size_t(63); // 64-byte chunks on AVX-512BW (EPYC Turin)
    __m512i target_vec512 = _mm512_set1_epi8(static_cast<char>(target_domain));
    for (; i < limit512; i += 64) {
        __m512i chunk512 = _mm512_loadu_si512(reinterpret_cast<const __m512i*>(lut_bytes + i));
        uint64_t mask64 = static_cast<uint64_t>(_mm512_cmpeq_epi8_mask(chunk512, target_vec512));
        while (mask64 != 0) {
#if defined(_WIN32)
            unsigned long bit_pos;
            _BitScanForward64(&bit_pos, mask64);
#else
            uint32_t bit_pos = __builtin_ctzll(mask64);
#endif
            if (matched < max_out) {
                out_indices[matched] = static_cast<uint32_t>(i + bit_pos);
            }
            matched++;
            mask64 &= (mask64 - 1);
        }
    }
#endif

    size_t limit = count & ~size_t(31); // 32-byte chunks

    __m256i target_vec = _mm256_set1_epi8(static_cast<char>(target_domain));

    for (; i < limit; i += 32) {
        __m256i chunk = _mm256_loadu_si256(reinterpret_cast<const __m256i*>(lut_bytes + i));
        __m256i cmp = _mm256_cmpeq_epi8(chunk, target_vec);
        uint32_t mask = static_cast<uint32_t>(_mm256_movemask_epi8(cmp));

        while (mask != 0) {
            unsigned long bit_pos;
#if defined(_WIN32)
            _BitScanForward(&bit_pos, mask);
#else
            bit_pos = __builtin_ctz(mask);
#endif
            if (matched < max_out) {
                out_indices[matched] = static_cast<uint32_t>(i + bit_pos);
            }
            matched++;
            mask &= (mask - 1); // clear lowest set bit
        }
    }

    // Scalar fallback remainder
    for (; i < count; ++i) {
        uint8_t b = lut_bytes[i];
        if (b == target_domain && b != NES_LUT_UNRESOLVED_BYTE && b <= NES_LUT_MAX_DOMAIN_BYTE) {
            if (matched < max_out) {
                out_indices[matched] = static_cast<uint32_t>(i);
            }
            matched++;
        }
    }

    *out_matched = matched;
    return (matched <= max_out) ? NES_LUT_FILTER_OK : NES_LUT_FILTER_ERR_BUFFER_TOO_SMALL;
}

// -----------------------------------------------------------------------------
// 3. Scalar Oracle: Multi-Domain Bitmask Match
// -----------------------------------------------------------------------------
NES_LUT_API NesLutFilterStatus nes_lut_filter_mask_scalar(
    const uint8_t* lut_bytes,
    size_t count,
    uint16_t domain_mask,
    uint32_t* out_indices,
    size_t max_out,
    size_t* out_matched
) {
    if (!lut_bytes || !out_indices || !out_matched) {
        return NES_LUT_FILTER_ERR_NULL_POINTER;
    }
    *out_matched = 0;

    // Strict filter: bit 0 (unresolved 0x00) is cleared, bits 1..10 only
    uint16_t active_mask = domain_mask & 0x07FE;
    if (active_mask == 0) {
        return NES_LUT_FILTER_OK; // No domains admitted
    }

    size_t matched = 0;
    for (size_t i = 0; i < count; ++i) {
        uint8_t b = lut_bytes[i];
        if (b != NES_LUT_UNRESOLVED_BYTE && b <= NES_LUT_MAX_DOMAIN_BYTE && (active_mask & (1 << b))) {
            if (matched < max_out) {
                out_indices[matched] = static_cast<uint32_t>(i);
            }
            matched++;
        }
    }

    *out_matched = matched;
    return (matched <= max_out) ? NES_LUT_FILTER_OK : NES_LUT_FILTER_ERR_BUFFER_TOO_SMALL;
}

// -----------------------------------------------------------------------------
// 4. AVX2 Challenger: Multi-Domain Bitmask Match via Vectorized LUT Shuffle
// -----------------------------------------------------------------------------
NES_LUT_API NesLutFilterStatus nes_lut_filter_mask_avx2(
    const uint8_t* lut_bytes,
    size_t count,
    uint16_t domain_mask,
    uint32_t* out_indices,
    size_t max_out,
    size_t* out_matched
) {
    if (!lut_bytes || !out_indices || !out_matched) {
        return NES_LUT_FILTER_ERR_NULL_POINTER;
    }
    *out_matched = 0;

    uint16_t active_mask = domain_mask & 0x07FE;
    if (active_mask == 0) {
        return NES_LUT_FILTER_OK;
    }

    // Build 16-entry lookup table for _mm256_shuffle_epi8
    alignas(16) uint8_t lut_16[16] = {0};
    for (uint8_t d = 1; d <= NES_LUT_MAX_DOMAIN_BYTE; ++d) {
        if (active_mask & (1 << d)) {
            lut_16[d] = 0xFF; // Match flag
        }
    }

    __m128i lut128 = _mm_load_si128(reinterpret_cast<const __m128i*>(lut_16));
    __m256i lut256 = _mm256_set_m128i(lut128, lut128);
    __m256i max_domain_vec = _mm256_set1_epi8(static_cast<char>(NES_LUT_MAX_DOMAIN_BYTE));

    size_t matched = 0;
    size_t i = 0;
    size_t limit = count & ~size_t(31);

    for (; i < limit; i += 32) {
        __m256i chunk = _mm256_loadu_si256(reinterpret_cast<const __m256i*>(lut_bytes + i));
        // Reject bytes > 10
        __m256i out_of_bounds = _mm256_cmpgt_epi8(chunk, max_domain_vec);
        // Shuffle: substitutes byte with lut256[byte & 0x0F]
        __m256i shuffled = _mm256_shuffle_epi8(lut256, chunk);
        // Mask out bytes that were > 10
        __m256i valid_matches = _mm256_andnot_si256(out_of_bounds, shuffled);
        uint32_t mask = static_cast<uint32_t>(_mm256_movemask_epi8(valid_matches));

        while (mask != 0) {
            unsigned long bit_pos;
#if defined(_WIN32)
            _BitScanForward(&bit_pos, mask);
#else
            bit_pos = __builtin_ctz(mask);
#endif
            if (matched < max_out) {
                out_indices[matched] = static_cast<uint32_t>(i + bit_pos);
            }
            matched++;
            mask &= (mask - 1);
        }
    }

    // Scalar fallback remainder
    for (; i < count; ++i) {
        uint8_t b = lut_bytes[i];
        if (b != NES_LUT_UNRESOLVED_BYTE && b <= NES_LUT_MAX_DOMAIN_BYTE && (active_mask & (1 << b))) {
            if (matched < max_out) {
                out_indices[matched] = static_cast<uint32_t>(i);
            }
            matched++;
        }
    }

    *out_matched = matched;
    return (matched <= max_out) ? NES_LUT_FILTER_OK : NES_LUT_FILTER_ERR_BUFFER_TOO_SMALL;
}

// -----------------------------------------------------------------------------
// 5. Adaptive Dispatcher
// -----------------------------------------------------------------------------
NES_LUT_API NesLutFilterStatus nes_lut_filter_dispatch(
    const uint8_t* lut_bytes,
    size_t count,
    uint8_t target_domain,
    bool force_scalar,
    uint32_t* out_indices,
    size_t max_out,
    size_t* out_matched,
    bool* out_used_avx2
) {
    bool can_use_avx2 = !force_scalar && nes_lut_cpu_supports_avx2();
    if (out_used_avx2) {
        *out_used_avx2 = can_use_avx2;
    }

    if (can_use_avx2) {
        return nes_lut_filter_avx2(lut_bytes, count, target_domain, out_indices, max_out, out_matched);
    } else {
        return nes_lut_filter_scalar(lut_bytes, count, target_domain, out_indices, max_out, out_matched);
    }
}

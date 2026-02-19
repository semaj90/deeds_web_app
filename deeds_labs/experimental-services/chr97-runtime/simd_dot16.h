// simd_dot16.h - AVX2 optimized 16D dot product
#pragma once
#include <immintrin.h>
#include <stdint.h>

static inline float dot16f_avx2(const float *a, const float *b) {
    // assume a and b are 32-byte aligned (optional but ideal)
    __m256 v0 = _mm256_loadu_ps(a + 0);
    __m256 v1 = _mm256_loadu_ps(a + 8);
    __m256 u0 = _mm256_loadu_ps(b + 0);
    __m256 u1 = _mm256_loadu_ps(b + 8);

    __m256 m0 = _mm256_mul_ps(v0, u0);
    __m256 m1 = _mm256_mul_ps(v1, u1);

    __m256 sum = _mm256_add_ps(m0, m1);

    // horizontal sum
    __m128 low  = _mm256_castps256_ps128(sum);
    __m128 high = _mm256_extractf128_ps(sum, 1);
    __m128 s1   = _mm_add_ps(low, high);
    __m128 shuf = _mm_movehdup_ps(s1);        // (s1[1],s1[1],s1[3],s1[3])
    __m128 sums = _mm_add_ps(s1, shuf);
    shuf        = _mm_movehl_ps(shuf, sums);
    sums        = _mm_add_ss(sums, shuf);

    return _mm_cvtss_f32(sums);
}

// Batch dot product for multiple queries vs multiple runes
static inline void batch_dot16f_avx2(
    const float *queries,    // [num_queries * 16] floats
    const float *runes,      // [num_runes * 16] floats
    float *results,          // [num_queries * num_runes] floats
    uint32_t num_queries,
    uint32_t num_runes
) {
    for (uint32_t q = 0; q < num_queries; ++q) {
        const float *q_vec = queries + q * 16;
        for (uint32_t r = 0; r < num_runes; ++r) {
            const float *r_vec = runes + r * 16;
            results[q * num_runes + r] = dot16f_avx2(q_vec, r_vec);
        }
    }
}
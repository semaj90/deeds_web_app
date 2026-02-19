// simd_project.h - AVX2 optimized 768→16 projection
#pragma once
#include <immintrin.h>
#include <stdint.h>

static inline void project_768_to_16(
    const float *restrict v768,   // 768
    const float *restrict W,      // (16 x 768) row-major
    float *restrict out16)        // 16
{
    for (int i = 0; i < 16; ++i) {
        const float *row = W + i * 768;
        float acc = 0.0f;

        int j = 0;
        __m256 vacc = _mm256_setzero_ps();
        for (; j + 8 <= 768; j += 8) {
            __m256 vx = _mm256_loadu_ps(v768 + j);
            __m256 vw = _mm256_loadu_ps(row + j);
            vacc = _mm256_fmadd_ps(vx, vw, vacc); // FMA
        }
        // horizontal sum
        __m128 low  = _mm256_castps256_ps128(vacc);
        __m128 high = _mm256_extractf128_ps(vacc, 1);
        __m128 s1   = _mm_add_ps(low, high);
        __m128 shuf = _mm_movehdup_ps(s1);
        __m128 sums = _mm_add_ps(s1, shuf);
        shuf        = _mm_movehl_ps(shuf, sums);
        sums        = _mm_add_ss(sums, shuf);
        acc += _mm_cvtss_f32(sums);

        // tail (if not multiple of 8)
        for (; j < 768; ++j) acc += v768[j] * row[j];

        out16[i] = acc;
    }
}

// Batch projection for multiple 768D vectors
static inline void batch_project_768_to_16(
    const float *restrict v768_batch, // [num_vectors * 768]
    const float *restrict W,          // (16 x 768) row-major
    float *restrict out16_batch,      // [num_vectors * 16]
    uint32_t num_vectors
) {
    for (uint32_t v = 0; v < num_vectors; ++v) {
        const float *v768 = v768_batch + v * 768;
        float *out16 = out16_batch + v * 16;
        project_768_to_16(v768, W, out16);
    }
}
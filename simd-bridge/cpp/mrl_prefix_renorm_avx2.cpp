/**
 * simd-bridge/cpp/mrl_prefix_renorm_avx2.cpp
 *
 * AVX2 production kernel for MRL prefix + L2 renormalize.
 * Two passes per row: sum of squares over the prefix (8 float lanes,
 * 4 independent accumulators to hide FMA latency), then scale by 1/norm.
 */

#include "mrl_prefix_renorm_avx2.h"

#include <immintrin.h>
#include <cmath>
#if defined(_WIN32)
  #include <intrin.h>
#endif

MRL_API int mrl_cpu_supports_avx2(void) {
#if defined(_WIN32)
    int info[4] = {0};
    __cpuid(info, 0);
    if (info[0] < 7) return 0;
    int info1[4] = {0};
    __cpuid(info1, 1);
    int osxsave = (info1[2] >> 27) & 1;
    int avx = (info1[2] >> 28) & 1;
    if (!osxsave || !avx) return 0;
    unsigned long long xcr0 = _xgetbv(0);
    if ((xcr0 & 0x6) != 0x6) return 0; /* XMM + YMM state enabled by OS */
    int info7[4] = {0};
    __cpuidex(info7, 7, 0);
    return (info7[1] >> 5) & 1;
#else
    __builtin_cpu_init();
    return __builtin_cpu_supports("avx2") ? 1 : 0;
#endif
}

#if defined(__GNUC__) || defined(__clang__)
  #define MRL_TARGET_AVX2 __attribute__((target("avx2,fma")))
#else
  #define MRL_TARGET_AVX2
#endif

MRL_TARGET_AVX2
static inline float hsum256(__m256 v) {
    __m128 lo = _mm256_castps256_ps128(v);
    __m128 hi = _mm256_extractf128_ps(v, 1);
    __m128 s = _mm_add_ps(lo, hi);
    s = _mm_hadd_ps(s, s);
    s = _mm_hadd_ps(s, s);
    return _mm_cvtss_f32(s);
}

MRL_TARGET_AVX2
static int mrl_row_avx2(const float* x, size_t out_dim, float* y) {
    __m256 a0 = _mm256_setzero_ps();
    __m256 a1 = _mm256_setzero_ps();
    __m256 a2 = _mm256_setzero_ps();
    __m256 a3 = _mm256_setzero_ps();
    size_t i = 0;
    for (; i + 32 <= out_dim; i += 32) {
        __m256 v0 = _mm256_loadu_ps(x + i);
        __m256 v1 = _mm256_loadu_ps(x + i + 8);
        __m256 v2 = _mm256_loadu_ps(x + i + 16);
        __m256 v3 = _mm256_loadu_ps(x + i + 24);
        a0 = _mm256_fmadd_ps(v0, v0, a0);
        a1 = _mm256_fmadd_ps(v1, v1, a1);
        a2 = _mm256_fmadd_ps(v2, v2, a2);
        a3 = _mm256_fmadd_ps(v3, v3, a3);
    }
    for (; i + 8 <= out_dim; i += 8) {
        __m256 v = _mm256_loadu_ps(x + i);
        a0 = _mm256_fmadd_ps(v, v, a0);
    }
    float sumsq = hsum256(_mm256_add_ps(_mm256_add_ps(a0, a1), _mm256_add_ps(a2, a3)));
    for (; i < out_dim; ++i) {
        sumsq += x[i] * x[i];
    }
    if (!(sumsq > 0.0f) || !std::isfinite(sumsq)) {
        return MRL_ERR_ZERO_NORM;
    }
    float inv = 1.0f / std::sqrt(sumsq);
    __m256 vinv = _mm256_set1_ps(inv);
    i = 0;
    for (; i + 8 <= out_dim; i += 8) {
        _mm256_storeu_ps(y + i, _mm256_mul_ps(_mm256_loadu_ps(x + i), vinv));
    }
    for (; i < out_dim; ++i) {
        y[i] = x[i] * inv;
    }
    return MRL_OK;
}

MRL_API int mrl_prefix_renorm_f32(const float* in,
                                  size_t rows,
                                  size_t in_dim,
                                  size_t out_dim,
                                  float* out) {
    if (rows == 0) {
        return MRL_OK;
    }
    if (in == NULL || out == NULL) {
        return MRL_ERR_NULL_POINTER;
    }
    if (out_dim == 0 || out_dim > in_dim) {
        return MRL_ERR_INVALID_DIM;
    }
    if (!mrl_cpu_supports_avx2()) {
        return MRL_ERR_UNSUPPORTED_HARDWARE;
    }
    for (size_t r = 0; r < rows; ++r) {
        int rc = mrl_row_avx2(in + r * in_dim, out_dim, out + r * out_dim);
        if (rc != MRL_OK) {
            return rc;
        }
    }
    return MRL_OK;
}

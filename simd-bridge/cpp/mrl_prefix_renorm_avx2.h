/**
 * simd-bridge/cpp/mrl_prefix_renorm_avx2.h
 *
 * Matryoshka (MRL) prefix + L2 renormalize, AVX2 production kernel.
 *   out[r, 0:k] = in[r, 0:k] / ||in[r, 0:k]||_2
 *
 * Production path is AVX2 only. Hardware without AVX2 returns
 * MRL_ERR_UNSUPPORTED_HARDWARE (fail closed); there is no scalar production
 * fallback. The scalar reference lives in the test file only.
 *
 * Zero dependencies (no LibTorch, CUDA, PyTorch, N-API).
 */

#ifndef MRL_PREFIX_RENORM_AVX2_H
#define MRL_PREFIX_RENORM_AVX2_H

#include <stddef.h>
#include <stdint.h>

#if defined(_WIN32)
  #define MRL_API extern "C" __declspec(dllexport)
#else
  #define MRL_API extern "C" __attribute__((visibility("default")))
#endif

typedef enum MrlStatus {
    MRL_OK = 0,
    MRL_ERR_NULL_POINTER = -1,
    MRL_ERR_INVALID_DIM = -2,      /* out_dim == 0 or out_dim > in_dim */
    MRL_ERR_ZERO_NORM = -3,        /* a row prefix has zero or non-finite norm */
    MRL_ERR_UNSUPPORTED_HARDWARE = -4
} MrlStatus;

/* 1 if the running CPU supports AVX2 (and OS-enabled YMM state), else 0. */
MRL_API int mrl_cpu_supports_avx2(void);

/*
 * in:  row-major float32, rows x in_dim (rows may be 0)
 * out: row-major float32, rows x out_dim, written only on MRL_OK
 * Requires in_dim >= out_dim >= 1.
 */
MRL_API int mrl_prefix_renorm_f32(const float* in,
                                  size_t rows,
                                  size_t in_dim,
                                  size_t out_dim,
                                  float* out);

#endif /* MRL_PREFIX_RENORM_AVX2_H */

#include "gemm_contract.h"

#include <cmath>
#include <cstddef>

extern "C" int atlasGemmCpuF32(
    const float* A, const float* B, float* C,
    int64_t m, int64_t n, int64_t k,
    float alpha, float beta
) {
    if (!A || !B || !C || m <= 0 || n <= 0 || k <= 0) {
        return ATLAS_GEMM_INVALID_ARGS;
    }

    for (int64_t i = 0; i < m; ++i) {
        for (int64_t j = 0; j < n; ++j) {
            double acc = 0.0;
            for (int64_t p = 0; p < k; ++p) {
                acc += static_cast<double>(A[i * k + p]) *
                       static_cast<double>(B[p * n + j]);
            }
            const int64_t idx = i * n + j;
            C[idx] = alpha * static_cast<float>(acc) + beta * C[idx];
        }
    }
    return ATLAS_GEMM_SUCCESS;
}

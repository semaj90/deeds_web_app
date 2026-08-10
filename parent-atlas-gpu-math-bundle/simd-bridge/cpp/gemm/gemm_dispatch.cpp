#include "gemm_contract.h"

#ifndef SIMD_HAVE_CUBLAS
#define SIMD_HAVE_CUBLAS 0
#endif
#ifndef SIMD_HAVE_CUBLASLT
#define SIMD_HAVE_CUBLASLT 0
#endif
#ifndef SIMD_HAVE_CUTLASS
#define SIMD_HAVE_CUTLASS 0
#endif

extern "C" int atlasGemm(
    const float* A,
    const float* B,
    float* C,
    const AtlasGemmProblem* p
) {
    if (!A || !B || !C || !p || p->m <= 0 || p->n <= 0 || p->k <= 0) {
        return ATLAS_GEMM_INVALID_ARGS;
    }

    AtlasGemmBackend backend = p->backend;
    if (backend == ATLAS_GEMM_AUTO) {
        if (p->compute == ATLAS_GEMM_COMPUTE_F16_ACCUM_F32 && SIMD_HAVE_CUBLASLT) {
            backend = ATLAS_GEMM_CUBLASLT;
        } else if (p->compute == ATLAS_GEMM_COMPUTE_F32 && SIMD_HAVE_CUBLAS) {
            backend = ATLAS_GEMM_CUBLAS;
        } else {
            backend = ATLAS_GEMM_CPU;
        }
    }

    switch (backend) {
        case ATLAS_GEMM_CPU:
            if (p->compute != ATLAS_GEMM_COMPUTE_F32) {
                // CPU reference is deliberately FP32 only.
                return ATLAS_GEMM_UNSUPPORTED;
            }
            return atlasGemmCpuF32(A, B, C, p->m, p->n, p->k, p->alpha, p->beta);

        case ATLAS_GEMM_CUBLAS:
#if SIMD_HAVE_CUBLAS
            if (p->compute != ATLAS_GEMM_COMPUTE_F32) return ATLAS_GEMM_UNSUPPORTED;
            return atlasGemmCublasF32(A, B, C, p->m, p->n, p->k, p->alpha, p->beta);
#else
            return ATLAS_GEMM_BACKEND_UNAVAILABLE;
#endif

        case ATLAS_GEMM_CUBLASLT:
#if SIMD_HAVE_CUBLASLT
            if (p->compute != ATLAS_GEMM_COMPUTE_F16_ACCUM_F32) return ATLAS_GEMM_UNSUPPORTED;
            return atlasGemmCublasLtF16AccumF32(A, B, C, p->m, p->n, p->k, p->alpha, p->beta);
#else
            return ATLAS_GEMM_BACKEND_UNAVAILABLE;
#endif

        case ATLAS_GEMM_CUTLASS:
#if SIMD_HAVE_CUTLASS
            return atlasGemmCutlass(A, B, C, p->m, p->n, p->k, p->alpha, p->beta, p->compute);
#else
            return ATLAS_GEMM_BACKEND_UNAVAILABLE;
#endif

        default:
            return ATLAS_GEMM_INVALID_ARGS;
    }
}

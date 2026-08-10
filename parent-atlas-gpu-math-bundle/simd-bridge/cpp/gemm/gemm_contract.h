#pragma once

#include <cstdint>

#ifdef _WIN32
  #ifdef ATLAS_GEMM_BUILD
    #define ATLAS_GEMM_API __declspec(dllexport)
  #else
    #define ATLAS_GEMM_API
  #endif
#else
  #define ATLAS_GEMM_API
#endif

extern "C" {

enum AtlasGemmStatus : int32_t {
    ATLAS_GEMM_SUCCESS = 0,
    ATLAS_GEMM_INVALID_ARGS = -1,
    ATLAS_GEMM_BACKEND_UNAVAILABLE = -2,
    ATLAS_GEMM_CUDA_ERROR = -3,
    ATLAS_GEMM_CUBLAS_ERROR = -4,
    ATLAS_GEMM_OOM = -5,
    ATLAS_GEMM_UNSUPPORTED = -6,
};

enum AtlasGemmBackend : int32_t {
    ATLAS_GEMM_AUTO = 0,
    ATLAS_GEMM_CPU = 1,
    ATLAS_GEMM_CUBLAS = 2,
    ATLAS_GEMM_CUBLASLT = 3,
    ATLAS_GEMM_CUTLASS = 4,
};

enum AtlasGemmCompute : int32_t {
    // Host A/B/C are float32. Computation is float32.
    ATLAS_GEMM_COMPUTE_F32 = 0,
    // Host A/B/C remain float32. A/B are converted to FP16 on device;
    // multiplication uses FP16 inputs with FP32 accumulation/output.
    ATLAS_GEMM_COMPUTE_F16_ACCUM_F32 = 1,
};

struct AtlasGemmProblem {
    int64_t m;
    int64_t n;
    int64_t k;
    float alpha;
    float beta;
    AtlasGemmBackend backend;
    AtlasGemmCompute compute;
};

// Contract v1: row-major, non-transposed, host-resident float32 buffers.
// A = [m,k], B = [k,n], C = [m,n].
// C <- alpha * A*B + beta*C.
ATLAS_GEMM_API int atlasGemm(
    const float* A,
    const float* B,
    float* C,
    const AtlasGemmProblem* problem
);

ATLAS_GEMM_API int atlasGemmCpuF32(
    const float* A, const float* B, float* C,
    int64_t m, int64_t n, int64_t k,
    float alpha, float beta
);

ATLAS_GEMM_API int atlasGemmCublasF32(
    const float* A, const float* B, float* C,
    int64_t m, int64_t n, int64_t k,
    float alpha, float beta
);

ATLAS_GEMM_API int atlasGemmCublasLtF16AccumF32(
    const float* A, const float* B, float* C,
    int64_t m, int64_t n, int64_t k,
    float alpha, float beta
);

ATLAS_GEMM_API int atlasGemmCutlass(
    const float* A, const float* B, float* C,
    int64_t m, int64_t n, int64_t k,
    float alpha, float beta,
    AtlasGemmCompute compute
);

} // extern "C"

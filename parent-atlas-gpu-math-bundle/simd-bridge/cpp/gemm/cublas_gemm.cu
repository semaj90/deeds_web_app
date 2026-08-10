#include "gemm_contract.h"

#include <cuda_runtime.h>
#include <cublas_v2.h>
#include <cstddef>

namespace {
int cudaStatus(cudaError_t e) {
    if (e == cudaSuccess) return ATLAS_GEMM_SUCCESS;
    if (e == cudaErrorMemoryAllocation) return ATLAS_GEMM_OOM;
    return ATLAS_GEMM_CUDA_ERROR;
}
}

extern "C" int atlasGemmCublasF32(
    const float* A, const float* B, float* C,
    int64_t m, int64_t n, int64_t k,
    float alpha, float beta
) {
    if (!A || !B || !C || m <= 0 || n <= 0 || k <= 0) return ATLAS_GEMM_INVALID_ARGS;
    if (m > INT32_MAX || n > INT32_MAX || k > INT32_MAX) return ATLAS_GEMM_UNSUPPORTED;

    float *dA = nullptr, *dB = nullptr, *dC = nullptr;
    cublasHandle_t handle = nullptr;
    const size_t bytesA = static_cast<size_t>(m * k) * sizeof(float);
    const size_t bytesB = static_cast<size_t>(k * n) * sizeof(float);
    const size_t bytesC = static_cast<size_t>(m * n) * sizeof(float);

    auto cleanup = [&]() {
        if (handle) cublasDestroy(handle);
        if (dA) cudaFree(dA);
        if (dB) cudaFree(dB);
        if (dC) cudaFree(dC);
    };

    cudaError_t ce;
    if ((ce = cudaMalloc(&dA, bytesA)) != cudaSuccess) { cleanup(); return cudaStatus(ce); }
    if ((ce = cudaMalloc(&dB, bytesB)) != cudaSuccess) { cleanup(); return cudaStatus(ce); }
    if ((ce = cudaMalloc(&dC, bytesC)) != cudaSuccess) { cleanup(); return cudaStatus(ce); }

    if ((ce = cudaMemcpy(dA, A, bytesA, cudaMemcpyHostToDevice)) != cudaSuccess) { cleanup(); return cudaStatus(ce); }
    if ((ce = cudaMemcpy(dB, B, bytesB, cudaMemcpyHostToDevice)) != cudaSuccess) { cleanup(); return cudaStatus(ce); }
    if (beta != 0.0f) {
        if ((ce = cudaMemcpy(dC, C, bytesC, cudaMemcpyHostToDevice)) != cudaSuccess) { cleanup(); return cudaStatus(ce); }
    } else {
        cudaMemset(dC, 0, bytesC);
    }

    if (cublasCreate(&handle) != CUBLAS_STATUS_SUCCESS) { cleanup(); return ATLAS_GEMM_CUBLAS_ERROR; }

    // cuBLAS is column-major. For row-major C=A*B, compute C^T=B^T*A^T.
    // B row-major [k,n] is interpreted as column-major [n,k].
    // A row-major [m,k] is interpreted as column-major [k,m].
    const cublasStatus_t st = cublasSgemm(
        handle,
        CUBLAS_OP_N,
        CUBLAS_OP_N,
        static_cast<int>(n),
        static_cast<int>(m),
        static_cast<int>(k),
        &alpha,
        dB,
        static_cast<int>(n),
        dA,
        static_cast<int>(k),
        &beta,
        dC,
        static_cast<int>(n)
    );
    if (st != CUBLAS_STATUS_SUCCESS) { cleanup(); return ATLAS_GEMM_CUBLAS_ERROR; }

    if ((ce = cudaMemcpy(C, dC, bytesC, cudaMemcpyDeviceToHost)) != cudaSuccess) { cleanup(); return cudaStatus(ce); }
    cleanup();
    return ATLAS_GEMM_SUCCESS;
}

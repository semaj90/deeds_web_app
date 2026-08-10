#include "gemm_contract.h"

#include <cuda_fp16.h>
#include <cuda_runtime.h>
#include <cublasLt.h>
#include <cstddef>
#include <cstdint>

namespace {
__global__ void fp32ToFp16(const float* in, half* out, size_t count) {
    size_t i = static_cast<size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (i < count) out[i] = __float2half_rn(in[i]);
}

int cudaStatus(cudaError_t e) {
    if (e == cudaSuccess) return ATLAS_GEMM_SUCCESS;
    if (e == cudaErrorMemoryAllocation) return ATLAS_GEMM_OOM;
    return ATLAS_GEMM_CUDA_ERROR;
}

void setRowMajor(cublasLtMatrixLayout_t layout) {
    cublasLtOrder_t order = CUBLASLT_ORDER_ROW;
    cublasLtMatrixLayoutSetAttribute(layout, CUBLASLT_MATRIX_LAYOUT_ORDER, &order, sizeof(order));
}
}

extern "C" int atlasGemmCublasLtF16AccumF32(
    const float* A, const float* B, float* C,
    int64_t m, int64_t n, int64_t k,
    float alpha, float beta
) {
    if (!A || !B || !C || m <= 0 || n <= 0 || k <= 0) return ATLAS_GEMM_INVALID_ARGS;

    float *dA32 = nullptr, *dB32 = nullptr, *dC = nullptr;
    half *dA16 = nullptr, *dB16 = nullptr;
    void* workspace = nullptr;
    constexpr size_t WORKSPACE_BYTES = 4u * 1024u * 1024u;

    cublasLtHandle_t lt = nullptr;
    cublasLtMatmulDesc_t op = nullptr;
    cublasLtMatrixLayout_t aLayout = nullptr, bLayout = nullptr, cLayout = nullptr;
    cublasLtMatmulPreference_t pref = nullptr;

    const size_t countA = static_cast<size_t>(m * k);
    const size_t countB = static_cast<size_t>(k * n);
    const size_t countC = static_cast<size_t>(m * n);

    auto cleanup = [&]() {
        if (pref) cublasLtMatmulPreferenceDestroy(pref);
        if (aLayout) cublasLtMatrixLayoutDestroy(aLayout);
        if (bLayout) cublasLtMatrixLayoutDestroy(bLayout);
        if (cLayout) cublasLtMatrixLayoutDestroy(cLayout);
        if (op) cublasLtMatmulDescDestroy(op);
        if (lt) cublasLtDestroy(lt);
        if (workspace) cudaFree(workspace);
        if (dA32) cudaFree(dA32);
        if (dB32) cudaFree(dB32);
        if (dA16) cudaFree(dA16);
        if (dB16) cudaFree(dB16);
        if (dC) cudaFree(dC);
    };

    cudaError_t ce;
    if ((ce = cudaMalloc(&dA32, countA * sizeof(float))) != cudaSuccess) { cleanup(); return cudaStatus(ce); }
    if ((ce = cudaMalloc(&dB32, countB * sizeof(float))) != cudaSuccess) { cleanup(); return cudaStatus(ce); }
    if ((ce = cudaMalloc(&dA16, countA * sizeof(half))) != cudaSuccess) { cleanup(); return cudaStatus(ce); }
    if ((ce = cudaMalloc(&dB16, countB * sizeof(half))) != cudaSuccess) { cleanup(); return cudaStatus(ce); }
    if ((ce = cudaMalloc(&dC, countC * sizeof(float))) != cudaSuccess) { cleanup(); return cudaStatus(ce); }
    cudaMalloc(&workspace, WORKSPACE_BYTES); // optional; null is legal if allocation fails

    if ((ce = cudaMemcpy(dA32, A, countA * sizeof(float), cudaMemcpyHostToDevice)) != cudaSuccess) { cleanup(); return cudaStatus(ce); }
    if ((ce = cudaMemcpy(dB32, B, countB * sizeof(float), cudaMemcpyHostToDevice)) != cudaSuccess) { cleanup(); return cudaStatus(ce); }
    if (beta != 0.0f) {
        if ((ce = cudaMemcpy(dC, C, countC * sizeof(float), cudaMemcpyHostToDevice)) != cudaSuccess) { cleanup(); return cudaStatus(ce); }
    } else {
        cudaMemset(dC, 0, countC * sizeof(float));
    }

    constexpr int block = 256;
    fp32ToFp16<<<static_cast<unsigned>((countA + block - 1) / block), block>>>(dA32, dA16, countA);
    fp32ToFp16<<<static_cast<unsigned>((countB + block - 1) / block), block>>>(dB32, dB16, countB);
    if ((ce = cudaGetLastError()) != cudaSuccess) { cleanup(); return cudaStatus(ce); }

    if (cublasLtCreate(&lt) != CUBLAS_STATUS_SUCCESS) { cleanup(); return ATLAS_GEMM_CUBLAS_ERROR; }
    if (cublasLtMatmulDescCreate(&op, CUBLAS_COMPUTE_32F, CUDA_R_32F) != CUBLAS_STATUS_SUCCESS) { cleanup(); return ATLAS_GEMM_CUBLAS_ERROR; }
    if (cublasLtMatrixLayoutCreate(&aLayout, CUDA_R_16F, m, k, k) != CUBLAS_STATUS_SUCCESS) { cleanup(); return ATLAS_GEMM_CUBLAS_ERROR; }
    if (cublasLtMatrixLayoutCreate(&bLayout, CUDA_R_16F, k, n, n) != CUBLAS_STATUS_SUCCESS) { cleanup(); return ATLAS_GEMM_CUBLAS_ERROR; }
    if (cublasLtMatrixLayoutCreate(&cLayout, CUDA_R_32F, m, n, n) != CUBLAS_STATUS_SUCCESS) { cleanup(); return ATLAS_GEMM_CUBLAS_ERROR; }
    setRowMajor(aLayout); setRowMajor(bLayout); setRowMajor(cLayout);

    if (cublasLtMatmulPreferenceCreate(&pref) != CUBLAS_STATUS_SUCCESS) { cleanup(); return ATLAS_GEMM_CUBLAS_ERROR; }
    size_t effectiveWorkspace = workspace ? WORKSPACE_BYTES : 0;
    cublasLtMatmulPreferenceSetAttribute(
        pref, CUBLASLT_MATMUL_PREF_MAX_WORKSPACE_BYTES,
        &effectiveWorkspace, sizeof(effectiveWorkspace)
    );

    cublasLtMatmulHeuristicResult_t heuristic{};
    int returned = 0;
    const auto hs = cublasLtMatmulAlgoGetHeuristic(
        lt, op, aLayout, bLayout, cLayout, cLayout, pref,
        1, &heuristic, &returned
    );
    if (hs != CUBLAS_STATUS_SUCCESS || returned == 0) { cleanup(); return ATLAS_GEMM_BACKEND_UNAVAILABLE; }

    const auto st = cublasLtMatmul(
        lt, op,
        &alpha,
        dA16, aLayout,
        dB16, bLayout,
        &beta,
        dC, cLayout,
        dC, cLayout,
        &heuristic.algo,
        workspace, effectiveWorkspace,
        0
    );
    if (st != CUBLAS_STATUS_SUCCESS) { cleanup(); return ATLAS_GEMM_CUBLAS_ERROR; }

    if ((ce = cudaMemcpy(C, dC, countC * sizeof(float), cudaMemcpyDeviceToHost)) != cudaSuccess) { cleanup(); return cudaStatus(ce); }
    cleanup();
    return ATLAS_GEMM_SUCCESS;
}

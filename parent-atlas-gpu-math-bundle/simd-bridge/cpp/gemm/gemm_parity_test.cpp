#include "gemm_contract.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <vector>

static float maxAbsDiff(const std::vector<float>& a, const std::vector<float>& b) {
    float d = 0.0f;
    for (size_t i = 0; i < a.size(); ++i) d = std::max(d, std::fabs(a[i] - b[i]));
    return d;
}

int main() {
    constexpr int M = 7, N = 5, K = 11;
    std::vector<float> A(M*K), B(K*N), ref(M*N, 0.0f), got(M*N, 0.0f);
    for (size_t i = 0; i < A.size(); ++i) A[i] = static_cast<float>((int(i)%13)-6) / 13.0f;
    for (size_t i = 0; i < B.size(); ++i) B[i] = static_cast<float>((int(i)%17)-8) / 17.0f;

    if (atlasGemmCpuF32(A.data(), B.data(), ref.data(), M, N, K, 1.0f, 0.0f) != ATLAS_GEMM_SUCCESS) {
        std::fprintf(stderr, "CPU reference failed\n"); return 1;
    }

    AtlasGemmProblem p{M,N,K,1.0f,0.0f,ATLAS_GEMM_CPU,ATLAS_GEMM_COMPUTE_F32};
    if (atlasGemm(A.data(), B.data(), got.data(), &p) != ATLAS_GEMM_SUCCESS) {
        std::fprintf(stderr, "dispatch CPU failed\n"); return 2;
    }

    const float diff = maxAbsDiff(ref, got);
    std::printf("GEMM_CPU_REFERENCE_PASS max_abs_diff=%g\n", diff);
    return diff <= 1e-6f ? 0 : 3;
}

#include "gemm_contract.h"

// Deliberately not a fake CUTLASS implementation.
// Keep this backend unavailable until a concrete Parent Atlas hot shape
// demonstrates a benchmarked win over cuBLASLt and the exact CUTLASS 3.x
// kernel configuration is frozen in the OpenSpec.
extern "C" int atlasGemmCutlass(
    const float*, const float*, float*,
    int64_t, int64_t, int64_t,
    float, float,
    AtlasGemmCompute
) {
    return ATLAS_GEMM_BACKEND_UNAVAILABLE;
}

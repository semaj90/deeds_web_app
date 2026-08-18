// Optional LibTorch reference/challenger for Parent Atlas recommendation math.
//
// This file DOES NOT replace the existing cpp/gemm CPU/cuBLAS/cuBLASLt/CUTLASS
// dispatch. It mirrors the readable PyTorch reference with torch::Tensor so the
// same formula can be run from C++ on CPU or CUDA and compared before promotion.
#include <torch/torch.h>

#include <algorithm>
#include <array>
#include <cstddef>
#include <stdexcept>

struct AtlasRecommendationFeatureRow {
    float semantic = 0.0f;
    float pagerank = 0.0f;
    float hypergraph = 0.0f;
    float som = 0.0f;
    float ast = 0.0f;
    float hypersphere = 0.0f;
    std::array<bool, 6> present{true, false, false, false, false, false};
};

static constexpr std::array<float, 6> kPriorWeights{
    0.40f, 0.18f, 0.14f, 0.10f, 0.08f, 0.10f,
};

float atlasPresenceAwareRecommendationScore(const AtlasRecommendationFeatureRow& row) {
    const std::array<float, 6> values{
        row.semantic,
        row.pagerank,
        row.hypergraph,
        row.som,
        row.ast,
        row.hypersphere,
    };

    float numerator = 0.0f;
    float denominator = 0.0f;
    for (std::size_t i = 0; i < values.size(); ++i) {
        if (!row.present[i]) continue;
        numerator += std::clamp(values[i], 0.0f, 1.0f) * kPriorWeights[i];
        denominator += kPriorWeights[i];
    }
    return denominator > 0.0f ? numerator / denominator : 0.0f;
}

torch::Tensor atlasSemanticCosineReference(
    torch::Tensor query,
    torch::Tensor candidates,
    bool preferCuda
) {
    if (query.dim() != 1 || candidates.dim() != 2 || candidates.size(1) != query.size(0)) {
        throw std::invalid_argument("expected query[D] and candidates[N,D]");
    }

    const torch::Device device =
        (preferCuda && torch::cuda::is_available()) ? torch::Device(torch::kCUDA) : torch::Device(torch::kCPU);

    query = query.to(device, torch::kFloat32);
    candidates = candidates.to(device, torch::kFloat32);

    query = query / torch::clamp(torch::linalg_vector_norm(query), 1e-8);
    candidates = candidates / torch::clamp(
        torch::linalg_vector_norm(candidates, 2, {1}, true),
        1e-8
    );

    // Normalized matrix-vector product is cosine similarity. Map [-1,1] to
    // [0,1] so the result occupies the same semantic feature slot as TS/Python.
    return torch::matmul(candidates, query)
        .clamp(-1.0, 1.0)
        .add(1.0)
        .div(2.0)
        .to(torch::kCPU);
}

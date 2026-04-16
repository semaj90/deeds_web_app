/**
 * pytorch_graph.cc — GPU ML ops for graph analysis + GRPO reward scoring
 *
 * Functions (LibTorch 2.9 / CUDA 13.0, SM 8.6 — RTX 3060 Ti):
 *   pageRankGPU       — power-iteration PageRank on GPU (code dependency graphs)
 *   attentionScoreGPU — scaled dot-product attention weights (ACE context weighting)
 *   rewardScoreGPU    — cosine reward scoring, GRPO-compatible (LLM quality signal)
 *   softmaxGPU        — numerically-stable GPU softmax (confidence calibration)
 *   topKIndicesGPU    — top-k index selection (retrieval ranking)
 *
 * All functions fall back to CPU if CUDA is unavailable.
 * Return codes: 0 = success, -1 = bad args, -2 = runtime error.
 */

#include <torch/torch.h>
#include <cstring>
#include <cmath>

namespace F = torch::nn::functional;

// ── Device selection ─────────────────────────────────────────────────────────

static torch::Device pgDevice() {
    return torch::cuda::is_available() ? torch::kCUDA : torch::kCPU;
}

// ── pageRankGPU ──────────────────────────────────────────────────────────────
// Power-iteration PageRank using GPU matrix multiply.
//
// adj[n*n]  — row-major adjacency matrix (any non-negative weights)
// n         — number of nodes
// damping   — damping factor (typically 0.85)
// iters     — power-iteration steps (typically 20-100)
// out[n]    — output PageRank scores (sum to 1.0)

extern "C" int pageRankGPU(
    const float* adj, int n,
    float damping, int iters,
    float* out, int out_len
) {
    if (!adj || !out || n <= 0 || out_len < n) return -1;
    try {
        torch::NoGradGuard ng;
        auto dev = pgDevice();
        auto opts = torch::TensorOptions().dtype(torch::kFloat32);

        // Build row-normalised column-stochastic transition matrix P
        auto A = torch::from_blob(const_cast<float*>(adj), {n, n}, opts).to(dev);
        auto row_sum = A.sum(/*dim=*/1, /*keepdim=*/true).clamp_min(1e-8f);
        auto P = (A / row_sum).t();  // P[j,i] = probability of walking i→j

        // Uniform initial rank
        auto r = torch::full({n, 1}, 1.0f / n,
                             torch::TensorOptions().dtype(torch::kFloat32).device(dev));
        auto teleport = torch::full({n, 1}, (1.0f - damping) / n,
                                    torch::TensorOptions().dtype(torch::kFloat32).device(dev));

        for (int i = 0; i < iters; ++i) {
            r = damping * torch::mm(P, r) + teleport;
        }

        auto cpu_r = r.squeeze().to(torch::kCPU).contiguous();
        std::memcpy(out, cpu_r.data_ptr<float>(), n * sizeof(float));
        return 0;
    } catch (...) { return -2; }
}

// ── attentionScoreGPU ────────────────────────────────────────────────────────
// Scaled dot-product attention: softmax(Q * K^T / sqrt(dim)).
// Used to weight retrieved context chunks in the ACE assembly stage.
//
// query[dim]    — single query vector (e.g. case embedding)
// keys[n*dim]   — n candidate key vectors (e.g. chunk embeddings)
// n, dim        — matrix dimensions
// out[n]        — softmax attention weights (sum to 1.0)

extern "C" int attentionScoreGPU(
    const float* query, int dim,
    const float* keys, int n,
    float* out, int out_len
) {
    if (!query || !keys || !out || dim <= 0 || n <= 0 || out_len < n) return -1;
    try {
        torch::NoGradGuard ng;
        auto dev = pgDevice();
        auto opts = torch::TensorOptions().dtype(torch::kFloat32);

        auto Q = torch::from_blob(const_cast<float*>(query), {1, dim}, opts).to(dev);
        auto K = torch::from_blob(const_cast<float*>(keys),  {n, dim}, opts).to(dev);

        float scale = 1.0f / std::sqrt(static_cast<float>(dim));
        // [1, dim] @ [dim, n] → [1, n] → softmax → [n]
        auto scores  = torch::mm(Q, K.t()) * scale;
        auto weights = torch::softmax(scores, /*dim=*/1).squeeze();

        auto cpu_w = weights.to(torch::kCPU).contiguous();
        std::memcpy(out, cpu_w.data_ptr<float>(), n * sizeof(float));
        return 0;
    } catch (...) { return -2; }
}

// ── rewardScoreGPU ───────────────────────────────────────────────────────────
// Cosine similarity between generated and reference embeddings — GRPO reward signal.
// Higher score = generated response is semantically closer to the reference.
//
// gen[n*dim]  — generated response embeddings (one per candidate)
// ref[n*dim]  — reference / ground-truth embeddings
// n, dim      — matrix dimensions
// out[n]      — cosine similarity in [-1, 1] (reward scores)

extern "C" int rewardScoreGPU(
    const float* gen, const float* ref,
    int n, int dim,
    float* out, int out_len
) {
    if (!gen || !ref || !out || n <= 0 || dim <= 0 || out_len < n) return -1;
    try {
        torch::NoGradGuard ng;
        auto dev = pgDevice();
        auto opts = torch::TensorOptions().dtype(torch::kFloat32);

        auto G = torch::from_blob(const_cast<float*>(gen), {n, dim}, opts).to(dev);
        auto R = torch::from_blob(const_cast<float*>(ref), {n, dim}, opts).to(dev);

        // L2-normalise rows, then element-wise dot product → cosine sim
        auto G_n = F::normalize(G, F::NormalizeFuncOptions().dim(1).p(2));
        auto R_n = F::normalize(R, F::NormalizeFuncOptions().dim(1).p(2));
        auto scores = (G_n * R_n).sum(/*dim=*/1);  // [n]

        auto cpu_s = scores.to(torch::kCPU).contiguous();
        std::memcpy(out, cpu_s.data_ptr<float>(), n * sizeof(float));
        return 0;
    } catch (...) { return -2; }
}

// ── softmaxGPU ───────────────────────────────────────────────────────────────
// Numerically-stable softmax for confidence calibration / probability output.
//
// logits[n]  — raw logit / score values
// out[n]     — probability distribution (sum to 1.0)

extern "C" int softmaxGPU(
    const float* logits, int n,
    float* out, int out_len
) {
    if (!logits || !out || n <= 0 || out_len < n) return -1;
    try {
        torch::NoGradGuard ng;
        auto dev = pgDevice();
        auto opts = torch::TensorOptions().dtype(torch::kFloat32);

        auto t = torch::from_blob(const_cast<float*>(logits), {n}, opts).to(dev);
        auto s = torch::softmax(t, /*dim=*/0);

        auto cpu_s = s.to(torch::kCPU).contiguous();
        std::memcpy(out, cpu_s.data_ptr<float>(), n * sizeof(float));
        return 0;
    } catch (...) { return -2; }
}

// ── kmeansWithCentroids ──────────────────────────────────────────────────────
// K-means clustering returning BOTH assignments AND centroids.
// Extends the existing clusterEmbeddings (which returns assignments only).
//
// embeddings[n*dim]          — input vectors
// n, dim, k, max_iters       — dimensions + hyperparams
// assignments_out[n]         — cluster index (0..k-1) per point
// centroids_out[k*dim]       — final centroid vectors
//
// Uses torch::cdist (cuBLAS) for O(n*k*dim) pairwise distance computation.

extern "C" int kmeansWithCentroids(
    const float* embeddings, int n, int dim,
    int k, int max_iters,
    int* assignments_out, int assignments_len,
    float* centroids_out, int centroids_len
) {
    if (!embeddings || !assignments_out || !centroids_out) return -1;
    if (n <= 0 || dim <= 0 || k <= 0) return -1;
    if (assignments_len < n || centroids_len < k * dim) return -2;
    if (k > n) k = n;
    if (max_iters <= 0) max_iters = 100;

    try {
        torch::NoGradGuard ng;
        auto dev  = pgDevice();
        auto opts = torch::TensorOptions().dtype(torch::kFloat32);

        auto data      = torch::from_blob(const_cast<float*>(embeddings), {n, dim}, opts).to(dev);
        auto centroids = data.slice(0, 0, k).clone();  // deterministic init (first k)
        auto assign    = torch::zeros({n}, torch::TensorOptions().dtype(torch::kLong).device(dev));

        for (int iter = 0; iter < max_iters; ++iter) {
            auto dists      = torch::cdist(data, centroids, 2.0);  // [n, k]
            auto new_assign = dists.argmin(1);                      // [n]

            if (iter > 0 && torch::equal(new_assign, assign)) {
                assign = new_assign;
                break;
            }
            assign = new_assign;

            for (int c = 0; c < k; ++c) {
                auto mask  = (assign == c);
                auto count = mask.sum().item<int64_t>();
                if (count > 0) centroids[c] = data.index({mask}).mean(0);
            }
        }

        // Copy assignments (int64 → int32)
        auto cpu_a = assign.to(torch::kCPU).to(torch::kInt32).contiguous();
        std::memcpy(assignments_out, cpu_a.data_ptr<int32_t>(), n * sizeof(int32_t));

        // Copy centroids
        auto cpu_c = centroids.to(torch::kCPU).contiguous();
        std::memcpy(centroids_out, cpu_c.data_ptr<float>(), k * dim * sizeof(float));

        return 0;
    } catch (...) { return -3; }
}

// ── trainSOM ─────────────────────────────────────────────────────────────────
// Kohonen Self-Organizing Map training on GPU.
// Finds a low-dimensional (grid_w × grid_h) topology-preserving map of data.
//
// data[n*dim]              — input vectors
// n, dim                   — data dimensions
// grid_w, grid_h           — SOM grid size (total neurons = grid_w * grid_h)
// iters                    — training iterations (recommended: 500-2000)
// lr_init / lr_final       — learning rate schedule (linear decay)
// radius_init / radius_final — neighbourhood radius schedule (linear decay)
// weights_out[gw*gh*dim]   — trained neuron weight vectors
// bmu_out[n]               — Best-Matching-Unit index for each input point

extern "C" int trainSOM(
    const float* data, int n, int dim,
    int grid_w, int grid_h,
    int iters,
    float lr_init, float lr_final,
    float radius_init, float radius_final,
    float* weights_out, int weights_len,
    int* bmu_out, int bmu_len
) {
    const int neurons = grid_w * grid_h;
    if (!data || !weights_out || !bmu_out) return -1;
    if (n <= 0 || dim <= 0 || neurons <= 0 || iters <= 0) return -1;
    if (weights_len < neurons * dim || bmu_len < n) return -2;
    if (lr_init <= 0.0f)     lr_init     = 0.1f;
    if (lr_final <= 0.0f)    lr_final    = 0.01f;
    if (radius_init <= 0.0f) radius_init = (float)std::max(grid_w, grid_h) / 2.0f;
    if (radius_final <= 0.0f) radius_final = 1.0f;

    try {
        torch::NoGradGuard ng;
        auto dev  = pgDevice();
        auto fopts = torch::TensorOptions().dtype(torch::kFloat32);

        auto X = torch::from_blob(const_cast<float*>(data), {n, dim}, fopts).to(dev);

        // Initialise weights: sample n evenly-spaced rows from data (deterministic)
        auto step   = std::max(1, n / neurons);
        auto init_idx = torch::arange(0, neurons, torch::TensorOptions().dtype(torch::kLong).device(dev))
                            .mul(step)
                            .clamp_max(n - 1);
        auto W = X.index_select(0, init_idx).clone();  // [neurons, dim]

        // Precompute 2-D neuron grid coordinates [neurons, 2]
        auto grid_rows = torch::arange(grid_h, fopts).unsqueeze(1).expand({grid_h, grid_w}).reshape({neurons});
        auto grid_cols = torch::arange(grid_w, fopts).unsqueeze(0).expand({grid_h, grid_w}).reshape({neurons});
        auto grid_pos  = torch::stack({grid_rows, grid_cols}, 1).to(dev);  // [neurons, 2]

        for (int t = 0; t < iters; ++t) {
            float progress = (float)t / (float)(iters - 1 + 1e-6f);
            float lr       = lr_init     + progress * (lr_final     - lr_init);
            float radius   = radius_init + progress * (radius_final - radius_init);
            float r2       = radius * radius;

            // Sample a random input vector
            int64_t idx = (int64_t)(rand() % n);
            auto xi = X[idx].unsqueeze(0);  // [1, dim]

            // BMU: nearest neuron in weight space
            auto dists = torch::cdist(xi, W, 2.0).squeeze(0);  // [neurons]
            auto bmu   = dists.argmin().item<int64_t>();

            // Neighbourhood function: h(j) = exp(-||pos_j - pos_bmu||^2 / 2r^2)
            auto bmu_pos  = grid_pos[bmu].unsqueeze(0);                        // [1, 2]
            auto d2       = (grid_pos.to(torch::kFloat32) - bmu_pos.to(torch::kFloat32))
                                .pow(2).sum(1);                                 // [neurons]
            auto h        = torch::exp(-d2 / (2.0f * r2)).unsqueeze(1);        // [neurons, 1]

            // Weight update: W += lr * h * (xi - W)
            W.add_((xi - W) * (lr * h));
        }

        // Assign each data point its BMU index
        auto dists_all = torch::cdist(X, W, 2.0);               // [n, neurons]
        auto bmu_all   = dists_all.argmin(1).to(torch::kInt32).to(torch::kCPU).contiguous();

        // Copy outputs
        auto cpu_W = W.to(torch::kCPU).contiguous();
        std::memcpy(weights_out, cpu_W.data_ptr<float>(), neurons * dim * sizeof(float));
        std::memcpy(bmu_out, bmu_all.data_ptr<int32_t>(), n * sizeof(int32_t));

        return 0;
    } catch (...) { return -3; }
}

// ── topKIndicesGPU ───────────────────────────────────────────────────────────
// GPU top-k selection — returns the k highest-scoring indices in descending order.
// Used in retrieval ranking (pick best k chunks from n candidates).
//
// scores[n]  — score for each candidate
// n          — total candidates
// k          — how many top indices to return
// out[k]     — indices of top-k scores (descending order)

extern "C" int topKIndicesGPU(
    const float* scores, int n, int k,
    int* out, int out_len
) {
    if (!scores || !out || n <= 0 || k <= 0 || k > n || out_len < k) return -1;
    try {
        torch::NoGradGuard ng;
        auto dev = pgDevice();
        auto opts = torch::TensorOptions().dtype(torch::kFloat32);

        auto t = torch::from_blob(const_cast<float*>(scores), {n}, opts).to(dev);
        auto [values, indices] = torch::topk(t, k, /*dim=*/-1, /*largest=*/true, /*sorted=*/true);

        // Convert int64 indices to int32 for N-API compatibility
        auto cpu_idx = indices.to(torch::kCPU).to(torch::kInt32).contiguous();
        std::memcpy(out, cpu_idx.data_ptr<int32_t>(), k * sizeof(int32_t));
        return 0;
    } catch (...) { return -2; }
}
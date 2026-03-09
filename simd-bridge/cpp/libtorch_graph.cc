/**
 * LibTorch GPU Graph Analysis — N-API Native Module
 *
 * Provides GPU-accelerated operations via PyTorch C++ API (libtorch 2.9.0+cu130):
 *   1. graphSimilarity(embeddings[][]) → cosine similarity matrix via torch::mm
 *   2. clusterEmbeddings(embeddings[][], k) → k-means clustering on GPU
 *   3. computeCaseEmbedding(weights[], embeddings[][]) → weighted average
 *
 * Falls back to CPU if CUDA unavailable.
 * Compiled as part of tensorrt_bridge.node N-API addon.
 */

#include <torch/torch.h>
#include <vector>
#include <cmath>
#include <cstring>

// Device selection: CUDA if available, else CPU
static torch::Device getDevice() {
    if (torch::cuda::is_available()) {
        return torch::kCUDA;
    }
    return torch::kCPU;
}

/**
 * Cosine similarity matrix: torch::mm(normalized, normalized.T)
 * Input:  embeddings[n][dim] as flat float array
 * Output: similarity[n][n] as flat float array
 */
extern "C" int graphSimilarity(
    const float* embeddings, int n, int dim,
    float* output, int output_len
) {
    if (!embeddings || !output || n <= 0 || dim <= 0) return -1;
    if (output_len < n * n) return -2;

    try {
        auto device = getDevice();

        // Create tensor from input data
        auto opts = torch::TensorOptions().dtype(torch::kFloat32);
        auto mat = torch::from_blob(
            const_cast<float*>(embeddings), {n, dim}, opts
        ).to(device);

        // L2 normalize each row
        auto norms = mat.norm(2, /*dim=*/1, /*keepdim=*/true).clamp_min(1e-12);
        auto normalized = mat / norms;

        // Cosine similarity matrix via matrix multiply
        auto sim = torch::mm(normalized, normalized.t());

        // Copy result back to CPU
        auto sim_cpu = sim.to(torch::kCPU).contiguous();
        std::memcpy(output, sim_cpu.data_ptr<float>(), n * n * sizeof(float));

        return 0; // success
    } catch (const std::exception& e) {
        return -3;
    }
}

/**
 * K-means clustering on GPU via iterative assignment + centroid update.
 * Input:  embeddings[n][dim], k clusters, max_iters
 * Output: assignments[n] (cluster index per embedding)
 */
extern "C" int clusterEmbeddings(
    const float* embeddings, int n, int dim,
    int k, int max_iters,
    int* assignments, int assignments_len
) {
    if (!embeddings || !assignments || n <= 0 || dim <= 0 || k <= 0) return -1;
    if (k > n) k = n;
    if (assignments_len < n) return -2;
    if (max_iters <= 0) max_iters = 100;

    try {
        auto device = getDevice();
        auto opts = torch::TensorOptions().dtype(torch::kFloat32);

        auto data = torch::from_blob(
            const_cast<float*>(embeddings), {n, dim}, opts
        ).to(device);

        // Initialize centroids: first k points (deterministic)
        auto centroids = data.slice(0, 0, k).clone();

        auto assign_tensor = torch::zeros({n}, torch::TensorOptions().dtype(torch::kLong).device(device));

        for (int iter = 0; iter < max_iters; iter++) {
            // Compute distances: ||data - centroid||^2 for each centroid
            // Expand for broadcasting: data[n,1,dim] - centroids[1,k,dim]
            auto diff = data.unsqueeze(1) - centroids.unsqueeze(0); // [n, k, dim]
            auto dists = diff.pow(2).sum(2); // [n, k]

            // Assign each point to nearest centroid
            auto new_assign = dists.argmin(1); // [n]

            // Check convergence
            if (iter > 0 && torch::equal(new_assign, assign_tensor)) {
                assign_tensor = new_assign;
                break;
            }
            assign_tensor = new_assign;

            // Update centroids
            for (int c = 0; c < k; c++) {
                auto mask = (assign_tensor == c);
                auto count = mask.sum().item<int64_t>();
                if (count > 0) {
                    centroids[c] = data.index({mask}).mean(0);
                }
            }
        }

        // Copy assignments to output
        auto assign_cpu = assign_tensor.to(torch::kCPU).to(torch::kInt32).contiguous();
        std::memcpy(assignments, assign_cpu.data_ptr<int>(), n * sizeof(int));

        return 0;
    } catch (const std::exception& e) {
        return -3;
    }
}

/**
 * Weighted embedding computation: sum(weights[i] * embeddings[i]) / sum(weights)
 * Input:  weights[n], embeddings[n][dim]
 * Output: result[dim]
 */
extern "C" int computeCaseEmbedding(
    const float* weights, int n,
    const float* embeddings, int dim,
    float* output, int output_len
) {
    if (!weights || !embeddings || !output || n <= 0 || dim <= 0) return -1;
    if (output_len < dim) return -2;

    try {
        auto device = getDevice();
        auto opts = torch::TensorOptions().dtype(torch::kFloat32);

        auto w = torch::from_blob(
            const_cast<float*>(weights), {n}, opts
        ).to(device);

        auto mat = torch::from_blob(
            const_cast<float*>(embeddings), {n, dim}, opts
        ).to(device);

        // Normalize weights
        auto w_sum = w.sum().clamp_min(1e-12);
        auto w_norm = w / w_sum;

        // Weighted sum: w_norm[1,n] @ mat[n,dim] → [1,dim]
        auto result = torch::mm(w_norm.unsqueeze(0), mat).squeeze(0);

        // L2 normalize the result
        auto norm = result.norm(2).clamp_min(1e-12);
        result = result / norm;

        auto result_cpu = result.to(torch::kCPU).contiguous();
        std::memcpy(output, result_cpu.data_ptr<float>(), dim * sizeof(float));

        return 0;
    } catch (const std::exception& e) {
        return -3;
    }
}

/**
 * Check if CUDA is available for this build.
 * Returns 1 if CUDA available, 0 if CPU only.
 */
extern "C" int checkCudaAvailable() {
    return torch::cuda::is_available() ? 1 : 0;
}
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
#include <cuda_runtime_api.h>
#include <vector>
#include <cmath>
#include <cstring>
#include <algorithm>
#include <thread>
#include <mutex>

/**
 * One-time LibTorch threading configuration, called lazily on first use.
 * Pin intra-op threads to min(4, hardware) to avoid starving Node.js event loop.
 */
static std::once_flag _init_flag;
static bool _cudnn_available = false;

static void initLibTorch() {
    std::call_once(_init_flag, [] {
        int hw = std::max(1, (int)std::thread::hardware_concurrency());
        int intra = std::min(4, hw);
        torch::set_num_threads(intra);
        // set_num_interop_threads must be called before any parallel region;
        // safe here since call_once runs before first op
        try {
            torch::set_num_interop_threads(std::min(2, hw));
        } catch (...) {
            // Already set or not supported — ignore
        }

        // Enable cuDNN benchmarking for optimal kernel selection per input size
        if (torch::cuda::is_available() && torch::cuda::cudnn_is_available()) {
            _cudnn_available = true;
            torch::globalContext().setBenchmarkCuDNN(true);
        }
    });
}

// Device selection: CUDA if available, else CPU
static torch::Device getDevice() {
    initLibTorch();
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
        torch::NoGradGuard no_grad;  // skip autograd tracking (inference only)
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
        torch::NoGradGuard no_grad;  // skip autograd tracking (inference only)
        auto device = getDevice();
        auto opts = torch::TensorOptions().dtype(torch::kFloat32);

        auto data = torch::from_blob(
            const_cast<float*>(embeddings), {n, dim}, opts
        ).to(device);

        // Initialize centroids: first k points (deterministic)
        auto centroids = data.slice(0, 0, k).clone();

        auto assign_tensor = torch::zeros({n}, torch::TensorOptions().dtype(torch::kLong).device(device));

        for (int iter = 0; iter < max_iters; iter++) {
            // Compute pairwise L2 distances: data[n,dim] vs centroids[k,dim] → [n,k]
            // torch::cdist uses optimized cuBLAS path internally (avoids [n,k,dim] broadcast)
            auto dists = torch::cdist(data, centroids, 2.0); // [n, k]

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
        torch::NoGradGuard no_grad;  // skip autograd tracking (inference only)
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
 * Returns 2 if CUDA+cuDNN available, 1 if CUDA only, 0 if CPU only.
 */
extern "C" int checkCudaAvailable() {
    if (!torch::cuda::is_available()) return 0;
    initLibTorch(); // ensure cuDNN detection ran
    return _cudnn_available ? 2 : 1;
}

/**
 * Query free and total CUDA memory (bytes).
 * Output: free_bytes[0] = free, total_bytes[0] = total
 * Returns 0 on success, -1 if CUDA unavailable, -2 on error.
 */
extern "C" int getCudaMemory(int64_t* free_bytes, int64_t* total_bytes) {
    if (!free_bytes || !total_bytes) return -1;
    if (!torch::cuda::is_available()) return -1;

    try {
        // Use cudaMemGetInfo via PyTorch's CUDA allocator stats
        size_t free_mem = 0, total_mem = 0;
        cudaMemGetInfo(&free_mem, &total_mem);
        *free_bytes = static_cast<int64_t>(free_mem);
        *total_bytes = static_cast<int64_t>(total_mem);
        return 0;
    } catch (...) {
        return -2;
    }
}

/**
 * Batch cosine similarity: query[1,dim] vs corpus[n,dim] → scores[n]
 * Useful for GPU-accelerated nearest-neighbor pre-filtering.
 * Input:  query[dim], corpus[n][dim] as flat float arrays
 * Output: scores[n] (cosine similarity of query vs each corpus row)
 */
extern "C" int batchCosineSimilarity(
    const float* query, int dim,
    const float* corpus, int n,
    float* scores, int scores_len
) {
    if (!query || !corpus || !scores || n <= 0 || dim <= 0) return -1;
    if (scores_len < n) return -2;

    try {
        torch::NoGradGuard no_grad;
        auto device = getDevice();
        auto opts = torch::TensorOptions().dtype(torch::kFloat32);

        auto q = torch::from_blob(
            const_cast<float*>(query), {1, dim}, opts
        ).to(device);

        auto c = torch::from_blob(
            const_cast<float*>(corpus), {n, dim}, opts
        ).to(device);

        // L2 normalize
        auto q_norm = q / q.norm(2, 1, true).clamp_min(1e-12);
        auto c_norm = c / c.norm(2, 1, true).clamp_min(1e-12);

        // Cosine similarity: q[1,dim] @ c[dim,n] → [1,n]
        auto sim = torch::mm(q_norm, c_norm.t()).squeeze(0);

        auto sim_cpu = sim.to(torch::kCPU).contiguous();
        std::memcpy(scores, sim_cpu.data_ptr<float>(), n * sizeof(float));

        return 0;
    } catch (const std::exception& e) {
        return -3;
    }
}

/**
 * Half-precision cosine similarity matrix (FP16).
 * Uses 50% less VRAM than graphSimilarity for large embedding sets (>10K vectors).
 * Input:  embeddings[n][dim] as flat float array (FP32 input, internally cast to FP16)
 * Output: similarity[n][n] as flat float array (FP32 output)
 */
extern "C" int graphSimilarityHalf(
    const float* embeddings, int n, int dim,
    float* output, int output_len
) {
    if (!embeddings || !output || n <= 0 || dim <= 0) return -1;
    if (output_len < n * n) return -2;

    try {
        torch::NoGradGuard no_grad;
        auto device = getDevice();
        auto opts = torch::TensorOptions().dtype(torch::kFloat32);

        auto mat = torch::from_blob(
            const_cast<float*>(embeddings), {n, dim}, opts
        ).to(device);

        // Cast to half precision for VRAM savings
        auto mat_half = mat.to(torch::kFloat16);

        // L2 normalize
        auto norms = mat_half.norm(2, 1, true).clamp_min(1e-6f);
        auto normalized = mat_half / norms;

        // Cosine similarity via matmul in FP16
        auto sim = torch::mm(normalized, normalized.t());

        // Cast back to FP32 for output
        auto sim_cpu = sim.to(torch::kFloat32).to(torch::kCPU).contiguous();
        std::memcpy(output, sim_cpu.data_ptr<float>(), n * n * sizeof(float));

        return 0;
    } catch (const std::exception& e) {
        return -3;
    }
}
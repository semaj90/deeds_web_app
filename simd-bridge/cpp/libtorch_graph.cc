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

#include "gpu_error_codes.h"

static constexpr int MAX_N_SIMILARITY = 4096;
static constexpr int MAX_N_SIMILARITY_HALF = 8192;
static constexpr int MAX_N_CLUSTERING = 16384;

/**
 * Cosine similarity matrix: torch::mm(normalized, normalized.T)
 */
extern "C" int graphSimilarity(
    const float* embeddings, int n, int dim,
    float* output, int output_len
) {
    if (!embeddings || !output || n <= 0 || dim <= 0) return GPU_ERR_INVALID_ARGS;
    if (output_len < n * n) return GPU_ERR_BUFFER_TOO_SMALL;
    if (n > MAX_N_SIMILARITY) return GPU_ERR_INPUT_TOO_LARGE;

    try {
        torch::NoGradGuard no_grad;
        auto device = getDevice();

        auto opts = torch::TensorOptions().dtype(torch::kFloat32);
        auto mat = torch::from_blob(
            const_cast<float*>(embeddings), {n, dim}, opts
        ).to(device);

        auto norms = mat.norm(2, 1, true).clamp_min(1e-12);
        auto normalized = mat / norms;

        auto sim = torch::mm(normalized, normalized.t());

        auto sim_cpu = sim.to(torch::kCPU).contiguous();
        std::memcpy(output, sim_cpu.data_ptr<float>(), n * n * sizeof(float));

        return GPU_SUCCESS;
    } catch (const std::runtime_error& e) {
        if (std::string(e.what()).find("out of memory") != std::string::npos) return GPU_ERR_CUDA_OOM;
        return GPU_ERR_TORCH_EXCEPTION;
    } catch (...) {
        return GPU_ERR_UNKNOWN;
    }
}

/**
 * K-means clustering on GPU with empty cluster guard.
 */
extern "C" int clusterEmbeddings(
    const float* embeddings, int n, int dim,
    int k, int max_iters,
    int* assignments, int assignments_len,
    int* out_reseeded_count
) {
    if (!embeddings || !assignments || n <= 0 || dim <= 0 || k <= 0) return GPU_ERR_INVALID_ARGS;
    if (k > n) k = n;
    if (assignments_len < n) return GPU_ERR_BUFFER_TOO_SMALL;
    if (n > MAX_N_CLUSTERING) return GPU_ERR_INPUT_TOO_LARGE;
    if (max_iters <= 0) max_iters = 100;

    int reseeded_total = 0;

    try {
        torch::NoGradGuard no_grad;
        auto device = getDevice();
        auto opts = torch::TensorOptions().dtype(torch::kFloat32);

        auto data = torch::from_blob(
            const_cast<float*>(embeddings), {n, dim}, opts
        ).to(device);

        auto centroids = data.slice(0, 0, k).clone();
        auto assign_tensor = torch::zeros({n}, torch::TensorOptions().dtype(torch::kLong).device(device));

        for (int iter = 0; iter < max_iters; iter++) {
            auto dists = torch::cdist(data, centroids, 2.0);
            auto new_assign = dists.argmin(1);

            if (iter > 0 && torch::equal(new_assign, assign_tensor)) {
                assign_tensor = new_assign;
                break;
            }
            assign_tensor = new_assign;

            for (int c = 0; c < k; c++) {
                auto mask = (assign_tensor == c);
                auto count = mask.sum().item<int64_t>();
                if (count > 0) {
                    centroids[c] = data.index({mask}).mean(0);
                } else {
                    // P0: Empty cluster guard — re-seed from farthest point
                    auto current_centroids = centroids.index({assign_tensor});
                    auto dists_to_assigned = torch::norm(data - current_centroids, 2, 1);
                    auto farthest_idx = dists_to_assigned.argmax().item<int64_t>();
                    centroids[c] = data[farthest_idx].clone();
                    reseeded_total++;
                }
            }
        }

        if (out_reseeded_count) *out_reseeded_count = reseeded_total;

        auto assign_cpu = assign_tensor.to(torch::kCPU).to(torch::kInt32).contiguous();
        std::memcpy(assignments, assign_cpu.data_ptr<int>(), n * sizeof(int));

        return GPU_SUCCESS;
    } catch (const std::runtime_error& e) {
        if (std::string(e.what()).find("out of memory") != std::string::npos) return GPU_ERR_CUDA_OOM;
        return GPU_ERR_TORCH_EXCEPTION;
    } catch (...) {
        return GPU_ERR_UNKNOWN;
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
    if (!weights || !embeddings || !output || n <= 0 || dim <= 0) return GPU_ERR_INVALID_ARGS;
    if (output_len < dim) return GPU_ERR_BUFFER_TOO_SMALL;

    try {
        torch::NoGradGuard no_grad;
        auto device = getDevice();
        auto opts = torch::TensorOptions().dtype(torch::kFloat32);

        auto w = torch::from_blob(
            const_cast<float*>(weights), {n}, opts
        ).to(device);

        auto mat = torch::from_blob(
            const_cast<float*>(embeddings), {n, dim}, opts
        ).to(device);

        auto w_sum = w.sum().clamp_min(1e-12);
        auto w_norm = w / w_sum;

        auto result = torch::mm(w_norm.unsqueeze(0), mat).squeeze(0);

        auto norm = result.norm(2).clamp_min(1e-12);
        result = result / norm;

        auto result_cpu = result.to(torch::kCPU).contiguous();
        std::memcpy(output, result_cpu.data_ptr<float>(), dim * sizeof(float));

        return GPU_SUCCESS;
    } catch (const std::runtime_error& e) {
        if (std::string(e.what()).find("out of memory") != std::string::npos) return GPU_ERR_CUDA_OOM;
        return GPU_ERR_TORCH_EXCEPTION;
    } catch (...) {
        return GPU_ERR_UNKNOWN;
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
    if (!free_bytes || !total_bytes) return GPU_ERR_INVALID_ARGS;
    if (!torch::cuda::is_available()) return GPU_ERR_DEVICE_UNAVAILABLE;

    try {
        size_t free_mem = 0, total_mem = 0;
        cudaMemGetInfo(&free_mem, &total_mem);
        *free_bytes = static_cast<int64_t>(free_mem);
        *total_bytes = static_cast<int64_t>(total_mem);
        return GPU_SUCCESS;
    } catch (...) {
        return GPU_ERR_UNKNOWN;
    }
}

extern "C" int batchCosineSimilarity(
    const float* query, int dim,
    const float* corpus, int n,
    float* scores, int scores_len
) {
    if (!query || !corpus || !scores || n <= 0 || dim <= 0) return GPU_ERR_INVALID_ARGS;
    if (scores_len < n) return GPU_ERR_BUFFER_TOO_SMALL;

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

        auto q_norm = q / q.norm(2, 1, true).clamp_min(1e-12);
        auto c_norm = c / c.norm(2, 1, true).clamp_min(1e-12);

        auto sim = torch::mm(q_norm, c_norm.t()).squeeze(0);

        auto sim_cpu = sim.to(torch::kCPU).contiguous();
        std::memcpy(scores, sim_cpu.data_ptr<float>(), n * sizeof(float));

        return GPU_SUCCESS;
    } catch (const std::runtime_error& e) {
        if (std::string(e.what()).find("out of memory") != std::string::npos) return GPU_ERR_CUDA_OOM;
        return GPU_ERR_TORCH_EXCEPTION;
    } catch (...) {
        return GPU_ERR_UNKNOWN;
    }
}

/**
 * Half-precision cosine similarity matrix (FP16).
 */
extern "C" int graphSimilarityHalf(
    const float* embeddings, int n, int dim,
    float* output, int output_len
) {
    if (!embeddings || !output || n <= 0 || dim <= 0) return GPU_ERR_INVALID_ARGS;
    if (output_len < n * n) return GPU_ERR_BUFFER_TOO_SMALL;
    if (n > MAX_N_SIMILARITY_HALF) return GPU_ERR_INPUT_TOO_LARGE;

    try {
        torch::NoGradGuard no_grad;
        auto device = getDevice();
        auto opts = torch::TensorOptions().dtype(torch::kFloat32);

        auto mat = torch::from_blob(
            const_cast<float*>(embeddings), {n, dim}, opts
        ).to(device);

        auto mat_half = mat.to(torch::kFloat16);

        auto norms = mat_half.norm(2, 1, true).clamp_min(1e-6f);
        auto normalized = mat_half / norms;

        auto sim = torch::mm(normalized, normalized.t());

        auto sim_cpu = sim.to(torch::kFloat32).to(torch::kCPU).contiguous();
        std::memcpy(output, sim_cpu.data_ptr<float>(), n * n * sizeof(float));

        return GPU_SUCCESS;
    } catch (const std::runtime_error& e) {
        if (std::string(e.what()).find("out of memory") != std::string::npos) return GPU_ERR_CUDA_OOM;
        return GPU_ERR_TORCH_EXCEPTION;
    } catch (...) {
        return GPU_ERR_UNKNOWN;
    }
}
// Minimal LibTorch-aware shim for GPU operations.
// This file is selected by CMake only when LibTorch is present.

#include <cstdint>
#include <cstring>
#include <algorithm>
#include <cmath>
#include <limits>
#include <vector>
#include <string>
#include <torch/torch.h>
#include "gpu_error_codes.h"
#include "native_execution_counters.h"
#include "native_runtime_info.h"

extern "C" int checkCudaAvailable() {
  return torch::cuda::is_available() ? 1 : 0;
}

extern "C" int getCudaMemory(int64_t* free_bytes, int64_t* total_bytes) {
  if (free_bytes) *free_bytes = 0;
  if (total_bytes) *total_bytes = 0;

  AtlasCudaRuntimeInfo runtime{};
  const int query_rc = atlasGetCudaRuntimeInfo(&runtime);
  if (query_rc <= 0 || runtime.query_status != 0 || !runtime.cuda_runtime_available) {
    return query_rc < 0 ? query_rc : (runtime.query_status != 0 ? runtime.query_status : -1);
  }
  if (!free_bytes || !total_bytes) return -1;
  *free_bytes = static_cast<int64_t>(runtime.free_bytes);
  *total_bytes = static_cast<int64_t>(runtime.total_bytes);
  return 0;
}

// Placeholder implementations: real optimized GPU kernels should be
// provided in the full libtorch_graph.cc implementation. These placeholders
// allow the addon to link when a minimal Torch environment exists. Replace
// with the project's optimized kernels as needed.

extern "C" int graphSimilarity(const float* embeddings, int n, int dim, float* output, int output_len) {
  // Delegate to a simple CPU fallback if Torch is present but no GPU kernels
  if (!embeddings || !output) return -1;
  if (output_len < n * n) return -2;
  // simple O(n^2 * dim) CPU compute (not optimized)
  for (int i = 0; i < n; ++i) {
    for (int j = 0; j < n; ++j) {
      float dot = 0.0f;
      float na = 0.0f;
      float nb = 0.0f;
      const float* a = embeddings + (size_t)i * dim;
      const float* b = embeddings + (size_t)j * dim;
      for (int d = 0; d < dim; ++d) { dot += a[d] * b[d]; na += a[d]*a[d]; nb += b[d]*b[d]; }
      output[i * n + j] = dot / (sqrtf(na) * sqrtf(nb) + 1e-12f);
    }
  }
  atlasNativeCounterRecord(AtlasExecutionCounter::cpu_fallback);
  return 0;
}

extern "C" int graphSimilarityHalf(const float* embeddings, int n, int dim, float* output, int output_len) {
  return graphSimilarity(embeddings, n, dim, output, output_len);
}

// batchCosineSimilarity — LibTorch cuBLAS GEMM path with pinned host memory.
//
// Uses torch::mm() which dispatches to cuBLAS SGEMM on GPU (RTX 3060 Ti SM 8.6).
// Pinned (page-locked) host memory is allocated once per call via
// torch::from_blob on a pinned tensor — enabling async DMA (H2D/D2H overlap).
// Normalisation is done on-device before GEMM to avoid a second pass.
// Uses LibTorch CPU tensors when CUDA is unavailable and LibTorch is linked;
// falls back to a scalar loop only when the addon was built without LibTorch.
extern "C" int batchCosineSimilarity(const float* query, int dim, const float* corpus, int n, float* scores, int scores_len) {
  if (!query || !corpus || !scores) return -1;
  if (scores_len < n) return -2;
  if (n <= 0 || dim <= 0) return -3;

  if (!torch::cuda::is_available()) {
#if SIMD_HAVE_LIBTORCH
    try {
      torch::NoGradGuard ng;
      const auto opts = torch::TensorOptions().dtype(torch::kFloat32).device(torch::kCPU);
      auto q_cpu = torch::from_blob(const_cast<float*>(query), {1, dim}, opts).clone();
      auto c_cpu = torch::from_blob(const_cast<float*>(corpus), {n, dim}, opts).clone();
      auto q_norm = torch::nn::functional::normalize(
        q_cpu, torch::nn::functional::NormalizeFuncOptions().p(2).dim(1));
      auto c_norm = torch::nn::functional::normalize(
        c_cpu, torch::nn::functional::NormalizeFuncOptions().p(2).dim(1));
      auto result = torch::mm(q_norm, c_norm.t()).squeeze(0).contiguous();
      std::memcpy(scores, result.data_ptr<float>(), static_cast<size_t>(n) * sizeof(float));
      atlasNativeCounterRecord(AtlasExecutionCounter::cpu_fallback);
      return 0;
    } catch (const c10::Error&) {
      // Continue to the scalar correctness fallback below.
    }
#endif
    // CPU scalar fallback (used when LibTorch is absent or unavailable).
    for (int i = 0; i < n; ++i) {
      const float* c = corpus + (size_t)i * dim;
      float dot = 0.0f, na = 0.0f, nb = 0.0f;
      for (int d = 0; d < dim; ++d) { dot += query[d] * c[d]; na += query[d]*query[d]; nb += c[d]*c[d]; }
      scores[i] = dot / (sqrtf(na) * sqrtf(nb) + 1e-12f);
    }
    atlasNativeCounterRecord(AtlasExecutionCounter::cpu_fallback);
    return 0;
  }

  try {
    torch::NoGradGuard ng;
    auto opts_cpu  = torch::TensorOptions().dtype(torch::kFloat32).device(torch::kCPU).pinned_memory(true);
    auto opts_cuda = torch::TensorOptions().dtype(torch::kFloat32).device(torch::kCUDA);

    // Wrap host buffers into pinned tensors (zero-copy if already pinned; one
    // allocation otherwise).  from_blob does NOT copy data — the async H2D
    // transfer below does.
    auto q_pinned = torch::from_blob(const_cast<float*>(query), {1, dim}, opts_cpu);
    auto c_pinned = torch::from_blob(const_cast<float*>(corpus), {n, dim}, opts_cpu);

    // Async H2D on the default CUDA stream.
    auto q_gpu = q_pinned.to(opts_cuda, /*non_blocking=*/true);   // [1, dim]
    auto c_gpu = c_pinned.to(opts_cuda, /*non_blocking=*/true);   // [n, dim]

    // L2-normalise each row on-device (avoids separate norm pass after GEMM).
    auto q_norm = torch::nn::functional::normalize(q_gpu, torch::nn::functional::NormalizeFuncOptions().p(2).dim(1)); // [1, dim]
    auto c_norm = torch::nn::functional::normalize(c_gpu, torch::nn::functional::NormalizeFuncOptions().p(2).dim(1)); // [n, dim]

    // cuBLAS SGEMM: [1, dim] × [dim, n] → [1, n]  (cosine similarity scores)
    auto result = torch::mm(q_norm, c_norm.t()).squeeze(0);  // [n]

    // Async D2H back into the caller's buffer (pinned scores buffer for max throughput).
    auto scores_tensor = torch::from_blob(scores, {n}, torch::TensorOptions().dtype(torch::kFloat32).device(torch::kCPU));
    scores_tensor.copy_(result.to(torch::kCPU));
    atlasNativeCounterRecord(AtlasExecutionCounter::cuda_execution);
    return 0;
  } catch (const c10::Error& e) {
    // CUDA OOM or device error — fall back to CPU
    atlasNativeCounterRecord(AtlasExecutionCounter::cuda_error_fallback);
    if (std::string(e.what()).find("out of memory") != std::string::npos)
      atlasNativeCounterRecord(AtlasExecutionCounter::oom_fallback);
    for (int i = 0; i < n; ++i) {
      const float* c = corpus + (size_t)i * dim;
      float dot = 0.0f, na = 0.0f, nb = 0.0f;
      for (int d = 0; d < dim; ++d) { dot += query[d] * c[d]; na += query[d]*query[d]; nb += c[d]*c[d]; }
      scores[i] = dot / (sqrtf(na) * sqrtf(nb) + 1e-12f);
    }
    atlasNativeCounterRecord(AtlasExecutionCounter::cpu_fallback);
    return 0;
  }
}

// Combined cosine retrieval: keep the complete score vector on its execution
// device and transfer only the selected top-k indices/scores to the host.
// backend_out: 1 = LibTorch CUDA, 2 = LibTorch CPU.
extern "C" int batchCosineTopK(
    const float* query, const float* corpus, int n, int dim, int k,
    int32_t* indices, float* scores, int output_len, int* backend_out) {
  if (!query || !corpus || !indices || !scores || !backend_out) return -1;
  if (n <= 0 || dim <= 0 || k <= 0 || k > n || output_len < k) return -2;
  const size_t query_count = static_cast<size_t>(dim);
  const size_t corpus_count = static_cast<size_t>(n) * query_count;
  for (size_t i = 0; i < query_count; ++i) if (!std::isfinite(query[i])) return -2;
  for (size_t i = 0; i < corpus_count; ++i) if (!std::isfinite(corpus[i])) return -2;
  try {
    torch::NoGradGuard ng;
    const bool use_cuda = torch::cuda::is_available();
    const auto device = use_cuda ? torch::Device(torch::kCUDA) : torch::Device(torch::kCPU);
    const auto options = torch::TensorOptions().dtype(torch::kFloat32).device(torch::kCPU);
    auto q_host = torch::from_blob(const_cast<float*>(query), {1, dim}, options).clone();
    auto c_host = torch::from_blob(const_cast<float*>(corpus), {n, dim}, options).clone();
    auto q = q_host.to(device, /*non_blocking=*/use_cuda);
    auto c = c_host.to(device, /*non_blocking=*/use_cuda);
    auto q_norm = torch::nn::functional::normalize(
        q, torch::nn::functional::NormalizeFuncOptions().p(2).dim(1));
    auto c_norm = torch::nn::functional::normalize(
        c, torch::nn::functional::NormalizeFuncOptions().p(2).dim(1));
    auto all_scores = torch::mm(q_norm, c_norm.t()).squeeze(0);
    auto selected = torch::topk(all_scores, k, /*dim=*/-1, /*largest=*/true, /*sorted=*/true);
    auto host_indices = std::get<1>(selected).to(torch::kCPU).to(torch::kInt32).contiguous();
    auto host_scores = std::get<0>(selected).to(torch::kCPU).contiguous();
    std::memcpy(indices, host_indices.data_ptr<int32_t>(), static_cast<size_t>(k) * sizeof(int32_t));
    std::memcpy(scores, host_scores.data_ptr<float>(), static_cast<size_t>(k) * sizeof(float));
    *backend_out = use_cuda ? 1 : 2;
    atlasNativeCounterRecord(use_cuda ? AtlasExecutionCounter::cuda_execution : AtlasExecutionCounter::cpu_fallback);
    return 0;
  } catch (const c10::Error& e) {
    atlasNativeCounterRecord(AtlasExecutionCounter::cuda_error_fallback);
    if (std::string(e.what()).find("out of memory") != std::string::npos)
      atlasNativeCounterRecord(AtlasExecutionCounter::oom_fallback);
    return GPU_ERR_TORCH_EXCEPTION;
  } catch (...) {
    return GPU_ERR_UNKNOWN;
  }
}

// clusterEmbeddings and computeCaseEmbedding should be implemented using
// LibTorch tensors and CUDA kernels for performance. Provide basic CPU
// fallbacks here for completeness.
extern "C" int computeCaseEmbedding(const float* weights, int n, const float* embeddings, int dim, float* output, int output_len) {
  if (!weights || !embeddings || !output) return -1;
  if (output_len < dim) return -2;
  double total_w = 0.0;
  for (int d = 0; d < dim; ++d) output[d] = 0.0f;
  for (int i = 0; i < n; ++i) {
    double w = weights[i];
    total_w += w;
    const float* e = embeddings + (size_t)i * dim;
    for (int d = 0; d < dim; ++d) output[d] += (float)(w * e[d]);
  }
  if (total_w == 0.0) total_w = 1.0;
  double norm_sq = 0.0;
  for (int d = 0; d < dim; ++d) {
    output[d] = (float)(output[d] / total_w);
    norm_sq += (double)output[d] * output[d];
  }
  const double norm = std::sqrt(norm_sq);
  if (norm > 1e-12) {
    for (int d = 0; d < dim; ++d) output[d] = (float)(output[d] / norm);
  }
  atlasNativeCounterRecord(AtlasExecutionCounter::cpu_fallback);
  return 0;
}

extern "C" int clusterEmbeddings(const float* embeddings, int n, int dim, int k, int max_iters, int* assignments, int assignments_len, int* out_reseeded_count) {
  if (!embeddings || !assignments) return -1;
  if (assignments_len < n || n <= 0 || dim <= 0 || k <= 0 || k > n) return -2;
  std::vector<float> centroids((size_t)k * dim);
  std::vector<int> next_assignments((size_t)n, -1);
  for (int c = 0; c < k; ++c) {
    std::copy(embeddings + (size_t)c * dim,
              embeddings + (size_t)(c + 1) * dim,
              centroids.begin() + (size_t)c * dim);
  }
  const int iterations = std::max(1, std::min(max_iters, 1000));
  for (int iteration = 0; iteration < iterations; ++iteration) {
    bool changed = false;
    for (int i = 0; i < n; ++i) {
      int best = 0;
      float best_distance = std::numeric_limits<float>::max();
      for (int c = 0; c < k; ++c) {
        float distance = 0.0f;
        for (int d = 0; d < dim; ++d) {
          const float delta = embeddings[(size_t)i * dim + d] - centroids[(size_t)c * dim + d];
          distance += delta * delta;
        }
        if (distance < best_distance) {
          best_distance = distance;
          best = c;
        }
      }
      if (next_assignments[i] != best) changed = true;
      next_assignments[i] = best;
    }
    std::vector<float> sums((size_t)k * dim, 0.0f);
    std::vector<int> counts((size_t)k, 0);
    for (int i = 0; i < n; ++i) {
      const int c = next_assignments[i];
      ++counts[c];
      for (int d = 0; d < dim; ++d) sums[(size_t)c * dim + d] += embeddings[(size_t)i * dim + d];
    }
    for (int c = 0; c < k; ++c) {
      if (counts[c] == 0) continue;
      for (int d = 0; d < dim; ++d) centroids[(size_t)c * dim + d] = sums[(size_t)c * dim + d] / counts[c];
    }
    if (!changed) break;
  }
  std::copy(next_assignments.begin(), next_assignments.end(), assignments);
  if (out_reseeded_count) *out_reseeded_count = 0;
  atlasNativeCounterRecord(AtlasExecutionCounter::cpu_fallback);
  return 0;
}

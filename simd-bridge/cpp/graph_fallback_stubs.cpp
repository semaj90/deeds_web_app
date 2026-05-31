// CPU fallback implementations for graph/vector operations
// Selected at CMake configure time when LibTorch is unavailable.

#include <cstdint>
#include <cmath>
#include <cstring>

extern "C" int graphSimilarity(const float* embeddings, int n, int dim, float* output, int output_len) {
  if (!embeddings || !output) return -1;
  if (output_len < n * n) return -2;
  // compute norms
  float* norms = (float*)malloc(sizeof(float) * n);
  if (!norms) return -3;
  for (int i = 0; i < n; ++i) {
    const float* e = embeddings + (size_t)i * dim;
    float sum = 0.0f;
    for (int d = 0; d < dim; ++d) sum += e[d] * e[d];
    norms[i] = sqrtf(sum) + 1e-12f;
  }
  for (int i = 0; i < n; ++i) {
    const float* a = embeddings + (size_t)i * dim;
    for (int j = 0; j < n; ++j) {
      const float* b = embeddings + (size_t)j * dim;
      float dot = 0.0f;
      for (int d = 0; d < dim; ++d) dot += a[d] * b[d];
      output[i * n + j] = dot / (norms[i] * norms[j]);
    }
  }
  free(norms);
  return 0;
}

extern "C" int graphSimilarityHalf(const float* embeddings, int n, int dim, float* output, int output_len) {
  // For CPU fallback, behave same as full-precision similarity
  return graphSimilarity(embeddings, n, dim, output, output_len);
}

extern "C" int batchCosineSimilarity(const float* query, int dim, const float* corpus, int n, float* scores, int scores_len) {
  if (!query || !corpus || !scores) return -1;
  if (scores_len < n) return -2;
  float qnorm = 0.0f;
  for (int d = 0; d < dim; ++d) qnorm += query[d] * query[d];
  qnorm = sqrtf(qnorm) + 1e-12f;
  for (int i = 0; i < n; ++i) {
    const float* c = corpus + (size_t)i * dim;
    float dot = 0.0f;
    float cnorm = 0.0f;
    for (int d = 0; d < dim; ++d) {
      dot += query[d] * c[d];
      cnorm += c[d] * c[d];
    }
    scores[i] = dot / (qnorm * (sqrtf(cnorm) + 1e-12f));
  }
  return 0;
}

extern "C" int computeCaseEmbedding(const float* weights, int n, const float* embeddings, int dim, float* output, int output_len) {
  if (!weights || !embeddings || !output) return -1;
  if (output_len < dim) return -2;
  // weighted average of n embeddings
  memset(output, 0, sizeof(float) * output_len);
  double total_w = 0.0;
  for (int i = 0; i < n; ++i) {
    double w = weights[i];
    total_w += w;
    const float* e = embeddings + (size_t)i * dim;
    for (int d = 0; d < dim; ++d) output[d] += (float)(w * e[d]);
  }
  if (total_w == 0.0) total_w = 1.0;
  for (int d = 0; d < dim; ++d) output[d] = (float)(output[d] / total_w);
  return 0;
}

extern "C" int clusterEmbeddings(const float* embeddings, int n, int dim, int k, int max_iters, int* assignments, int assignments_len, int* out_reseeded_count) {
  if (!embeddings || !assignments) return -1;
  if (assignments_len < n) return -2;
  if (k <= 0) return -3;
  // Simple deterministic k-means: init centroids as first k points
  float* centroids = (float*)malloc(sizeof(float) * k * dim);
  if (!centroids) return -4;
  for (int i = 0; i < k; ++i) {
    const float* src = embeddings + (size_t)(i % n) * dim;
    memcpy(centroids + (size_t)i * dim, src, sizeof(float) * dim);
  }
  int reseeded = 0;
  int* counts = (int*)malloc(sizeof(int) * k);
  float* sums = (float*)malloc(sizeof(float) * k * dim);
  for (int iter = 0; iter < max_iters; ++iter) {
    // assign
    for (int i = 0; i < n; ++i) {
      const float* p = embeddings + (size_t)i * dim;
      int best = 0;
      float bestDist = -INFINITY;
      for (int c = 0; c < k; ++c) {
        const float* cent = centroids + (size_t)c * dim;
        float dot = 0.0f, na = 0.0f, nb = 0.0f;
        for (int d = 0; d < dim; ++d) { dot += p[d] * cent[d]; na += p[d]*p[d]; nb += cent[d]*cent[d]; }
        float sim = dot / (sqrtf(na) * sqrtf(nb) + 1e-12f);
        if (sim > bestDist) { bestDist = sim; best = c; }
      }
      assignments[i] = best;
    }
    // zero sums
    memset(counts, 0, sizeof(int) * k);
    memset(sums, 0, sizeof(float) * k * dim);
    // accumulate
    for (int i = 0; i < n; ++i) {
      int a = assignments[i];
      counts[a]++;
      const float* p = embeddings + (size_t)i * dim;
      float* s = sums + (size_t)a * dim;
      for (int d = 0; d < dim; ++d) s[d] += p[d];
    }
    // recompute centroids
    for (int c = 0; c < k; ++c) {
      if (counts[c] == 0) {
        // reseed from first point deterministically
        memcpy(centroids + (size_t)c * dim, embeddings + 0, sizeof(float) * dim);
        reseeded++;
      } else {
        float* cent = centroids + (size_t)c * dim;
        float* s = sums + (size_t)c * dim;
        for (int d = 0; d < dim; ++d) cent[d] = s[d] / counts[c];
      }
    }
  }
  if (out_reseeded_count) *out_reseeded_count = reseeded;
  free(centroids);
  free(counts);
  free(sums);
  return 0;
}

extern "C" int checkCudaAvailable() {
  return 0; // CPU-only fallback
}

extern "C" int getCudaMemory(int64_t* free_bytes, int64_t* total_bytes) {
  if (free_bytes) *free_bytes = 0;
  if (total_bytes) *total_bytes = 0;
  return -99; // device unavailable
}

// Additional CPU-side fallbacks for functions referenced elsewhere
extern "C" int autoencoderEncodeGPU(const float*, int, float*, int) { return -99; }
extern "C" int autoencoderDecodeGPU(const float*, int, float*, int) { return -99; }
extern "C" int pcaProjectGPU(const float*, int, int, float*, int) { return -99; }

// Stubs for GPU-named functions expected by bindings; these are no-ops in CPU fallback.
extern "C" void pageRankGPU() {}
extern "C" void attentionScoreGPU() {}
extern "C" void rewardScoreGPU() {}
extern "C" void softmaxGPU() {}
extern "C" void topKIndicesGPU() {}
extern "C" void kmeansWithCentroids() {}
extern "C" void trainSOM() {}

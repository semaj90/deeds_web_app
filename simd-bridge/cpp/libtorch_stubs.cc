/**
 * Stub implementations for libtorch_graph.cc functions.
 * Used when LibTorch is not available (NO_LIBTORCH=1).
 * All functions return -99 to indicate "not available".
 */

#ifdef NO_LIBTORCH

#include <cstdint>

extern "C" int graphSimilarity(const float*, int, int, float*, int) {
    return -99;  // LibTorch not available
}

extern "C" int clusterEmbeddings(const float*, int, int, int, int, int*, int) {
    return -99;
}

extern "C" int computeCaseEmbedding(const float*, int, const float*, int, float*, int) {
    return -99;
}

extern "C" int checkCudaAvailable() {
    return 0;  // No CUDA without LibTorch
}

// NOTE: The LSTM/math bridge implementations live in `lstm_bridge.cc`.
// Do NOT duplicate those symbols here to avoid LNK2005 duplicate-definition
// errors. This stub file should only provide fallbacks for LibTorch-dependent
// GPU functions.

// pytorch_graph.cc stubs
extern "C" int pageRankGPU(const float*, int, float, int, float*, int) { return -99; }
extern "C" int attentionScoreGPU(const float*, int, const float*, int, float*, int) { return -99; }
extern "C" int rewardScoreGPU(const float*, const float*, int, int, float*, int) { return -99; }
extern "C" int softmaxGPU(const float*, int, float*, int) { return -99; }
extern "C" int topKIndicesGPU(const float*, int, int, int*, int) { return -99; }
extern "C" int kmeansWithCentroids(const float*, int, int, int, int, int*, int, float*, int) { return -99; }
extern "C" int trainSOM(const float*, int, int, int, int, int, float, float, float, float, float*, int, int*, int) { return -99; }

// Additional stubs for libtorch_graph functions referenced elsewhere
extern "C" int batchCosineSimilarity(const float *, int, const float *, int,
                                     float *, int) {
  return -99;
}
extern "C" int graphSimilarityHalf(const float *, int, int, float *, int) {
  return -99;
}
extern "C" int getCudaMemory(int64_t * /*free_bytes*/,
                             int64_t * /*total_bytes*/) {
  return -99;
}
extern "C" int autoencoderEncodeGPU(const float *, int, float *, int) {
  return -99;
}
extern "C" int autoencoderDecodeGPU(const float *, int, float *, int) {
  return -99;
}
extern "C" int pcaProjectGPU(const float *, int, int, float *, int) {
  return -99;
}

#endif

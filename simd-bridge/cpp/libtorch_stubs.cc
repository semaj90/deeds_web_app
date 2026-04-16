/**
 * Stub implementations for libtorch_graph.cc functions.
 * Used when LibTorch is not available (NO_LIBTORCH=1).
 * All functions return -99 to indicate "not available".
 */

#ifdef NO_LIBTORCH

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

// LSTM/math bridge stubs (defined in binding.cc as extern, need implementations)
extern "C" int bridge_run_lstm(const float*, const float*, float*, int) {
    return -99;
}

extern "C" int bridge_dot_product(const float*, const float*, float*, int) {
    return -99;
}

extern "C" int bridge_scale(const float*, float*, float, int) {
    return -99;
}

extern "C" int bridge_relu(const float*, float*, int) {
    return -99;
}

// pytorch_graph.cc stubs
extern "C" int pageRankGPU(const float*, int, float, int, float*, int) { return -99; }
extern "C" int attentionScoreGPU(const float*, int, const float*, int, float*, int) { return -99; }
extern "C" int rewardScoreGPU(const float*, const float*, int, int, float*, int) { return -99; }
extern "C" int softmaxGPU(const float*, int, float*, int) { return -99; }
extern "C" int topKIndicesGPU(const float*, int, int, int*, int) { return -99; }
extern "C" int kmeansWithCentroids(const float*, int, int, int, int, int*, int, float*, int) { return -99; }
extern "C" int trainSOM(const float*, int, int, int, int, int, float, float, float, float, float*, int, int*, int) { return -99; }

#endif

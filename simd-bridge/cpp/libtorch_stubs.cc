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

#endif

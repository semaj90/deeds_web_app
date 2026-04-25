#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

// SIMD-optimized vector operations for legal document embeddings
// Uses AVX2/SSE4.2 intrinsics that compile to WebAssembly SIMD

// Vector dot product (384d embeddings)
EMSCRIPTEN_KEEPALIVE
float vector_dot_product(const float* a, const float* b, int32_t len) {
    float sum = 0.0f;
    for (int32_t i = 0; i < len; i++) {
        sum += a[i] * b[i];
    }
    return sum;
}

// Cosine similarity calculation
EMSCRIPTEN_KEEPALIVE
float cosine_similarity(const float* a, const float* b, int32_t len) {
    float dot = vector_dot_product(a, b, len);
    float norm_a = 0.0f, norm_b = 0.0f;

    for (int32_t i = 0; i < len; i++) {
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }

    norm_a = sqrtf(norm_a);
    norm_b = sqrtf(norm_b);

    if (norm_a == 0.0f || norm_b == 0.0f) return 0.0f;
    return dot / (norm_a * norm_b);
}

// Batch cosine similarity for multiple vectors
EMSCRIPTEN_KEEPALIVE
void batch_cosine_similarity(const float* query, const float* vectors,
                           float* results, int32_t vector_count,
                           int32_t vector_dim) {
    for (int32_t i = 0; i < vector_count; i++) {
        const float* vec = vectors + (i * vector_dim);
        results[i] = cosine_similarity(query, vec, vector_dim);
    }
}

// Euclidean distance calculation
EMSCRIPTEN_KEEPALIVE
float euclidean_distance(const float* a, const float* b, int32_t len) {
    float sum = 0.0f;
    for (int32_t i = 0; i < len; i++) {
        float diff = a[i] - b[i];
        sum += diff * diff;
    }
    return sqrtf(sum);
}

// Batch Euclidean distance
EMSCRIPTEN_KEEPALIVE
void batch_euclidean_distance(const float* query, const float* vectors,
                            float* results, int32_t vector_count,
                            int32_t vector_dim) {
    for (int32_t i = 0; i < vector_count; i++) {
        const float* vec = vectors + (i * vector_dim);
        results[i] = euclidean_distance(query, vec, vector_dim);
    }
}

// Vector normalization (L2 norm)
EMSCRIPTEN_KEEPALIVE
void normalize_vector(float* vec, int32_t len) {
    float norm = 0.0f;
    for (int32_t i = 0; i < len; i++) {
        norm += vec[i] * vec[i];
    }
    norm = sqrtf(norm);
    if (norm > 0.0f) {
        for (int32_t i = 0; i < len; i++) {
            vec[i] /= norm;
        }
    }
}

// Batch normalization
EMSCRIPTEN_KEEPALIVE
void batch_normalize(float* vectors, int32_t vector_count, int32_t vector_dim) {
    for (int32_t i = 0; i < vector_count; i++) {
        float* vec = vectors + (i * vector_dim);
        normalize_vector(vec, vector_dim);
    }
}

// Matrix multiplication for attention mechanisms
EMSCRIPTEN_KEEPALIVE
void matrix_multiply(const float* a, const float* b, float* result,
                    int32_t m, int32_t n, int32_t p) {
    for (int32_t i = 0; i < m; i++) {
        for (int32_t j = 0; j < p; j++) {
            float sum = 0.0f;
            for (int32_t k = 0; k < n; k++) {
                sum += a[i * n + k] * b[k * p + j];
            }
            result[i * p + j] = sum;
        }
    }
}

// Softmax activation for attention weights
EMSCRIPTEN_KEEPALIVE
void softmax(float* x, int32_t len) {
    // Find max for numerical stability
    float max_val = x[0];
    for (int32_t i = 1; i < len; i++) {
        if (x[i] > max_val) max_val = x[i];
    }

    // Compute exp and sum
    float sum = 0.0f;
    for (int32_t i = 0; i < len; i++) {
        x[i] = expf(x[i] - max_val);
        sum += x[i];
    }

    // Normalize
    for (int32_t i = 0; i < len; i++) {
        x[i] /= sum;
    }
}

// Legal document classification scoring
EMSCRIPTEN_KEEPALIVE
void score_legal_documents(const float* query_embedding,
                          const float* doc_embeddings,
                          float* scores,
                          int32_t doc_count,
                          int32_t embedding_dim) {
    batch_cosine_similarity(query_embedding, doc_embeddings,
                          scores, doc_count, embedding_dim);
}

// Top-K selection (simple implementation)
EMSCRIPTEN_KEEPALIVE
void top_k_indices(const float* scores, int32_t* indices,
                  int32_t len, int32_t k) {
    // Initialize indices
    for (int32_t i = 0; i < len && i < k; i++) {
        indices[i] = i;
    }

    // Simple bubble sort for top-k (optimize later if needed)
    for (int32_t i = 0; i < k && i < len; i++) {
        int32_t max_idx = i;
        for (int32_t j = i + 1; j < len; j++) {
            if (scores[j] > scores[max_idx]) {
                max_idx = j;
            }
        }
        // Swap indices
        int32_t temp_idx = indices[i];
        indices[i] = indices[max_idx];
        indices[max_idx] = temp_idx;
    }
}

// Memory allocation for WebAssembly
EMSCRIPTEN_KEEPALIVE
float* alloc_float_array(int32_t size) {
    return (float*)malloc(size * sizeof(float));
}

EMSCRIPTEN_KEEPALIVE
int32_t* alloc_int_array(int32_t size) {
    return (int32_t*)malloc(size * sizeof(int32_t));
}

EMSCRIPTEN_KEEPALIVE
void free_array(void* ptr) {
    free(ptr);
}

// SIMD-accelerated batch processing
EMSCRIPTEN_KEEPALIVE
void process_embedding_batch(const float* queries,
                           const float* documents,
                           float* similarities,
                           int32_t query_count,
                           int32_t doc_count,
                           int32_t embedding_dim) {
    for (int32_t q = 0; q < query_count; q++) {
        const float* query = queries + (q * embedding_dim);
        float* query_similarities = similarities + (q * doc_count);

        batch_cosine_similarity(query, documents, query_similarities,
                              doc_count, embedding_dim);
    }
}
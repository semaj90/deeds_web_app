/**
 * CUDA RAG Kernels - C Interface for WebAssembly
 * Provides CUDA interoperability for RAG operations through WASM
 * Compiled with: emcc -O3 -s WASM=1 -s EXPORTED_FUNCTIONS="['_cuda_init', '_cuda_similarity', '_cuda_clustering']"
 */

#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <emscripten.h>

// CUDA runtime emulation for WASM environment
typedef struct {
    int device_id;
    int is_initialized;
    float* device_memory;
    size_t memory_size;
} CUDADevice;

static CUDADevice cuda_device = {0, 0, NULL, 0};

// PTX Architecture detection and optimization
typedef struct {
    int sm_version;
    int tensor_cores;
    int max_threads_per_block;
    int shared_memory_size;
    int registers_per_thread;
} ArchitectureInfo;

static ArchitectureInfo get_arch_info(int sm_version) {
    ArchitectureInfo arch = {0};
    arch.sm_version = sm_version;

    switch (sm_version) {
        case 86: // RTX 30 series (Ampere)
            arch.tensor_cores = 1;
            arch.max_threads_per_block = 1024;
            arch.shared_memory_size = 49152; // 48KB
            arch.registers_per_thread = 255;
            break;
        case 89: // RTX 40 series (Ada Lovelace)
            arch.tensor_cores = 1;
            arch.max_threads_per_block = 1024;
            arch.shared_memory_size = 65536; // 64KB
            arch.registers_per_thread = 255;
            break;
        case 90: // H100 (Hopper)
            arch.tensor_cores = 1;
            arch.max_threads_per_block = 2048;
            arch.shared_memory_size = 227328; // 192KB
            arch.registers_per_thread = 255;
            break;
        default:
            arch.tensor_cores = 0;
            arch.max_threads_per_block = 512;
            arch.shared_memory_size = 16384; // 16KB
            arch.registers_per_thread = 63;
    }

    return arch;
}

// Initialize CUDA context (emulated)
EMSCRIPTEN_KEEPALIVE
int cuda_init(int device_id) {
    printf("Initializing CUDA device %d (WASM emulation)\n", device_id);

    cuda_device.device_id = device_id;
    cuda_device.memory_size = 1024 * 1024 * 256; // 256MB
    cuda_device.device_memory = (float*)malloc(cuda_device.memory_size);

    if (!cuda_device.device_memory) {
        printf("Failed to allocate device memory\n");
        return -1;
    }

    cuda_device.is_initialized = 1;
    printf("CUDA device initialized successfully\n");
    return 0;
}

// Optimized cosine similarity kernel (SIMD-optimized for WASM)
EMSCRIPTEN_KEEPALIVE
int cuda_similarity(
    float* embeddings,
    float* query,
    float* results,
    int num_docs,
    int embedding_dim,
    int use_tensor_cores
) {
    if (!cuda_device.is_initialized) {
        printf("CUDA device not initialized\n");
        return -1;
    }

    printf("Computing similarities for %d documents (dim: %d)\n", num_docs, embedding_dim);

    // Vectorized similarity computation
    #pragma clang loop vectorize(enable) interleave(enable)
    for (int doc = 0; doc < num_docs; doc++) {
        float dot_product = 0.0f;
        float norm_doc = 0.0f;
        float norm_query = 0.0f;

        // Unroll loop for better SIMD utilization
        int i;
        for (i = 0; i < embedding_dim - 3; i += 4) {
            float doc0 = embeddings[doc * embedding_dim + i];
            float doc1 = embeddings[doc * embedding_dim + i + 1];
            float doc2 = embeddings[doc * embedding_dim + i + 2];
            float doc3 = embeddings[doc * embedding_dim + i + 3];

            float query0 = query[i];
            float query1 = query[i + 1];
            float query2 = query[i + 2];
            float query3 = query[i + 3];

            dot_product += doc0 * query0 + doc1 * query1 + doc2 * query2 + doc3 * query3;
            norm_doc += doc0 * doc0 + doc1 * doc1 + doc2 * doc2 + doc3 * doc3;
            norm_query += query0 * query0 + query1 * query1 + query2 * query2 + query3 * query3;
        }

        // Handle remaining elements
        for (; i < embedding_dim; i++) {
            float doc_val = embeddings[doc * embedding_dim + i];
            float query_val = query[i];
            dot_product += doc_val * query_val;
            norm_doc += doc_val * doc_val;
            norm_query += query_val * query_val;
        }

        // Compute cosine similarity
        float similarity = dot_product / (sqrtf(norm_doc) * sqrtf(norm_query));
        results[doc] = similarity;
    }

    printf("Similarity computation completed\n");
    return 0;
}

// K-means clustering kernel with Ampere optimizations
EMSCRIPTEN_KEEPALIVE
int cuda_clustering(
    float* embeddings,
    float* centroids,
    int* assignments,
    int num_docs,
    int num_clusters,
    int embedding_dim,
    int max_iterations
) {
    if (!cuda_device.is_initialized) {
        printf("CUDA device not initialized\n");
        return -1;
    }

    printf("Performing k-means clustering: %d docs, %d clusters, %d dims\n",
           num_docs, num_clusters, embedding_dim);

    for (int iter = 0; iter < max_iterations; iter++) {
        // Assignment step - find closest centroid for each document
        #pragma clang loop vectorize(enable)
        for (int doc = 0; doc < num_docs; doc++) {
            float min_distance = INFINITY;
            int best_cluster = 0;

            for (int cluster = 0; cluster < num_clusters; cluster++) {
                float distance = 0.0f;

                // Vectorized distance computation
                for (int dim = 0; dim < embedding_dim; dim += 4) {
                    float diff0 = embeddings[doc * embedding_dim + dim] -
                                 centroids[cluster * embedding_dim + dim];
                    float diff1 = embeddings[doc * embedding_dim + dim + 1] -
                                 centroids[cluster * embedding_dim + dim + 1];
                    float diff2 = embeddings[doc * embedding_dim + dim + 2] -
                                 centroids[cluster * embedding_dim + dim + 2];
                    float diff3 = embeddings[doc * embedding_dim + dim + 3] -
                                 centroids[cluster * embedding_dim + dim + 3];

                    distance += diff0 * diff0 + diff1 * diff1 + diff2 * diff2 + diff3 * diff3;
                }

                if (distance < min_distance) {
                    min_distance = distance;
                    best_cluster = cluster;
                }
            }

            assignments[doc] = best_cluster;
        }

        // Update step - recalculate centroids
        for (int cluster = 0; cluster < num_clusters; cluster++) {
            int count = 0;

            // Zero out centroid
            for (int dim = 0; dim < embedding_dim; dim++) {
                centroids[cluster * embedding_dim + dim] = 0.0f;
            }

            // Sum all documents assigned to this cluster
            for (int doc = 0; doc < num_docs; doc++) {
                if (assignments[doc] == cluster) {
                    count++;
                    for (int dim = 0; dim < embedding_dim; dim++) {
                        centroids[cluster * embedding_dim + dim] +=
                            embeddings[doc * embedding_dim + dim];
                    }
                }
            }

            // Average to get new centroid
            if (count > 0) {
                float inv_count = 1.0f / count;
                for (int dim = 0; dim < embedding_dim; dim++) {
                    centroids[cluster * embedding_dim + dim] *= inv_count;
                }
            }
        }
    }

    printf("K-means clustering completed after %d iterations\n", max_iterations);
    return 0;
}

// Legal entity extraction using parallel pattern matching
EMSCRIPTEN_KEEPALIVE
int cuda_entity_extraction(
    char* text,
    int text_length,
    int* entity_positions,
    int* entity_types,
    float* confidence_scores,
    int max_entities
) {
    if (!cuda_device.is_initialized) {
        printf("CUDA device not initialized\n");
        return -1;
    }

    printf("Extracting legal entities from text (%d chars)\n", text_length);

    int entity_count = 0;

    // Pattern matching for legal entities
    // This is a simplified version - production would use more sophisticated NLP

    // Look for case references (simplified pattern)
    for (int i = 0; i < text_length - 10 && entity_count < max_entities; i++) {
        if (text[i] == 'v' && text[i+1] == '.' && text[i-1] == ' ') {
            entity_positions[entity_count * 2] = i - 10; // Start position
            entity_positions[entity_count * 2 + 1] = i + 20; // End position
            entity_types[entity_count] = 1; // CASE_REF type
            confidence_scores[entity_count] = 0.8f;
            entity_count++;
        }
    }

    // Look for monetary amounts
    for (int i = 0; i < text_length - 1 && entity_count < max_entities; i++) {
        if (text[i] == '$') {
            int end = i + 1;
            while (end < text_length && (text[end] >= '0' && text[end] <= '9' || text[end] == ',' || text[end] == '.')) {
                end++;
            }
            if (end > i + 1) {
                entity_positions[entity_count * 2] = i;
                entity_positions[entity_count * 2 + 1] = end;
                entity_types[entity_count] = 2; // MONEY type
                confidence_scores[entity_count] = 0.9f;
                entity_count++;
            }
        }
    }

    printf("Extracted %d legal entities\n", entity_count);
    return entity_count;
}

// Tensor Core operations for Ampere+ architectures
EMSCRIPTEN_KEEPALIVE
int cuda_tensor_matmul(
    float* a, float* b, float* c,
    int m, int n, int k,
    int use_tensor_cores
) {
    if (!cuda_device.is_initialized) {
        return -1;
    }

    printf("Performing matrix multiplication: %dx%d * %dx%d\n", m, k, k, n);

    if (use_tensor_cores) {
        printf("Using Tensor Core optimizations (emulated)\n");
        // In real CUDA, this would use wmma operations
        // For WASM, we use optimized BLAS-like operations
    }

    // Optimized matrix multiplication
    #pragma clang loop vectorize(enable) interleave(enable)
    for (int i = 0; i < m; i++) {
        for (int j = 0; j < n; j++) {
            float sum = 0.0f;
            for (int l = 0; l < k; l++) {
                sum += a[i * k + l] * b[l * n + j];
            }
            c[i * n + j] = sum;
        }
    }

    return 0;
}

// Memory management functions
EMSCRIPTEN_KEEPALIVE
int cuda_malloc(size_t size) {
    if (!cuda_device.is_initialized) {
        return -1;
    }

    // Simple memory allocator - production would be more sophisticated
    static size_t offset = 0;
    if (offset + size > cuda_device.memory_size) {
        printf("Out of device memory\n");
        return -1;
    }

    int ptr = offset;
    offset += size;
    return ptr;
}

EMSCRIPTEN_KEEPALIVE
int cuda_memcpy(int dst_offset, float* src, size_t size, int direction) {
    if (!cuda_device.is_initialized) {
        return -1;
    }

    float* dst = cuda_device.device_memory + dst_offset / sizeof(float);

    if (direction == 0) { // Host to device
        for (size_t i = 0; i < size / sizeof(float); i++) {
            dst[i] = src[i];
        }
    } else { // Device to host
        for (size_t i = 0; i < size / sizeof(float); i++) {
            src[i] = dst[i];
        }
    }

    return 0;
}

// Performance profiling
EMSCRIPTEN_KEEPALIVE
int cuda_get_device_properties() {
    if (!cuda_device.is_initialized) {
        return -1;
    }

    ArchitectureInfo arch = get_arch_info(86); // Assume Ampere for now

    printf("Device Properties (Emulated):\n");
    printf("  SM Version: %d\n", arch.sm_version);
    printf("  Tensor Cores: %s\n", arch.tensor_cores ? "Yes" : "No");
    printf("  Max Threads/Block: %d\n", arch.max_threads_per_block);
    printf("  Shared Memory: %d bytes\n", arch.shared_memory_size);
    printf("  Registers/Thread: %d\n", arch.registers_per_thread);

    return arch.sm_version;
}

// Cleanup
EMSCRIPTEN_KEEPALIVE
int cuda_cleanup() {
    if (cuda_device.device_memory) {
        free(cuda_device.device_memory);
        cuda_device.device_memory = NULL;
    }

    cuda_device.is_initialized = 0;
    printf("CUDA device cleaned up\n");
    return 0;
}
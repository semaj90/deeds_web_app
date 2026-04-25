#include <cuda_runtime.h>
#include <cublas_v2.h>
#include <device_launch_parameters.h>

// Optimized cosine similarity kernel for Ampere+
__global__ void cosine_similarity_kernel(
    const float* __restrict__ input_embeddings,
    const float* __restrict__ query_embedding,
    float* __restrict__ similarity_results,
    int num_documents,
    int embedding_dim
) {
    int doc_idx = blockIdx.x * blockDim.x + threadIdx.x;

    if (doc_idx >= num_documents) return;

    float dot_product = 0.0f;
    float norm_input = 0.0f;
    float norm_query = 0.0f;

    const float* doc_embedding = input_embeddings + doc_idx * embedding_dim;

    // Vectorized computation with unrolled loop
    #pragma unroll 4
    for (int i = 0; i < embedding_dim; i += 4) {
        float4 doc_vec = reinterpret_cast<const float4*>(doc_embedding)[i/4];
        float4 query_vec = reinterpret_cast<const float4*>(query_embedding)[i/4];

        dot_product += doc_vec.x * query_vec.x + doc_vec.y * query_vec.y +
                      doc_vec.z * query_vec.z + doc_vec.w * query_vec.w;

        norm_input += doc_vec.x * doc_vec.x + doc_vec.y * doc_vec.y +
                     doc_vec.z * doc_vec.z + doc_vec.w * doc_vec.w;

        norm_query += query_vec.x * query_vec.x + query_vec.y * query_vec.y +
                     query_vec.z * query_vec.z + query_vec.w * query_vec.w;
    }

    float similarity = dot_product / (sqrtf(norm_input) * sqrtf(norm_query));
    similarity_results[doc_idx] = similarity;
}

// K-means clustering kernel
__global__ void kmeans_kernel(
    const float* __restrict__ document_embeddings,
    const float* __restrict__ cluster_centroids,
    int* __restrict__ cluster_assignments,
    int num_documents,
    int num_clusters,
    int embedding_dim
) {
    int doc_idx = blockIdx.x * blockDim.x + threadIdx.x;

    if (doc_idx >= num_documents) return;

    float min_distance = INFINITY;
    int best_cluster = 0;

    const float* doc_embedding = document_embeddings + doc_idx * embedding_dim;

    for (int cluster = 0; cluster < num_clusters; cluster++) {
        const float* centroid = cluster_centroids + cluster * embedding_dim;
        float distance = 0.0f;

        for (int dim = 0; dim < embedding_dim; dim++) {
            float diff = doc_embedding[dim] - centroid[dim];
            distance += diff * diff;
        }

        if (distance < min_distance) {
            min_distance = distance;
            best_cluster = cluster;
        }
    }

    cluster_assignments[doc_idx] = best_cluster;
}

// C interface for easier integration
extern "C" {
    int cuda_rag_similarity(float* embeddings, float* query, float* results,
                           int num_docs, int dim);
    int cuda_rag_clustering(float* embeddings, float* centroids, int* assignments,
                           int num_docs, int num_clusters, int dim);
}

int cuda_rag_similarity(float* embeddings, float* query, float* results,
                       int num_docs, int dim) {
    // GPU memory allocation and kernel launch
    float *d_embeddings, *d_query, *d_results;

    cudaMalloc(&d_embeddings, num_docs * dim * sizeof(float));
    cudaMalloc(&d_query, dim * sizeof(float));
    cudaMalloc(&d_results, num_docs * sizeof(float));

    cudaMemcpy(d_embeddings, embeddings, num_docs * dim * sizeof(float), cudaMemcpyHostToDevice);
    cudaMemcpy(d_query, query, dim * sizeof(float), cudaMemcpyHostToDevice);

    int threads = 256;
    int blocks = (num_docs + threads - 1) / threads;

    cosine_similarity_kernel<<<blocks, threads>>>(d_embeddings, d_query, d_results, num_docs, dim);

    cudaMemcpy(results, d_results, num_docs * sizeof(float), cudaMemcpyDeviceToHost);

    cudaFree(d_embeddings);
    cudaFree(d_query);
    cudaFree(d_results);

    return 0;
}

int cuda_rag_clustering(float* embeddings, float* centroids, int* assignments,
                       int num_docs, int num_clusters, int dim) {
    float *d_embeddings, *d_centroids;
    int *d_assignments;

    cudaMalloc(&d_embeddings, num_docs * dim * sizeof(float));
    cudaMalloc(&d_centroids, num_clusters * dim * sizeof(float));
    cudaMalloc(&d_assignments, num_docs * sizeof(int));

    cudaMemcpy(d_embeddings, embeddings, num_docs * dim * sizeof(float), cudaMemcpyHostToDevice);
    cudaMemcpy(d_centroids, centroids, num_clusters * dim * sizeof(float), cudaMemcpyHostToDevice);

    int threads = 256;
    int blocks = (num_docs + threads - 1) / threads;

    kmeans_kernel<<<blocks, threads>>>(d_embeddings, d_centroids, d_assignments,
                                      num_docs, num_clusters, dim);

    cudaMemcpy(assignments, d_assignments, num_docs * sizeof(int), cudaMemcpyDeviceToHost);

    cudaFree(d_embeddings);
    cudaFree(d_centroids);
    cudaFree(d_assignments);

    return 0;
}
